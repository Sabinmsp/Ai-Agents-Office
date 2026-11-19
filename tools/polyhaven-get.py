#!/usr/bin/env python3
"""Download CC0 models and textures from Poly Haven (polyhaven.com) at 1k resolution.
usage: tools/polyhaven-get.py model <id>... | texture <id>..."""
import json, os, sys, urllib.request
UA = {'User-Agent': 'agent-office-game'}
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
def save(url, path):
    if os.path.exists(path): return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(get(url))
kind, ids = sys.argv[1], sys.argv[2:]
for i in ids:
    try:
        files = json.loads(get(f'https://api.polyhaven.com/files/{i}'))
        if kind == 'model':
            g = files['gltf']['1k']['gltf']; out = os.path.join(ROOT, 'ph', i)
            save(g['url'], os.path.join(out, i + '.gltf'))
            for rel, f in g['include'].items(): save(f['url'], os.path.join(out, rel))
        else:
            for key, name in (('Diffuse', 'diff'), ('nor_gl', 'nor'), ('Rough', 'rough')):
                if key in files: save(files[key]['1k']['jpg']['url'], os.path.join(ROOT, 'tex', f'{i}_{name}.jpg'))
        print('ok', i)
    except Exception as e:
        print('FAILED', i, e)
