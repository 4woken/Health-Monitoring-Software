"""Compare three pinned UBFC-rPPG checkpoints against synchronized contact PPG."""

import argparse
import csv
import hashlib
import importlib.util
from pathlib import Path

import cv2
import numpy as np
import torch
from scipy.signal import butter, detrend, periodogram, sosfiltfilt

# Only these externally supplied upstream modules and state dictionaries are used.
HASHES = {
    "DeepPhys": ("e9f1ad149c398b71ebd9cadc563e67a03be19d305297c7f25e3070f207156eba",
                 "1ed8b94e57fb1a12d18a426af5ac818223182f27cfbd48801ac8a529accc1159"),
    "PhysNet": ("48a5a3132d9cb737f0dd782d354d27bf36c723a3ce018b4a1ec0cc3571905d9a",
                "6c00db978d9db3566b8953a97cb7cfcd6deb9522b0cbc937c921bb1859a1cdd0"),
    "EfficientPhys": ("384b01b5c99d6d280b5ddb9e2358631f89747e40e3181b6a174e26d6e74798c9",
                      "219b970e04b3580ee4c063554b7d9fe2a7a3ceb4e9e585980f15ac8313054cd6"),
}


def load_model(root, name):
    source, weights = [root / (name + suffix) for suffix in (".py", ".pth")]
    for path, expected in zip((source, weights), HASHES[name]):
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f"Different upstream version at {path}")
    spec = importlib.util.spec_from_file_location(name, source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if name == "DeepPhys":
        model = module.DeepPhys(img_size=72)
    elif name == "PhysNet":
        model = module.PhysNet_padding_Encoder_Decoder_MAX(frames=128)
    else:
        model = module.EfficientPhys(img_size=72, frame_depth=10)
    state = torch.load(weights, weights_only=True, map_location="cpu")
    model.load_state_dict({k.removeprefix("module."): v for k, v in state.items()})
    return model.eval()


def face_video(path):
    video = cv2.VideoCapture(str(path))
    try:
        fps = video.get(cv2.CAP_PROP_FPS)
        ok, frame = video.read()
        if not ok or not (29 < fps < 31):
            raise ValueError(f"Expected a readable ~30 fps clip at {path}")
        detect = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = detect.detectMultiScale(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 1.1, 4)
        if len(faces) == 0:
            raise ValueError(f"No face detected in first frame of {path}")
        x, y, w, h = max(faces, key=lambda face: face[2] * face[3])
        left, top = max(0, x - w // 4), max(0, y - h // 4)
        right, bottom = min(frame.shape[1], x + 5 * w // 4), min(frame.shape[0], y + 5 * h // 4)
        frames = []
        while ok:
            crop = cv2.resize(frame[top:bottom, left:right], (72, 72), interpolation=cv2.INTER_AREA)
            frames.append(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            ok, frame = video.read()
    finally:
        video.release()
    return np.stack(frames).astype(np.float32), fps


def rate(signal, fps):
    signal = detrend(np.asarray(signal, dtype=np.float64))
    filtered = sosfiltfilt(butter(2, [0.7, 3.0], fs=fps, btype="bandpass", output="sos"), signal)
    frequencies, power = periodogram(filtered, fps, window="hann", nfft=8192)
    use = (frequencies >= 0.7) & (frequencies <= 3.0)
    return float(frequencies[use][power[use].argmax()] * 60)


def predict(model, name, frames):
    standardized = (frames - frames.mean()) / max(frames.std(), 1e-7)
    ratios = np.diff(frames, axis=0) / (frames[1:] + frames[:-1] + 1e-7)
    diffs = np.pad(ratios / max(ratios.std(), 1e-7), ((0, 1), (0, 0), (0, 0), (0, 0)))
    if name == "DeepPhys":
        inputs, chunk = np.concatenate((diffs, standardized), axis=3), 180
    elif name == "PhysNet":
        inputs, chunk = diffs, 128
    else:
        inputs, chunk = standardized, 180
    signals = []
    data = torch.from_numpy(inputs).permute(0, 3, 1, 2).contiguous()
    with torch.inference_mode():
        for start in range(0, len(data), chunk):
            batch = data[start:start + chunk]
            count = len(batch)
            # Shift the last window back to avoid fitting a long artificially static tail.
            if count < chunk:
                if len(data) < chunk:
                    raise ValueError("The video must contain at least 180 frames.")
                batch = data[-chunk:]
            if name == "PhysNet":
                waveform = model(batch.permute(1, 0, 2, 3).unsqueeze(0))[0]
            elif name == "EfficientPhys":
                waveform = model(torch.cat((batch, batch[-1:])))
            else:
                waveform = model(batch)
            signals.append(waveform.flatten().numpy()[-count:])
    return np.cumsum(np.concatenate(signals))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Directory of the pinned modules, weights, videos and CSVs")
    args = parser.parse_args()
    torch.set_num_threads(2)
    models = {name: load_model(args.root, name) for name in HASHES}
    for i in (1, 2):
        frames, fps = face_video(args.root / f"sample_video_{i}.mp4")
        with (args.root / f"sample_vitals_{i}.csv").open() as reference:
            ppg = [float(row["ppg"]) for row in csv.DictReader(reference)]
        if len(ppg) != len(frames):
            raise ValueError("Reference and video frame counts differ.")
        truth = rate(ppg, fps)
        print(f"Sample {i}: {len(frames)} frames at {fps:.3f} Hz; contact = {truth:.1f} bpm")
        for name, model in models.items():
            bpm = rate(predict(model, name, frames), fps)
            print(f"  {name}: {bpm:.1f} bpm, absolute difference {abs(bpm - truth):.1f} bpm")


if __name__ == "__main__":
    main()
