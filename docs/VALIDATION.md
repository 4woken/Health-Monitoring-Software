# Validating the webcam pulse

Goal: answer the question "how do you measure quality?" with numbers. We compare the pulse the app estimates with a reference recorded at the same time, then publish the difference together with the conditions of the measurement.

This protocol evaluates an educational prototype. It is not a clinical validation, and it does not make the app a medical device.

## What the app computes

The **Pulse** view of the **Camera** page uses one webcam capture, shared with the 3D heart of the **Body** screen.

1. **Face**: MediaPipe Face Landmarker places 468 points on the face, on the computer.
2. **Skin**: the mean red, green and blue of the forehead and both cheeks, about 30 times a second. Very dark and very bright pixels are left out. Frames in which the selected facial landmarks move by more than 1.32% of the frame dimensions on average are skipped. This allows 10% more movement than the previous 1.20% cutoff. A larger movement clears the displayed rate for at least 1.5 seconds.
3. **Signal**: the samples are resampled to 30 Hz. If the shared log-brightness varies by more than 0.5% RMS in the pulse band, the pipeline estimates each colour channel’s sensitivity to that fluctuation. It corrects the differences in gain, reaching full correction at 1% RMS. It then applies the POS method (Wang, den Brinker, Stuijk and de Haan, _Algorithmic Principles of Remote PPG_, IEEE Trans. Biomed. Eng. 64(7):1479-1491, 2017) in a sliding window of 1.6 s.
4. **Rate**: the trend is removed, a fourth-order Butterworth band-pass filter from 0.7 to 3.0 Hz (42 to 180 bpm) runs in both directions, then the rate is the peak of the spectrum over the last 10 seconds.
5. **Quality**: the signal-to-noise ratio of the spectrum, in the spirit of de Haan and Jeanne (2013): the power around the peak and its first harmonic, compared with the rest of the band. It is scaled between 0 and 1 (−1 dB gives 0, 7 dB gives 1). A strong periodic lighting peak within one frequency-resolution interval of the candidate pulse also suppresses the reading.
6. **Display**: the first value comes after 8 seconds of signal. A pulse is shown only above a quality of 0.35, and the number shown is the median of the last five accepted estimates.

The code is in `src/camera/pulse/`, and its tests are in `rppg.test.ts` and `skinRegions.test.ts`. On synthetic signals (sensor noise, light drift, dropped frames), the tests require an error of 2 bpm or less between 48 and 165 bpm, and a quality below the threshold when there is no pulse.

### Comparing POS and CHROM

In the camera tools, in **Pulse camera**, tick **Compare POS and CHROM**. Both methods analyse the same forehead and cheek samples at the same moment. Each value appears once the window holds at least eight seconds and the signal passes that method's quality threshold. The large display, the heart animation and the CSV always use the smoothed POS value; the two comparison values use the current window, before smoothing.

For CHROM, each colour channel is normalised over a 1.6-second window. The two chrominance projections are filtered between 0.7 and 3 Hz and combined in the ratio of their standard deviations. The windows overlap by 50% with a Hann weighting ([de Haan and Jeanne, 2013](https://doi.org/10.1109/TBME.2013.2266196)).

Two public recordings replayed in Chrome gave, over their last ten seconds, 74.1 and 61.8 bpm with POS, and 73.9 and 62.2 bpm with CHROM. The finger pulse over the same intervals was 75.3 and 61.3 bpm. [Protocol and reproduction](WEBCAM_RESEARCH.md).

### Controlled lighting replay

We replayed 18 lighting variants on the forehead/cheek RGB time series extracted from each public video. Each variant applies an oscillating brightness change with unequal channel gains. The two original videos and their synchronized finger-PPG references are the same across all 36 cases. The frequency, amplitude, channel gains and phase are fixed in `scripts/research/compare_browser_pulse.js`. Motion and video decoding are held constant. [Videos and reproduction](WEBCAM_RESEARCH.md).

| Lighting replay                  | Readings displayed | Readings within 5 bpm of the finger sensor | Readings withheld |
| -------------------------------- | -----------------: | -----------------------------------------: | ----------------: |
| POS before exposure correction   |              36/36 |                                       3/36 |                 0 |
| POS with exposure correction     |              20/36 |                                      20/36 |                16 |
| CHROM before exposure correction |              24/36 |                                      13/36 |                12 |
| CHROM with exposure correction   |              24/36 |                                      24/36 |                12 |

On both original videos, the four unperturbed readings agreed with their previous values at the reported precision (0.1 bpm). Each lighting variant reuses an existing recording. These figures measure robustness to the specified perturbations, rather than accuracy across people, cameras or physical lighting conditions.

### Export

The **Download CSV** button saves only the numbers shown during the measurement:

```text
timestamp_ms,time_s,bpm,quality
1731582012345,12.40,71.8,0.742
```

- `timestamp_ms`: the computer's clock, in milliseconds since 1970
- `time_s`: seconds since the camera started
- `bpm`: the value shown
- `quality`: the quality at the same moment

The file is named `pulse-session-` followed by the date and time. The pulse log contains no images, facial landmarks or colour samples. Saving a portrait to a profile is a separate action in avatar setup or the face studio.

## Check with a simulated camera

Before filming people, we check the whole chain (camera, face, skin regions, POS, spectrum, display) with a video whose pulse is known. `scripts/fake-webcam.py` (Python, with numpy and Pillow) turns a front-facing photo into a 640 × 480 Y4M video at 30 frames a second. The skin colour changes at the requested rate: 0.5% in the green, along the blood-pulse direction that POS uses, shaped like a pulse wave (a systolic peak, then a diastolic wave), with sensor noise and a slow drift of the light. The loop holds a whole number of beats, so Chrome repeats it without a jump.

```sh
python scripts/fake-webcam.py portrait.jpg pulse72.y4m --bpm 72
chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=C:/full/path/pulse72.y4m
```

Then pick a crew member, open the **Camera** page, choose **Pulse**, press **Start the camera** and wait about twenty seconds.

Result of 14 November 2026, with an official NASA astronaut portrait (public domain, not stored in the repository), in a headless Chrome that draws the 3D on the processor and analyses only 5 to 10 frames a second:

| Pulse in the video | Pulse shown (median, range) | Values shown in about 1 min | Mean quality |
| ------------------ | --------------------------- | --------------------------- | ------------ |
| 72 bpm             | 71.2 bpm (68.6 to 73.0)     | 339                         | 0.63         |
| 96 bpm             | 95.0 bpm (93.2 to 96.9)     | 122                         | 0.55         |

The face was found, and the portrait was captured and laid on the body. The moments without a value ("Weak signal") match this low analysis rate. This test says nothing about accuracy on a real person: a still photo has no movement, no real skin reflections and no video compression. It shows that the chain works and that the pulse read matches the pulse put in.

## Equipment

- The webcam that will be used for the demonstration, at 640 × 480 or more and 30 frames a second.
- A reference: a **finger pulse oximeter**, ideally one that can export its readings. Otherwise, a second person writes down the value every 5 seconds, or films the screen of the oximeter.
- Optional: **OBS Studio**, to record the same session and process it later with rPPG-Toolbox.

## Protocol

1. **Set up the scene**: soft light from the front, no window behind the person, face 50 to 70 cm from the camera, forehead uncovered. If the webcam allows it, lock the automatic exposure.
2. **Synchronise**: note the computer's time at the start. If the reference has its own clock, note the difference between the two clocks.
3. **Measure** for 2 minutes per condition, with the oximeter on:
   - at rest, keeping still
   - just after light exercise (for example 30 squats), to cover a higher pulse
   - while talking or moving the head a little
   - in dim light
   - with glasses, if the person wears them
4. **Vary the people**: several skin tones (Fitzpatrick types I to VI if possible), ages and amounts of facial hair. Camera methods are known to be less accurate on darker skin and in low light: the report must show this bias.
5. **Export** the CSV from the app, and the reference as `time_s,bpm` or `timestamp_ms,bpm`.
6. **Compare** the two files with the script below.

Ask each person filmed for their consent. Delete the test videos once the measurements are extracted.

## Reference format

The file needs a header row, a time column and a pulse column. Columns are separated by commas or semicolons; with semicolons, decimal commas are accepted too.

```text
time_s,bpm
0,72
5,73
10,71
```

Names recognised for the time: `timestamp_ms`, `epoch_ms`, `unix_ms` (clock time), and `time_s`, `time`, `t`, `seconds`, `sec` (elapsed time). Names recognised for the pulse: `bpm`, `hr`, `heart_rate`, `heartrate`, `pulse`, `pulse_rate`, `pr`.

## Running the comparison

```sh
node scripts/compare-pulse.mjs pulse-session.csv oximeter.csv
```

Useful options:

- `--offset=<s>` shifts the reference when it started after the app (seconds added to the reference times)
- `--window=<s>` sets the largest time gap allowed for a pair, 1 s by default
- `--min-quality=<q>` ignores app values below a given quality
- `--clock=wall` or `--clock=relative` forces the matching on clock time (`timestamp_ms`) or on elapsed time (`time_s`)
- `--json` prints the result in a form a program can read

The script pairs each app value with the nearest reference value in time, then prints:

| Measure           | Meaning                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Pairs             | Number of measurements compared                                                               |
| MAE               | Mean absolute error, in bpm                                                                   |
| RMSE              | Root mean square error: large errors weigh more                                               |
| MAPE              | Mean absolute error as a percentage of the reference                                          |
| Pearson r         | How well the changes agree (1 means the app follows the reference perfectly)                  |
| Bland-Altman bias | Mean difference, app minus reference: a positive value means the app reads high               |
| 95% limits        | Bias ± 1.96 standard deviations of the differences: 95% of differences should fall in between |
| Within 5 bpm      | Share of pairs that differ by 5 bpm or less                                                   |

A rough benchmark: for ECG heart-rate devices, the ANSI/AAMI EC13 standard is often quoted with a tolerance of ±10% or ±5 bpm. A result close to this benchmark is not a certification.

## Optional: compare with rPPG-Toolbox, offline

[rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox) (NeurIPS 2023, Datasets and Benchmarks) gathers unsupervised and supervised rPPG methods and reference datasets. It is a research tool in Python and PyTorch.

1. Record the session with OBS, with the same webcam and the same light, and the oximeter on.
2. Install the toolbox as its README explains, and run one of its unsupervised methods (POS or CHROM, in the `unsupervised_methods` folder) on the video. A personal video may need a small loader, because the toolbox is organised around its datasets.
3. Produce a `time_s,bpm` file, for example an estimate over a 10 s window every second, then run `compare-pulse.mjs` with this file as the reference.

This comparison shows whether our browser implementation behaves like a research implementation on the same video. It does not replace the oximeter: two camera methods can be wrong in the same way.

## Licences

- **rPPG-Toolbox**: _Responsible Artificial Intelligence Source Code License_ (RAIL) v1.1. It allows reuse but forbids some uses, including surveillance and decisions about care or insurance, and these restrictions follow the code. It is therefore used only for offline validation and is not shipped with the app.
- **heartbeat-js**: GPL-3.0, and it depends on OpenCV.js. Not used: the app implements POS itself, with no extra dependency.
- **MediaPipe**: Apache-2.0, already shipped locally in `public/face/`.

## Report template

| Condition       | Person (Fitzpatrick) | Duration | Pairs | MAE (bpm) | RMSE (bpm) | Bias (bpm) | 95% limits (bpm) | r   | ≤ 5 bpm |
| --------------- | -------------------- | -------- | ----- | --------- | ---------- | ---------- | ---------------- | --- | ------- |
| At rest, still  |                      | 2 min    |       |           |            |            |                  |     |         |
| After exercise  |                      | 2 min    |       |           |            |            |                  |     |         |
| Talking, moving |                      | 2 min    |       |           |            |            |                  |     |         |
| Dim light       |                      | 2 min    |       |           |            |            |                  |     |         |
| With glasses    |                      | 2 min    |       |           |            |            |                  |     |         |

Also give: the webcam and its resolution, the lighting, the reference used (oximeter model), the quality threshold applied, and the share of time when the app showed no value. A missing value is better than a wrong one, but it must be counted.
