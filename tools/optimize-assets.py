"""Shrinks the office's images so the page opens fast. Safe to run again: files already small enough are skipped.

  python3 tools/optimize-assets.py

- JPEG textures saved at near-lossless quality are re-saved at 85 (normal maps at 90, full colour detail) when that is a real saving.
- Opaque PNG textures used by glTF models become JPEGs, and the .gltf files are updated to point at them.
- Wall photos are scaled to the size they are shown at.
Needs Pillow (pip install pillow).
"""
import json, os, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'assets'
saved = 0

def is_normal(name):
    return '_nor' in name or 'normal' in name.lower()

def save_jpeg(img, dest, normal):
    if img.mode not in ('RGB', 'L'): img = img.convert('RGB')
    img.save(dest, 'JPEG', quality=90 if normal else 85, optimize=True, progressive=True, subsampling=0 if normal else 2)

def recompress(path):
    global saved
    before = path.stat().st_size
    if before < 60_000: return
    img = Image.open(path); img.load()
    tmp = path.with_suffix('.tmp.jpg'); save_jpeg(img, tmp, is_normal(path.name))
    if tmp.stat().st_size < before * 0.75: saved += before - tmp.stat().st_size; tmp.replace(path)
    else: tmp.unlink()

for path in sorted(ROOT.rglob('*.jpg')):
    if 'photos' in path.parts: continue
    recompress(path)

# Wall photos: shown on small frames, 1024 wide is plenty.
for path in sorted((ROOT / 'photos').glob('*.jpg')):
    img = Image.open(path)
    if img.width <= 1024: continue
    before = path.stat().st_size
    img = img.resize((1024, round(img.height * 1024 / img.width)), Image.LANCZOS)
    img.save(path, 'JPEG', quality=82, optimize=True, progressive=True)
    saved += before - path.stat().st_size

# Opaque PNGs referenced from .gltf files -> JPEG.
renamed = {}
for gltf in sorted(ROOT.rglob('*.gltf')):
    doc = json.loads(gltf.read_text())
    changed = False
    for image in doc.get('images', []):
        uri = image.get('uri', '')
        if not uri.endswith('.png'): continue
        src = gltf.parent / uri
        dest = src.with_suffix('.jpg')
        if not dest.exists():
            if not src.exists() or src.stat().st_size < 60_000: continue
            img = Image.open(src); img.load()
            if img.mode == 'P' or (img.mode in ('RGBA', 'LA') and img.getextrema()[-1][0] < 255): continue   # keeps real transparency as PNG
            save_jpeg(img, dest, is_normal(src.name)); renamed[src] = dest
        image['uri'] = dest.name; image['mimeType'] = 'image/jpeg'; changed = True
    if changed: gltf.write_text(json.dumps(doc, separators=(',', ':')))

for src, dest in renamed.items():
    saved += src.stat().st_size - dest.stat().st_size
    src.unlink()
    print('png -> jpg', src.relative_to(ROOT))
print(f'saved {saved / 1e6:.1f} MB')
