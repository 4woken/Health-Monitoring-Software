"""Run the site's MediaPipe + skin regions + POS/CHROM on public synchronized video files."""
import argparse
import csv
from pathlib import Path

import cv2
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Directory populated by fetch_samples.sh pulse")
    parser.add_argument("--site", default="http://127.0.0.1:5174", help="Pulsar Vite development server")
    args = parser.parse_args()
    origin = args.site.rstrip("/")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page()
        # A same-origin in-memory test document imports the actual development modules.
        page.route(origin + "/research-pulse-test", lambda route: route.fulfill(
            status=200, content_type="text/html", body='<input type="file" accept="video/mp4">'
        ))
        page.goto(origin + "/research-pulse-test")
        script = Path(__file__).with_name("compare_browser_pulse.js").read_text()
        for i in (1, 2):
            path = args.root / f"sample_video_{i}.mp4"
            with (args.root / f"sample_vitals_{i}.csv").open() as reference:
                ppg = [float(row["ppg"]) for row in csv.DictReader(reference)]
            cap = cv2.VideoCapture(str(path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            cap.release()
            page.locator("input").set_input_files(path)
            result = page.evaluate(script, {"fps": fps, "ppg": ppg})
            print(f"Sample {i}: {result}", flush=True)
        browser.close()


if __name__ == "__main__":
    main()
