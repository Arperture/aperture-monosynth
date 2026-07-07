#!/bin/bash
# Downloads the Clash Display woff2 files from Fontshare into app/assets/fonts.
# Clash Display is free to use (Fontshare Free Font License) but may not be
# redistributed, so it is not committed to this repository. The UI falls back
# to Hanken Grotesk if these files are absent.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/app/assets/fonts"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
CSS_URL="https://api.fontshare.com/v2/css?f%5B%5D=clash-display%40500&f%5B%5D=clash-display%40600&display=swap"

mkdir -p "$DIR"
css=$(curl -sA "$UA" "$CSS_URL")

fetch_weight() {
  local weight="$1"
  local url
  url=$(printf '%s' "$css" \
    | awk -v w="font-weight: $weight" 'BEGIN{RS="@font-face"} $0 ~ w' \
    | grep -oE "//[^')]+\.woff2" | head -1)
  if [ -z "$url" ]; then
    echo "could not find woff2 URL for weight $weight" >&2
    exit 1
  fi
  curl -sL -A "$UA" "https:$url" -o "$DIR/clash-display-$weight.woff2"
  echo "fetched clash-display-$weight.woff2"
}

fetch_weight 500
fetch_weight 600
echo "done."
