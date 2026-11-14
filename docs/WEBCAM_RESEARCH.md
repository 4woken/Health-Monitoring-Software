# Camera and wearable experiments

The pulse and wearable experiments ran locally on an Apple Silicon Mac. The Python scripts take files on disk. Personal camera footage, participant identifiers and research weights do not pass through the application.

## Pulse from real face videos

We ran the published UBFC-rPPG checkpoints for DeepPhys, PhysNet and EfficientPhys against two face videos with synchronized contact recordings. The reference below is the dominant pulse frequency in the finger PPG waveform over the same interval as the camera prediction. It is one estimate per clip. [Models and paper](https://github.com/ubicomplab/rPPG-Toolbox) · [Videos and synchronized measurements](https://github.com/Rouast-Labs/vitallens-python/tree/a19d08e7188f96bb33418f06dc95ebe9ea47afd5/examples)

| Video    | Duration | Finger PPG | DeepPhys |  PhysNet | EfficientPhys |
| -------- | -------: | ---------: | -------: | -------: | ------------: |
| Sample 1 |   11.8 s |   75.6 bpm | 76.5 bpm | 76.3 bpm |      75.8 bpm |
| Sample 2 |   21.0 s |   60.4 bpm | 60.2 bpm | 60.2 bpm |      60.2 bpm |

OpenCV located the largest face in the first video frame. We expanded its box by a factor of 1.5 and resized each crop to 72 × 72 pixels. Each checkpoint received its expected normalized inputs. We integrated its predicted pulse differences, linearly detrended and filtered at 0.7–3 Hz. A Hann-window periodogram located the strongest frequency in both prediction and reference. The last incomplete model window was evaluated with preceding real frames.

Each model was within one bpm on these clips. Two short recordings provide little evidence about other people, head movement, lighting, device variation or failure rates. No reliability ranking or medical claim follows from them. Both public samples were evaluated offline. The app can keep its existing browser pulse estimator independently of this experiment. The upstream software carries the Responsible AI Source Code License 1.1 and its use restrictions. [Upstream terms](https://github.com/ubicomplab/rPPG-Toolbox/blob/b7500b848f84ad7f86e277b4612563b69f4f88f9/LICENSE)

## POS and CHROM in the browser

Chrome decoded both public videos frame by frame. The test imported the project's MediaPipe tracker, facial regions, skin sampler, motion gate and pulse estimators. All 354 and 630 frames, respectively, yielded accepted skin colours. These rates use the last ten seconds as displayed by the app; they describe a shorter interval than the neural comparison above. We computed the finger-PPG reference for that same interval. Both algorithms cleared their individual signal-quality thresholds.

| Last 10 seconds | Finger PPG |      POS |    CHROM |
| --------------- | ---------: | -------: | -------: |
| Sample 1        |   75.3 bpm | 74.1 bpm | 73.9 bpm |
| Sample 2        |   61.3 bpm | 61.8 bpm | 62.2 bpm |

## WESAD with chest sensors

We tested a logistic-regression baseline on all 15 participants in the authors’ compressed preview. Inputs were **chest ECG and breathing-belt waveforms**. The target was the study's Trier Social Stress Test (TSST) phase. The comparison group pooled rest and amusement. The protocol labels describe the experimental condition. WESAD contains synchronized wearable recordings. A laptop webcam supplies different signals and cannot run this classifier as tested. [Study and conditions of use](https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html) · [Authors’ data preview](https://github.com/kristofvl/wesadviz)

Each non-overlapping 60-second window came entirely from one study phase. The four features were ECG-derived median heart rate, interbeat-interval standard deviation, dominant respiratory frequency and its share of respiratory-band power. We used timing and relative power because the authors’ preview quantizes each person's recording and rescales it into plotting coordinates. In each of 15 folds the scaler and classifier were fitted on the other 14 people. There was no window from the held-out person in training.

| Held-out result                                                  |        Value |
| ---------------------------------------------------------------- | -----------: |
| People / scored windows                                          |     15 / 548 |
| Mean of each person's balanced accuracy                          |        83.0% |
| Lowest / highest person’s balanced accuracy                      | 55.8% / 100% |
| TSST windows flagged / missed                                    |     140 / 26 |
| Rest or amusement windows correctly classified / falsely flagged |     314 / 68 |

These are outcomes on a controlled laboratory protocol using two worn sensors. The preview scales against each participant’s full recording, including later phases. Real-time wearable deployment would need its own calibration and evaluation. An astronaut's stress level cannot be inferred from this experiment. The data owners permit scientific, noncommercial use with attribution. [Schmidt, Reiss, Duerichen, Marberger and Van Laerhoven (2018)](https://doi.org/10.1145/3242969.3242985)

## Reproduce the runs

The commands below use Python 3.13, approximately 55 MB of pulse inputs, and 480 MB of WESAD preview data. The pulse script checks SHA-256 for the six source and weight files and uses PyTorch's weights-only loader. The WESAD script reads the preview's numeric arrays as data.

```bash
research_dir="$(mktemp -d)"
python3.13 -m venv "$research_dir/venv"
source "$research_dir/venv/bin/activate"
python -m pip install numpy==2.1.3 scipy==1.15.3 scikit-learn==1.6.1 torch==2.9.0 opencv-python-headless==4.11.0.86

bash scripts/research/fetch_samples.sh "$research_dir" pulse
python scripts/research/pulse_models.py "$research_dir"

bash scripts/research/fetch_samples.sh "$research_dir" wesad
python scripts/research/wesad_preview.py "$research_dir"/dta*.js
```

To repeat the browser comparison, start the Vite development server and provide its URL. The test opens an isolated headless Chrome session and reads the public MP4 files through a file input. Chrome must be installed.

```bash
python -m pip install playwright==1.55.0
python scripts/research/compare_browser_pulse.py "$research_dir" --site http://127.0.0.1:5174
```
