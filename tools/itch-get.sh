#!/bin/bash
# Download the free files of a public itch.io asset page (the "No thanks, just take me to the downloads" path).
# usage: tools/itch-get.sh <page-url> <out-dir> [filename-filter]
set -e
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36"
P=${1%/}; OUT=$2; FILTER=${3:-.}; J=$(mktemp)
mkdir -p "$OUT"
csrf=$(curl -sL -A "$UA" -c "$J" "$P" | grep -oE 'name="csrf_token" value="[^"]+"' | head -1 | sed 's/.*value="//;s/"//')
dl=$(curl -s -A "$UA" -b "$J" -c "$J" -X POST --data-urlencode "csrf_token=$csrf" "$P/download_url" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
[ -z "$dl" ] && { echo "No free download on $P"; exit 1; }
curl -sL -A "$UA" -b "$J" -c "$J" "$dl" | python3 -c "
import sys,re
h=sys.stdin.read()
for m in re.finditer(r'data-upload_id=\"(\d+)\"', h):
    seg=h[m.start():m.start()+1500]; n=re.search(r'class=\"name\"[^>]*>([^<]+)',seg)
    print(m.group(1)+'\t'+(n.group(1) if n else 'file'))
" | while IFS=$'\t' read -r id name; do
  echo "$name" | grep -qiE "$FILTER" || { echo "skip $name"; continue; }
  u=$(curl -s -A "$UA" -b "$J" -e "$P" -X POST --data-urlencode "csrf_token=$csrf" "$P/file/$id?source=game_download&after_download_lightbox=1&as_props=1" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
  curl -sL -A "$UA" -o "$OUT/$name" "$u"; echo "got $name ($(du -h "$OUT/$name" | cut -f1))"
done
