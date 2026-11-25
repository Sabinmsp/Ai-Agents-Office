// The team from config/agents.yaml, checked and filled in with defaults. Shared by server.js and the Vercel build.
export function loadTeam(raw) {
  const person = (p, i) => {
    for (const k of ['id', 'name', 'title']) if (!p?.[k]) throw new Error(`config/agents.yaml: person ${i + 1} is missing "${k}".`);
    return { model: 'auto', tools: [], prompt: '', skill: '', dept: 'Team', color: '#9aa3d0', ...p, look: { body: 'm', skin: 'light', cut: 'parted', hair: '#3b2a20', shirt: '#555', pants: '#222', sleeve: 'long', ...(p.look || {}) } };
  };
  const manager = person({ dept: 'Head', ...raw.manager, id: 'hq' }, 0), team = (raw.team || []).map(person);
  if (team.length > 12) throw new Error('config/agents.yaml: the office has 12 desks; list at most 12 team members.');
  const ids = new Set(); for (const p of team) { if (ids.has(p.id) || p.id === 'hq') throw new Error(`config/agents.yaml: the id "${p.id}" is used twice.`); ids.add(p.id); }
  for (const p of [manager, ...team]) p.building = p.desk || `${p.name}'s desk`;
  return { manager, team, trusted: (raw.trusted_models || []).map(String) };
}
