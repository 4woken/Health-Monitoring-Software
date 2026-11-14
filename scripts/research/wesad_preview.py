"""Evaluate a wearable-only classifier on WESAD's public, compressed preview files."""

import argparse
import ast
from pathlib import Path

import numpy as np
from scipy.signal import butter, find_peaks, sosfiltfilt, welch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, confusion_matrix
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# The authors' preview keeps every fifth sample of the 700 Hz chest sensor.
HZ = 140
WINDOW = 60 * HZ


def read_subject(path):
    channels = {}
    with path.open(encoding="utf-8") as source:
        for line in source:
            name, _, values = line.strip().removeprefix("var ").partition("=")
            if name in ("ecg", "rsp", "pos"):
                channels[name] = np.fromstring(values[1:-2], sep=",")
            elif name == "lbl":
                channels[name] = ast.literal_eval(values[:-1])
    return channels


def features(ecg, respiration):
    # The preview rescales amplitudes separately per person. Use timings and
    # relative power within each minute, never the participant's absolute level.
    filtered = sosfiltfilt(butter(3, [5, 20], fs=HZ, btype="bandpass", output="sos"), ecg)
    energy = filtered ** 2
    peaks, _ = find_peaks(energy, distance=int(0.33 * HZ), prominence=np.percentile(energy, 95))
    intervals = np.diff(peaks) / HZ
    intervals = intervals[(intervals > 0.33) & (intervals < 1.5)]
    if len(intervals) < 20 or np.std(respiration) < 1e-8:
        return None
    freqs, spectrum = welch(respiration, fs=HZ, nperseg=WINDOW // 2)
    band = (freqs >= 0.1) & (freqs <= 0.6)
    power = spectrum[band]
    if power.sum() == 0:
        return None
    return [60 / np.median(intervals), np.std(intervals), 60 * freqs[band][power.argmax()],
            power.max() / power.sum()]


def windows(path):
    data = read_subject(path)
    rows, targets = [], []
    for i, label in enumerate(data["lbl"]):
        if label not in ("Base", "TSST", "Fun"):
            continue
        start, stop = data["pos"][i:i + 2].astype(int)
        for begin in range(start, stop - WINDOW + 1, WINDOW):
            end = begin + WINDOW
            sample = features(data["ecg"][begin:end], data["rsp"][begin:end])
            if sample is not None:
                rows.append(sample)
                targets.append(int(label == "TSST"))
    return np.asarray(rows), np.asarray(targets)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", type=Path, nargs="+", help="One official dta<ID>.js file per participant")
    args = parser.parse_args()
    if len(set(p.resolve() for p in args.files)) != len(args.files) or len(args.files) < 2:
        parser.error("Give distinct participant files for held-out-person validation.")
    sets = [windows(path) for path in args.files]
    matrices = []
    scores = []
    for i, (x, y) in enumerate(sets):
        other = [rows for j, rows in enumerate(sets) if j != i]
        model = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", random_state=0))
        model.fit(np.concatenate([pair[0] for pair in other]), np.concatenate([pair[1] for pair in other]))
        pred = model.predict(x)
        cm = confusion_matrix(y, pred, labels=[0, 1])
        score = balanced_accuracy_score(y, pred)
        scores.append(score)
        matrices.append(cm)
        print(f"{args.files[i].stem}: {len(y)} windows; TN FP FN TP = {cm.ravel()}; balanced = {score:.3f}")
    print(f"Mean subject balanced accuracy: {np.mean(scores):.3f}; pooled counts: {np.sum(matrices,axis=0).ravel()}")


if __name__ == "__main__":
    main()
