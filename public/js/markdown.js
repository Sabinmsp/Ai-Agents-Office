// A small, safe Markdown renderer: everything is HTML-escaped first, then a few patterns are turned into tags.
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  .replace(/(^|[\s(])_([^_\s][^_]*)_/g, '$1<i>$2</i>');

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = []; let i = 0;
  const isBlock = l => /^(#{1,6} |```|\s*[-*+] |\s*\d+[.)] |\||---+\s*$|>)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,6}) (.*)/);
    if (h) { const n = Math.min(h[1].length, 3); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\|[\s:|-]+\|?\s*$/.test(r));
      out.push('<table>' + body.map((r, k) => '<tr>' + cells(r).map(c => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>');
      continue;
    }
    const li = l.match(/^\s*([-*+]|\d+[.)]) (.*)/);
    if (li) {
      const tag = /\d/.test(li[1]) ? 'ol' : 'ul', items = [];
      while (i < lines.length) { const m = lines[i].match(/^\s*([-*+]|\d+[.)]) (.*)/); if (!m) break; items.push(`<li>${inline(m[2])}</li>`); i++; }
      out.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlock(lines[i]))) para.push(lines[i++].replace(/^>\s?/, ''));
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}
