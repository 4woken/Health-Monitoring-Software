"""Turns a still portrait into a fake webcam video with a known pulse, to test the Pulse camera.

The output is a Y4M file (I420, 640 x 480, 30 frames a second) that Chrome can use as its camera:

    chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \\
           --use-file-for-fake-video-capture=/full/path/pulse72.y4m

Then open the Camera page, choose Pulse and press Start the camera. The rate shown should match --bpm.

Usage:
    python scripts/fake-webcam.py portrait.jpg pulse72.y4m --bpm 72
    python scripts/fake-webcam.py portrait.jpg pulse96.y4m --bpm 96 --box 158,0,958,600

Needs numpy and Pillow. Ten seconds of video take about 140 MB. See docs/VALIDATION.md.
"""

import argparse

import numpy as np
from PIL import Image

W, H, FPS = 640, 480, 30
# Direction of the blood-volume pulse in normalised skin RGB (Wang et al., 2017).
PULSE_DIRECTION = np.array([0.33, 0.77, 0.53], dtype=np.float32)


def pulse_shape(phase):
    """Pulse wave over one beat: a systolic peak, then a smaller diastolic wave."""
    return np.exp(-(((phase - 0.15) / 0.07) ** 2)) + 0.35 * np.exp(-(((phase - 0.45) / 0.1) ** 2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('portrait', help='front-facing photo, JPEG or PNG')
    parser.add_argument('out', help='video file to write, .y4m')
    parser.add_argument('--bpm', type=float, required=True, help='pulse rate to put in the skin colour')
    parser.add_argument('--seconds', type=float, default=10, help='about how long the loop lasts (default 10)')
    parser.add_argument('--box', help='crop x0,y0,x1,y1 in the photo; default: widest 4:3 box at the top')
    parser.add_argument('--amplitude', type=float, default=0.005, help='change in green, share (default 0.005)')
    args = parser.parse_args()

    photo = Image.open(args.portrait).convert('RGB')
    if args.box:
        box = tuple(int(v) for v in args.box.split(','))
    else:
        width = min(photo.width, photo.height * W // H)
        left = (photo.width - width) // 2
        box = (left, 0, left + width, width * H // W)
    base = np.asarray(photo.crop(box).resize((W, H), Image.LANCZOS), dtype=np.float32)

    # Chrome loops the file: the loop is stretched to a whole number of beats, so the pulse has no jump.
    beats = max(1, round(args.bpm * args.seconds / 60))
    frames = int(round(beats * 60 / args.bpm * FPS))
    duration = frames / FPS
    rate = beats / duration

    grid = np.linspace(0, 1, 2000, endpoint=False)
    mean = pulse_shape(grid).mean()
    peak = np.abs(pulse_shape(grid) - mean).max()
    amplitude = args.amplitude * PULSE_DIRECTION / PULSE_DIRECTION[1]
    rng = np.random.default_rng(1)

    with open(args.out, 'wb') as out:
        out.write(f'YUV4MPEG2 W{W} H{H} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
        for i in range(frames):
            t = i / FPS
            wave = (pulse_shape((rate * t) % 1) - mean) / peak
            # Skin darkens as blood volume rises. A slow light drift and sensor noise, as from a real camera.
            light = 1 + 0.008 * np.sin(2 * np.pi * t / duration)
            image = base * light * (1 - amplitude * wave) + rng.normal(0, 1.5, base.shape).astype(np.float32)
            r, g, b = np.moveaxis(np.clip(image, 0, 255) / 255, 2, 0)
            # BT.601 limited range, as Chrome reads I420.
            y = 16 + 65.481 * r + 128.553 * g + 24.966 * b
            cb = (128 - 37.797 * r - 74.203 * g + 112.0 * b).reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
            cr = (128 + 112.0 * r - 93.786 * g - 18.214 * b).reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
            out.write(b'FRAME\n')
            for plane in (y, cb, cr):
                out.write(np.clip(np.round(plane), 0, 255).astype(np.uint8).tobytes())

    print(f'{args.out}: {frames} frames, {beats} beat{"s" if beats != 1 else ""} in {duration:.2f} s, so {rate * 60:.1f} bpm')


if __name__ == '__main__':
    main()
