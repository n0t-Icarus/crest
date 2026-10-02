#!/usr/bin/env python3
"""Generate Crest's application icons using only the Python standard library.

The mark is the same tapered-V used by the in-app logo component
(src/components/brand/Logo.tsx), so the taskbar icon and the UI wordmark match.
Run with: python scripts/make_icons.py
"""

from __future__ import annotations

import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src-tauri", "icons")
SIZES = [16, 24, 32, 48, 64, 128, 256]
SS = 4  # supersampling factor per axis

BG = (0x0A, 0x0B, 0x10)
MARK = (0xEC, 0xEE, 0xF3)

# Left arm of the V in normalised coordinates (y down), tapered from top to tip.
ARM_A = (0.14, 0.255)
ARM_B = (0.500, 0.805)
HALF_TOP = 0.115
HALF_TIP = 0.028


def _dist_to_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> tuple[float, float]:
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy), t


def _in_tapered_arm(px: float, py: float, flip: bool) -> bool:
    x = 1.0 - px if flip else px
    dist, t = _dist_to_segment(x, py, *ARM_A, *ARM_B)
    half = HALF_TOP + (HALF_TIP - HALF_TOP) * t
    return dist <= half


def _in_rounded_square(px: float, py: float, radius: float) -> bool:
    cx = min(max(px, radius), 1.0 - radius)
    cy = min(max(py, radius), 1.0 - radius)
    return math.hypot(px - cx, py - cy) <= radius


def render(size: int, transparent_bg: bool = False) -> bytearray:
    """Render one icon at `size` px as RGBA bytes (top-down rows)."""
    buf = bytearray(size * size * 4)
    radius = 0.235
    inv = 1.0 / (size * SS)
    samples = SS * SS

    for y in range(size):
        for x in range(size):
            bg_hits = 0
            mark_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = (x * SS + sx + 0.5) * inv
                    py = (y * SS + sy + 0.5) * inv
                    if _in_rounded_square(px, py, radius):
                        bg_hits += 1
                    if _in_tapered_arm(px, py, False) or _in_tapered_arm(px, py, True):
                        if _in_rounded_square(px, py, radius):
                            mark_hits += 1
            bg_a = bg_hits / samples
            mark_a = mark_hits / samples
            if transparent_bg:
                bg_a = 0.0
            # Composite the mark over the plate.
            r = BG[0] * (1 - mark_a) + MARK[0] * mark_a
            g = BG[1] * (1 - mark_a) + MARK[1] * mark_a
            b = BG[2] * (1 - mark_a) + MARK[2] * mark_a
            a = mark_a if transparent_bg else bg_a
            i = (y * size + x) * 4
            buf[i] = int(round(r))
            buf[i + 1] = int(round(g))
            buf[i + 2] = int(round(b))
            buf[i + 3] = int(round(a * 255))
    return buf


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path: str, size: int, rgba: bytes) -> None:
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: none
        raw += rgba[y * stride : (y + 1) * stride]
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )
    with open(path, "wb") as fh:
        fh.write(png)


def ico_bitmap(size: int, rgba: bytes) -> bytes:
    """A 32bpp BMP entry (BITMAPINFOHEADER + XOR bitmap + empty AND mask)."""
    header = struct.pack(
        "<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0, size * size * 4, 0, 0, 0, 0
    )
    rows = bytearray()
    for y in range(size - 1, -1, -1):  # bottom-up
        for x in range(size):
            i = (y * size + x) * 4
            rows += bytes((rgba[i + 2], rgba[i + 1], rgba[i], rgba[i + 3]))  # BGRA
    mask_stride = ((size + 31) // 32) * 4
    return header + bytes(rows) + bytes(mask_stride * size)


def write_ico(path: str, images: list[tuple[int, bytes]]) -> None:
    entries = bytearray()
    payload = bytearray()
    offset = 6 + 16 * len(images)
    for size, rgba in images:
        data = ico_bitmap(size, rgba)
        entries += struct.pack(
            "<BBBBHHII",
            0 if size >= 256 else size,
            0 if size >= 256 else size,
            0,
            0,
            1,
            32,
            len(data),
            offset,
        )
        payload += data
        offset += len(data)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<HHH", 0, 1, len(images)) + bytes(entries) + bytes(payload))


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    rendered: dict[int, bytes] = {}
    for size in SIZES:
        rendered[size] = bytes(render(size))

    write_png(os.path.join(OUT_DIR, "32x32.png"), 32, rendered[32])
    write_png(os.path.join(OUT_DIR, "128x128.png"), 128, rendered[128])
    write_png(os.path.join(OUT_DIR, "128x128@2x.png"), 256, rendered[256])
    write_png(os.path.join(OUT_DIR, "icon.png"), 256, rendered[256])
    write_png(os.path.join(OUT_DIR, "icon-96.png"), 96, bytes(render(96)))
    write_ico(
        os.path.join(OUT_DIR, "icon.ico"),
        [(size, rendered[size]) for size in SIZES if size <= 256],
    )

    transparent = bytes(render(256, transparent_bg=True))
    write_png(os.path.join(OUT_DIR, "mark-256.png"), 256, transparent)
    print(f"icons written to {OUT_DIR}")


if __name__ == "__main__":
    main()
