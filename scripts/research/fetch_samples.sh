#!/usr/bin/env bash
# Download pinned research inputs outside the application. No credentials or API required.
set -eu

dest=${1:?Usage: bash fetch_samples.sh /path/to/research-cache pulse-or-wesad}
suite=${2:?Choose pulse or wesad}
mkdir -p "$dest"

fetch() {
  local source=$1 filename=$2
  curl --fail --show-error --silent --location --retry 2 "$source" -o "$dest/$filename.part"
  mv "$dest/$filename.part" "$dest/$filename"
}

case "$suite" in
  pulse)
    toolbox='https://raw.githubusercontent.com/ubicomplab/rPPG-Toolbox/b7500b848f84ad7f86e277b4612563b69f4f88f9'
    examples='https://raw.githubusercontent.com/Rouast-Labs/vitallens-python/a19d08e7188f96bb33418f06dc95ebe9ea47afd5/examples'
    for model in DeepPhys PhysNet EfficientPhys; do
      weights="UBFC-rPPG_${model}"
      if [ "$model" = PhysNet ]; then weights="${weights}_DiffNormalized"; fi
      fetch "$toolbox/neural_methods/model/$model.py" "$model.py"
      fetch "$toolbox/final_model_release/$weights.pth" "$model.pth"
    done
    for i in 1 2; do
      fetch "$examples/sample_video_$i.mp4" "sample_video_$i.mp4"
      fetch "$examples/sample_vitals_$i.csv" "sample_vitals_$i.csv"
    done
    ;;
  wesad)
    preview='https://raw.githubusercontent.com/kristofvl/wesadviz/87669be86a1ce095e54fe0b25b87f7311187c03d'
    for id in 2 3 4 5 6 7 8 9 10 11 13 14 15 16 17; do
      fetch "$preview/dta$id.js" "dta$id.js"
    done
    ;;
  *) echo 'Choose pulse or wesad.' >&2; exit 2 ;;
esac
