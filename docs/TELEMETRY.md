# Medical telemetry prototype

Open **Send to Earth** in the top bar. **Prepare the report** writes a snapshot to this device, and **Send to Earth** puts it in the queue. While a report travels, the link clock runs by itself, in real time for orbit and the Moon and 60 times faster for the Mars delays, so you can watch it leave, arrive and its receipt come back. **Cut the link** holds the queue on board until the link is restored. Local health alerts continue independently of the link.

## Implemented storage and formats

- Medical inputs are JSON in `localStorage`, under `pulsar.medical.v1.<member>.<mission>`. They contain imported organ-dose intervals and the latest entered ocular examination, with source, time and unassessed fields retained as `null`.
- Transmission archives are records in IndexedDB `pulsar.telemetry.v1`, object store `packets`. The archive contains a readable local JSON preview, metadata, transfer state and the encrypted binary payload. The `keys` store holds the browser's non-extractable AES-GCM key.
- The health payload uses the versioned schema `pulsar.health.v1`: subject ID, mission/day, daily observations with units and acquisition provenance, signals, self-tests, organ inputs and calculated outputs, latest eye examination and cited sources. An optional simulation snapshot contains the current simulated minute and, when selected, previous samples. Daily observations and the simulated minute are separate. Portraits and camera footage are excluded.
- Encoding is real definite-length [CBOR (RFC 8949)](https://www.rfc-editor.org/rfc/rfc8949.html), followed by lossless gzip where the browser supports it, then AES-256-GCM with a fresh 96-bit nonce. SHA-256 covers the uncompressed CBOR. Verification actually decrypts, decompresses and checks the digest.
- **Download encrypted CBOR** exports a `pulsar.envelope.v1` CBOR map containing `packetId`, `encryption`, `compression`, `digest`, `iv` and binary `payload`. **Download readable JSON** exports the unencrypted health snapshot. Displayed JSON size uses compact JSON for a fair comparison with CBOR; the readable download is indented.

These are browser-local records, not a synchronized medical record system. Clearing site storage removes the archive and its key. The readable preview remains unencrypted locally. The encrypted export currently requires the same browser key: ground key provisioning and receiver interoperability are not implemented.

## What the link simulates

The application models durable queuing, urgent-before-routine priority, contact loss, one-way travel time, and a later acknowledgement. Packet IDs prevent the same archive from being queued twice. A packet already sent continues travelling when origin contact is lost; its return acknowledgement waits for contact. Records survive closing the panel and reloading the page.

This demonstrates the store-and-forward concept of [NASA DTN](https://www.nasa.gov/communicating-with-missions/delay-disruption-tolerant-networking/). It does **not** serialize [BPv7 bundles](https://www.rfc-editor.org/rfc/rfc9171.html), connect to a spacecraft gateway, transmit over a network, or implement routing, fragmentation, retransmission timers, bandwidth scheduling or receiver authentication. One departure per clock tick makes priority visible; it is not a link-capacity prediction. Delay selections are scenario values, not live Earth–Mars ephemerides. The prototype's receipts are always labelled simulated.

## Organ and eye inputs

`health/dosimetry.ts` implements the final RBE aggregation described in NASA-TM-20220006594: organ-averaged absorbed mGy by particle class becomes mGy-Eq. It integrates supplied intervals into 30-day, 365-day and mission totals and compares the appropriate organ reference limits. The annual window is a prototype convention. Missing time coverage and unknown prior-career exposure remain incomplete; even an incomplete recorded lower bound can trigger a limit alert. Imported intervals cannot overlap for the same organ.

The default organ dataset is a labelled synthetic uniform field, independent of destination. It is an arithmetic demonstration, not a prediction of a person's Mars exposure. Export the inputs from the radiation/eyes panel for the JSON schema, then import externally calculated organ doses using that schema. The input must already include transport through shielding and the body; this app does not run HZETRN or convert environmental mSv into a lens dose. `source` should identify the instrument/model, shielding, phantom and provenance. The `origin` field records the supplier's declaration, not independently verified authenticity.

The eye panel separately records OCT retinal thickness and baseline, refraction and baseline, intraocular pressure, folds and globe flattening for each eye. Findings prompt review using cited NASA examination criteria, without diagnosing SANS. A lens-dose exceedance raises the eye signal independently and cannot be downgraded by an ocular examination's review flag. Research, constants, units and primary references are in [DOSIMETRY_RESEARCH.md](DOSIMETRY_RESEARCH.md).

## Validation

Unit tests cover standard CBOR vectors, blackout/recovery and priority, published RBE arithmetic, dose-window boundaries, missing history, invalid organ/examination inputs and ocular review criteria. Browser verification covers archive persistence after reload, both downloads, encryption round-trip and rejection of modified ciphertext, the interrupted acknowledgement journey, eye-input import and examination saving, and desktop/mobile layout. The browser checks use an isolated test context and synthetic records.
