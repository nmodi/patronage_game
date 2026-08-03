#!/usr/bin/env python3
"""Cut a seamless ambience loop from a longer WAV recording.

Takes a slice and equal-power-crossfades its tail into its head, so the
HTMLAudio loop point is inaudible. Stdlib only (wave + array) — mp3/AAC
legs are afconvert's job:

    afconvert -f WAVE -d LEI16 market-full.mp3 market-full.wav
    python3 scripts/make-ambience-loop.py market-full.wav loop.wav 120 90 3
    afconvert -f m4af -d aac -b 96000 loop.wav public/sfx/ambience-crowd.m4a

Args: input.wav output.wav start_s duration_s crossfade_s
"""

import array
import sys
import wave

inp, outp, start_s, dur_s, fade_s = (
    sys.argv[1],
    sys.argv[2],
    float(sys.argv[3]),
    float(sys.argv[4]),
    float(sys.argv[5]),
)

with wave.open(inp, "rb") as w:
    assert w.getsampwidth() == 2, "expected 16-bit PCM (afconvert -d LEI16)"
    rate, ch = w.getframerate(), w.getnchannels()
    w.setpos(int(start_s * rate))
    # Read duration + crossfade: the extra tail gets folded onto the head.
    frames = w.readframes(int((dur_s + fade_s) * rate))

samples = array.array("h", frames)
per_frame = ch
body = int(dur_s * rate) * per_frame
fade = int(fade_s * rate) * per_frame

out = samples[:body]
tail = samples[body : body + fade]
# Equal-power crossfade: tail fades out over the head fading in.
for i in range(len(tail)):
    t = (i // per_frame) / (fade // per_frame)
    v = out[i] * (t**0.5) + tail[i] * ((1 - t) ** 0.5)
    out[i] = max(-32768, min(32767, int(v)))

with wave.open(outp, "wb") as w:
    w.setnchannels(ch)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(out.tobytes())

print(f"wrote {outp}: {len(out) // per_frame / rate:.1f}s at {rate}Hz, {ch}ch")
