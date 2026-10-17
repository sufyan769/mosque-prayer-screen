#!/usr/bin/env python3
"""Generate data.js for mosque-prayer-screen from the corrected master
~/workspace/user/files/prayerData.json (167 Iraqi cities, Hawijah corrected).
The master is READ-ONLY here — never modified.
Schema per city: {id, nameAr, nameEn, times: {"MM-DD": [Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha]}} (24h "HH:MM").
Only Hawijah carries "02-29"; app.js falls back to "02-28" for other cities.
"""
import json
from pathlib import Path

SRC = Path.home() / "workspace/user/files/prayerData.json"
OUT = Path(__file__).parent / "data.js"

data = json.loads(SRC.read_text(encoding="utf-8"))
cities = [
    {"id": c["id"], "nameAr": c["nameAr"], "nameEn": c["nameEn"], "times": c["times"]}
    for c in data
]
OUT.write_text(
    "const PRAYER_DATA = " + json.dumps(cities, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
haw = next(c for c in cities if c["id"] == "hawija")
kir = next(c for c in cities if c["id"] == "kirkuk")
print(f"cities={len(cities)} out={OUT} size={OUT.stat().st_size}")
print("hawija 10-21:", haw["times"]["10-21"], "| 01-01:", haw["times"]["01-01"], "| days:", len(haw["times"]))
print("kirkuk 10-17:", kir["times"]["10-17"], "| days:", len(kir["times"]))
