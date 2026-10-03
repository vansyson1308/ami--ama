#!/usr/bin/env bash
# Regenerate demo media (needs a production build being served by `npm run preview`, Playwright Chromium and ffmpeg).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf docs/media/raw
MEDIA=1 npx playwright test tests/media.spec.ts
cd docs/media
ffmpeg -loglevel error -y -i raw/demo.webm -vf "fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 28 -movflags +faststart -an ami-ama-demo.mp4
ffmpeg -loglevel error -y -i raw/demo.webm -vf "fps=8,scale=270:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" ami-ama-demo.gif
for f in raw/0*.png; do ffmpeg -loglevel error -y -i "$f" -q:v 3 "$(basename "${f%.png}").jpg"; done
ls -la
