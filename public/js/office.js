// The office: floor plan, walls, furniture, desks, and the grid people walk on.
// Plan coordinates: x runs east (0..44), z runs south (0..30); one unit is about 0.74 m.
// The camera looks in from the south-east, so the north and west walls are full height and the rest is low or glass.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BOSS, AGENTS } from './team.js';

export const W = 44, D = 30, K = 1.35;      // K scales real-world (metre) models into plan units
export const ROOMS = {
  overview: { name: 'Overview', x: 28.5, z: 15.5, zoom: 0.84 },
  workspace: { name: 'Workspace', x: 16.5, z: 20, zoom: 1.75 },
  meeting: { name: 'Meeting room', x: 20, z: 5.5, zoom: 2.5 },
  manager: { name: 'Manager office', x: 6, z: 5.5, zoom: 3 },
  lounge: { name: 'Lounge', x: 38.5, z: 21, zoom: 2.2 },
  kitchen: { name: 'Kitchen', x: 36, z: 5.5, zoom: 2.5 },
  brain: { name: 'Brain', x: 50, z: 5.2, zoom: 2.7 },
  courts: { name: 'Courts', x: 56.5, z: 23, zoom: 1.6 },
};

// A place to be: position, the way to face (0 = south, towards the camera; PI = north), and for seats the spot to walk to first.
const N = Math.PI, E = Math.PI / 2, WEST = -Math.PI / 2;
const S = (x, z, face = 0, o = {}) => ({ x, z, face, ...o });
const seat = (x, z, face, vx, vz, say = '') => S(x, z, face, { sit: true, via: { x: vx, z: vz }, say });
const MEET_X = [17.3, 19.1, 20.9, 22.7];
export const SPOTS = {
  entrance: S(13.5, 31.5, N),
  bossMeeting: S(15.4, 5, E),
  visit: [S(6, 6.9, N), S(4.6, 7.3, N), S(7.4, 7.3, N), S(3.4, 8, N), S(8.6, 8, N), S(5.3, 8.5, N), S(6.7, 8.5, N), S(6, 9.2, N)],   // standing in front of the manager's desk
  meeting: [...MEET_X.map(x => seat(x, 3.25, 0, x, 2.2)), ...MEET_X.map(x => seat(x, 6.75, N, x, 7.9))],
  breaks: [S(38.6, 2.5, N, { say: '☕' }), S(40.2, 2.5, N, { say: '☕' }), S(35.2, 5.0, 0, { say: '💬' }), S(36.9, 5.0, 0, { say: '🍪' }), S(30.6, 8.5, WEST, { say: '💧' }),   // kitchen
    S(41, 11.1, 0, { say: '⚽' }), S(41, 13.5, N, { say: '⚽' }), S(22.6, 25.6, 0, { say: '💬' }), S(22.6, 28.3, N, { say: '💬' }),                               // foosball, standing table
    S(39, 15.6, 0, { say: '🎱' }), S(39, 19.4, N, { say: '🎱' }), S(36, 17.5, E, { say: '🎱' }),                                                     // pool table
    seat(37.6, 28.25, N, 37.6, 26.9, '💬'), seat(39.4, 28.25, N, 39.4, 26.9, '💬'), seat(34.85, 25.3, E, 36.1, 23.9), seat(42.1, 25.3, WEST, 40.9, 23.9, '📖')],   // sofas
};

export const DESKS = {};
// Three clusters of four desks. In each, two rows sit back to back with their privacy screens meeting in the middle.
AGENTS.forEach((a, i) => {
  const cluster = Math.floor(i / 4), east = i % 2 === 1, south = i % 4 >= 2;
  const x = [6.5, 16.5, 26.5][cluster] + (east ? 1.55 : -1.55), z = 18.6 + (south ? 0.8 : -0.8), sz = z + (south ? 1.0 : -1.0);
  DESKS[a.id] = { id: a.id, who: a, x, z, w: 3, d: 1.5, seat: seat(x, sz, south ? N : 0, x + (east ? -1.15 : 1.15), sz + (south ? 0.45 : -0.45)), level: 0, screens: [], screenFace: south ? 0 : N };
});
DESKS.hq = { id: 'hq', who: BOSS, x: 6, z: 4.4, w: 3.6, d: 1.7, seat: seat(6, 3.3, 0, 7.5, 3.0), level: 0, screens: [], screenFace: N };
export const LIGHTS = [];   // warm lamps: the game adds a point light at each
export const FX = {};       // materials the game dims and brightens with the time of day
// Places the task cards fly between (x, height, z).
export const POINTS = { max: new THREE.Vector3(6, 1.35, 4.4), wallScreen: new THREE.Vector3(23, 2.2, 0.45), reception: new THREE.Vector3(13.5, 1.22, 26.3) };

// ---------------------------------------------------------------- small helpers
const mats = new Map();
export function M(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o }));
  return mats.get(k);
}
function box(parent, w, h, d, mat, x, y, z) {   // y is the bottom of the box
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function cyl(parent, r0, r1, h, mat, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const blocks = [];   // rectangles nobody can walk through: [x0, z0, x1, z1]
const solid = (x0, z0, x1, z1) => blocks.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

// Photo-scanned surface textures (Poly Haven). size = how many plan units one copy of the texture covers.
const texLoader = new THREE.TextureLoader();
function surface(name, w, d, size, o = {}) {
  const load = (kind, srgb) => {
    const t = texLoader.load(`/assets/tex/${name}_${kind}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / size, d / size); t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return new THREE.MeshStandardMaterial({ map: o.noMap ? null : load('diff', true), normalMap: load('nor'), roughnessMap: load('rough'), ...(o.mat || {}) });
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- building the office
const MODELS = ['modern_arm_chair_01', 'sofa_03', 'sofa_02', 'ArmChair_01', 'mid_century_lounge_chair', 'modern_coffee_table_01', 'potted_plant_04', 'potted_plant_02',
  'CoffeeCart_01', 'round_wooden_table_02', 'bar_chair_round_01', 'steel_frame_shelves_03', 'modern_wooden_cabinet', 'drawer_cabinet',
  'hanging_picture_frame_01', 'hanging_picture_frame_02', 'hanging_picture_frame_03', 'wall_clock', 'modern_ceiling_lamp_01', 'fern_02', 'shrub_03', 'side_table_01', 'desk_lamp_arm_01', 'Ottoman_01', 'ceramic_vase_01'];
const kit = {};

export async function buildOffice(scene) {
  const loader = new GLTFLoader();
  await Promise.all(MODELS.map(async name => {
    const g = await loader.loadAsync(`/assets/ph/${name}/${name}.gltf`);
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    kit[name] = g.scene;
  }));
  const put = (name, x, z, rot = 0, { y = 0, s = 1, block, parent = scene } = {}) => {
    const o = kit[name].clone(); o.position.set(x, y, z); o.rotation.y = rot; o.scale.setScalar(K * s); parent.add(o);
    if (block) solid(x - block[0], z - block[1], x + block[0], z + block[1]);
    return o;
  };
  const nat = {};
  await Promise.all(['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_5', 'Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2', 'Grass_Common_Tall', 'Flower_3_Group'].map(async name => {
    const g = await loader.loadAsync(`/assets/nature/${name}.gltf`);
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) { m.roughness = 1; m.metalness = 0; } } });
    nat[name] = g.scene;
  }));
  const grow = (name, x, z, s = 1, rot = x * 3.7 + z) => { const o = nat[name].clone(); o.position.set(x, -0.3, z); o.rotation.y = rot; o.scale.setScalar(s); scene.add(o); return o; };
  const plant = (x, z, s = 2.6) => put('potted_plant_02', x, z, x * 2.1, { s: s * 0.62, block: [0.4, 0.4] });

  // --- lamps. Each one glows and gets a real light from the game.
  const bulb = FX.bulb = M('#fff1d6', { emissive: '#ffd9a0', emissiveIntensity: 3.2 }), gardenBulb = FX.gardenBulb = M('#fff1d6', { emissive: '#ffcf8a', emissiveIntensity: 3 });
  const pendant = (x, z, y = 3.1, power = 1) => { put('modern_ceiling_lamp_01', x, z, 0, { y: y - 0.3 }).traverse(o => { o.castShadow = false; }); cyl(scene, 0.09, 0.09, 0.05, bulb, x, y + 0.02, z, 12).castShadow = false; LIGHTS.push({ x, y: y - 0.2, z, power }); };
  const floorLamp = (x, z) => { cyl(scene, 0.22, 0.25, 0.04, M('#1b1c20', { metalness: 0.6, roughness: 0.4 }), x, 0, z); cyl(scene, 0.025, 0.025, 2.1, M('#1b1c20', { metalness: 0.6, roughness: 0.4 }), x, 0, z, 8); cyl(scene, 0.2, 0.3, 0.42, bulb, x, 2.05, z, 20).castShadow = false; solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25); LIGHTS.push({ x, y: 2.2, z, power: 0.55 }); };

  // --- the world outside: lawn, a paved path to the door, shrubs, garden lights, trees behind the building
  const lawn = surface('leafy_grass', 700, 700, 9, { mat: { color: '#6f8a66', roughness: 1 } });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), lawn);
  ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, -0.32, D / 2); ground.receiveShadow = true; scene.add(ground);
  box(scene, W + 2.4, 0.3, D + 2.4, M('#30333b'), W / 2, -0.31, D / 2);                                   // slab under the office
  const paving = (x0, z0, x1, z1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), surface('concrete_pavers', x1 - x0, z1 - z0, 2.6, { mat: { color: '#b9b4aa' } })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, -0.3, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); };
  paving(11, 31.2, 16, 70); paving(-4, 31.2, 48, 34.4); paving(45.2, -4, 48, 31.2);
  box(scene, 5, 0.16, 3.4, M('#22252c', { roughness: 0.5 }), 13.5, 3.25, 31.5);                           // entrance canopy
  for (const x of [11.2, 15.8]) cyl(scene, 0.07, 0.07, 3.25, M('#22252c', { metalness: 0.5, roughness: 0.4 }), x, -0.3, 33, 10);
  const sign = (text, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTex(512, 72, (k, cw, ch) => { k.fillStyle = '#fff4dc'; k.font = '600 46px "Helvetica Neue", Arial, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.letterSpacing = '10px'; k.fillText(text, cw / 2, ch / 2 + 2); }) }));
  const canopySign = sign('AGENT OFFICE', 3.6, 0.5); canopySign.position.set(13.5, 3.0, 33.22); scene.add(canopySign);
  const gardenLight = (x, z) => { cyl(scene, 0.05, 0.06, 0.8, M('#1b1c20'), x, -0.3, z, 8); cyl(scene, 0.1, 0.1, 0.12, gardenBulb, x, 0.5, z, 10).castShadow = false; };
  for (const z of [36, 42, 48, 54]) { gardenLight(10.6, z); gardenLight(16.4, z); }
  for (const [x, z] of [[-3, 37], [20, 37.5], [30, 36.5], [41, 37.2], [66, 14], [66, 24], [66, 33]]) gardenLight(x, z);
  buildCourts(scene);
  const rnd = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  // Planting. The two sides facing the camera stay low (bushes, flowers, rocks) so nothing hides the office.
  for (let i = 0; i < 44; i++) {
    const south = i % 2 === 0, t = rnd(i, 5);
    const x = south ? -6 + t * 60 : 66.5 + rnd(i, 6) * 8, z = south ? 35.8 + rnd(i, 6) * 9 : -4 + t * 38;
    if (south && x > 9.3 && x < 17.7) continue;
    if (!south && z < 12) continue;                       // the Brain room is here
    const kind = ['Bush_Common', 'Grass_Common_Tall', 'Bush_Common_Flowers', 'Flower_3_Group', 'Grass_Common_Tall', 'Rock_Medium_2', 'fern'][i % 7];
    if (kind === 'fern') put('fern_02', x, z, i * 1.9, { y: -0.3, s: 1.6 + rnd(i, 7) * 0.6 });
    else grow(kind, x, z, kind.startsWith('Rock') ? 0.45 + rnd(i, 7) * 0.4 : kind.startsWith('Bush') ? 1.1 + rnd(i, 7) * 0.5 : 0.8 + rnd(i, 7) * 0.5);
  }
  for (let i = 0; i < 60; i++) {                                                                           // trees, rocks and undergrowth behind and beside the building
    const north = i % 2 === 0, t = rnd(i, 8), far = 5 + rnd(i, 9) * 46;
    const x = north ? -34 + t * 118 : -far - 4, z = north ? -far - 3 : -34 + t * 96;
    grow(['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_5'][i % 4], x, z, K * (0.6 + rnd(i, 10) * 0.4));
    if (i % 3 === 0) grow(i % 2 ? 'Rock_Medium_1' : 'Bush_Common', x + 3 + rnd(i, 11) * 3, z + 2.5, 0.8 + rnd(i, 12) * 0.7);
    if (i % 4 === 1) grow('Grass_Common_Tall', x - 2.5, z + 3, 1.2);
  }

  // floors
  const floor = (x0, z0, x1, z1, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
  };
  const carpet = (w, d, color) => surface('fabric_pattern_07', w, d, 1.2, { noMap: true, mat: { color, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6) } });
  const parquet = (w, d) => surface('herringbone_parquet', w, d, 3.4, { mat: { roughnessMap: null, roughness: 0.6 } });
  floor(0, 0, 12, 10, carpet(12, 10, '#5b2f2e'));                                        // manager office: deep red carpet
  floor(12, 0, 28, 10, carpet(16, 10, '#3f4c5c'));                                       // meeting room: slate carpet
  floor(28, 0, 44, 10, surface('floor_tiles_06', 16, 10, 3.6, { mat: { roughnessMap: null, roughness: 0.35 } }));   // kitchen: checkered stone
  floor(0, 10, 33, 13, parquet(33, 3));                                                  // corridor
  floor(0, 13, 33, 23.4, carpet(33, 10.4, '#3a4048'));                                   // workspace: charcoal carpet
  floor(0, 23.4, 33, 30, parquet(33, 6.6));                                              // reception
  floor(33, 10, 44, 30, surface('wood_floor', 11, 20, 3.6, { mat: { roughnessMap: null, roughness: 0.6 } }));       // lounge boards

  // walls. gaps are doorways: [from, to] along the wall.
  const dark = M('#23262d', { roughness: 0.5, metalness: 0.4 }), baseMat = M('#3a3d45', { roughness: 0.7 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#dff3fb', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false });
  const run = (alongX, fixed, from, to, gaps, make) => {
    let a = from;
    for (const [g0, g1] of [...gaps, [to, to]]) { if (g0 > a) alongX ? make(a, fixed, g0, fixed) : make(fixed, a, fixed, g0); a = g1; }
  };
  const wall = (h, matFor) => (x0, z0, x1, z1) => {
    const len = Math.abs(x1 - x0) + Math.abs(z1 - z0), w = Math.abs(x1 - x0) + 0.3, d = Math.abs(z1 - z0) + 0.3;
    box(scene, w, h, d, typeof matFor === 'function' ? matFor(len, h) : matFor, (x0 + x1) / 2, 0, (z0 + z1) / 2);
    solid(Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15);
  };
  const glass = (x0, z0, x1, z1) => {            // floor-to-head-height glazing in a dark metal frame
    const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = 2.6;
    solid(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
    const pane = box(scene, alongX ? len : 0.05, H - 0.2, alongX ? 0.05 : len, glassMat, cx, 0.15, cz); pane.castShadow = false; pane.renderOrder = 2;
    box(scene, alongX ? len : 0.14, 0.15, alongX ? 0.14 : len, dark, cx, 0, cz); box(scene, alongX ? len : 0.12, 0.1, alongX ? 0.12 : len, dark, cx, H - 0.1, cz);
    for (let i = 0, n = Math.max(1, Math.round(len / 2.2)); i <= n; i++) box(scene, 0.1, H, 0.1, dark, alongX ? x0 + len * i / n : x0, 0, alongX ? z0 : z0 + len * i / n);
  };
  const plaster = (len, h) => surface('painted_plaster_wall', len, h, 3, { mat: { color: '#e9e4da' } });
  const panel = (len, h) => surface('walnut_veneer', len, h, 2.6, { mat: { color: '#b89a84' } });
  run(true, 0, 0, 12, [], wall(3.8, panel)); run(true, 0, 12, W, [], wall(3.8, plaster));          // north: walnut behind the manager, plaster elsewhere
  run(false, 0, 0, 10, [], wall(3.8, panel)); run(false, 0, 10, D, [], wall(3.8, plaster));        // west
  run(true, D, 0, W, [[12, 15]], wall(0.45, baseMat));                                             // south, with the entrance
  run(false, W, 0, 10, [], glass); run(false, W, 10, D, [[16.5, 19]], wall(0.45, baseMat));   // a side door out to the courts                  // east: the kitchen's glass wall opens onto the Brain room
  run(false, 12, 0, 10, [], glass); run(false, 28, 0, 10, [], glass);                              // between the three north rooms
  run(true, 10, 0, 12, [[5, 7.5]], glass); run(true, 10, 12, 28, [[19, 21.5]], glass); run(true, 10, 28, 44, [[33, 35.5]], glass);   // their fronts, with doorways
  run(false, 33, 13, 30, [[19.5, 22.5]], glass);                                                   // workspace | lounge
  for (const x of [12, 15]) box(scene, 0.25, 3, 0.25, dark, x, 0, 30);
  box(scene, 3.25, 0.25, 0.25, dark, 13.5, 2.9, 30);                                               // entrance frame
  box(scene, 2.6, 0.03, 1.6, M('#3b3f47', { roughness: 1 }), 13.5, 0.0, 29).castShadow = false;    // door mat
  box(scene, W - 0.3, 0.16, 0.05, dark, W / 2, 0, 0.18).castShadow = false; box(scene, 0.05, 0.16, D - 0.3, dark, 0.18, 0, D / 2).castShadow = false;   // skirting boards

  // Windows in the west wall: the panes take the colour of the sky outside.
  const pane = FX.window = new THREE.MeshBasicMaterial({ color: '#0a1020' });
  const windowWest = (z, w = 2.8, y0 = 1.15, h = 2) => {
    box(scene, 0.1, h + 0.2, w + 0.2, dark, 0.17, y0 - 0.1, z).castShadow = false; box(scene, 0.04, h, w, pane, 0.22, y0, z).castShadow = false;
    box(scene, 0.06, h, 0.07, dark, 0.24, y0, z).castShadow = false; box(scene, 0.06, 0.07, w, dark, 0.24, y0 + h * 0.55, z).castShadow = false;
    box(scene, 0.3, 0.06, w + 0.3, M('#d9d4c8'), 0.3, y0 - 0.16, z).castShadow = false;
  };
  windowWest(2.7, 2.4); windowWest(15.4, 3); windowWest(22.4, 3);
  // Photographs: real country landscapes (Poly Haven panoramas, CC0), cropped to flat pictures, in frames with a small caption plate.
  const photoList = await (await fetch('/assets/photos/photos.json')).json(), photoMats = {};
  const photoMat = id => photoMats[id] ??= (() => { const t = texLoader.load(`/assets/photos/${id}.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.12 }); })();
  const FRAME_TONES = ['#241b14', '#d8d2c4', '#15161a', '#5a3d27'];
  const photoFrame = (id, x, y, z, rot, w = 1.4, tone = 0) => {
    const info = photoList.find(q => q.id === id), h = w * 0.625, bar = 0.07, depth = 0.07, mat = M(FRAME_TONES[tone % 4], { roughness: 0.55 });
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; scene.add(g);
    const OW = w + 0.16 + bar * 2, OH = h + 0.16 + bar * 2;
    box(g, OW, bar, depth, mat, 0, OH / 2 - bar, 0); box(g, OW, bar, depth, mat, 0, -OH / 2, 0);
    box(g, bar, OH - bar * 2, depth, mat, -OW / 2 + bar / 2, -OH / 2 + bar, 0); box(g, bar, OH - bar * 2, depth, mat, OW / 2 - bar / 2, -OH / 2 + bar, 0);
    box(g, OW - bar * 2, OH - bar * 2, 0.01, M('#f4f1ea', { roughness: 0.9 }), 0, -OH / 2 + bar, 0.01).castShadow = false;                       // white mount
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat(id)); pic.position.set(0, 0, 0.026); g.add(pic);
    if (info) {
      const text = [info.place, info.country].filter(Boolean).join(' · '), cw = Math.min(w, 0.2 + text.length * 0.05);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(cw, 0.13), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5, map: canvasTex(Math.round(cw * 300), 39, (k, pw, ph) => { k.fillStyle = '#b79a5e'; k.fillRect(0, 0, pw, ph); k.fillStyle = '#2b2214'; k.font = '600 22px Georgia, serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(text, pw / 2, ph / 2 + 1); }) }));
      plate.position.set(0, -OH / 2 - 0.12, 0.04); g.add(plate);
    }
    return g;
  };
  const WALL = 0.16;                                                  // the wall surface is 0.15 from its centre line
  photoFrame('alps_field', 3.6, 2.55, WALL, 0, 1.0, 0); photoFrame('table_mountain_1', 6, 2.6, WALL, 0, 1.55, 3); photoFrame('venice_sunset', 8.4, 2.55, WALL, 0, 1.0, 0);   // manager office
  photoFrame('shanghai_bund', 13.7, 2.35, WALL, 0, 1.05, 2); photoFrame('bergen', 27.2, 2.4, WALL, 0, 0.9, 1);                                                           // meeting room
  photoFrame('flower_road', WALL, 2.4, 19, E, 1.5, 3); photoFrame('lilienstein', WALL, 2.5, 12.7, E, 1.1, 0); photoFrame('nagoya_wall_path', WALL, 2.45, 29.3, E, 1.0, 2);     // west wall

  buildBrainRoom(scene, { run, wall, glass, baseMat, dark, floor });

  // --- manager office
  put('modern_wooden_cabinet', 6, 0.75, 0, { block: [1.7, 0.5] }); put('ceramic_vase_01', 5, 0.75, 0, { y: 0.93 }); put('potted_plant_04', 7.2, 0.75, 1, { y: 0.93, s: 1.6 });
  put('steel_frame_shelves_03', 0.75, 6.4, E, { block: [0.6, 1.7] });
  put('modern_arm_chair_01', 2.7, 7.9, 2.4, { block: [0.5, 0.5] }); put('modern_arm_chair_01', 9.5, 7.9, -2.4, { block: [0.5, 0.5] });
  plant(10.9, 1.1, 3); plant(1, 1.1, 2.4);
  const rug = (x, z, w, d, color) => { const r = box(scene, w, 0.04, d, carpet(w, d, color), x, 0, z); r.castShadow = false; return r; };
  rug(6, 7.4, 6.4, 3.6, '#8f7f6a'); floorLamp(11, 8.9); pendant(6, 5.6, 3.3);
  put('desk_lamp_arm_01', 4.75, 4.5, 2.6, { y: 1.02 });

  // --- meeting room
  const table = new THREE.Group(); table.position.set(20, 0, 5); scene.add(table);
  box(table, 7.6, 0.1, 2.6, surface('walnut_veneer', 7.6, 2.6, 2.6, { mat: { roughness: 0.45 } }), 0, 0.95, 0);
  for (const sx of [-2.6, 2.6]) box(table, 0.5, 0.95, 1.4, dark, sx, 0, 0);
  solid(16.2, 3.7, 23.8, 6.3);
  for (const s of SPOTS.meeting) put('modern_arm_chair_01', s.x, s.z + (s.face ? 0.15 : -0.15), s.face, { block: [0.4, 0.4] });
  const wb = box(scene, 4.6, 2.1, 0.08, M('#f7f7f4', { roughness: 0.25 }), 17.6, 1.1, 0.2); wb.castShadow = false;
  box(scene, 4.75, 0.08, 0.14, dark, 17.6, 1.05, 0.22); box(scene, 4.75, 0.06, 0.1, dark, 17.6, 3.2, 0.2);
  const wbPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.0), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.3 })); wbPlane.position.set(17.6, 2.15, 0.245); scene.add(wbPlane);
  box(scene, 3.5, 2.0, 0.08, dark, 23, 1.2, 0.2);                                                    // wall screen: live task counts
  box(scene, 3.36, 1.86, 0.02, new THREE.MeshStandardMaterial({ color: '#05070b', emissive: '#ffffff', emissiveIntensity: 1.0, roughness: 0.2, emissiveMap: statsTex }), 23, 1.27, 0.25).castShadow = false;
  pendant(18, 5, 3.2); pendant(22, 5, 3.2);
  plant(13, 1.1, 2.8); plant(27, 1.1, 2.6); put('wall_clock', 26.2, 0.17, 0, { y: 3.0, s: 1.6 });

  // --- kitchen: a run of cabinets along the north wall, coffee cart, fridge, a standing table
  const kitchen = new THREE.Group(); scene.add(kitchen);
  const white = M('#eeece7', { roughness: 0.45 }), stone = M('#2d2f33', { roughness: 0.25, metalness: 0.1 }), steel = M('#b9bdc4', { roughness: 0.3, metalness: 0.85 });
  box(kitchen, 7.4, 1.12, 0.9, white, 32.4, 0.08, 0.75); box(kitchen, 7.4, 0.08, 0.8, dark, 32.4, 0, 0.72); box(kitchen, 7.5, 0.07, 1, stone, 32.4, 1.2, 0.72);
  for (let i = 1; i < 6; i++) box(kitchen, 0.02, 1.0, 0.02, M('#c9c6bf'), 28.7 + i * 1.23, 0.14, 1.21).castShadow = false;       // cabinet door gaps
  box(kitchen, 7.4, 0.95, 0.5, white, 32.4, 2.25, 0.45); box(kitchen, 7.4, 0.04, 0.02, M('#fff2d6', { emissive: '#ffe2b0', emissiveIntensity: 1.4 }), 32.4, 2.22, 0.66).castShadow = false;
  box(kitchen, 1.1, 0.05, 0.6, steel, 30.2, 1.25, 0.72); cyl(kitchen, 0.03, 0.03, 0.4, steel, 30.2, 1.27, 0.42);               // sink and tap
  box(kitchen, 1.1, 0.02, 0.7, M('#0c0d10', { roughness: 0.1 }), 33.4, 1.27, 0.72).castShadow = false;                          // hob
  box(kitchen, 0.6, 0.38, 0.4, M('#1c1d21', { roughness: 0.3 }), 35.3, 1.27, 0.6); box(kitchen, 0.4, 0.2, 0.02, M('#0a0b0d', { roughness: 0.1 }), 35.3, 1.36, 0.81);   // microwave
  box(kitchen, 1.25, 2.6, 1.05, steel, 43, 0, 0.75); box(kitchen, 0.03, 1.5, 0.05, dark, 42.5, 0.9, 1.3); box(kitchen, 1.25, 0.02, 1.06, dark, 43, 1.75, 0.75);         // fridge
  solid(28.6, 0, 36.2, 1.3); solid(42.3, 0, 43.8, 1.4);
  put('CoffeeCart_01', 39.8, 0.9, 0, { block: [1.6, 0.75] });
  box(kitchen, 3.4, 1.1, 1.05, white, 36, 0.06, 6.3); box(kitchen, 3.4, 0.06, 0.95, dark, 36, 0, 6.3);                   // island
  box(kitchen, 3.8, 0.08, 1.4, surface('oak_veneer_01', 3.8, 1.4, 2.4, { mat: { roughness: 0.45 } }), 36, 1.16, 6.3);
  solid(34.2, 5.65, 37.8, 6.95);
  for (const x of [34.9, 36, 37.1]) put('bar_chair_round_01', x, 7.5, 0, { block: [0.28, 0.28] });
  pendant(35, 6.3, 3.0, 0.8); pendant(37, 6.3, 3.0, 0.8);
  const cooler = new THREE.Group(); cooler.position.set(29.3, 0, 8.5); scene.add(cooler);                                 // water cooler
  box(cooler, 0.5, 1.25, 0.5, M('#e9ebee', { roughness: 0.4 }), 0, 0, 0); cyl(cooler, 0.2, 0.2, 0.5, new THREE.MeshPhysicalMaterial({ color: '#8fc7ee', transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 1.25, 0, 16);
  solid(29, 8.2, 29.6, 8.8);
  photoFrame('spiaggia_di_mondello', 38.8, 2.45, WALL, 0, 1.5, 1);                                      // kitchen
  plant(43, 9, 2.8);

  // --- lounge
  rug(38.5, 25.6, 6.4, 4.6, '#6f7f86');
  put('sofa_03', 38.5, 28.6, N, { block: [1.9, 0.65] }); put('sofa_02', 34.5, 25.3, E, { block: [0.55, 1.25] });
  put('mid_century_lounge_chair', 42.4, 25.3, WEST, { block: [0.75, 0.7] });
  put('modern_coffee_table_01', 38.5, 25.5, E, { block: [0.85, 0.45] }); put('potted_plant_04', 38.9, 25.5, 0, { y: 0.53, s: 1.5 });
  put('side_table_01', 41.2, 28.8, 0, { block: [0.4, 0.35] }); put('desk_lamp_arm_01', 41.2, 28.8, 2.2, { y: 0.74 });
  put('ArmChair_01', 34.3, 21.3, E, { block: [0.6, 0.6] }); put('Ottoman_01', 35.9, 21.4, 0.2, { block: [0.6, 0.45] });
  plant(43, 29, 2.6); plant(43, 21.4, 2.6); plant(34, 29, 2.8); plant(34, 14.6, 2.6);
  const pool = new THREE.Group(); pool.position.set(39, 0, 17.5); scene.add(pool);       // pool table
  const felt = surface('fabric_pattern_07', 3.7, 1.9, 0.5, { noMap: true, mat: { color: '#1f7a4d', roughness: 1 } }), rail = surface('walnut_veneer', 4, 2, 2, { mat: { roughness: 0.4 } });
  box(pool, 4.2, 0.45, 2.4, rail, 0, 0.75, 0); box(pool, 3.7, 0.03, 1.9, felt, 0, 1.19, 0);
  for (const [x, z, w, d] of [[0, -1.07, 4.2, 0.26], [0, 1.07, 4.2, 0.26], [-1.97, 0, 0.26, 1.9], [1.97, 0, 0.26, 1.9]]) box(pool, w, 0.1, d, rail, x, 1.19, z);
  for (const x of [-1.85, 0, 1.85]) for (const z of [-0.95, 0.95]) cyl(pool, 0.1, 0.1, 0.02, M('#07080a'), x, 1.215, z).castShadow = false;
  for (const [x, z] of [[-1.8, -0.95], [1.8, -0.95], [-1.8, 0.95], [1.8, 0.95]]) box(pool, 0.28, 0.75, 0.28, rail, x, 0, z);
  [['#f4f4f4', -1, 0.2], ['#c62828', 0.6, -0.3], ['#f2c230', 0.9, 0.2], ['#1e4fc2', 0.7, 0.5], ['#111', 1.1, -0.1], ['#7b1fa2', 0.4, 0.3]].forEach(([c, x, z]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), M(c, { roughness: 0.15 })); b.position.set(x, 1.295, z); b.castShadow = true; pool.add(b); });
  solid(36.9, 16.3, 41.1, 18.7);
  const foos = new THREE.Group(); foos.position.set(41, 0, 12.3); scene.add(foos);     // foosball table
  box(foos, 2.1, 0.4, 1.15, rail, 0, 0.72, 0); box(foos, 1.9, 0.02, 0.95, M('#2f8f5b', { roughness: 0.9 }), 0, 1.0, 0);
  for (const [x, z] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) box(foos, 0.12, 0.72, 0.12, M('#1b1c20'), x, 0, z);
  for (let i = 0; i < 6; i++) {
    const x = -0.8 + i * 0.32, rod = cyl(foos, 0.018, 0.018, 1.7, M('#c9ccd3', { metalness: 0.9, roughness: 0.25 }), x, 1.1, 0, 8); rod.rotation.x = Math.PI / 2; rod.position.y = 1.19;
    for (let k = -1; k <= 1; k++) box(foos, 0.05, 0.16, 0.07, M(i % 2 ? '#c62828' : '#1e4fc2'), x, 1.05, k * 0.3).castShadow = false;
    box(foos, 0.06, 0.06, 0.16, M('#111'), x, 1.16, i % 2 ? 0.92 : -0.92);
  }
  solid(39.9, 11.7, 42.1, 12.9);
  floorLamp(35.4, 28.8); floorLamp(43.2, 26.9); pendant(39, 17.5, 3.0); pendant(38.5, 25.6, 3.3, 0.8);

  // --- reception: a slatted feature wall with the sign, the front desk, somewhere to wait
  const walnut = surface('walnut_veneer', 6, 2.6, 2.6, { mat: { roughness: 0.5 } });
  box(scene, 6, 2.7, 0.2, walnut, 13.5, 0, 24.3); for (let i = 0; i < 30; i++) box(scene, 0.09, 2.7, 0.07, walnut, 10.6 + i * 0.2, 0, 24.44).castShadow = false;
  const wallSign = sign('AGENT OFFICE', 4.4, 0.62); wallSign.position.set(13.5, 1.95, 24.5); scene.add(wallSign);
  solid(10.5, 24.15, 16.5, 24.5);
  box(scene, 4.2, 1.1, 0.85, walnut, 13.5, 0, 26.3); box(scene, 4.5, 0.06, 1.05, M('#f1efe9', { roughness: 0.35 }), 13.5, 1.1, 26.3); solid(11.4, 25.8, 15.6, 26.8);
  put('potted_plant_04', 12.1, 26.3, 0, { y: 1.16, s: 1.6 });
  pendant(13.5, 27.6, 3.2, 0.9);
  rug(6.4, 27.2, 6, 3.6, '#5e6b62');
  put('sofa_02', 6.4, 28.9, N, { block: [1.25, 0.55] }); put('modern_arm_chair_01', 3.2, 27, 1.2, { block: [0.5, 0.5] }); put('modern_coffee_table_01', 6.4, 27, E, { block: [0.85, 0.45] });
  plant(10.6, 29, 3); plant(16.4, 29, 3); plant(0.9, 29, 2.6); floorLamp(9.5, 29);
  put('round_wooden_table_02', 22.6, 27, 0, { s: 1.5, block: [0.7, 0.7] }); put('bar_chair_round_01', 21.3, 27, 0, { block: [0.28, 0.28] }); put('bar_chair_round_01', 23.9, 27, 0, { block: [0.28, 0.28] });
  const printer = new THREE.Group(); printer.position.set(32.3, 0, 25.2); printer.rotation.y = WEST; scene.add(printer);                             // copier
  box(printer, 0.9, 1.05, 0.75, M('#dfe1e5', { roughness: 0.5 }), 0, 0, 0); box(printer, 0.92, 0.12, 0.77, M('#2a2d34'), 0, 1.05, 0); box(printer, 0.2, 0.02, 0.1, M('#3ecf8e', { emissive: '#3ecf8e', emissiveIntensity: 2 }), -0.25, 1.17, 0.25);
  solid(31.85, 24.7, 32.75, 25.7);
  plant(32, 29, 2.8); plant(28, 27.6, 2.4);

  // --- corridor and workspace
  plant(0.9, 11.4, 3); plant(32, 14.2, 2.6); plant(0.9, 18.9, 2.4);
  put('drawer_cabinet', 0.55, 26.6, E, { block: [0.4, 0.8] });
  put('wall_clock', 0.17, 24.6, E, { y: 3.1, s: 1.6 });
  for (const cx of [6.5, 16.5, 26.5].slice(0, Math.ceil(AGENTS.length / 4))) {
    pendant(cx - 1.6, 18.6, 3.3, 1.25); pendant(cx + 1.6, 18.6, 3.3, 1.25);
    for (const sx of [-3.13, 3.13]) { box(scene, 0.07, 1.6, 3.3, M('#4a4f5a', { roughness: 1 }), cx + sx, 0, 18.6); solid(cx + sx - 0.07, 16.95, cx + sx + 0.07, 20.25); }   // end panels of each cluster
  }
  pendant(13.5, 11.5, 3.3, 0.6); pendant(27, 11.5, 3.3, 0.6);

  // --- desks: one for every team member plus the manager's
  for (const d of Object.values(DESKS)) buildDesk(scene, d);
  setWhiteboard(null); setWallStats({});
  buildGrid();
}

// ---------------------------------------------------------------- live surfaces the game draws on
const live = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return [c.getContext('2d'), t]; };
const [boardCtx, boardTex] = live(540, 240), [statsCtx, statsTex] = live(336, 186);
/** The meeting-room whiteboard: a plan when people are meeting, yesterday's scribbles otherwise. */
export function setWhiteboard(title, steps) {
  const k = boardCtx; k.fillStyle = '#f7f7f4'; k.fillRect(0, 0, 540, 240);
  if (!steps) {
    [['#ffd66b', 30, 30], ['#ff9eb5', 80, 80], ['#8fd3ff', 400, 26], ['#b6f09c', 450, 96]].forEach(([c, x, y]) => { k.fillStyle = c; k.fillRect(x, y, 44, 44); });
    k.lineWidth = 5; k.lineCap = 'round'; [['#2563eb', 170, 60, 250], ['#dc2626', 170, 100, 170], ['#2563eb', 170, 140, 220]].forEach(([c, x, y, w]) => { k.strokeStyle = c; k.beginPath(); k.moveTo(x, y); k.lineTo(x + w, y); k.stroke(); });
  } else {
    k.fillStyle = '#1f2937'; k.font = '600 24px "Marker Felt", "Comic Sans MS", sans-serif'; k.fillText(String(title).slice(0, 38), 22, 38);
    k.strokeStyle = '#dc2626'; k.lineWidth = 3; k.beginPath(); k.moveTo(22, 48); k.lineTo(Math.min(500, 30 + String(title).length * 12), 48); k.stroke();
    k.font = '20px "Marker Felt", "Comic Sans MS", sans-serif';
    steps.slice(0, 6).forEach((st, i) => { k.fillStyle = '#2563eb'; k.fillText(`${i + 1}.`, 24, 84 + i * 29); k.fillStyle = '#1f2937'; k.fillText(String(st).slice(0, 44), 54, 84 + i * 29); });
  }
  boardTex.needsUpdate = true;
}
/** The wall screen in the meeting room: live counts. */
export function setWallStats({ done = 0, running = 0, errors = 0 }) {
  const k = statsCtx; k.fillStyle = '#0d1322'; k.fillRect(0, 0, 336, 186);
  k.fillStyle = '#8b97b8'; k.font = '600 13px Helvetica, Arial, sans-serif'; k.fillText('AGENT OFFICE · LIVE', 16, 26);
  [['DONE', done, '#3ecf8e'], ['RUNNING', running, '#f5c542'], ['ERRORS', errors, '#ff6b81']].forEach(([label, n, c], i) => {
    const x = 16 + i * 106; k.fillStyle = '#161d33'; k.fillRect(x, 44, 96, 96);
    k.fillStyle = c; k.font = '700 46px Helvetica, Arial, sans-serif'; k.textAlign = 'center'; k.fillText(String(n), x + 48, 104);
    k.fillStyle = '#8b97b8'; k.font = '600 11px Helvetica, Arial, sans-serif'; k.fillText(label, x + 48, 128); k.textAlign = 'left';
  });
  const total = Math.max(1, done + running + errors); let x = 16;
  [[done, '#3ecf8e'], [running, '#f5c542'], [errors, '#ff6b81']].forEach(([n, c]) => { const w = 304 * n / total; k.fillStyle = c; k.fillRect(x, 158, w, 10); x += w; });
  statsTex.needsUpdate = true;
}
/** What a desk's monitors show: the live text of the task, or an idle editor when text is null. */
export function setDeskText(d, text) {
  const k = d.screenCtx; k.fillStyle = '#0b1020'; k.fillRect(0, 0, 256, 152);
  k.fillStyle = '#18203a'; k.fillRect(0, 0, 256, 14); k.fillStyle = d.who.color; k.fillRect(6, 4, 30, 6);
  if (text == null) {
    const cols = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#c0caf5', '#f7768e'];
    for (let r = 0; r < 12; r++) { let x = 10 + (r % 4 === 1 ? 14 : r % 4 === 2 ? 28 : 0); for (let c = 0; c < 4 && x < 230; c++) { const len = 14 + ((r * 31 + c * 17) % 46); k.fillStyle = cols[(r + c * 2) % 6]; k.globalAlpha = 0.75; k.fillRect(x, 24 + r * 10, len, 4); x += len + 6; } }
    k.globalAlpha = 1;
  } else {
    const lines = []; for (const raw of String(text).split('\n')) for (let i = 0; i < Math.max(1, raw.length); i += 36) lines.push(raw.slice(i, i + 36));
    k.font = '11px Menlo, Monaco, monospace';
    lines.slice(-11).forEach((ln, i, a) => { k.fillStyle = ln.startsWith('>') ? '#f5c542' : i === a.length - 1 ? '#ffffff' : '#a8ffcf'; k.fillText(ln, 8, 30 + i * 11.5); });
    k.fillStyle = '#ffffff'; k.fillRect(8 + Math.min(36, (lines.at(-1) || '').length) * 6.6, 22 + Math.min(10, lines.length - 1) * 11.5 + 0, 6, 10);
  }
  d.screenTex.needsUpdate = true;
}
/** Red desk light when a task has gone wrong. */
export function setDeskAlert(d, on) { if (d.strip) { d.strip.color.set(on ? '#ff2d3d' : d.who.color); d.strip.emissive.set(on ? '#ff2d3d' : d.who.color); d.strip.emissiveIntensity = on ? 3 : d.busy ? 1.6 : 0.2; } d.alert = on; }

// ---------------------------------------------------------------- the Brain: a glass server room east of the kitchen (x 44..56, z 0..10)
export const CATEGORY_COLORS = { you: '#ffcf5a', business: '#4f9cf7', projects: '#3ecf8e', lessons: '#c77dff' };
const CATEGORY_LABELS = { you: 'YOU', business: 'BUSINESS', projects: 'PROJECTS', lessons: 'LESSONS' };
export const BRAIN = { root: new THREE.Group(), core: null, light: null, pulse: 0, racks: {}, cubes: new Map(), anim: [] };
export const brainCorePos = () => new THREE.Vector3(50, 2.1, 6);
const COLS = 4, ROWS = 6, SLOTS_PER_RACK = COLS * ROWS;
let brainCtx, brainTex;

function buildBrainRoom(scene, { run, wall, glass, baseMat, dark, floor }) {
  const root = BRAIN.root; scene.add(root);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 11), M('#2b2f38')); slab.position.set(50, -0.46, 5); slab.receiveShadow = true; scene.add(slab);
  run(true, 0, 44, 56, [], wall(3.8, M('#171c2a', { roughness: 0.55, metalness: 0.35 })));   // north wall: dark, behind the racks
  run(false, 56, 0, 10, [], wall(0.45, baseMat));                                           // east: low, so the camera sees in
  run(true, 10, 44, 56, [], glass);                                                          // south: glass
  // floor: dark tiles with faint cyan seams
  const seams = canvasTex(256, 256, (k, w, h) => { k.fillStyle = '#10141f'; k.fillRect(0, 0, w, h); k.strokeStyle = 'rgba(111,184,255,.55)'; k.lineWidth = 3; k.strokeRect(1.5, 1.5, w - 3, h - 3); });
  seams.wrapS = seams.wrapT = THREE.RepeatWrapping; seams.repeat.set(6, 5);
  floor(44, 0, 56, 10, new THREE.MeshStandardMaterial({ map: seams, emissiveMap: seams, emissive: '#6fb8ff', emissiveIntensity: 0.18, roughness: 0.3, metalness: 0.5 }));

  // four racks along the north wall, one per kind of memory
  const rackMetal = M('#222838', { roughness: 0.45, metalness: 0.6 });
  Object.keys(CATEGORY_COLORS).forEach((cat, i) => {
    const x = 45.4 + i * 2.9, color = CATEGORY_COLORS[cat], g = new THREE.Group(); g.position.set(x, 0, 1.3); root.add(g);
    box(g, 2.2, 2.5, 0.9, rackMetal, 0, 0, 0); box(g, 2.0, 2.3, 0.04, M('#0b0e16'), 0, 0.1, 0.46);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(200, 230, (k, w, h) => {
      k.strokeStyle = color; k.globalAlpha = 0.35; k.lineWidth = 2;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) k.strokeRect(14 + c * 45, h - 40 - r * 36 - 24, 30, 26);
    }) })); front.position.set(0, 1.25, 0.49); g.add(front);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.3), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(360, 60, (k, w, h) => { k.fillStyle = '#0b0e16'; k.fillRect(0, 0, w, h); k.fillStyle = color; k.font = '700 34px Helvetica, Arial, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(CATEGORY_LABELS[cat], w / 2, h / 2 + 2); }) }));
    plate.position.set(0, 2.62, 0.2); g.add(plate); box(g, 2.2, 0.03, 0.04, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), toneMapped: false }), 0, 2.5, 0.46);
    BRAIN.racks[cat] = { group: g, color, slots: new Array(SLOTS_PER_RACK).fill(null) };
  });

  // the core: a sphere of linked nodes on a plinth
  const c = brainCorePos();
  cyl(root, 1.3, 1.5, 0.45, rackMetal, c.x, 0, c.z, 40); cyl(root, 1.12, 1.12, 0.03, new THREE.MeshBasicMaterial({ color: new THREE.Color('#4f9cf7').multiplyScalar(1.1), toneMapped: false }), c.x, 0.45, c.z, 40).castShadow = false;
  const core = BRAIN.core = new THREE.Group(); core.position.copy(c); root.add(core);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), new THREE.MeshStandardMaterial({ color: '#bfe6ff', emissive: '#5fb8ff', emissiveIntensity: 2.4, roughness: 0.2 })); inner.castShadow = false; core.add(inner);
  const ico = new THREE.IcosahedronGeometry(0.95, 1), seen = new Map(), pos = ico.attributes.position;
  for (let i = 0; i < pos.count; i++) { const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(3)).join(','); if (!seen.has(key)) seen.set(key, new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))); }
  const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfeeff').multiplyScalar(2.2), toneMapped: false }), seen.size);
  [...seen.values()].forEach((v, i) => nodes.setMatrixAt(i, new THREE.Matrix4().setPosition(v))); core.add(nodes);
  BRAIN.web = new THREE.LineSegments(new THREE.EdgesGeometry(ico), new THREE.LineBasicMaterial({ color: new THREE.Color('#7fd1ff').multiplyScalar(2), toneMapped: false })); core.add(BRAIN.web);
  BRAIN.shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.3, 0)), new THREE.LineBasicMaterial({ color: '#4f7fb8', transparent: true, opacity: 0.55, toneMapped: false })); core.add(BRAIN.shell);
  BRAIN.inner = inner;
  BRAIN.light = new THREE.PointLight('#6fb8ff', 5, 15, 1.7); BRAIN.light.position.set(c.x, 3.4, c.z); scene.add(BRAIN.light);

  // wall screen above the racks
  [brainCtx, brainTex] = live(576, 160);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.24, 0.9), new THREE.MeshStandardMaterial({ color: '#05070b', emissive: '#ffffff', emissiveMap: brainTex, emissiveIntensity: 1.0, roughness: 0.2 }));
  screen.position.set(50, 3.3, 0.23); root.add(screen);
  setBrainStats({});
}

/** Wall screen: how much the Brain holds and how much it was used today. */
export function setBrainStats({ total = 0, reads = 0, writes = 0, top = '–' }) {
  const k = brainCtx; if (!k) return;
  k.fillStyle = '#0d1322'; k.fillRect(0, 0, 576, 160);
  k.fillStyle = '#8b97b8'; k.font = '600 14px Helvetica, Arial, sans-serif'; k.fillText('THE BRAIN · SHARED MEMORY', 18, 28);
  [['MEMORIES', total, '#ffcf5a'], ['READS TODAY', reads, '#4f9cf7'], ['WRITES TODAY', writes, '#3ecf8e'], ['TOP USER', top, '#c77dff']].forEach(([label, v, c], i) => {
    const x = 18 + i * 138; k.fillStyle = '#161d33'; k.fillRect(x, 44, 128, 96);
    k.fillStyle = c; k.font = `700 ${String(v).length > 5 ? 26 : 46}px Helvetica, Arial, sans-serif`; k.textAlign = 'center'; k.fillText(String(v), x + 64, 100);
    k.fillStyle = '#8b97b8'; k.font = '600 12px Helvetica, Arial, sans-serif'; k.fillText(label, x + 64, 126); k.textAlign = 'left';
  });
  brainTex.needsUpdate = true;
}

const cubeGeo = new THREE.BoxGeometry(0.27, 0.25, 0.27);
/** Put a memory on its rack as a small glowing cube. Racks hold 24; the oldest cube makes room for a new one. */
export function brainAddMemory(mem, animate = true) {
  const rack = BRAIN.racks[mem.category] || BRAIN.racks.lessons; if (!rack || BRAIN.cubes.has(mem.id)) return;
  let i = rack.slots.indexOf(null);
  if (i < 0) { const oldest = rack.slots[0]; brainRemoveMemory(oldest.id); i = rack.slots.indexOf(null); }
  const col = i % COLS, row = Math.floor(i / COLS), color = new THREE.Color(rack.color);
  const m = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: mem.sensitivity === 'private' ? 0.55 : 1.5, roughness: 0.3 }));
  m.position.set(-0.75 + col * 0.5, 0.34 + row * 0.36, 0.42); m.castShadow = false; rack.group.add(m);
  const rec = { id: mem.id, mesh: m, rack, slot: i, base: mem.sensitivity === 'private' ? 0.55 : 1.5, flash: 0, grow: animate ? 0 : 1 };
  if (animate) { m.scale.setScalar(0.01); rec.flash = 1.2; }
  rack.slots[i] = rec; BRAIN.cubes.set(mem.id, rec);
}
export function brainRemoveMemory(id) { const r = BRAIN.cubes.get(id); if (!r) return; r.rack.group.remove(r.mesh); r.mesh.material.dispose(); r.rack.slots[r.slot] = null; BRAIN.cubes.delete(id); }
export function brainSetMemories(list) { for (const id of [...BRAIN.cubes.keys()]) brainRemoveMemory(id); for (const m of list.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) brainAddMemory(m, false); }
export function brainFlash(ids) { for (const id of ids) { const r = BRAIN.cubes.get(id); if (r) r.flash = 1.6; } }
export const brainPulse = n => { BRAIN.pulse = Math.min(3, BRAIN.pulse + n); };
export function updateBrain(dt, t) {
  if (!BRAIN.core) return;
  BRAIN.core.rotation.y = t * 0.35; BRAIN.core.rotation.x = Math.sin(t * 0.3) * 0.15;
  BRAIN.shell.rotation.y = -t * 0.2; BRAIN.core.position.y = 2.1 + Math.sin(t * 1.3) * 0.08;
  BRAIN.pulse = Math.max(0, BRAIN.pulse - dt * 1.4);
  const beat = 1 + 0.06 * Math.sin(t * 2.2) + BRAIN.pulse * 0.16;
  BRAIN.inner.scale.setScalar(beat); BRAIN.inner.material.emissiveIntensity = 2.2 + BRAIN.pulse * 2.2;
  BRAIN.light.intensity = 4.5 + BRAIN.pulse * 8;
  for (const r of BRAIN.cubes.values()) {
    if (r.grow < 1) { r.grow = Math.min(1, r.grow + dt * 2.2); r.mesh.scale.setScalar(Math.max(0.01, r.grow * (1 + 0.4 * Math.sin(Math.PI * r.grow)))); }
    r.flash = Math.max(0, r.flash - dt * 1.6); r.mesh.material.emissiveIntensity = r.base + r.flash * 4;
  }
}

// A desk with an office chair and space for monitors. The person sits on the side the screens face.
const glowTex = canvasTex(64, 64, (k, w, h) => { const g = k.createRadialGradient(w / 2, h * 0.3, 2, w / 2, h * 0.3, w * 0.6); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); k.fillStyle = g; k.fillRect(0, 0, w, h); });
function buildDesk(scene, d) {
  const hq = d.id === 'hq', g = d.group = new THREE.Group(); g.position.set(d.x, 0, d.z); g.rotation.y = d.screenFace; scene.add(g);   // local +z = the side the person sits on
  const top = surface(hq ? 'walnut_veneer' : 'oak_veneer_01', d.w, d.d, 2.4, { mat: { roughness: 0.5 } }), metal = M('#1e2026', { roughness: 0.45, metalness: 0.6 });
  box(g, d.w, 0.07, d.d, top, 0, 0.95, 0);
  for (const sx of [-1, 1]) box(g, 0.08, 0.95, d.d - 0.2, metal, sx * (d.w / 2 - 0.15), 0, 0);
  box(g, d.w - 0.3, 0.5, 0.05, hq ? top : M('#2d3038', { roughness: 0.9 }), 0, 0.3, -d.d / 2 + 0.12);                                   // modesty panel
  if (!hq) {                                                                                                                            // privacy screen with a status strip in their colour
    box(g, d.w, 0.55, 0.06, M('#4a4f5a', { roughness: 1 }), 0, 1.02, -d.d / 2 + 0.03);
    d.strip = new THREE.MeshStandardMaterial({ color: d.who.color, emissive: d.who.color, emissiveIntensity: 0.2 });
    box(g, d.w, 0.04, 0.07, d.strip, 0, 1.57, -d.d / 2 + 0.03).castShadow = false;
  }
  box(g, 0.75, 0.75, 0.75, M('#30333b', { roughness: 0.6 }), d.w / 2 - 0.6, 0.02, -0.15);                                                // drawer unit
  // office chair
  const c = new THREE.Group(), fabric = M(hq ? '#3a2a22' : '#2a2d35', { roughness: 0.95 }); c.position.set(0, 0, Math.abs(d.seat.z - d.z)); g.add(c);
  for (let i = 0; i < 5; i++) { const a = box(c, 0.07, 0.05, 0.42, metal, Math.sin(i * 1.2566) * 0.2, 0.06, Math.cos(i * 1.2566) * 0.2); a.rotation.y = i * 1.2566; }
  cyl(c, 0.04, 0.04, 0.42, metal, 0, 0.1, 0, 10); box(c, 0.66, 0.1, 0.64, fabric, 0, 0.52, 0);
  box(c, 0.6, hq ? 0.95 : 0.72, 0.09, fabric, 0, 0.72, 0.36).rotation.x = 0.08;
  for (const sx of [-1, 1]) { box(c, 0.05, 0.22, 0.05, metal, sx * 0.36, 0.6, 0.05); box(c, 0.07, 0.04, 0.36, metal, sx * 0.36, 0.82, 0.05); }
  d.gear = new THREE.Group(); g.add(d.gear);
  [d.screenCtx, d.screenTex] = live(256, 152); setDeskText(d, null);
  d.glow = new THREE.MeshBasicMaterial({ color: '#9db8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex });   // light the screens throw on the desk
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(d.w * 0.95, d.d * 0.9), d.glow); gl.rotation.x = -Math.PI / 2; gl.position.set(0, 1.025, 0.1); g.add(gl);
  solid(d.x - d.w / 2, d.z - d.d / 2, d.x + d.w / 2, d.z + d.d / 2); solid(d.x - 0.42, d.seat.z - 0.42, d.x + 0.42, d.seat.z + 0.42);
}

// Screens on a desk: one per level. Unhired desks are bare.
const plusTex = canvasTex(64, 64, (k, w, h) => { k.strokeStyle = 'rgba(255,255,255,.9)'; k.lineWidth = 5; k.lineCap = 'round'; k.beginPath(); k.arc(w / 2, h / 2, 24, 0, 7); k.moveTo(w / 2 - 11, h / 2); k.lineTo(w / 2 + 11, h / 2); k.moveTo(w / 2, h / 2 - 11); k.lineTo(w / 2, h / 2 + 11); k.stroke(); });
export function setDeskLevel(d, level) {
  d.level = level; d.gear.clear(); d.screens = [];
  if (!level) { const plus = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: plusTex, transparent: true, opacity: 0.55, depthWrite: false })); plus.rotation.x = -Math.PI / 2; plus.position.set(0, 1.03, 0.1); d.gear.add(plus); }
  const dark = M('#15171c', { roughness: 0.4, metalness: 0.3 });
  const xs = [[], [0], [-0.52, 0.52], [-1.02, 0, 1.02]][level];
  for (const x of xs) {
    const g = new THREE.Group(); g.position.set(x, 1.02, -0.32); g.rotation.y = x * -0.3; d.gear.add(g);
    cyl(g, 0.16, 0.18, 0.02, dark, 0, 0, 0); box(g, 0.05, 0.3, 0.04, dark, 0, 0.02, -0.02);
    box(g, 0.98, 0.6, 0.035, dark, 0, 0.26, 0);
    const scr = new THREE.MeshStandardMaterial({ color: '#05070b', emissive: '#dfe9ff', emissiveMap: d.screenTex, emissiveIntensity: 0.85, roughness: 0.2 });
    const s = box(g, 0.93, 0.55, 0.01, scr, 0, 0.285, 0.02); s.castShadow = false; d.screens.push(scr);
  }
  if (level) {
    box(d.gear, 0.82, 0.03, 0.26, dark, -0.05, 1.02, 0.4).castShadow = false; box(d.gear, 0.1, 0.03, 0.16, dark, 0.58, 1.02, 0.42).castShadow = false;                     // keyboard, mouse
    cyl(d.gear, 0.07, 0.06, 0.16, M(d.who.color, { roughness: 0.4 }), -0.95, 1.02, 0.35, 14);                                                                                // mug in their colour
    box(d.gear, 0.36, 0.02, 0.5, M('#f3f1ea'), 1.0, 1.02, 0.3).castShadow = false;
    if (d.glow) d.glow.opacity = 0.32;                                                                                           // paper
  }
}
export function setDeskBusy(d, on) {
  d.busy = on;
  for (const s of d.screens) s.emissiveIntensity = on ? 1.7 : 0.85;
  if (d.glow) d.glow.opacity = on ? 0.62 : d.level ? 0.32 : 0;
  if (d.strip && !d.alert) d.strip.emissiveIntensity = on ? 1.6 : 0.2;
}

// ---------------------------------------------------------------- walking grid
const CELL = 0.5, GX0 = -2, GZ0 = -2, GW = 136, GH = 72, PAD = 0.3;
const cost = new Uint8Array(GW * GH);
function buildGrid() {
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL;
    const inside = x > 0.4 && x < W - 0.4 && z > 0.4 && z < D - 0.4, porch = x > 12.4 && x < 14.6 && z >= D - 0.4 && z < D + 3;
    const deck = x > 43.5 && x < 49.2 && z > 15.9 && z < 19.6, courts = x > 49 && x < 64.8 && z > 11.8 && z < 34;
    let ok = inside || porch || deck || courts;
    if (ok && !porch) for (const [x0, z0, x1, z1] of blocks) if (x > x0 - PAD && x < x1 + PAD && z > z0 - PAD && z < z1 + PAD) { ok = false; break; }
    cost[j * GW + i] = ok ? 1 : 0;
  }
}
const ci = x => Math.max(0, Math.min(GW - 1, Math.floor((x - GX0) / CELL))), cj = z => Math.max(0, Math.min(GH - 1, Math.floor((z - GZ0) / CELL)));
export const isFree = (x, z) => cost[cj(z) * GW + ci(x)] === 1;

export function findPath(x0, z0, x1, z1) {
  const ti = ci(x1), tj = cj(z1), S0 = cj(z0) * GW + ci(x0), T = tj * GW + ti;
  const g = new Float32Array(GW * GH).fill(Infinity), from = new Int32Array(GW * GH).fill(-1), open = [S0];
  g[S0] = 0;
  const h = n => Math.hypot((n % GW) - ti, Math.floor(n / GW) - tj);
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    const n = open.splice(bi, 1)[0];
    if (n === T) break;
    const ni = n % GW, nj = Math.floor(n / GW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ni + di, j = nj + dj;
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const m = j * GW + i;
      if (!cost[m] && m !== T) continue;
      if (di && dj && (!cost[nj * GW + i] || !cost[j * GW + ni])) continue;     // no cutting corners through furniture
      const ng = g[n] + (di && dj ? 1.414 : 1);
      if (ng < g[m]) { if (g[m] === Infinity) open.push(m); g[m] = ng; from[m] = n; }
    }
  }
  const cells = [];
  for (let n = from[T]; n !== -1 && n !== S0; n = from[n]) cells.unshift(n);
  // keep only the corners so people walk in straight lines, not staircases
  const pts = []; let pd = null, prev = S0;
  for (const n of cells) { const d = n - prev; if (pd !== null && d !== pd) pts.push(prev); pd = d; prev = n; }
  if (cells.length) pts.push(cells[cells.length - 1]);
  return [...pts.filter(n => n !== S0).map(n => new THREE.Vector3(GX0 + ((n % GW) + 0.5) * CELL, 0, GZ0 + (Math.floor(n / GW) + 0.5) * CELL)), new THREE.Vector3(x1, 0, z1)];
}

// ---------------------------------------------------------------- the courts outside: 3-a-side football and a half basketball court
// Whoever has no work walks out through the lounge's side door to play. The game moves the balls; this only builds the place.
const GOAL_Z = 17.25;
export const SPORTS = {
  football: {
    ball: null, r: 0.15, centre: { x: 56.75, z: GOAL_Z },
    goals: [{ x: 49.7, z: GOAL_Z }, { x: 63.8, z: GOAL_Z }],          // team 0 (slots 0-2) attacks goals[1], team 1 attacks goals[0]
    homes: [{ x: 50.8, z: GOAL_Z }, { x: 55.2, z: 14.6 }, { x: 55.2, z: 20 }, { x: 62.7, z: GOAL_Z }, { x: 58.3, z: 14.6 }, { x: 58.3, z: 20 }],
    keepers: [0, 3],                                                  // slots 0 and 3 stand in goal
    slots: new Array(6).fill(null),
  },
  basketball: {
    ball: null, r: 0.16, rim: new THREE.Vector3(62.7, 4.1, 28.75),
    homes: [{ x: 57.6, z: 28.75 }, { x: 58.4, z: 25.6 }, { x: 58.4, z: 31.9 }, { x: 60.6, z: 24.4 }, { x: 60.6, z: 33.1 }],
    slots: new Array(5).fill(null),
  },
};

function buildCourts(scene) {
  const pad = M('#5d636c', { roughness: 0.95 });
  box(scene, 6, 0.32, 3.9, M('#8a6a4f', { roughness: 0.8 }), 46.6, -0.32, 17.75);                // deck from the side door
  for (let i = 0; i < 9; i++) box(scene, 0.04, 0.005, 3.9, M('#5b4433'), 43.9 + i * 0.66, 0, 17.75).castShadow = false;
  box(scene, 16.2, 0.32, 22.8, pad, 56.9, -0.32, 22.9);                                              // the concrete pad both courts sit on
  const markings = (x0, z0, x1, z1, cw, ch, draw, o = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: canvasTex(cw, ch, draw), roughness: o.rough ?? 0.9 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m); return m;
  };
  // football: striped artificial turf, white lines (canvas: 70 px per unit)
  const P = 70, fx0 = 49.4, fz0 = 12, fx1 = 64.1, fz1 = 22.5;
  markings(fx0, fz0, fx1, fz1, (fx1 - fx0) * P, (fz1 - fz0) * P, (k, w, h) => {
    for (let i = 0; i < 10; i++) { k.fillStyle = i % 2 ? '#2e6a2c' : '#357531'; k.fillRect(i * w / 10, 0, w / 10 + 1, h); }
    k.strokeStyle = 'rgba(225,228,220,.7)'; k.lineWidth = 5; const m = 0.35 * P;
    k.strokeRect(m, m, w - 2 * m, h - 2 * m); k.beginPath(); k.moveTo(w / 2, m); k.lineTo(w / 2, h - m); k.stroke();
    k.beginPath(); k.arc(w / 2, h / 2, 1.6 * P, 0, Math.PI * 2); k.stroke();
    k.fillStyle = 'rgba(225,228,220,.8)'; k.beginPath(); k.arc(w / 2, h / 2, 9, 0, Math.PI * 2); k.fill();
    for (const side of [0, 1]) { const bw = 2.4 * P, bh = 5.6 * P, x = side ? w - m - bw : m; k.strokeRect(x, h / 2 - bh / 2, bw, bh); k.beginPath(); k.arc(side ? w - m - 1.7 * P : m + 1.7 * P, h / 2, 7, 0, Math.PI * 2); k.fill(); }
  });
  // goals: white frame, net behind
  const white = M('#f4f4f2', { roughness: 0.4 }), netTex = canvasTex(128, 128, (k, w, h) => { k.strokeStyle = 'rgba(255,255,255,.85)'; k.lineWidth = 3; for (let i = 0; i <= 8; i++) { k.beginPath(); k.moveTo(i * w / 8, 0); k.lineTo(i * w / 8, h); k.stroke(); k.beginPath(); k.moveTo(0, i * h / 8); k.lineTo(w, i * h / 8); k.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 });
  for (const [gx, back] of [[49.75, -0.9], [63.75, 0.9]]) {
    const gw = 3.4, gh = 1.65, z0 = GOAL_Z - gw / 2, z1 = GOAL_Z + gw / 2;
    for (const z of [z0, z1]) cyl(scene, 0.05, 0.05, gh, white, gx, 0, z, 10);
    const bar = cyl(scene, 0.05, 0.05, gw, white, gx, gh - 0.05, GOAL_Z, 10); bar.rotation.x = Math.PI / 2; bar.position.y = gh;
    const netMesh = (w, h, x, y, z, ry, rx = 0) => { const t = netTex.clone(); t.repeat.set(w * 2, h * 2); t.needsUpdate = true; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), netMat.clone()); m.material.map = t; m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.castShadow = false; scene.add(m); };
    netMesh(gw, gh, gx + back, gh / 2, GOAL_Z, Math.PI / 2);                                         // back
    netMesh(Math.abs(back), gw, gx + back / 2, gh, GOAL_Z, 0, -Math.PI / 2);                     // roof
    for (const z of [z0, z1]) netMesh(Math.abs(back), gh, gx + back / 2, gh / 2, z, 0);
    solid(Math.min(gx, gx + back) - 0.05, z0 - 0.05, Math.max(gx, gx + back) + 0.05, z0 + 0.05); solid(Math.min(gx, gx + back) - 0.05, z1 - 0.05, Math.max(gx, gx + back) + 0.05, z1 + 0.05);
  }
  // half basketball court: blue paint, orange key, white lines; the hoop on the east baseline faces west
  const bx0 = 49.4, bz0 = 23.6, bx1 = 64.1, bz1 = 34, R = SPORTS.basketball.rim;
  markings(bx0, bz0, bx1, bz1, (bx1 - bx0) * P, (bz1 - bz0) * P, (k, w, h) => {
    k.fillStyle = '#22476b'; k.fillRect(0, 0, w, h);
    const hx = (R.x - bx0) * P, hz = (R.z - bz0) * P, m = 0.35 * P, kw = 3.6 * P, kl = 5.3 * P;
    k.fillStyle = '#9c4d26'; k.fillRect(w - m - kl, hz - kw / 2, kl, kw);
    k.strokeStyle = 'rgba(225,228,220,.75)'; k.lineWidth = 5; k.strokeRect(m, m, w - 2 * m, h - 2 * m); k.strokeRect(w - m - kl, hz - kw / 2, kl, kw);
    k.beginPath(); k.arc(w - m - kl, hz, 1.6 * P, Math.PI / 2, Math.PI * 1.5); k.stroke();
    k.beginPath(); k.arc(hx, hz, 6.2 * P, Math.PI * 0.62, Math.PI * 1.38); k.stroke();                       // three-point arc
    k.beginPath(); k.arc(m, hz, 1.6 * P, -Math.PI / 2, Math.PI / 2); k.stroke();                              // half of the centre circle
  }, { rough: 0.85 });
  const steel = M('#2a2e36', { metalness: 0.6, roughness: 0.4 });
  cyl(scene, 0.11, 0.13, 5.2, steel, 64.25, 0, R.z, 14); solid(64, R.z - 0.25, 64.5, R.z + 0.25);
  box(scene, 1.1, 0.12, 0.12, steel, 63.75, 4.35, R.z);
  const board = box(scene, 0.06, 1.45, 2.45, new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.1 }), 63.18, 3.85, R.z); board.castShadow = false;
  box(scene, 0.07, 0.05, 0.9, M('#ffffff'), 63.14, 4.25, R.z); box(scene, 0.07, 0.6, 0.05, M('#ffffff'), 63.14, 4.15, R.z - 0.45); box(scene, 0.07, 0.6, 0.05, M('#ffffff'), 63.14, 4.15, R.z + 0.45);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.025, 8, 28), M('#e8541c', { metalness: 0.4, roughness: 0.4 })); rim.rotation.x = Math.PI / 2; rim.position.copy(R); scene.add(rim);
  box(scene, 0.2, 0.04, 0.06, M('#e8541c'), 63.05, R.y - 0.02, R.z);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.2, 0.5, 14, 1, true), new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  net.position.set(R.x, R.y - 0.25, R.z); net.castShadow = false; scene.add(net);
  // a bench beside each court
  const wood = M('#9a7650', { roughness: 0.7 });
  for (const [x, z] of [[56.75, 11.95], [52.2, 33.7]]) { box(scene, 2.6, 0.08, 0.5, wood, x, 0.55, z); for (const dx of [-1.1, 1.1]) box(scene, 0.08, 0.55, 0.45, steel, x + dx, 0, z); solid(x - 1.3, z - 0.25, x + 1.3, z + 0.25); }
  // the balls
  const ballTex = (draw) => canvasTex(256, 128, draw);
  const fb = SPORTS.football, bb = SPORTS.basketball;
  fb.ball = new THREE.Mesh(new THREE.SphereGeometry(fb.r, 18, 14), new THREE.MeshStandardMaterial({ roughness: 0.5, map: ballTex((k, w, h) => { k.fillStyle = '#f7f7f5'; k.fillRect(0, 0, w, h); k.fillStyle = '#1b1c20'; for (let i = 0; i < 12; i++) { const x = (i % 6) * w / 6 + (i < 6 ? 0 : w / 12), y = i < 6 ? h * 0.3 : h * 0.72; k.beginPath(); for (let a = 0; a < 5; a++) { const t = a / 5 * Math.PI * 2; k.lineTo(x + Math.cos(t) * 13, y + Math.sin(t) * 13); } k.fill(); } }) }));
  fb.ball.position.set(fb.centre.x, fb.r, fb.centre.z); fb.ball.castShadow = true; scene.add(fb.ball);
  bb.ball = new THREE.Mesh(new THREE.SphereGeometry(bb.r, 18, 14), new THREE.MeshStandardMaterial({ roughness: 0.7, map: ballTex((k, w, h) => { k.fillStyle = '#d8661f'; k.fillRect(0, 0, w, h); k.strokeStyle = '#2a1408'; k.lineWidth = 4; for (const x of [0, w / 4, w / 2, w * 0.75]) { k.beginPath(); k.moveTo(x, 0); k.lineTo(x, h); k.stroke(); } k.beginPath(); k.moveTo(0, h / 2); k.lineTo(w, h / 2); k.stroke(); }) }));
  bb.ball.position.set(61.6, bb.r, 30.2); bb.ball.castShadow = true; scene.add(bb.ball);
}
