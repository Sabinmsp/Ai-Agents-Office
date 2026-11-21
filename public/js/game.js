// Agent Office client: an isometric office where each desk belongs to an AI team member who works for you.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ANIM, MAX_LEVEL, BUILD_COST, EFFORT_BY_LEVEL, SKILLS } from './config.js';
import { BOSS, AGENTS } from './team.js';
import { renderMarkdown } from './markdown.js';
import { W, D, ROOMS, SPOTS, DESKS, LIGHTS, FX, POINTS, BRAIN, CATEGORY_COLORS, buildOffice, setDeskLevel, setDeskBusy, setDeskText, setDeskAlert, setWhiteboard, setWallStats, setBrainStats, brainAddMemory, brainRemoveMemory, brainSetMemories, brainFlash, brainPulse, brainCorePos, updateBrain, findPath, SPORTS } from './office.js';
import { createBus, MockSource, ServerSource, WebSocketSource } from './agentEvents.js';
import { clip, loadPeople, makePerson } from './people.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), canvas = $('view'), labels = $('labels');
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WHO = Object.fromEntries([BOSS, ...AGENTS].map(a => [a.id, a]));
const agentIndex = id => AGENTS.findIndex(a => a.id === id);

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0e15');
const reflections = new THREE.PMREMGenerator(renderer), roomEnvironment = new RoomEnvironment();
scene.environment = reflections.fromScene(roomEnvironment, 0.04).texture;
roomEnvironment.dispose();
reflections.dispose();
scene.environmentIntensity = 0.3;
const BASE_DIST = 70;   // camera distance that shows the whole office
const camera = new THREE.PerspectiveCamera(30, 1, 2, 1200);
const controls = new OrbitControls(camera, canvas);
controls.target.set(ROOMS.overview.x, 0, ROOMS.overview.z);
camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(1, 1.25, 1).normalize(), BASE_DIST);
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.screenSpacePanning = false;
controls.minDistance = 12; controls.maxDistance = 140;
controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.25;
controls.addEventListener('change', () => { controls.target.x = THREE.MathUtils.clamp(controls.target.x, 0, 64); controls.target.z = THREE.MathUtils.clamp(controls.target.z, 0, D); controls.target.y = 0; });

// ---------------------------------------------------------------- light: sun, moon, lamps, sky. Driven by the time of day (see setTime).
const hemi = new THREE.HemisphereLight('#ffe9cf', '#2a2630', 0.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffe2bd', 1.9);        // the sun by day, the moon by night; the roof is open, so it lights the rooms
sun.target.position.set(W / 2, 0, D / 2); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 2;
Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 5, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
scene.add(sun);
scene.fog = new THREE.Fog('#060a13', 170, 430);                // the far lawn fades into the sky
const lamps = [];                                              // one warm light per pendant, filled in once the office is built
const stars = (() => {
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = i * 2.39996, y = 0.08 + 0.9 * ((i * 0.6180339) % 1), r = Math.sqrt(1 - y * y); pos.set([Math.cos(a) * r * 800, y * 800, Math.sin(a) * r * 800], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  p.position.set(W / 2, 0, D / 2); scene.add(p); return p;
})();

// Darwin's clock decides the light. Click the clock in the top bar to preview other times.
const SUNRISE = 6.6, SUNSET = 18.8, MODES = [null, 13, 18.45, 22];
let timeMode = 0;
const darwinHour = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Darwin', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return Number(p.hour) + Number(p.minute) / 60; };
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
function setTime(h) {
  const p = (h - SUNRISE) / (SUNSET - SUNRISE), alt = Math.sin(Math.PI * p);           // sun height: 1 at midday, below 0 at night
  const day = smooth(-0.1, 0.32, alt), dusk = Math.max(0, 1 - Math.abs(alt - 0.06) / 0.34), night = 1 - smooth(-0.28, 0.02, alt), lampsOn = 1 - smooth(0.05, 0.4, alt);
  const sky = mix(mix('#060a13', '#9cc6ea', day), '#c7775a', dusk * 0.75);
  scene.background = sky; scene.fog.color.copy(sky);
  hemi.color.copy(mix(mix('#2c3856', '#e3f1ff', day), '#ffb98a', dusk * 0.7)); hemi.groundColor.copy(mix('#0b0c11', '#77805f', day)); hemi.intensity = 0.2 + 0.5 * day;
  sun.color.copy(mix(mix('#9db4e6', '#fff4e2', day), '#ff8a48', dusk * 0.85)); sun.intensity = 0.3 + 1.5 * day - 0.4 * dusk * day;
  const el = alt > 0 ? Math.max(0.24, alt * 1.15) : 0.95, az = alt > 0 ? Math.PI * THREE.MathUtils.clamp(p, 0, 1) : 1.1;      // in November Darwin's sun passes just south of overhead
  sun.position.set(W / 2 + Math.cos(az) * Math.cos(el) * 90, Math.sin(el) * 90, D / 2 + (0.45 * Math.cos(el) + 0.12) * 90);
  renderer.shadowMap.needsUpdate = true;
  scene.environmentIntensity = 0.16 + 0.42 * day;
  renderer.toneMappingExposure = 1.08 - 0.18 * day;
  for (const l of lamps) l.intensity = l.userData.base * (0.1 + 0.9 * lampsOn);
  if (FX.bulb) FX.bulb.emissiveIntensity = 0.35 + 3.0 * lampsOn;
  if (FX.gardenBulb) FX.gardenBulb.emissiveIntensity = 3.2 * lampsOn;
  if (FX.window) FX.window.color.copy(mix(sky, '#ffffff', 0.25 * day));
  stars.material.opacity = night * 0.9;
  const hh = Math.floor(h), mm = String(Math.floor((h - hh) * 60)).padStart(2, '0');
  $('clock').textContent = `${alt < -0.05 ? '🌙' : dusk > 0.5 ? '🌇' : '☀️'} ${hh}:${mm}${timeMode ? ' · preview' : ''}`;
}
const refreshTime = () => setTime(MODES[timeMode] ?? darwinHour());
$('clock').onclick = () => { timeMode = (timeMode + 1) % MODES.length; refreshTime(); };
$('clock').title = 'Darwin time. Click to preview day, sunset and night.';

let viewWidth = 2, viewHeight = 2;
function resize() {
  viewWidth = Math.max(2, stage.clientWidth);
  viewHeight = Math.max(2, stage.clientHeight);
  const scale = Math.min(devicePixelRatio, 1.25, Math.sqrt(2_000_000 / (viewWidth * viewHeight)));
  renderer.setDrawingBufferSize(viewWidth, viewHeight, scale);
  camera.aspect = viewWidth / viewHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// room tabs: glide the camera to a room
let camGoal = null;
function focus(x, z, zoom) { camGoal = { x, z, dist: BASE_DIST / zoom }; }
controls.addEventListener('start', () => { camGoal = null; });
for (const [key, room] of Object.entries(ROOMS)) {
  const b = document.createElement('button'); b.textContent = room.name; b.dataset.room = key;
  b.onclick = () => { focus(room.x, room.z, room.zoom); for (const o of $('rooms').children) o.classList.toggle('on', o === b); };
  if (key === 'overview') b.classList.add('on');
  $('rooms').appendChild(b);
}
const camDir = new THREE.Vector3();
function updateCamera(dt) {
  if (!camGoal) return;
  const k = Math.min(1, dt * 4);
  camDir.subVectors(camera.position, controls.target); const dist = camDir.length(); camDir.normalize();
  controls.target.x += (camGoal.x - controls.target.x) * k; controls.target.z += (camGoal.z - controls.target.z) * k;
  const nd = dist + (camGoal.dist - dist) * k;
  camera.position.copy(controls.target).addScaledVector(camDir, nd);
  if (Math.abs(camGoal.x - controls.target.x) + Math.abs(camGoal.z - controls.target.z) < 0.02 && Math.abs(camGoal.dist - nd) < 0.05) camGoal = null;
}

// ---------------------------------------------------------------- people
// A portrait of each person for the cards and the team chart, rendered once from the 3D model.
const portraits = {};
function makePortraits() {
  if (portraits[BOSS.id]) return;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(128, 128);
  const s = new THREE.Scene(); s.add(new THREE.HemisphereLight('#ffffff', '#b0a090', 2.4)); const d = new THREE.DirectionalLight('#fff', 1.8); d.position.set(2, 3, 4); s.add(d);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 100); cam.position.set(0.3, 2.3, 1.75); cam.lookAt(0, 2.22, 0);
  for (const def of [BOSS, ...AGENTS]) {
    const p = makePerson(def.look, def.kit); s.add(p);
    const mixer = new THREE.AnimationMixer(p.userData.body); mixer.clipAction(clip(ANIM.idle)).play(); mixer.update(0.4);
    r.render(s, cam); portraits[def.id] = r.domElement.toDataURL(); s.remove(p);
  }
  r.dispose();
}

const walkers = {};
const tmp = new THREE.Vector3();
// ---- Sitting. The sitting animation puts the pelvis behind the character's root, so the body is slid forward onto the chair seat,
// and while someone is at their own desk both arms are solved (two-bone IK) so the hands rest on the keyboard and tap when they work.
const ARM_BONES = ['upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'];
const SIT_FORWARD = 0.42;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _t = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _bq = new THREE.Quaternion();
function aim(bone, from, to) {                       // turn a bone, in world space, so that direction `from` becomes `to`
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_q1); _q2.setFromUnitVectors(from, to); _q1.premultiply(_q2);
  bone.parent.getWorldQuaternion(_q3); bone.quaternion.copy(_q3.invert().multiply(_q1));
  bone.updateWorldMatrix(false, true);
}
function twoBone(upper, lower, hand, target, pole) {
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _d.subVectors(target, _a); const full = _d.length(), d = Math.min(Math.max(full, 0.05), (l1 + l2) * 0.995); _d.divideScalar(full || 1);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), up = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _e.subVectors(pole, _a); _e.addScaledVector(_d, -_e.dot(_d)).normalize();
  const elbow = _a.clone().addScaledVector(_d, along).addScaledVector(_e, up);
  aim(upper, _b.clone().sub(_a).normalize(), elbow.clone().sub(_a).normalize());
  lower.getWorldPosition(_b); hand.getWorldPosition(_c);
  aim(lower, _c.clone().sub(_b).normalize(), _a.clone().addScaledVector(_d, d).sub(_b).normalize());
}
function typePose(w, t, weight) {
  const desk = DESKS[w.def.id], body = w.group.userData.body; if (!desk?.group) return;
  body.updateMatrixWorld(true); body.getWorldQuaternion(_bq);
  for (const side of ['l', 'r']) {
    const m = side === 'l' ? 1 : -1, u = w.bones['upperarm_' + side], lo = w.bones['lowerarm_' + side], h = w.bones['hand_' + side]; if (!u || !lo || !h) continue;
    const qu = u.quaternion.clone(), ql = lo.quaternion.clone();                       // the animated pose, to blend back toward
    const tap = w.working ? Math.max(0, Math.sin(t * 17 + w.phase0 + (m > 0 ? 0 : 2.3))) * 0.03 : 0;
    _t.set(side === 'l' ? -0.3 : 0.22, 1.07 + tap, 0.4 + (w.working ? Math.sin(t * 3 + m) * 0.04 : 0)); desk.group.localToWorld(_t);
    u.getWorldPosition(_c); _e.set(0.6 * m, -0.9, -0.5).applyQuaternion(_bq).add(_c);   // elbows out, down and back
    twoBone(u, lo, h, _t, _e);
    if (weight < 0.999) { const iu = u.quaternion.clone(), il = lo.quaternion.clone(); u.quaternion.copy(qu).slerp(iu, weight); lo.quaternion.copy(ql).slerp(il, weight); u.updateWorldMatrix(false, true); }
  }
}
class Walker {
  constructor(def) {
    Object.assign(this, { def, isBoss: def.id === 'hq', path: [], speed: 2, dest: null, seat: null, mode: 'desk', task: null, working: false, until: 0, idle: 30 + Math.random() * 60, anim: '', rest: 'idle', ik: 0 });
    this.group = makePerson(def.look, def.kit); this.pos = this.group.position;
    this.mixer = new THREE.AnimationMixer(this.group.userData.body);
    this.bones = Object.fromEntries(ARM_BONES.map(n => [n, this.group.userData.body.getObjectByName(n)]));
    this.phase0 = Math.random() * 10;
    this.actions = Object.fromEntries(Object.entries(ANIM).map(([k, v]) => [k, this.mixer.clipAction(clip(v))]));
    for (const k of ['shoot']) { this.actions[k].setLoop(THREE.LoopOnce); this.actions[k].clampWhenFinished = true; }
    scene.add(this.group);
    this.tag = el('div', 'tag who'); this.tag.innerHTML = `<i></i>${escapeHtml(def.name)}`; this.tag.style.setProperty('--c', def.color);
    this.bubble = el('div', 'tag say'); this.bubble.hidden = true; this.bubbleUntil = 0;
  }
  play(name) {
    if (this.anim === name || !this.actions[name]) return;
    this.actions[name].reset().fadeIn(0.25).play();
    this.actions[this.anim]?.fadeOut(0.25);
    this.anim = name;
  }
  sitDown(s, snap = false) { this.seat = s; if (snap) { this.pos.set(s.x, 0, s.z); this.group.rotation.y = s.face; this.group.userData.body.position.z = SIT_FORWARD; } }
  goTo(spot, speed = 4.6) {          // walk to the spot beside a seat, then step onto it. Leaving a seat: step out sideways first, no teleporting.
    const from = this.seat; this.seat = null;
    this.dest = spot; this.speed = speed;
    const t = spot.via || spot;
    let pts;
    if (from) { const v = new THREE.Vector3(from.via.x, 0, from.via.z); pts = [v, ...findPath(v.x, v.z, t.x, t.z)]; }
    else pts = findPath(this.pos.x, this.pos.z, t.x, t.z);
    if (spot.sit) pts.push(new THREE.Vector3(spot.x, 0, spot.z));
    this.path = pts;
  }
  turn(want, dt) { let d = want - this.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); this.group.rotation.y += d * Math.min(1, dt * 9); }
  update(dt, t) {
    this.mixer.update(dt);
    const body = this.group.userData.body;
    body.position.z += ((this.seat ? SIT_FORWARD : 0) - body.position.z) * Math.min(1, dt * 5);
    const seated = this.seat && this.seat === DESKS[this.def.id]?.seat && this.anim === 'sit' && !this.path.length;
    this.ik += ((seated ? 1 : 0) - this.ik) * Math.min(1, dt * 4);
    if (this.ik > 0.01) typePose(this, t, this.ik);
    if (this.path.length) {
      const p = this.path[0]; tmp.subVectors(p, this.pos); tmp.y = 0;
      const d = tmp.length(), step = this.speed * dt;
      if (d <= step) {
        this.pos.copy(p); this.path.shift();
        if (!this.path.length) { if (this.dest.sit) this.sitDown(this.dest); if (this.dest.say) say(this.def.id, this.dest.say, 4); }
      } else { this.pos.addScaledVector(tmp, step / d); this.turn(Math.atan2(tmp.x, tmp.z), dt); }
      if (this.path.length) { this.pos.y = 0; this.play(this.speed > 3.2 ? 'run' : 'walk'); }
    } else {
      if (this.seat) this.turn(this.seat.face, dt); else if (this.dest && this.dest.face != null) this.turn(this.dest.face, dt);
      const fx = this.fx && performance.now() < this.fx.until && !this.seat ? this.fx : (this.fx = null);
      this.pos.y = fx?.move === 'jump' ? Math.abs(Math.sin(t * 6.5)) * 0.42 : 0;            // a celebration: jumping, dancing or punching the air
      this.play(this.seat ? (this.rest === 'talk' ? 'sitTalk' : 'sit') : fx ? (fx.move === 'dance' ? 'dance' : 'cheer') : this.rest);
    }
  }
}
function spawn(def, spot) {
  const w = new Walker(def);
  if (spot.sit) w.sitDown(spot, true); else { w.pos.set(spot.x, 0, spot.z); w.group.rotation.y = spot.face ?? 0; }
  w.dest = spot; w.play(spot.sit ? 'sit' : 'idle');
  return (walkers[def.id] = w);
}

// ---------------------------------------------------------------- everyday behaviour
// Everyone sits at their own desk by default. Without a task they take the odd short break; meetings and trips to QA are timed.
function goDesk(w, speed = 4.4) { w.mode = 'desk'; w.rest = 'idle'; w.fx = null; const s = DESKS[w.def.id].seat; if (w.seat !== s && !(w.dest === s && w.path.length)) w.goTo(s, speed); }
const pick = a => a?.length ? a[Math.floor(Math.random() * a.length)] : null;
const chatter = w => { const l = pick(w.def.lines); if (l) say(w.def.id, l, 3.5); };
/** Their own celebration: stand up beside the desk, jump, dance or punch the air, and say their line. */
function celebrate(w) {
  if (!w.def.celebrate || w.isBoss) return;
  const s = DESKS[w.def.id].seat;
  log(w.def.id, `celebrated: ${quote(w.def.celebrate.say)}`, 'life');
  w.mode = 'celebrate'; w.until = 0; w.goTo({ x: s.via.x, z: s.via.z, face: 0 }, 2.4);
}
const cheer = (w, secs = 3) => { if (w.def.celebrate) { w.fx = { move: w.def.celebrate.move, until: performance.now() + secs * 1000 }; say(w.def.id, w.def.celebrate.say, secs); } };
/** The coach does not sit still: he watches games from the touchline and stands behind whoever is working. */
function coachRound(w) {
  w.idle = 35 + Math.random() * 45;
  const players = Object.values(walkers).filter(x => x.mode === 'sport' && x.sport === 'football').length;
  const busy = Object.values(walkers).filter(x => !x.isBoss && x.working);
  let spot = null;
  if (players >= 2 && (!busy.length || Math.random() < 0.75)) spot = { x: 56.75, z: 23.1, face: Math.PI };
  else if (busy.length) { const d = DESKS[pick(busy).def.id], v = d.seat.via; spot = { x: v.x, z: v.z + (d.screenFace ? -1.1 : 1.1) }; spot.face = Math.atan2(d.x - spot.x, d.z - spot.z); }
  if (!spot) return;
  log(w.def.id, spot.z > 22 && spot.x > 50 ? 'is watching the game from the touchline 📢' : `is coaching ${WHO[Object.keys(DESKS).find(id => DESKS[id].seat.via.x === spot.x && Math.abs(DESKS[id].seat.via.z - spot.z) < 1.2)]?.name || 'the team'} at his desk`, 'life');
  w.mode = 'coach'; w.until = performance.now() + 14000 + Math.random() * 8000; w.rest = 'talk'; w.goTo(spot, 2.6);
}
function takeBreak(w) {
  if (Math.random() < 0.6 && joinSport(w)) return;
  const taken = new Set(Object.values(walkers).map(x => x.dest)), free = SPOTS.breaks.filter(s => !taken.has(s));
  w.idle = 50 + Math.random() * 70;
  if (!free.length) return;
  const spot = free[Math.floor(Math.random() * free.length)];
  w.mode = 'break'; w.until = 0; w.goTo(spot, 1.9); log(w.def.id, BREAK_WORDS[spot.say] || 'is relaxing on the sofa 🛋️', 'life');
}
function brain(w, dt, now) {
  if (w.path.length) return;
  if (w.mode === 'meeting' || w.mode === 'qa') { if (now > w.until) { if (w.isBoss) w.rest = 'idle'; goDesk(w); } return; }
  if (w.mode === 'sport') { if (now > w.until) goDesk(w, 2.2); return; }
  if (w.mode === 'celebrate') { if (!w.until) { w.until = now + 3200; cheer(w, 3); } else if (now > w.until) goDesk(w, 2); return; }
  if (w.mode === 'coach') { if (now > w.until) goDesk(w, 2.6); else if (Math.random() < dt * 0.22) chatter(w); return; }
  if (w.mode === 'break') { if (!w.until) { w.until = now + 7000 + Math.random() * 9000; if (Math.random() < 0.5) setTimeout(() => chatter(w), 4200); } else if (now > w.until) goDesk(w, 1.9); return; }
  if (!w.seat) return goDesk(w);
  if (w.isBoss && !w.task) { w.idle -= dt; if (w.idle < 0) coachRound(w); return; }
  if (w.isBoss || w.task) return;
  w.idle -= dt;
  if (w.idle < 0) takeBreak(w);
}

// ---------------------------------------------------------------- sport on the courts outside
// Free players walk out to the courts: 3-a-side football on the pitch, shooting around on the half court. A new task sends them straight back in.
const jitter = (p, r) => ({ x: p.x + (Math.random() - 0.5) * r, z: p.z + (Math.random() - 0.5) * r });
const lerp = THREE.MathUtils.lerp, faceTo = (w, x, z) => { if (w.dest && !w.seat) w.dest.face = Math.atan2(x - w.pos.x, z - w.pos.z); };
function joinSport(w) {
  // join a game that already has players if there is room, so games actually happen; otherwise start one
  const open = Object.entries(SPORTS).map(([k, S]) => ({ k, S, n: S.slots.filter(Boolean).length, free: S.slots.map((id, i) => id ? -1 : i).filter(i => i >= 0) })).filter(o => o.free.length);
  if (!open.length) return false;
  open.sort((a, b) => b.n - a.n + Math.random() * 1.5 - 0.75);
  const gk = !!w.def.kit?.gloves, inGoal = open.find(o => o.k === 'football' && o.free.some(i => o.S.keepers.includes(i)));
  const { k, S, free } = gk && inGoal ? inGoal : open[0];
  let slot = free[Math.floor(Math.random() * free.length)];
  if (k === 'football') {                       // the keeper goes in goal; everyone else plays outfield unless the outfield is full
    const team = i => i < 3 ? 0 : 1, count = t => S.slots.filter((id, i) => id && team(i) === t).length, want = count(0) <= count(1) ? 0 : 1;
    const goals = free.filter(i => S.keepers.includes(i)), outfield = free.filter(i => !S.keepers.includes(i));
    if (gk && goals.length) slot = goals[0];
    else { const pool = outfield.length ? outfield : free; slot = pool.find(i => team(i) === want) ?? pool[0]; }
  }
  S.slots[slot] = w.def.id;
  Object.assign(w, { mode: 'sport', sport: k, slot, until: performance.now() + 45000 + Math.random() * 40000 });
  log(w.def.id, k === 'basketball' ? 'went out to shoot hoops 🏀' : S.keepers.includes(slot) ? 'went out to play football, in goal 🧤' : 'went out to play football ⚽', 'life');
  const h = S.homes[slot]; w.goTo({ x: h.x, z: h.z, face: 0, say: k === 'football' ? '⚽' : '🏀' }, 2.4);
  return true;
}
const onCourt = (S, k) => S.slots.map((id, i) => ({ id, i, w: walkers[id] })).filter(o => o.id && o.w && o.w.mode === 'sport' && o.w.sport === k);
function flyBall(S, to, dur, h, done) { const b = S.ball.position; S.fly = { a: b.clone(), b: to.clone(), t: 0, dur, h, done }; }
function stepFlight(S, dt, roll) {
  const f = S.fly; f.t += dt; const u = Math.min(1, f.t / f.dur), e = roll ? 1 - (1 - u) * (1 - u) : u;
  S.ball.position.set(lerp(f.a.x, f.b.x, e), lerp(f.a.y, f.b.y, e) + 4 * f.h * u * (1 - u), lerp(f.a.z, f.b.z, e));
  S.ball.rotation.z -= dt * 12 * (1 - u * 0.6); S.ball.rotation.x += dt * 5;
  if (u >= 1) { S.fly = null; f.done?.(); }
}
function updateSports(dt, t) {
  for (const [k, S] of Object.entries(SPORTS)) {
    S.slots.forEach((id, i) => { const w = walkers[id]; if (id && (!w || w.mode !== 'sport' || w.sport !== k)) { S.slots[i] = null; if (S.holder === id) S.holder = null; if (S.fetch === id) S.fetch = null; } });
    const on = onCourt(S, k), here = on.filter(o => !o.w.path.length);
    for (const o of here) { if (o.id !== S.holder) faceTo(o.w, S.ball.position.x, S.ball.position.z); if (Math.random() < dt * 0.03) chatter(o.w); }
    (k === 'football' ? football : hoops)(S, on, here, dt, t);
  }
}
const _v = new THREE.Vector3();
function football(S, on, here, dt, t) {
  const b = S.ball.position;
  if (S.fly) return stepFlight(S, dt, true);
  if (S.pause > 0) { S.pause -= dt; if (S.pause <= 0) b.set(S.centre.x, S.r, S.centre.z); return; }
  if (!S.holder) {                                                         // loose ball: the nearest player goes to get it
    if (!on.length) return;
    let f = S.fetch && walkers[S.fetch];
    if (!f) { const near = on.slice().sort((p, q) => p.w.pos.distanceToSquared(b) - q.w.pos.distanceToSquared(b))[0]; S.fetch = near.id; f = near.w; f.goTo({ x: b.x, z: b.z, face: 0 }, 4.2); }
    else if (!f.path.length) { if (Math.hypot(f.pos.x - b.x, f.pos.z - b.z) < 0.9) { S.holder = S.fetch; S.wait = 0.5 + Math.random() * 0.6; } else f.goTo({ x: b.x, z: b.z, face: 0 }, 4.2); S.fetch = S.holder ? null : S.fetch; }
    return;
  }
  const w = walkers[S.holder], fwd = _v.set(Math.sin(w.group.rotation.y), 0, Math.cos(w.group.rotation.y));
  b.set(w.pos.x + fwd.x * 0.45, S.r, w.pos.z + fwd.z * 0.45); S.ball.rotation.z -= w.path.length ? dt * 8 : 0;
  if (w.path.length) return;
  S.wait -= dt; if (S.wait > 0) return;
  const team = w.slot < 3 ? 0 : 1, goal = S.goals[1 - team], mates = on.filter(o => o.id !== S.holder);
  const passer = w, back = () => passer.goTo({ ...jitter(S.homes[passer.slot], S.keepers.includes(passer.slot) ? 0.4 : 1.6), face: 0 }, 2.2);
  if (!mates.length || Math.random() < 0.2 || Math.hypot(goal.x - w.pos.x, goal.z - w.pos.z) < 4.5) {          // shoot
    faceTo(w, goal.x, goal.z); w.rest = 'idle';
    const scored = Math.random() < 0.6, to = new THREE.Vector3(goal.x + (goal.x < S.centre.x ? -0.5 : 0.5), S.r, goal.z + (scored ? (Math.random() - 0.5) * 2.6 : (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random())));
    S.holder = null;
    const gk = on.find(o => o.i === (team === 0 ? 3 : 0) && !o.w.path.length);
    if (scored && gk && Math.random() < (gk.w.def.kit?.gloves ? 0.55 : 0.35)) {             // the keeper gets to it
      const at = new THREE.Vector3(goal.x + (goal.x < S.centre.x ? 1 : -1), S.r, THREE.MathUtils.clamp(to.z, goal.z - 1.4, goal.z + 1.4));
      gk.w.goTo({ x: at.x, z: at.z, face: 0 }, 5.5);
      flyBall(S, at, 0.6, 0.35, () => { S.fetch = gk.id; say(gk.id, 'Save! 🧤', 2.5); log(gk.id, `saved a shot from ${passer.def.name} 🧤`, 'life'); back(); });
      return;
    }
    flyBall(S, to, 0.55 + Math.random() * 0.2, scored ? 0.3 + Math.random() * 0.6 : 0.4, () => {
      if (scored && on.length < 2) { S.pause = 1.2; setTimeout(back, 800); }                 // practising alone: no celebration
      else if (scored) { log(passer.def.id, `scored a goal! ${passer.def.celebrate?.say || '⚽'}`, 'life'); cheer(passer, 2.4); say(passer.def.id, `GOAL! ${passer.def.celebrate?.say || '⚽'}`, 3); S.pause = 2; setTimeout(back, 2500); }
      else back();
    });
    return;
  }
  const r = mates[Math.floor(Math.random() * mates.length)], spot = jitter(S.homes[r.i], S.keepers.includes(r.i) ? 0.8 : 3);
  spot.x = THREE.MathUtils.clamp(spot.x, 50.2, 63.3); spot.z = THREE.MathUtils.clamp(spot.z, 12.6, 21.9);
  faceTo(w, spot.x, spot.z); S.holder = null; S.fetch = r.id;
  r.w.goTo({ x: spot.x, z: spot.z, face: 0 }, 4.4);
  const d = Math.hypot(spot.x - b.x, spot.z - b.z);
  flyBall(S, new THREE.Vector3(spot.x, S.r, spot.z), 0.35 + d / 9, Math.random() < 0.2 ? 0.7 : 0, null);
  setTimeout(back, 700);
}
function hoops(S, on, here, dt, t) {
  const b = S.ball.position, R = S.rim;
  if (S.fly) return stepFlight(S, dt, false);
  if (S.release && t >= S.release.at) {                                     // the ball leaves the shooter's hands
    const { w, make } = S.release; S.release = null;
    const to = make ? R.clone().add(new THREE.Vector3(0, 0.12, 0)) : R.clone().add(new THREE.Vector3(-0.25, 0.12, (Math.random() < 0.5 ? -1 : 1) * 0.35));
    flyBall(S, to, 0.95, 1.6 + Math.random() * 0.5, () => {
      if (make) { if (Math.random() < 0.5) say(w.def.id, 'Swish! 🏀', 2.5); if (Math.random() < 0.4) log(w.def.id, 'sank a shot 🏀', 'life'); flyBall(S, new THREE.Vector3(R.x - 0.2, S.r, R.z + (Math.random() - 0.5) * 0.6), 0.5, 0, () => { S.holder = null; }); }
      else flyBall(S, new THREE.Vector3(R.x - 2 - Math.random() * 2, S.r, R.z + (Math.random() - 0.5) * 5), 0.9, 1.1, () => { S.holder = null; });
    });
    return;
  }
  if (S.release) { b.set(S.release.w.pos.x + Math.sin(S.release.w.group.rotation.y) * 0.3, 2.5, S.release.w.pos.z + Math.cos(S.release.w.group.rotation.y) * 0.3); return; }
  if (!S.holder) {                                                         // rebound: the ball goes to the next shooter in line
    if (!here.length) { b.y = S.r; return; }
    S.turn = ((S.turn ?? -1) + 1) % here.length; const nx = here[S.turn];
    flyBall(S, new THREE.Vector3(nx.w.pos.x + Math.sin(nx.w.group.rotation.y) * 0.4, 1.5, nx.w.pos.z + Math.cos(nx.w.group.rotation.y) * 0.4), 0.75, 0.9, () => { S.holder = nx.id; S.wait = 0.8 + Math.random() * 1.2; });
    return;
  }
  const w = walkers[S.holder]; if (!w) { S.holder = null; return; }
  faceTo(w, R.x, R.z);
  const side = _v.set(Math.cos(w.group.rotation.y), 0, -Math.sin(w.group.rotation.y));          // dribble at their right hand
  b.set(w.pos.x - side.x * 0.38 + Math.sin(w.group.rotation.y) * 0.2, S.r + Math.abs(Math.sin(t * 7)) * 0.95, w.pos.z - side.z * 0.38 + Math.cos(w.group.rotation.y) * 0.2);
  if (w.path.length) return;
  S.wait -= dt; if (S.wait > 0) return;
  w.rest = 'shoot'; setTimeout(() => { if (w.rest === 'shoot') w.rest = 'idle'; }, 1300);
  S.release = { w, at: t + 0.45, make: Math.random() < 0.55 }; S.holder = null;
  if (Math.random() < 0.35) setTimeout(() => { if (w.mode === 'sport') w.goTo({ ...jitter(S.homes[w.slot], 1.4), face: 0 }, 2); }, 1800);
}

// ---------------------------------------------------------------- labels over the 3D view
function el(tag, cls, text) { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; labels.appendChild(e); return e; }
const proj = new THREE.Vector3();
function toScreen(x, y, z) { proj.set(x, y, z).project(camera); return [(proj.x + 1) / 2 * viewWidth, (1 - proj.y) / 2 * viewHeight]; }
const place = (e, sx, sy) => { e.style.transform = `translate(-50%,-100%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`; };
function pin(e, x, y, z, dy = 0) { const [sx, sy] = toScreen(x, y, z); place(e, sx, sy + dy); }
function say(id, text, secs = 3) { const w = walkers[id]; if (!w) return; w.bubble.textContent = text; w.bubble.hidden = false; w.bubbleUntil = performance.now() + secs * 1000; }
function floatText(text) {
  const p = walkers.hq.pos, e = el('div', 'tag float', text); pin(e, p.x, 3.2, p.z);
  requestAnimationFrame(() => { e.style.opacity = 0; e.style.marginTop = '-70px'; });
  setTimeout(() => e.remove(), 1700);
}
const statusOfWalker = w => w.working ? 'work' : w.task || w.mode === 'meeting' || w.mode === 'qa' ? 'busy' : w.mode === 'break' || w.mode === 'sport' ? 'break' : 'idle';
function updateLabels(now) {
  const ref = camera.position.distanceTo(controls.target), placed = [];
  const list = Object.values(walkers).map(w => {
    const y = w.seat ? 2.0 : 2.7, [sx, sy] = toScreen(w.pos.x, y, w.pos.z);
    return { w, sx, sy, half: 14 + w.def.name.length * 3.4, d: camera.position.distanceTo(w.pos) };
  }).sort((a, b) => a.d - b.d);                                // nearest first: they keep their spot, others step aside
  for (const it of list) {
    while (placed.some(p => Math.abs(p.sx - it.sx) < p.half + it.half && Math.abs(p.sy - it.sy) < 17)) it.sy -= 18;
    placed.push(it);
    const w = it.w, st = statusOfWalker(w);
    if (w.tagStatus !== st) { w.tag.dataset.st = st; w.tagStatus = st; }
    w.tag.style.opacity = w.isBoss ? 1 : THREE.MathUtils.clamp((1.34 * ref - it.d) / (0.3 * ref), 0.3, 1).toFixed(2);   // the manager's label never fades
    place(w.tag, it.sx, it.sy);
    if (!w.bubble.hidden) { if (now > w.bubbleUntil) w.bubble.hidden = true; else place(w.bubble, it.sx, it.sy - 19); }
  }
}

// ---------------------------------------------------------------- game state, HUD, person card
let state = { live: false, city: { coins: 0, lots: {}, skills: {}, hired: {}, stats: { missions: 0 } } };
let target = null;   // null = talk to the manager, otherwise a team member's id
const api = async (url, body) => { const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Request failed'); return j; };
const avatar = who => { makePortraits(); return `<img class="avatar" src="${portraits[who.id]}" alt="">`; };
const dayOf = id => state.city.hired?.[id] ? Math.floor((Date.now() - Date.parse(state.city.hired[id])) / 864e5) + 1 : 0;
const knows = (id, skill) => (state.city.skills?.[id] || []).includes(skill);

function applyState(st) { const was = state.live; state = st; applyCity(st.city); setMode(); if (was !== st.live) pickSource(); if (!$('card').hidden && cardDesk) showCard(cardDesk); }
const modelOf = id => state.city.models?.[id] || state.configModels?.[id] || state.defaultModel || 'auto';
// ---- choosing and checking each person's model
const mark = m => { const t = state.tests?.[m]; return !t ? '' : t.ok ? '✓ ' : '✗ '; };
function modelRow(id) {
  const own = state.city.models?.[id], def = state.configModels?.[id] || 'auto', cur = own || def, t = state.tests || {};
  const rank = m => (t[m]?.ok ? 0 : t[m] ? 2 : 1) + (m.includes('/') ? 0.1 : 0);                  // answered, untested, failed; combos first within each
  const list = [...new Set([own, ...state.models].filter(Boolean))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const res = t[cur], status = !res ? 'Not tested yet' : res.ok ? `✓ Answered in ${(res.ms / 1000).toFixed(1)}s` : `✗ ${res.error || 'Did not answer'}`;
  const f = state.finder || {};
  return `<div class="model"><label>Model <select id="cardModel"><option value="" ${own ? '' : 'selected'}>Default · ${mark(def)}${escapeHtml(def)}</option>${list.map(m => `<option value="${escapeHtml(m)}" ${m === own ? 'selected' : ''}>${mark(m)}${escapeHtml(m)}</option>`).join('')}</select></label>
    <div class="row"><button id="cardTest">Test</button><span id="cardTestRes" class="${!res ? '' : res.ok ? 'ok' : 'bad'}" title="${escapeHtml(res?.error || '')}">${escapeHtml(status)}</span></div>
    <button id="cardFind" class="linkish" ${f.running ? 'disabled' : ''}>${f.running ? `Testing models… ${f.done}/${f.total}` : 'Find working models'}</button></div>`;
}
function wireModelRow(desk) {
  const ms = $('cardModel'); if (!ms) return;
  ms.onchange = async () => { try { applyState(await api('/api/assign', { agent: desk.id, model: ms.value })); } catch (e) { note(e.message, true); } };
  $('cardTest').onclick = async () => {
    const r = $('cardTestRes'); $('cardTest').disabled = true; r.className = ''; r.textContent = 'Testing…';
    try { await api('/api/test-model', { agent: desk.id }); applyState(await api('/api/state')); }            // re-renders the card with the result
    catch (e) { r.className = 'bad'; r.textContent = '✗ ' + e.message; $('cardTest').disabled = false; }
  };
  $('cardFind').onclick = async () => { await api('/api/find-models', {}); watchFinder(); };
}
let finderTimer = null;
function watchFinder() {                    // poll while the background search runs, so the card and picker fill in as models are checked
  clearInterval(finderTimer);
  finderTimer = setInterval(async () => { try { applyState(await api('/api/state')); if (!state.finder?.running) { clearInterval(finderTimer); const n = Object.values(state.tests || {}).filter(t => t.ok).length; note(`Model check finished: ${n} model${n === 1 ? '' : 's'} answered. They are marked ✓ and listed first.`); } } catch {} }, 3000);
}
/** A banner naming anyone whose model is not answering, so mock work is never mistaken for real work. */
function setBanner() {
  const bad = Object.entries(state.health || {}).filter(([, h]) => h.ok === false);
  const b = $('banner'); if (!b) return;
  if (!bad.length) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<b>No working model:</b> ${bad.map(([id]) => escapeHtml(WHO[id]?.name || id)).join(', ')}. Click them to pick one.<details><summary>details</summary>${bad.map(([id, h]) => `<div>${escapeHtml(WHO[id]?.name || id)} · <code>${escapeHtml(h.model)}</code>: ${escapeHtml(h.error)}</div>`).join('')}</details>`;
}
function setMode() {
  $('mode').textContent = state.live ? (state.backend === 'anthropic' ? 'Live · Claude' : 'Live · OmniRoute') : 'Demo';
  $('mode').title = state.live ? `${state.models.length} models available` : (state.problem || 'No AI connected, so the team only pretends to work');
  $('mode').className = 'mode ' + (state.live ? 'live' : 'demo');
  setBanner();
}
function applyCity(city) {
  state.city = city;
  $('coins').textContent = city.coins;
  if (!$('card').hidden && cardDesk) showCard(cardDesk);
}
let cardDesk = null;
function showCard(desk) {
  cardDesk = desk;
  const c = $('card'), who = desk.who, lvl = desk.level, boss = desk.id === 'hq';
  const next = lvl < MAX_LEVEL ? BUILD_COST[lvl] : null, can = next != null && state.city.coins >= next;
  const skills = boss ? '<span class="chip">Brain ✓</span><span class="chip">Assigns jobs ✓</span>'
    : SKILLS.map(s => knows(desk.id, s.id) ? `<span class="chip" title="${escapeHtml(s.about)}">${s.name} ✓</span>`
      : `<button class="chip" data-skill="${s.id}" title="${escapeHtml(s.about)}" ${lvl > 0 && state.city.coins >= s.cost ? '' : 'disabled'}>+ ${s.name} · ${s.cost}</button>`).join('');
  const about = boss ? 'Takes your requests and hands out the jobs.' : 'Good at ' + who.skill + '.';
  const upTip = lvl === 0 ? `Hire ${who.name}` : lvl < MAX_LEVEL ? `Another screen, and thinks harder: ${EFFORT_BY_LEVEL[lvl]} → ${EFFORT_BY_LEVEL[lvl + 1]}` : '';
  c.innerHTML = `<button class="x">×</button>
    <div class="who-row" title="${escapeHtml(about)}">${avatar(who)}<div><h3>${who.name}</h3><div>${who.title}</div><small class="stars">${lvl ? '★'.repeat(lvl) + '☆'.repeat(MAX_LEVEL - lvl) + ` · day ${dayOf(desk.id)}` : 'Not hired'}</small></div></div>
    ${lvl ? `<div class="chips">${skills}</div>` : ''}
    ${lvl && state.models?.length ? modelRow(desk.id) : ''}
    <div class="row">
      ${next != null ? `<button class="primary" id="cardBuild" title="${upTip}" ${can ? '' : 'disabled'}>${lvl === 0 ? 'Hire' : 'Upgrade'} · ${next}</button>` : ''}
      ${lvl > 0 && !boss ? `<button id="cardJob">Give a job</button>` : ''}
      ${boss ? '<button id="cardBrain">Brain</button>' : ''}
    </div>`;
  c.hidden = false;
  c.querySelector('.x').onclick = () => { c.hidden = true; cardDesk = null; };
  const b = $('cardBuild'); if (b) b.onclick = () => hire(desk);
  const j = $('cardJob'); if (j) j.onclick = () => setTarget(desk.id);
  const br = $('cardBrain'); if (br) br.onclick = openBrain;
  for (const s of c.querySelectorAll('button[data-skill]')) s.onclick = () => teach(desk, s.dataset.skill);
  wireModelRow(desk);
}
async function hire(desk) {            // first time: the person walks in through the front door. After that: a desk upgrade.
  try {
    const s = await api('/api/build', { lot: desk.id });
    const first = desk.level === 0;
    setDeskLevel(desk, s.city.lots[desk.id]);
    applyCity(s.city);
    if (first) { const w = spawn(desk.who, SPOTS.entrance); goDesk(w, 1.9); say(desk.id, '👋', 4); }
  } catch (e) { note(e.message, true); }
}
async function teach(desk, skill) {
  try { applyCity((await api('/api/skill', { agent: desk.id, skill })).city); } catch (e) { note(e.message, true); }
}
function setTarget(id) {
  target = id;
  $('targetName').textContent = id ? `To: ${WHO[id].name}` : '';
  $('input').placeholder = id ? `Give ${WHO[id].name} a job…` : `Ask ${BOSS.name}…`;
  $('targetClear').hidden = !id; $('input').focus();
}
$('targetClear').onclick = () => setTarget(null);

// click to select (ignores drags)
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const doc = ray.intersectObjects([...approvals.values()].map(a => a.mesh))[0];
  if (doc) return openApproval(doc.object.userData.ev);
  if (ray.intersectObject(BRAIN.root, true).length) return openBrain();
  let best = null, bestD = Infinity;
  for (const d of Object.values(DESKS)) { const hit = ray.intersectObject(d.group, true)[0]; if (hit && hit.distance < bestD) { best = d; bestD = hit.distance; } }
  for (const w of Object.values(walkers)) { const hit = ray.intersectObject(w.group, true)[0]; if (hit && hit.distance < bestD + 2) { best = DESKS[w.def.id]; bestD = hit.distance - 2; } }
  if (best) showCard(best); else { $('card').hidden = true; cardDesk = null; }
});

// ---------------------------------------------------------------- team chart and Brain
function statusOf(id) {
  const w = walkers[id];
  if (!DESKS[id].level) return ['', `Not hired · ${BUILD_COST[0]}`];
  if (id === 'hq') return ['on', 'On'];
  if (w?.task) return ['work', escapeHtml(w.task.title)];
  return ['on', 'On'];
}
function orgNode(id) {
  const who = WHO[id], [dot, text] = statusOf(id);
  const chips = id === 'hq' ? '' : `<div class="chips">${SKILLS.filter(s => knows(id, s.id)).map(s => `<span class="chip">${s.name}</span>`).join('')}</div>`;
  return `<div class="node ${DESKS[id].level ? '' : 'off'}" data-id="${id}">${avatar(who)}<div><b>${who.name}</b><small>${who.title}${state.live && DESKS[id].level ? ` · ${escapeHtml(modelOf(id))}` : ''}</small><small><span class="dot ${dot}"></span>${text}</small>${chips}</div></div>`;
}
function openOrg() {
  const depts = [...new Set(AGENTS.map(a => a.dept))];
  openPanel('Team', `<div class="org"><div class="boss">${orgNode('hq')}</div><div class="trunk"></div><div class="depts">${
    depts.map(d => `<div><h4>${d}</h4>${AGENTS.filter(a => a.dept === d).map(a => orgNode(a.id)).join('')}</div>`).join('')}</div></div>`);
  for (const n of $('modalBody').querySelectorAll('.node')) n.onclick = () => { const d = DESKS[n.dataset.id]; closeModal(); focus(d.x, d.z, 2.4); showCard(d); };
}
// ---------------------------------------------------------------- the Brain: stats, beams, memory browser
const brainStat = { total: 0, reads: 0, writes: 0, readsBy: {} };
function drawBrainScreen() {
  const top = Object.entries(brainStat.readsBy).sort((a, b) => b[1] - a[1])[0];
  setBrainStats({ total: brainStat.total, reads: brainStat.reads, writes: brainStat.writes, top: top ? (WHO[top[0]]?.name || top[0]) : '–' });
}
async function loadBrain() {
  try {
    const d = await api('/api/brain');
    brainSetMemories(d.memories);
    Object.assign(brainStat, { total: d.stats.total, reads: d.stats.reads, writes: d.stats.writes, readsBy: d.stats.readsBy || {} });
    drawBrainScreen();
  } catch { /* the Brain room just stays empty */ }
}
const beams = [];
function brainBeam(deskPos, color) {                        // a light beam from the core to the desk that was just given memories
  const a = brainCorePos(), b = deskPos.clone(), mid = a.clone().lerp(b, 0.5); mid.y += 3 + a.distanceTo(b) * 0.12;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.05, 6, false), mat), spark = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat.clone());
  scene.add(tube, spark); beams.push({ tube, spark, curve, t: 0 });
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]; b.t += dt / 1.9;
    b.spark.position.copy(b.curve.getPoint(Math.min(1, b.t * 1.6))); b.spark.material.opacity = b.t > 0.7 ? Math.max(0, 1 - (b.t - 0.7) / 0.3) : 1;
    b.tube.material.opacity = Math.max(0, 0.85 * (1 - b.t));
    if (b.t >= 1) { scene.remove(b.tube, b.spark); b.tube.geometry.dispose(); b.spark.geometry.dispose(); beams.splice(i, 1); }
  }
}
const CAT_NAMES = { you: 'You', business: 'Business', projects: 'Projects', lessons: 'Lessons' };
async function openBrain() {
  const d = await api('/api/brain');
  const mems = d.memories, ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  openPanel('Brain', `<div class="pad brain">
    <details ${mems.length ? '' : 'open'}><summary>Core profile: always sent to Max</summary>
      <textarea id="profileText" rows="5" placeholder="Who you are, your business, goals, rules, tone of voice…">${escapeHtml(d.profile)}</textarea>
      <div class="row"><button id="profileSave">Save profile</button></div></details>
    <div class="bar"><input id="memSearch" placeholder="Search memories…"><select id="memCat"><option value="">All</option>${d.categories.map(c => `<option value="${c}">${CAT_NAMES[c]}</option>`).join('')}</select><span id="memCount"></span></div>
    <div id="memList"></div>
    <p class="hint">Whatever is given to an agent is sent to the model that serves that call. Memories marked private only go to models you list under <code>trusted_models</code> in config/agents.yaml. Never store passwords, keys or ID numbers.</p></div>`);
  const list = $('memList'), render = () => {
    const q = $('memSearch').value.toLowerCase(), cat = $('memCat').value;
    const rows = mems.filter(m => (!cat || m.category === cat) && (!q || m.text.toLowerCase().includes(q))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $('memCount').textContent = `${rows.length} of ${mems.length}`;
    list.innerHTML = rows.map(m => `<div class="mem" data-id="${m.id}"><i class="dot" style="background:${CATEGORY_COLORS[m.category]}"></i><div class="body"><div class="txt">${escapeHtml(m.text)}</div>
      <small>${CAT_NAMES[m.category]} · ${WHO[m.agent]?.name || m.agent} · saved ${ago(m.createdAt)} · used ${m.uses || 0}×${m.sensitivity === 'private' ? ' · <b>private</b>' : ''}</small></div>
      <span class="acts"><button data-a="edit">Edit</button><button data-a="priv">${m.sensitivity === 'private' ? 'Make normal' : 'Make private'}</button><button data-a="del">Delete</button></span></div>`).join('') || '<p class="empty">Nothing here yet. Memories appear after tasks, once Rex approves them.</p>';
  };
  render(); $('memSearch').oninput = render; $('memCat').onchange = render;
  $('profileSave').onclick = async () => { await api('/api/brain/profile', { text: $('profileText').value }); $('profileSave').textContent = 'Saved'; setTimeout(() => $('profileSave') && ($('profileSave').textContent = 'Save profile'), 1200); };
  const patch = (id, body) => fetch(`/api/brain/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not save.'); return j; });
  list.onclick = async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const row = btn.closest('.mem'), id = row.dataset.id, m = mems.find(x => x.id === id);
    try {
      if (btn.dataset.a === 'del') { await fetch(`/api/brain/${id}`, { method: 'DELETE' }); mems.splice(mems.indexOf(m), 1); brainRemoveMemory(id); brainStat.total = mems.length; drawBrainScreen(); render(); }
      else if (btn.dataset.a === 'priv') { Object.assign(m, await patch(id, { sensitivity: m.sensitivity === 'private' ? 'normal' : 'private' })); render(); }
      else if (btn.dataset.a === 'edit') {
        row.querySelector('.txt').innerHTML = `<textarea rows="2">${escapeHtml(m.text)}</textarea>`; btn.textContent = 'Save'; btn.dataset.a = 'save';
      } else if (btn.dataset.a === 'save') { Object.assign(m, await patch(id, { text: row.querySelector('textarea').value })); render(); }
    } catch (err) { note(err.message, true); }
  };
}
// ---------------------------------------------------------------- the token bar: how much the team used today, against a daily budget
const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n);
let usage = null, usageTimer = null;
async function refreshTokens() {
  try { usage = await api('/api/usage'); } catch { return; }
  const pct = Math.min(100, usage.total / usage.budget * 100);
  $('tkText').textContent = `⚡ ${fmtK(usage.total)} / ${fmtK(usage.budget)}`;
  $('tkFill').style.width = pct.toFixed(1) + '%'; $('tkFill').className = pct > 90 ? 'hot' : pct > 70 ? 'warm' : '';
  if (!$('modal').hidden && $('modalTitle').textContent === 'Token usage') openTokens(true);
}
const soonTokens = () => { clearTimeout(usageTimer); usageTimer = setTimeout(refreshTokens, 2500); };
function openTokens(keepOpen) {
  if (!usage) return;
  const u = usage, agents = Object.entries(u.byAgent).sort((a, b) => b[1].tokens - a[1].tokens), maxA = Math.max(1, ...agents.map(([, a]) => a.tokens));
  const models = Object.entries(u.byModel).sort((a, b) => b[1].tokens - a[1].tokens), maxM = Math.max(1, ...models.map(([, m]) => m.tokens));
  const maxD = Math.max(1, ...u.days.map(d => d.tokens)), perCall = u.calls ? Math.round(u.total / u.calls) : 0;
  const bar = (v, max, color) => `<span class="ub"><i style="width:${(v / max * 100).toFixed(1)}%;background:${color}"></i></span>`;
  const html = `<div class="pad usage">
    <div class="tiles"><div><b>${fmtK(u.total)}</b><small>tokens today</small></div><div><b>${u.calls}</b><small>model calls</small></div><div><b>${fmtK(perCall)}</b><small>tokens per call</small></div><div><b>${u.failed}</b><small>failed calls</small></div></div>
    <div class="big">${bar(u.total, u.budget, u.total / u.budget > 0.9 ? 'var(--bad)' : 'var(--gold)')}<small>${Math.round(u.total / u.budget * 100)}% of the daily budget (${fmtK(u.budget)}, set DAILY_TOKEN_BUDGET in .env)</small></div>
    <h4>By person, today</h4>${agents.map(([id, a]) => `<div class="urow"><span class="nm"><i style="background:${WHO[id]?.color || '#888'}"></i>${escapeHtml(WHO[id]?.name || id)}</span>${bar(a.tokens, maxA, WHO[id]?.color || '#888')}<span class="v">${fmtK(a.tokens)} · ${a.calls} call${a.calls === 1 ? '' : 's'}${a.failed ? ` · <em>${a.failed} failed</em>` : ''}</span></div>`).join('') || '<p class="empty">No model calls yet today.</p>'}
    <h4>By model, today</h4>${models.map(([m, x]) => `<div class="urow"><span class="nm">${escapeHtml(m)}</span>${bar(x.tokens, maxM, '#6aa8ff')}<span class="v">${fmtK(x.tokens)} · ${x.calls}</span></div>`).join('') || '<p class="empty">Nothing yet.</p>'}
    <h4>Last 7 days</h4><div class="days">${u.days.map(d => `<div title="${d.day}: ${d.tokens} tokens, ${d.calls} calls"><span style="height:${Math.max(3, d.tokens / maxD * 100)}%"></span><small>${d.day.slice(5)}</small><small>${fmtK(d.tokens)}</small></div>`).join('')}</div>
    <p class="hint">${u.estimated ? `${u.estimated} of today's calls came from routes that do not report usage, so those are estimated from text length. ` : ''}Fewer tokens per call means tighter prompts and shorter answers; failed calls usually mean a model route is down.</p></div>`;
  if (keepOpen) $('modalBody').innerHTML = html; else openPanel('Token usage', html);
}
$('tokens').onclick = async () => { await refreshTokens(); openTokens(); };
$('orgBtn').onclick = openOrg; $('brainBtn').onclick = openBrain;
$('logBtn').onclick = () => { const box = $('log'); box.hidden = !box.hidden; if (!box.hidden) { logUnread = 0; $('logBtn').dataset.n = 0; $('logList').scrollTop = 1e9; } try { localStorage.setItem('logOpen', box.hidden ? '' : '1'); } catch {} };
$('logClose').onclick = () => $('logBtn').click();
for (const b of $('logTabs').children) b.onclick = () => { for (const o of $('logTabs').children) o.classList.toggle('on', o === b); $('logList').className = b.dataset.f === 'all' ? '' : 'f-' + b.dataset.f; $('logList').scrollTop = 1e9; };
try { if (localStorage.getItem('logOpen')) $('log').hidden = false; } catch {}

// ---------------------------------------------------------------- chat, job list, reading work
function note(text, bad) { const m = document.createElement('div'); m.className = 'msg' + (bad ? ' err' : ''); text = String(text); if (text.length > 110) { const first = document.createElement('span'); first.textContent = text.slice(0, 100).replace(/\s\S*$/, '') + '…'; const d = document.createElement('details'), sm = document.createElement('summary'); sm.textContent = 'details'; const full = document.createElement('div'); full.textContent = text; d.append(sm, full); m.append(first, d); } else m.textContent = text; $('chat').appendChild(m); $('chat').scrollTop = 1e9; return m; }
function chat(from, text, cls = '') {
  const m = document.createElement('div'); m.className = 'msg ' + cls;
  if (from) { const f = document.createElement('span'); f.className = 'from'; f.textContent = from; m.appendChild(f); }
  m.appendChild(document.createTextNode(text)); $('chat').appendChild(m); $('chat').scrollTop = 1e9; return m;
}
const withButton = (msg, label, fn, primary) => { const b = document.createElement('button'); b.textContent = label; if (primary) b.className = 'primary'; b.onclick = fn; msg.appendChild(document.createElement('br')); msg.appendChild(b); return msg; };
const STATUS = { assigned: 'Assigned', working: 'Working', meeting: 'In meeting', approval: 'Needs you', error: 'Error', done: 'Done', rejected: 'Sent back' };
function drawJob(t) {
  if (t.quiet && !t.el) return;
  if (!t.el) { t.el = document.createElement('div'); t.el.onclick = () => t.status === 'approval' && approvals.has(t.id) ? openApproval(approvals.get(t.id).ev) : openJob(t); $('jobs').prepend(t.el); while ($('jobs').children.length > 14) $('jobs').lastChild.remove(); }
  const who = WHO[t.agent];
  t.el.className = 'job ' + ({ done: 'done', error: 'fail', rejected: 'fail', working: 'work', approval: 'work' }[t.status] || '');
  t.el.style.borderLeftColor = who.color;
  t.el.innerHTML = `<div><b>${String(t.id).startsWith('mock-') ? '<em class="demo">DEMO</em> ' : ''}${escapeHtml(t.title)}</b><small>${who.name}</small></div><span class="st">${STATUS[t.status]}</span>`;
}
let openModalJob = null;
function openModal(title, text, live) {
  $('modalTitle').textContent = title; $('modalBody').className = 'md'; $('modalBody').innerHTML = renderMarkdown(text || '_Nothing written yet. Work appears here as it is produced._');
  $('modal').hidden = false; $('modalCopy').hidden = false; $('modalCopy').onclick = () => navigator.clipboard.writeText(text || ''); openModalJob = live || null;
}
function openPanel(title, html) { $('modalTitle').textContent = title; $('modalBody').className = ''; $('modalBody').innerHTML = html; $('modal').hidden = false; $('modalCopy').hidden = true; openModalJob = null; }
function closeModal() { $('modal').hidden = true; openModalJob = null; }
const openJob = t => openModal(`${t.title} · ${WHO[t.agent].name}`, t.error ? `**This task hit a problem:** ${t.error}\n\n${t.output}` : t.output, t);
$('modalClose').onclick = closeModal;
$('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };

// ---------------------------------------------------------------- the office reacts to agent events (the shapes are documented in agentEvents.js)
const bus = createBus(), tasks = new Map(), approvals = new Map(), counts = { done: 0, errors: 0 };
const deskTop = id => id === 'hq' ? POINTS.max : new THREE.Vector3(DESKS[id].x, 1.3, DESKS[id].z);
const refreshStats = () => setWallStats({ done: counts.done, errors: counts.errors, running: [...tasks.values()].filter(t => !['done', 'rejected'].includes(t.status)).length });
const setStatus = (t, status) => { t.status = status; drawJob(t); refreshStats(); };

// Task cards: small glowing cards that fly in an arc from one place to another.
const flying = [];
function flyCard(from, to, color, then, secs = 1.5) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), side: THREE.DoubleSide, toneMapped: false }));
  scene.add(m); flying.push({ m, from: from.clone(), to: to.clone(), t: 0, secs, then });
}
const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const k = c.getContext('2d'), g = k.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); k.fillStyle = g; k.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function updateFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i]; f.t = Math.min(1, f.t + dt / f.secs);
    const k = f.t * f.t * (3 - 2 * f.t);
    f.m.position.lerpVectors(f.from, f.to, k); f.m.position.y += Math.sin(Math.PI * k) * (2.2 + f.from.distanceTo(f.to) * 0.08);
    f.m.rotation.set(-0.9, f.t * 7, 0);
    if (f.t >= 1) { scene.remove(f.m); flying.splice(i, 1); f.then?.(); }
  }
}
// A card resting on a desk while its task is open.
function deskCard(id, on) {
  const d = DESKS[id]; if (!d || id === 'hq') return;
  if (on && !d.card) { d.card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.who.color).multiplyScalar(1.8), toneMapped: false })); d.card.rotation.x = -Math.PI / 2; d.card.position.set(-1.05, 1.035, 0.05); d.group.add(d.card); }
  if (!on && d.card) { d.group.remove(d.card); d.card = null; }
}
// Tool icons that pop up over a monitor for a few seconds.
const ICONS = { web: '🌐', github: '🐙', email: '✉️', file: '📄' }, icons = [];
function toolIcon(id, tool) {
  const d = DESKS[id]; if (!d) return;
  const e = el('div', 'tag tool', ICONS[tool] || '🛠'); icons.push({ e, x: d.x, z: d.z, t: 0 });
}
function updateIcons(dt) {
  for (let i = icons.length - 1; i >= 0; i--) {
    const o = icons[i]; o.t += dt;
    pin(o.e, o.x, 2.3 + Math.min(0.6, o.t * 0.9), o.z);
    o.e.style.opacity = o.t > 3 ? Math.max(0, 1 - (o.t - 3) * 2) : Math.min(1, o.t * 5);
    if (o.t > 3.5) { o.e.remove(); icons.splice(i, 1); }
  }
}
// Approvals: a glowing document on the reception counter. That counter is your desk.
function addApproval(ev) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.66), new THREE.MeshStandardMaterial({ color: '#fff8e0', emissive: '#ffcf5a', emissiveIntensity: 2.4 }));
  mesh.userData.ev = ev; scene.add(mesh); approvals.set(ev.taskId, { mesh, ev }); layoutApprovals();
  $('inbox').hidden = false; $('inbox').textContent = `Approvals · ${approvals.size}`;
}
function layoutApprovals() { [...approvals.values()].forEach((a, i) => a.mesh.position.set(POINTS.reception.x - 0.6 + (i % 4) * 0.68, POINTS.reception.y + Math.floor(i / 5) * 0.08, POINTS.reception.z)); }
function removeApproval(taskId) { const a = approvals.get(taskId); if (!a) return; scene.remove(a.mesh); approvals.delete(taskId); layoutApprovals(); $('inbox').hidden = !approvals.size; $('inbox').textContent = `Approvals · ${approvals.size}`; }
function openApproval(ev) {
  focus(POINTS.reception.x, POINTS.reception.z, 2.6);
  openPanel(`Approve: ${ev.title}`, `<div class="pad"><p>From ${escapeHtml(WHO[ev.agentId]?.name || 'the team')}</p><div class="md approval">${renderMarkdown(ev.summary || '')}</div><div class="row" style="margin-top:14px"><button class="primary" id="okBtn">Approve</button><button id="noBtn">Send back</button></div></div>`);
  $('okBtn').onclick = () => { closeModal(); source.decide(ev.taskId, true); };
  $('noBtn').onclick = () => { closeModal(); source.decide(ev.taskId, false); };
}
$('inbox').onclick = () => { const first = approvals.values().next().value; if (first) openApproval(first.ev); };
const pulseApprovals = t => { for (const a of approvals.values()) { a.mesh.material.emissiveIntensity = 2.2 + Math.sin(t * 4) * 1.1; a.mesh.rotation.y = Math.sin(t * 1.5) * 0.15; } };

const lastDraw = new Map();
// ---------------------------------------------------------------- the activity log: what everyone is doing, work and office life
let logUnread = 0; const logSeen = new Map();
function log(id, text, kind = 'work', bad = false) {
  const list = $('logList'); if (!list) return;
  if (kind === 'life') { const key = id + text, now = performance.now(); if (now - (logSeen.get(key) || -1e9) < 90000) return; logSeen.set(key, now); }   // office life: no repeats within 90 s
  const who = WHO[id], li = document.createElement('li'), d = new Date();
  li.className = kind + (bad ? ' bad' : '');
  li.innerHTML = `<time>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</time>${who ? `<b style="--c:${who.color}">${escapeHtml(who.name)}</b> ` : ''}${escapeHtml(text)}`;
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.appendChild(li); while (list.children.length > 300) list.firstChild.remove();
  if (stick) list.scrollTop = list.scrollHeight;
  if ($('log').hidden && kind === 'work') $('logBtn').dataset.n = ++logUnread;
}
const BREAK_WORDS = { '☕': 'went for a coffee ☕', '💬': 'stopped for a chat 💬', '🍪': 'grabbed a snack 🍪', '💧': 'went for some water 💧', '⚽': 'is playing foosball ⚽', '🎱': 'is playing pool 🎱', '📖': 'is reading on the sofa 📖' };
const quote = t => `"${String(t || '').slice(0, 70)}"`;

const HANDLERS = {
  log(ev) { log(ev.agentId, ev.text, ev.kind || 'work', ev.bad); },
  task_assigned(ev) {
    const t = { id: ev.taskId, agent: ev.agentId, title: ev.title, origin: ev.origin, quiet: ev.quiet, output: '', status: 'assigned' };
    tasks.set(t.id, t); setStatus(t, 'assigned');
    if (/^Review: /.test(ev.title || '')) log(ev.agentId, `is reviewing ${quote(ev.title.slice(8))}`);
    else if (ev.agentId !== 'hq') log('hq', `gave ${WHO[ev.agentId]?.name || ev.agentId} a job: ${quote(ev.title)}`);
    const w = walkers[ev.agentId]; if (!w || w.isBoss) return;
    if (w.mode === 'sport') log(ev.agentId, 'ran back in from the courts for a new job', 'life');
    w.task = t; if (w.mode === 'break' || !w.seat) goDesk(w);
    flyCard(POINTS.max, deskTop(ev.agentId), w.def.color, () => deskCard(ev.agentId, true));
  },
  working(ev) {
    const t = tasks.get(ev.taskId), w = walkers[ev.agentId], d = DESKS[ev.agentId]; if (!t || !w) return;
    setStatus(t, 'working'); w.working = true; w.task = t; if (w.mode === 'desk') goDesk(w);
    setDeskAlert(d, false); setDeskBusy(d, true); setDeskText(d, t.output || `> ${t.title}\n`);
  },
  output(ev) {
    const t = tasks.get(ev.taskId); if (!t) return;
    if (ev.reset) t.output = ''; else t.output += ev.text;
    if (openModalJob === t) $('modalBody').innerHTML = renderMarkdown(t.output);
    const now = performance.now(); if (now - (lastDraw.get(t.id) || 0) < 160) return; lastDraw.set(t.id, now);
    if (DESKS[ev.agentId] && t.status === 'working') setDeskText(DESKS[ev.agentId], `> ${t.title}\n` + t.output.replace(/^> .*\n/, '').slice(-420));
  },
  tool_call(ev) {
    toolIcon(ev.agentId, ev.tool);
    if (ev.kind === 'web_search') log(ev.agentId, `searched the web: ${quote(ev.detail)}`);
    else if (ev.kind === 'web_fetch') log(ev.agentId, `read a page on ${ev.detail}`);
    else log(ev.agentId, { web: 'looked something up online', github: 'opened the code', email: 'drafted an email', file: 'opened a file' }[ev.tool] || `used ${ev.tool}`);
  },
  collaborating(ev) {
    const duration = ev.duration ?? 14000, until = performance.now() + duration, t = tasks.get(ev.taskId); if (t) setStatus(t, 'meeting');
    setWhiteboard(ev.title, ev.steps);
    log('hq', `called a team meeting with ${ev.agentIds.map(id => WHO[id]?.name || id).join(', ')}`);
    ev.agentIds.filter(id => walkers[id]).forEach((id, k) => { const w = walkers[id]; w.mode = 'meeting'; w.until = until; w.goTo(SPOTS.meeting[k % SPOTS.meeting.length], 4.4); });
    const boss = walkers.hq; boss.mode = 'meeting'; boss.until = until; boss.rest = 'talk'; boss.goTo(SPOTS.bossMeeting, 4.2);
    setTimeout(() => setWhiteboard(null), duration + 12000);
  },
  awaiting_approval(ev) {
    const t = tasks.get(ev.taskId), w = walkers[ev.agentId]; if (t) setStatus(t, 'approval');
    log(ev.agentId, `left ${quote(ev.title)} at reception for your approval`);
    if (w && !w.isBoss) { w.working = false; setDeskBusy(DESKS[ev.agentId], false); }
    flyCard(deskTop(ev.agentId), POINTS.reception, '#ffcf5a', () => addApproval(ev));
    withButton(chat(WHO[ev.agentId]?.name || BOSS.name, `Needs your approval: ${ev.title}`), 'Review', () => openApproval(ev), true);
  },
  approval(ev) { removeApproval(ev.taskId); log(null, ev.approved ? 'You approved a job at reception ✓' : 'You turned down a job at reception', 'work', !ev.approved); },
  error(ev) {
    const t = tasks.get(ev.taskId), w = walkers[ev.agentId], d = DESKS[ev.agentId]; if (t) { t.error = ev.message; setStatus(t, 'error'); }
    log(ev.agentId, `hit a problem${t ? ` on ${quote(t.title)}` : ''}: ${String(ev.message || '').slice(0, 140)}`, 'work', true);
    counts.errors++; refreshStats();
    if (!w || w.isBoss) return;
    w.working = false; setDeskBusy(d, false); setDeskAlert(d, true); say(ev.agentId, '⚠️', 4);
    const qa = DESKS.rex, help = walkers.rex && ev.agentId !== 'rex' ? { x: qa.seat.via.x, z: qa.seat.via.z + (qa.screenFace ? -1.1 : 1.1), face: qa.screenFace ? 0 : Math.PI } : SPOTS.visit[0];
    w.mode = 'qa'; w.until = performance.now() + 9000; w.goTo(help, 4.4);          // off to ask QA (or the manager, if there is no QA yet)
  },
  done(ev) {
    const t = tasks.get(ev.taskId), w = walkers[ev.agentId], d = DESKS[ev.agentId]; if (!t) return;
    if (ev.output != null) t.output = ev.output;
    setStatus(t, ev.rejected ? 'rejected' : 'done'); if (!ev.rejected) counts.done++;
    if (!/^Review: /.test(t.title || '')) log(ev.agentId, ev.rejected ? `had ${quote(t.title)} turned down` : ev.agentId === 'hq' ? 'wrote up the final report 📄' : `finished ${quote(t.title)}${ev.reward ? ` (+${ev.reward} coins)` : ''}`, 'work', !!ev.rejected);
    if (openModalJob === t) $('modalBody').innerHTML = renderMarkdown(t.output);
    if (w && !w.isBoss) { w.working = false; if (w.task === t) w.task = null; w.idle = 25 + Math.random() * 50; setDeskBusy(d, false); setDeskAlert(d, false); setDeskText(d, null); deskCard(ev.agentId, false); say(ev.agentId, '✓', 2.5); if (Math.random() < 0.75) setTimeout(() => { if (w.mode === 'desk' && !w.task) celebrate(w); }, 1200); }
    const color = WHO[ev.agentId]?.color || '#f5c542', toWall = () => flyCard(POINTS.max, POINTS.wallScreen, color, refreshStats, 1.3);
    if (ev.agentId === 'hq') flyCard(POINTS.reception, POINTS.wallScreen, color, refreshStats); else flyCard(deskTop(ev.agentId), POINTS.max, color, toWall);
    if (ev.reward) floatText(`+${ev.reward}`);
    if (t.origin === 'user' && !ev.rejected) withButton(chat(WHO[ev.agentId].name, ev.agentId === 'hq' ? 'Report approved.' : `Done: ${t.title}`), ev.agentId === 'hq' ? 'Open report' : 'Read', () => openJob(t), ev.agentId === 'hq');
  },
  memory_read(ev) {
    const id = ev.agentId; if (!DESKS[id]) return;
    log(id, `checked the Brain (${ev.count || 1} ${ev.count === 1 ? 'memory' : 'memories'})`);
    brainBeam(deskTop(id), WHO[id]?.color || '#7fd1ff'); brainFlash(ev.ids || []); brainPulse(1.2);
    brainStat.reads += ev.count || 1; brainStat.readsBy[id] = (brainStat.readsBy[id] || 0) + (ev.count || 1); drawBrainScreen();
  },
  memory_write(ev) {
    log(ev.agentId, `saved to the Brain: ${quote(ev.text)}`);
    const mem = { id: ev.id, category: ev.category, text: ev.text, sensitivity: ev.sensitivity, createdAt: new Date().toISOString() };
    flyCard(deskTop(ev.agentId), brainCorePos(), CATEGORY_COLORS[ev.category] || '#ffffff', () => { brainAddMemory(mem, true); brainPulse(2.2); brainStat.total++; brainStat.writes++; drawBrainScreen(); }, 1.5);
  },
  model_call() { brainPulse(0.45); soonTokens(); },
  idle(ev) { const w = walkers[ev.agentId]; if (w && !w.task && w.mode === 'desk' && !w.isBoss) takeBreak(w); },
  message(ev) { if (ev.bad && ev.from === 'system') log(null, ev.text, 'work', true); if (ev.bad) note(ev.text, true); else chat(WHO[ev.from]?.name || '', ev.text); },
  state(ev) { applyCity(ev.city); },
};
bus.on(ev => HANDLERS[ev.type]?.(ev));

// Where events come from: a websocket if the page was opened with ?ws=..., this project's server when an AI is connected, the mock otherwise.
const team = () => Object.values(walkers).filter(w => !w.isBoss).map(w => ({ id: w.def.id, name: w.def.name, title: w.def.title, skill: w.def.skill, free: !w.task && w.mode !== 'meeting' }));
const mock = new MockSource(bus.emit, team, () => [...BRAIN.cubes.keys()]), server = new ServerSource(bus.emit, Object.fromEntries(AGENTS.map(a => [a.id, a.name])));
const wsUrl = new URLSearchParams(location.search).get('ws'), socket = wsUrl ? new WebSocketSource(bus.emit, wsUrl) : null;
let source = mock;
function pickSource() { source = socket || (state.live ? server : mock); if (source === mock) mock.start(); else mock.stop(); }
$('composer').addEventListener('submit', e => { e.preventDefault(); const t = $('input').value.trim(); if (!t) return; $('input').value = ''; chat('', t, 'me'); source.submit(t, target); });
$('input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); } });

// ---------------------------------------------------------------- start
async function start() {
  resize();
  const [initialState, , loadScenery] = await Promise.all([api('/api/state'), loadPeople(), buildOffice(scene)]);
  state = initialState;
  for (const L of LIGHTS.filter(l => l.power >= 0.7)) { const p = new THREE.PointLight('#ffd3a0', 15 * L.power, 26, 1.5); p.position.set(L.x, L.y, L.z); p.userData.base = 15 * L.power; scene.add(p); lamps.push(p); }
  refreshTime(); setInterval(refreshTime, 30000);
  for (const d of Object.values(DESKS)) {
    setDeskLevel(d, state.city.lots[d.id] ?? 0);
    if (d.level) spawn(d.who, d.seat);
  }
  applyCity(state.city);
  setMode();
  if (!state.live) note(`Demo mode: ${state.problem || 'no AI connected.'}`);
  setInterval(async () => { try { const was = state.live; applyState(await api('/api/state')); if (!was && state.live) note(`Connected: ${state.models.length} models available. Pick one per person on their card.`); } catch {} }, 15000);
  setTarget(null); pickSource(); refreshStats(); loadBrain(); refreshTokens(); setInterval(refreshTokens, 20000);
  $('loading').hidden = true;
  $('input').disabled = $('send').disabled = false;
  let last = performance.now(), clock = 0, nextShadow = 0, firstFrame = true;
  renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now; clock += dt;
    updateCamera(dt); controls.update();
    for (const w of Object.values(walkers)) { brain(w, dt, now); w.update(dt, clock); }
    updateFlying(dt); updateIcons(dt); pulseApprovals(clock); updateBeams(dt); updateBrain(dt, clock); updateSports(dt, clock);
    if (now >= nextShadow) { renderer.shadowMap.needsUpdate = true; nextShadow = now + 65; }
    renderer.render(scene, camera);
    updateLabels(now);
    if (firstFrame) {
      firstFrame = false;
      setTimeout(loadScenery, 0);
    }
  });
  window.__office = { SPORTS, play: id => joinSport(walkers[id]), celebrate: id => celebrate(walkers[id]), coach: () => { walkers.hq.idle = -1; }, spawn: id => spawn(DESKS[id].who, DESKS[id].seat), DESKS, walkers, camera, controls, bus, BRAIN, brainStat, openBrain, mock, tasks, approvals, hire, openOrg, openBrain, showCard, focus, submit: (t, a) => source.submit(t, a), decide: (id, ok) => source.decide(id, ok) };
}
start().catch(e => { console.error(e); $('loading').textContent = 'Could not open the office: ' + e.message; });
