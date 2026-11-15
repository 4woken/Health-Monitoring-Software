# Organ dosimetry and ocular monitoring

Research checked on 15 November 2026. This note separates published measurement methods and constants from implementation proposals for Pulsar. It does not certify the application as a NASA flight system.

## Applicable references

The NASA standards catalogue currently lists **NASA-STD-3001 Volume 1, Revision C, approved 15 September 2023**, and **Volume 2, Revision F, approved 14 July 2026**. The Volume 1 radiation tables are on PDF pages 40–41. [NASA standards catalogue](https://standards.nasa.gov/all-standards), [Volume 1 signed PDF](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)

## What NASA measures and calculates

NASA's Crew Active Dosimeters measure absorbed dose through calibrated sensors. Their timestamped readings are transferred by Bluetooth to onboard laptops for downlink; their displays show recent dose rate and total mission dose. Area monitors additionally characterize particle types and LET spectra. Organ dose is not simply the reading of a badge positioned on the chest. [NASA SRAG: protection and detectors](https://srag.jsc.nasa.gov/spaceradiation/how/how.cfm)

Volume 2 distinguishes area monitoring, individual monitoring, external space weather, and alerting. Requirements V2 6161–6165 cover these functions; V2 6164 specifically requires crew alerts even when Earth communication is unavailable, with operations informed when communication returns. Exposure limits are exclusion limits, not assurances that exposure below them is harmless. [NASA Volume 2, section 6.8.1](https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/)

## Implementable organ-dose calculation

NASA-TM-20220006594 (August 2022), section 2.2 and Table 1, describes RBE weighting at organ/tissue points. The following factors are the report's **implemented TARIS convention**, including its extensions beyond the narrower particle ranges printed in the standard:

| Contribution to absorbed dose at the organ | RBE |
| ------------------------------------------ | --: |
| Neutrons below 1 MeV                       | 5.0 |
| Neutrons from 1 through 5 MeV              | 6.0 |
| Neutrons above 5 MeV                       | 3.5 |
| Protons, all energies                      | 1.5 |
| Ions with atomic number Z > 1              | 2.5 |

For each organ T, use **organ-averaged absorbed doses**, already transported through vehicle/body shielding:

```text
grayEquivalent[T, interval] = sum(absorbedDose_mGy[T, particleBin] * RBE[particleBin])
grayEquivalent[T, window] = sum(grayEquivalent[T, intervals in window])
```

The result is in **mGy-Eq**, not mSv. A rate input must first be integrated over elapsed time. The model must not apply these factors to an existing dose-equivalent or effective-dose value. The report discusses biological and computational uncertainty; these factors are not a precise cataract probability model. [NASA-TM-20220006594](https://ntrs.nasa.gov/api/citations/20220006594/downloads/NASA-TM-20220006594.pdf)

OLTARIS adopted the organ-location method on **20 April 2023**. Its changelog explicitly contrasts it with the earlier weighting of incident particles outside the body. Thus Pulsar can accurately implement this final aggregation stage without claiming to reproduce the transport calculation. [OLTARIS change log](https://oltaris.nasa.gov/changelog)

NASA HZETRN tracks primary radiation and secondaries generated in shielding. Geometry, particle energy, material, body self-shielding and organ sampling belong upstream of the above equation. A single environmental mSv/day number cannot determine these inputs. [NASA HZETRN2020 description, 2026 paper](https://ntrs.nasa.gov/citations/20260008568)

## Limits to compare with the appropriate quantity

NASA-STD-3001 Vol. 1 Rev. C, Table 4.8-1:

| Tissue                   | Unit   | 30 days | One year |         Career |
| ------------------------ | ------ | ------: | -------: | -------------: |
| Lens                     | mGy-Eq |    1000 |     2000 |           4000 |
| Skin                     | mGy-Eq |    1500 |     3000 |           6000 |
| Blood-forming organs     | mGy-Eq |     250 |      500 | Not applicable |
| Circulatory system       | mGy-Eq |     250 |      500 |           1000 |
| CNS, at hippocampus      | mGy    |     500 |     1000 |           1500 |
| CNS, Z ≥ 10 contribution | mGy    |       — |      100 |            250 |

CNS values use absorbed dose: do not apply the above non-cancer RBE table. Circulatory values average heart muscle and adjacent arteries. Lens limits address early severe cataracts; later cataracts can occur below them. The separate **600 mSv** career limit applies to NASA **effective dose**, accounting for prior spaceflights. It is not an eye-dose limit. [NASA radiation standard, section 4.8](https://www.nasa.gov/reference/4-0-human-performance/)

The standard's Table 4.8-2 has narrower RBE descriptions: neutrons 1–5 MeV: 6; 5–50 MeV: 3.5; heavy ions: 2.5; protons above 2 MeV: 1.5. Its footnotes emphasize sparse neutron and high-Z cataract data. Use the explicitly named 2022 computational convention above when extending those ranges, not an invented claim that those extensions are precisely measured biological constants. [Signed standard, page 41](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)

## Ocular observations are a separate record

NASA's 2023 clinical update lists vision screening, fundoscopy, OCT, ultrasound and tonometry aboard the ISS. The earliest SANS findings include at least one of: peripapillary total retinal thickness increase **≥20 µm**, chorioretinal folds, posterior globe flattening, or hyperopic refraction change **≥+0.75 D**. These are examination findings, not measurements obtainable from an ordinary webcam. [NASA clinical-update abstract](https://ntrs.nasa.gov/citations/20220014606)

The corresponding 2023 presentation's diagnostic table additionally describes OCT thickness increase **≥55 µm** and/or **Frisén grade ≥1** as clinically concerning. Flattening/axial-length change and refractive shift are assessed independently. Preserve right/left eye, baseline, instrument, exam time and clinical interpretation; optic nerve sheath diameter alone is not this criterion. In the app these criteria should prompt review, not declare a medical diagnosis. [NASA clinical-update presentation, slide 10](https://ntrs.nasa.gov/citations/20230001492)

The 2024 clinical update cautions that mechanisms and relationships between severity/duration and long-term visual consequences remain unresolved. It reports no corresponding reduction in clinically significant optic disc edema as average cabin CO2 declined. Therefore a deterministic formula turning gravity, CO2 or lens radiation into SANS severity would overstate the evidence. [NASA investigators' 2024 primary abstract](https://www.abstractscorecard.com/uploads/Tasks/upload/21810/DPPWZUCK-1654829-1-PDF.pdf)

## Proposed Pulsar contract

The following is software design guidance, not a NASA requirement:

- Accept absorbed-dose contributions per organ, interval and supported particle bin. Validate finite, non-negative values and consistent units; retain unknown/missing coverage explicitly.
- Include `origin` (`simulated`, `instrument`, `transport-model`), source/instrument/model identifier, timestamps, record ID, interval duration, and any uncertainty or coverage flags.
- Synthetic particle/organ inputs can demonstrate the exact weighting and integration mathematics. Label them **Simulated organ dose**, with the assumed inputs inspectable. Do not derive them silently by splitting the existing environmental mSv/day into invented particle fractions or invent organ conversion coefficients.
- A useful deterministic test vector is 1 mGy of protons + 0.2 mGy of 1–5 MeV neutrons + 0.1 mGy of heavy ions in the lens: 2.95 mGy-Eq. This is an arithmetic fixture, not an astronaut exposure estimate.
- Track 30-day, annual and available career history separately. Unknown prior history must not be displayed as zero prior dose. State the implemented calendar/window convention and test the boundaries.
- Use a standard limit as a comparison reference. Any earlier amber warning percentage or five-times-background rate threshold remains a configurable application policy, not a published NASA medical threshold.
- Keep instantaneous/environmental dose-equivalent telemetry, organ gray-equivalent and career effective dose in distinct fields. The existing `cabinOn` mSv/day accumulation is a simulated environmental surrogate; comparing it directly to a personal NASA effective-dose budget is not a complete NASA dose assessment.
- Display actual ocular examination fields and source provenance alongside the model. Missing OCT/refraction should remain absent; simulations may populate clearly labeled example examinations. A browser acuity self-test must not silently become an OCT or tonometry measurement.

This provides real calculation logic and NASA-aligned quantities now. Actual personal organ dose estimates require imported transport outputs or calibrated radiation field measurements with validated conversion/transport data; those inputs are not currently present in this repository.

## Public example input and time-window follow-up

A targeted public-source search on 15 November 2026 did **not** identify a small, reusable table containing both organ-specific absorbed doses (including the lens) and the particle/energy contributions needed by this calculation. This is a search result, not a claim that no such dataset exists. The public [2009 OLTARIS overview](https://ntrs.nasa.gov/api/citations/20090008659/downloads/20090008659.pdf) illustrates aggregate responses and says result tables can be downloaded. The [2022 gray-equivalent report](https://ntrs.nasa.gov/api/citations/20220006594/downloads/NASA-TM-20220006594.pdf), Tables 2–4, reports BFO mGy-Eq by vehicle configuration and algorithm, not the component absorbed doses. Already-weighted mSv or mGy-Eq totals cannot uniquely recover those inputs.

The current [OLTARIS homepage](https://oltaris.nasa.gov/) requires registration and administrator approval for analysis access. It supports Mars atmosphere models and organ/phantom response calculations, but no anonymously accessible example export with the required complete inputs was located. Do not substitute a 5-cm tissue reference field or a whole-body average for a measured lens dose. For the present prototype, retain explicitly synthetic organ inputs and accept external transport-output JSON with model, environment, shielding, phantom, interval and units preserved. Uniform values across organs are an inspectable demonstration assumption, not a physical prediction that organs receive identical doses.

NASA-STD-3001 Vol. 1 Rev. C Table 4.8-1 calls its annual column **1-Year**; the reviewed text does not define it as exactly 365 rolling UTC days. The prototype may use `(now - 365 × 86400 seconds, now]` as an explicit software convention, labeled **365 jours glissants — convention du prototype**. That convention must not be described as a verified NASA operational compliance rule. A 365-day window and a calendar year differ around leap years. For an interval crossing the boundary, integrate only the overlap when a constant interval rate is justified; otherwise mark its allocation uncertain. Historical coverage must remain visible. [NASA standard, section 4.8](https://www.nasa.gov/reference/4-0-human-performance/)
