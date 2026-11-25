// Draws a profile picture for everyone in config/agents.yaml: public/assets/avatars/<id>.svg
//
//   node tools/make-avatars.js
//
// The drawings are Open Peeps by Pablo Stanley (CC0 1.0: no copyright, free for any use, no credit needed),
// put together by DiceBear and coloured to match each person's look in the office: skin, hair, beard and shirt.
// To change one picture, add `portrait:` to that person in agents.yaml with any Open Peeps option, e.g.
//   portrait: { head: mohawk, face: cheeky }
// Options: https://www.dicebear.com/styles/open-peeps/
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createAvatar } from '@dicebear/core';
import { openPeeps } from '@dicebear/collection';
import YAML from 'yaml';
import { loadTeam } from '../team-config.js';

const team = loadTeam(YAML.parse(readFileSync('config/agents.yaml', 'utf8')));
const hex = c => String(c || '').replace('#', '').slice(0, 6).toLowerCase();
const SKIN = { light: 'edb98a', dark: 'ae5d29' };
const HEAD = { none: 'noHair2', buzzed: 'short2', parted: 'short4', long: 'mediumStraight' };
const FACES = ['driven', 'serious', 'smile', 'calm', 'driven', 'smile', 'cheeky', 'calm', 'smile', 'serious', 'cheeky', 'driven'];

mkdirSync('public/assets/avatars', { recursive: true });
[team.manager, ...team.team].forEach((p, i) => {
  const { look, kit = {} } = p;
  const options = {
    seed: p.id,
    skinColor: [SKIN[look.skin] || SKIN.light],
    head: [HEAD[look.cut] || 'short1'],
    headContrastColor: [hex(look.hair) || '2c1b18'],
    face: [FACES[i % FACES.length]],
    facialHair: ['full3'], facialHairProbability: look.beard ? 100 : 0,
    accessoriesProbability: 0, maskProbability: 0,
    clothingColor: [hex(kit.shirt || look.shirt) || '8fa7df'],
  };
  for (const [k, v] of Object.entries(p.portrait || {})) options[k] = typeof v === 'number' ? v : [String(v).replace('#', '')];
  writeFileSync(`public/assets/avatars/${p.id}.svg`, createAvatar(openPeeps, options).toString());
  console.log(`${p.name}: public/assets/avatars/${p.id}.svg`);
});
