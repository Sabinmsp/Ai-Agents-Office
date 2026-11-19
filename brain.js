// The Brain: shared memory for the whole office. Plain files in data/brain/, no database.
//
//   profile.md      who the player is, their business, goals, rules, tone. Always included in Max's prompt.
//   memories.json   facts, decisions and lessons, each with where it came from. Searched, never dumped.
//   stats.json      reads and writes today, per team member (drives the wall screen).
//
// Memories marked "private" are only ever handed to models the player has listed as trusted.
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORIES = ['you', 'business', 'projects', 'lessons'];
const STOP = new Set('the and for with that this from have has had you your are was were will can could would should about into out not but all any one two new use using need needs want make made get got just also than then them they their what when where which who why how its our his her she him per via'.split(' '));
const words = text => String(text || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).map(w => w.replace(/^['-]+|['-]+$/g, '')).filter(w => w.length > 2 && !STOP.has(w));
const stem = w => w.replace(/(ing|ed|es|s)$/, '');
const tokenSet = text => new Set(words(text).map(stem));

/** Things that must never be stored, whatever a model says: secrets, card and ID numbers, health and money details. */
export const SENSITIVE = /(pass(word|code|wd)|\bpin\b|api[ _-]?key|secret|\btoken\b|\bsk-[a-z0-9_-]{8,}|\b(?:\d[ -]?){13,19}\b|\b\d{3}[- ]?\d{2}[- ]?\d{3,4}\b|\btfn\b|tax file|medicare|passport|licen[cs]e (no|number)|bank account|\bbsb\b|\biban\b|diagnos|prescription|medication|salary of|credit card)/i;

export function createBrain(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const F = { profile: path.join(dir, 'profile.md'), mem: path.join(dir, 'memories.json'), stats: path.join(dir, 'stats.json') };
  const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
  let memories = readJson(F.mem, []);
  const saveMem = () => fs.writeFileSync(F.mem, JSON.stringify(memories, null, 2));
  const today = () => new Date().toISOString().slice(0, 10);
  let stats = readJson(F.stats, null);
  const freshStats = () => ({ day: today(), reads: {}, writes: {} });
  const touchStats = () => { if (!stats || stats.day !== today()) stats = freshStats(); return stats; };
  const saveStats = () => fs.writeFileSync(F.stats, JSON.stringify(stats));

  return {
    profile: () => { try { return fs.readFileSync(F.profile, 'utf8').trim(); } catch { return ''; } },
    setProfile: text => fs.writeFileSync(F.profile, String(text || '').slice(0, 8000) + '\n'),
    list: () => memories.map(m => ({ ...m })),
    stats() {
      const s = touchStats(), sum = o => Object.values(o).reduce((a, b) => a + b, 0), top = Object.entries(s.reads).sort((a, b) => b[1] - a[1])[0];
      return { total: memories.length, reads: sum(s.reads), writes: sum(s.writes), top: top ? top[0] : null, byCategory: Object.fromEntries(CATEGORIES.map(c => [c, memories.filter(m => m.category === c).length])), readsBy: s.reads };
    },

    /** The few memories that matter for this task, newest-used first among equals. Private ones only if the model is trusted. */
    recall(query, agent, k = 3, { trusted = false, budget = 900 } = {}) {
      const q = tokenSet(query), out = [];
      if (!q.size) return { items: [], text: '' };
      const scored = memories
        .filter(m => trusted || m.sensitivity !== 'private')
        .map(m => { const t = tokenSet(m.text); let hit = 0; for (const w of q) if (t.has(w)) hit++; return { m, score: hit + (m.category === 'you' ? 0.25 : 0) + (hit ? 0.1 * Math.min(1, (m.uses || 0) / 10) : 0) }; })
        .filter(x => x.score >= 1).sort((a, b) => b.score - a.score);
      let used = 0;
      for (const { m } of scored) { if (out.length >= k || used + m.text.length > budget) continue; out.push(m); used += m.text.length; }
      if (out.length) {
        const now = new Date().toISOString();
        for (const m of out) { const real = memories.find(x => x.id === m.id); real.lastUsedAt = now; real.uses = (real.uses || 0) + 1; }
        saveMem(); const s = touchStats(); s.reads[agent] = (s.reads[agent] || 0) + out.length; saveStats();
      }
      return { items: out.map(m => ({ id: m.id, category: m.category })), text: out.map(m => `- (${m.category}) ${m.text}`).join('\n') };
    },

    /** Save one memory. Refuses secrets and near-duplicates. Returns { id } or { skipped: reason }. */
    remember({ text, category = 'lessons', source = '', agent = 'hq', sensitivity = 'normal' }) {
      text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (text.length < 8) return { skipped: 'too short' };
      if (SENSITIVE.test(text)) return { skipped: 'looks sensitive' };
      if (!CATEGORIES.includes(category)) category = 'lessons';
      const a = tokenSet(text);
      for (const m of memories) {                                  // duplicate: most of the words already appear in an existing memory
        const b = tokenSet(m.text); let same = 0; for (const w of a) if (b.has(w)) same++;
        if (a.size && same / Math.max(a.size, b.size) >= 0.7) return { skipped: 'duplicate', of: m.id };
      }
      const m = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, category, source, agent, createdAt: new Date().toISOString(), lastUsedAt: null, uses: 0, sensitivity: sensitivity === 'private' ? 'private' : 'normal' };
      memories.push(m); saveMem();
      const s = touchStats(); s.writes[agent] = (s.writes[agent] || 0) + 1; saveStats();
      return { id: m.id, memory: { ...m } };
    },
    forget(id) { const n = memories.length; memories = memories.filter(m => m.id !== id); if (memories.length !== n) saveMem(); return memories.length !== n; },
    update(id, patch) {
      const m = memories.find(x => x.id === id); if (!m) return null;
      if (patch.text !== undefined) { const t = String(patch.text).replace(/\s+/g, ' ').trim().slice(0, 300); if (t.length < 3 || SENSITIVE.test(t)) return { error: 'That text looks empty or sensitive.' }; m.text = t; }
      if (CATEGORIES.includes(patch.category)) m.category = patch.category;
      if (patch.sensitivity === 'private' || patch.sensitivity === 'normal') m.sensitivity = patch.sensitivity;
      saveMem(); return { ...m };
    },
  };
}
