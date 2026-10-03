"""Build-time Vietnamese audio for every advice card + UI prompt (SPEC §7.2).

Reads content/advice.vi.json -> Piper TTS (vi_VN-vais1000-medium, CC BY 4.0 voice data) -> WAV ->
ffmpeg -> public/audio/vi/<id>.ogg (Opus 24 kbps mono) and .mp3 (32 kbps mono, fallback for old iOS).

Usage:
  python -m venv .ttsvenv && .ttsvenv/bin/pip install piper-tts
  .ttsvenv/bin/python tools/tts/generate.py
Requires ffmpeg on PATH. Voice files are downloaded to tools/tts/voices/ (not committed).
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VOICE = "vi_VN-vais1000-medium"
VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/"
VOICES = Path(__file__).parent / "voices"
OUT = ROOT / "public" / "audio" / "vi"


def ensure_voice() -> Path:
    VOICES.mkdir(exist_ok=True)
    for f in (f"{VOICE}.onnx", f"{VOICE}.onnx.json"):
        dest = VOICES / f
        if not dest.exists():
            urllib.request.urlretrieve(VOICE_URL + f, dest)
    return VOICES / f"{VOICE}.onnx"


def main() -> None:
    advice = json.loads((ROOT / "content" / "advice.vi.json").read_text())
    items = {cid: c["audio_text"] for cid, c in advice["cards"].items()}
    items.update(advice["ui_prompts"])
    model = ensure_voice()
    piper = Path(sys.executable).parent / "piper"
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for cid, text in items.items():
            wav = Path(tmp) / f"{cid}.wav"
            subprocess.run([str(piper), "-m", str(model), "-f", str(wav), "--sentence-silence", "0.35"],
                           input=text.encode(), check=True, capture_output=True)
            common = ["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-ac", "1"]
            subprocess.run(common + ["-c:a", "libopus", "-b:a", "24k", "-application", "voip", str(OUT / f"{cid}.ogg")], check=True)
            subprocess.run(common + ["-ar", "22050", "-c:a", "libmp3lame", "-b:a", "32k", str(OUT / f"{cid}.mp3")], check=True)
            sz = (OUT / f"{cid}.ogg").stat().st_size + (OUT / f"{cid}.mp3").stat().st_size
            total += sz
            print(f"{cid:18s} {sz / 1024:6.1f} KB  {text[:60]}…")
    manifest = {"voice": VOICE, "voice_license": "CC BY 4.0 (VAIS-1000 corpus) via rhasspy/piper-voices",
                "engine": "piper-tts", "items": sorted(items)}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"total {total / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
