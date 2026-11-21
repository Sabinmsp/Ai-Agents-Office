// Realistic people: Quaternius base bodies and animation library, dressed in office clothes by a small shader.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { K } from './office.js';
const clips = {}, bodies = {}, hairs = {}, lightSkin = {};
export const clip = name => clips[name];

export async function loadPeople() {
  const loader = new GLTFLoader(), tl = new THREE.TextureLoader(), P = '/assets/people/';
  const hairNames = ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Long', 'Hair_Beard'];
  const [anims, m, f, ml, fl, ...hs] = await Promise.all([
    loader.loadAsync(P + 'office-animations.glb'), loader.loadAsync(P + 'Superhero_Male_FullBody.gltf'), loader.loadAsync(P + 'Superhero_Female_FullBody.gltf'),
    tl.loadAsync(P + 'T_Superhero_Male_Ligh.png'), tl.loadAsync(P + 'T_Superhero_Female_Light_BaseColor.png'), ...hairNames.map(h => loader.loadAsync(P + h + '.gltf')),
  ]);
  bodies.m = m.scene; bodies.f = f.scene;
  for (const t of [ml, fl]) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; }
  lightSkin.m = ml; lightSkin.f = fl;
  hairNames.forEach((h, i) => { hairs[h] = hs[i].scene; });
  for (const c of anims.animations) clips[c.name] = c;
}

// Paints the clothes onto the body by where each point sits in the rest pose (arms out, standing straight).
// With a kit: a football shirt (plain, stripes or checks) with a number on the back, shorts, bare knees, long socks, boots.
const numberTex = new Map();
function numberTexture(n) {
  if (!numberTex.has(n)) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const k = c.getContext('2d');
    k.font = '800 104px "Arial Black", Arial, sans-serif'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillStyle = '#fff'; k.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c); numberTex.set(n, t);
  }
  return numberTex.get(n);
}
function dress(base, look, kit) {
  const mat = base.clone(), f = look.body === 'f' ? 0.96 : 1;
  if (look.skin === 'light') mat.map = lightSkin[look.body];
  mat.roughness = 1; mat.metalness = 0; mat.roughnessMap = null; mat.metalnessMap = null;
  const dark = c => new THREE.Color(c).getHSL({}).l > 0.6;
  const u = kit ? {
    uKit: { value: 1 }, uShirt: { value: new THREE.Color(kit.shirt || '#ffffff') }, uShirt2: { value: new THREE.Color(kit.shirt2 || kit.shirt || '#ffffff') },
    uPattern: { value: { stripes: 1, checks: 2 }[kit.pattern] || 0 }, uPants: { value: new THREE.Color(kit.shorts || '#111111') }, uSocks: { value: new THREE.Color(kit.socks || '#ffffff') },
    uShoes: { value: new THREE.Color('#141416') }, uSleeve: { value: kit.sleeves === 'long' ? 0.69 : 0.36 }, uH: { value: f },
    uGlove: { value: kit.gloves ? 1 : 0 }, uCap: { value: kit.captain ? 1 : 0 }, uGloves: { value: new THREE.Color(kit.gloves || '#ffffff') },
    uNum: { value: numberTexture(kit.number ?? '') }, uNumColor: { value: new THREE.Color(dark(kit.shirt || '#fff') ? '#14182a' : '#ffffff') },
  } : {
    uKit: { value: 0 }, uShirt: { value: new THREE.Color(look.shirt) }, uShirt2: { value: new THREE.Color(look.shirt) }, uPattern: { value: 0 }, uPants: { value: new THREE.Color(look.pants) },
    uSocks: { value: new THREE.Color(look.pants) }, uShoes: { value: new THREE.Color(look.shoes || '#1b1b1f') },
    uSleeve: { value: (look.sleeve === 'short' ? 0.36 : 0.69) * (look.body === 'f' ? 0.9 : 1) }, uH: { value: f }, uNum: { value: numberTexture('') }, uNumColor: { value: new THREE.Color('#fff') }, uGlove: { value: 0 }, uCap: { value: 0 }, uGloves: { value: new THREE.Color('#fff') },
  };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest; uniform float uKit; uniform vec3 uShirt; uniform vec3 uShirt2; uniform float uPattern; uniform vec3 uPants; uniform vec3 uSocks; uniform vec3 uShoes; uniform float uSleeve; uniform float uH; uniform sampler2D uNum; uniform vec3 uNumColor; uniform float uGlove; uniform vec3 uGloves; uniform float uCap;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float ax = abs(vRest.x), ry = vRest.y / uH;
        float shade = 0.82 + 0.6 * (dot(diffuseColor.rgb, vec3(0.333)) - 0.35);
        bool shirt = ax < uSleeve && (ry < 1.5 || (ax > 0.075 && ry < 1.58));
        if (uKit > 0.5) {
          if (uGlove > 0.5 && ax > 0.69 && ry > 1.2) diffuseColor.rgb = uGloves * shade;              // goalkeeper gloves
          else if (ry < 0.075) diffuseColor.rgb = uShoes;
          else if (ry < 0.5) diffuseColor.rgb = uSocks * shade;                       // long socks to just below the knee
          else if (ry < 0.72) { }                                                      // bare knees and lower thighs
          else if (ry < 1.0) diffuseColor.rgb = uPants * shade;                        // shorts
          else if (shirt) {
            vec3 c = uShirt;
            if (uPattern > 0.5 && uPattern < 1.5 && fract((vRest.x + 1.0) * 9.0) < 0.5) c = uShirt2;                                   // vertical stripes
            if (uPattern > 1.5 && mod(floor((vRest.x + 1.0) * 11.0) + floor(vRest.y * 11.0), 2.0) < 1.0) c = uShirt2;               // checks
            if (ry > 1.46 && ax < 0.09) c = mix(c, uShirt2, 0.6);                                                                      // collar
            if (uCap > 0.5 && vRest.x > 0.25 && vRest.x < 0.31 && ry > 1.25) c = vec3(0.98, 0.78, 0.1);                            // captain's armband
            diffuseColor.rgb = c * shade;
            if (vRest.z < -0.04 && ax < 0.16 && ry > 1.13 && ry < 1.43) {                                                              // the number on the back
              float a = texture2D(uNum, vec2((0.16 - vRest.x) / 0.32, (ry - 1.13) / 0.30)).a;
              diffuseColor.rgb = mix(diffuseColor.rgb, uNumColor, a);
            }
          }
        } else {
          if (ry < 0.075) diffuseColor.rgb = uShoes;
          else if (ry < 1.0) diffuseColor.rgb = uPants * shade;
          else if (ry < 1.03 && ax < 0.3) diffuseColor.rgb = vec3(0.03);
          else if (shirt) diffuseColor.rgb = uShirt * shade;
        }`);
  };
  mat.customProgramCacheKey = () => 'dressed4';
  return mat;
}

export function makePerson(look, kit) {
  const body = cloneSkinned(bodies[look.body]);
  const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.75 });
  body.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    if (o.material.name.startsWith('MI_Superhero')) o.material = dress(o.material, look, kit);
    else if (o.material.name.startsWith('MI_Hair')) o.material = hairMat;        // eyebrows
  });
  body.updateMatrixWorld(true);
  const head = body.getObjectByName('Head');
  const wear = (name, dy = 0) => {                // hair is a separate model: put it where the head is, then let it follow the head bone
    const h = hairs[name].clone(); h.position.y += dy;
    h.traverse(o => { if (o.isMesh) { o.material = hairMat; o.castShadow = true; } });
    body.add(h); body.updateMatrixWorld(true); head.attach(h);
  };
  const drop = look.body === 'f' ? -0.04 : 0;
  if (look.cut === 'long') wear('Hair_Long', look.body === 'f' ? 0 : 0.04);
  else if (look.cut === 'buzzed') wear('Hair_Buzzed', drop);
  else if (look.cut === 'parted') wear('Hair_SimpleParted', drop);
  if (look.beard) wear('Hair_Beard');
  body.scale.setScalar(K);
  const g = new THREE.Group(); g.add(body); g.userData.body = body;
  return g;
}
