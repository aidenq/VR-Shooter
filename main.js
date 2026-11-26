import * as THREE from 'three';

// ============================================================
// 상수
// ============================================================
const DEG = Math.PI / 180;
const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
const $ = (id) => document.getElementById(id);

const COND = {
  A: { name: 'near', label: '가까이' },
  B: { name: 'focal', label: '초점 거리' },
  C: { name: 'same', label: '표적과 같은 거리' },
};
const COLORS = [
  { k: 'red', hex: 0xff4545, word: '빨간' },
  { k: 'blue', hex: 0x3d8bff, word: '파란' },
  { k: 'green', hex: 0x2fd16f, word: '초록' },
  { k: 'yellow', hex: 0xffd21f, word: '노란' },
];
// 같은 인덱스끼리 짝: 과녁 문양 s ↔ 몬스터 종류 s
const SHAPES = [
  { k: 'circle', word: '원' },
  { k: 'square', word: '네모' },
  { k: 'triangle', word: '세모' },
  { k: 'star', word: '별' },
];
const MONSTERS = [
  { k: 'slime', word: '슬라임' },
  { k: 'bat', word: '박쥐' },
  { k: 'mushroom', word: '버섯' },
  { k: 'ghost', word: '유령' },
];
const WEAPONS = [
  { label: '검', locked: true },
  { label: '활', locked: true },
  { label: '지팡이', locked: true },
  { label: '총', locked: false },
];
// 표적이 나올 수 있는 자리 (정면 기준 방위각, 올려본 각)
const SLOTS = [];
for (const el of [0, 12]) for (const az of [-30, -15, 0, 15, 30]) SLOTS.push({ az, el });

// 판타지 색
const UI = {
  bg: 'rgba(30,22,14,0.94)', border: '#d9b45a', title: '#fff4dc', text: '#ecdcbc', mute: '#a8977a',
  btn: '#4a3826', btnHover: '#a87b32', btnBorder: '#c9a24f', locked: '#2b241c',
};

// ============================================================
// 설정
// ============================================================
const DEFAULTS = {
  pid: 'P1', order: 'ABC',
  near: 0.7, focal: 1.4, target: 6,
  stageKills: 12, roundsPer: 1, practice: true, practiceKills: 6, monsterKills: 3,
  hudAngle: 20, hudDown: 10, nTargets: 4, targetAngle: 5, itiMs: 400, keepCmd: true, hideHud: true,
};
const FIELDS = [
  ['pid', 'text'], ['order', 'text'],
  ['near', 'num'], ['focal', 'num'], ['target', 'num'],
  ['stageKills', 'num'], ['roundsPer', 'num'], ['practice', 'check'], ['practiceKills', 'num'], ['monsterKills', 'num'],
  ['hudAngle', 'num'], ['hudDown', 'num'], ['nTargets', 'num'], ['targetAngle', 'num'],
  ['itiMs', 'num'], ['keepCmd', 'check'], ['hideHud', 'check'],
];
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 */ } }
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(lsGet('hudexp.settings') || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
let S = loadSettings();
function fillForm() {
  for (const [k, t] of FIELDS) {
    const el = $('f_' + k);
    if (t === 'check') el.checked = !!S[k]; else el.value = S[k];
  }
}
function readForm() {
  const s = {};
  for (const [k, t] of FIELDS) {
    const el = $('f_' + k);
    if (t === 'check') s[k] = el.checked;
    else if (t === 'num') { const v = parseFloat(el.value); s[k] = Number.isFinite(v) ? v : DEFAULTS[k]; }
    else s[k] = el.value.trim();
  }
  s.nTargets = Math.max(2, Math.min(10, Math.round(s.nTargets)));
  s.roundsPer = Math.max(1, Math.round(s.roundsPer));
  s.stageKills = Math.max(1, Math.round(s.stageKills));
  s.practiceKills = Math.max(1, Math.round(s.practiceKills));
  s.monsterKills = Math.max(0, Math.round(s.monsterKills));
  if (!s.pid) s.pid = 'P';
  return s;
}

// ============================================================
// 렌더러와 장면
// ============================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('stage').appendChild(renderer.domElement);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const SKY_LOW = 0xe8a46a, SKY_HIGH = 0x2a3566;
scene.background = new THREE.Color(SKY_HIGH);
scene.fog = new THREE.Fog(0x9a7f86, 35, 110);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 300);
const DESK_EYE = new THREE.Vector3(0, 1.6, 0);
camera.position.copy(DESK_EYE);
scene.add(camera);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xfff0d8, 0x4a5a32, 1.6));

// 하늘: 노을 그라데이션 구
{
  const geo = new THREE.SphereGeometry(200, 32, 16);
  const pos = geo.attributes.position, col = [];
  const lo = new THREE.Color(SKY_LOW), hi = new THREE.Color(SKY_HIGH), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / 200 * 2.2 + 0.05));
    c.copy(lo).lerp(hi, t);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
}

// 배경 소품: 스테이지 시작 때 정면 방향에 맞춰 바닥에 놓는다.
// 표적이 나오는 정면(±50°)에는 아무것도 두지 않는다 (먼 산도 지평선 아래로 낮게).
const decor = new THREE.Group();
scene.add(decor);
{
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 64), new THREE.MeshLambertMaterial({ color: 0x3c5a2c }));
  ground.rotation.x = -Math.PI / 2;
  decor.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshLambertMaterial({ color: 0x7a5d3c }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.01;
  decor.add(pad);
  const padRim = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.35, 48), new THREE.MeshLambertMaterial({ color: 0x8c8c8c }));
  padRim.rotation.x = -Math.PI / 2; padRim.position.y = 0.012;
  decor.add(padRim);

  const at = (az, dist, y = 0) => new THREE.Vector3(Math.sin(az * DEG) * dist, y, -Math.cos(az * DEG) * dist);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d25 });
  const leafMats = [0x2c5a2e, 0x24492a, 0x356b36].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 40; i++) {
    let az = rnd(60, 300); // 옆과 뒤
    const dist = rnd(9, 32), h = rnd(3, 6);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, h * 0.35, 6), trunkMat);
    trunk.position.y = h * 0.175;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.8, 7), leafMats[i % 3]);
    leaf.position.y = h * 0.35 + h * 0.4;
    tree.add(trunk, leaf);
    tree.position.copy(at(az, dist));
    decor.add(tree);
  }
  const mtMat = [0x4a4566, 0x3e3a5a, 0x564d6e].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let az = 0; az < 360; az += 14) {
    const front = az < 50 || az > 310;
    const h = front ? rnd(0.3, 0.9) : rnd(10, 22); // 정면 산은 지평선 아래
    const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(10, 16), h, 6), mtMat[Math.floor(az / 14) % 3]);
    m.position.copy(at(az + rnd(-4, 4), rnd(80, 100), h / 2 - 0.2));
    decor.add(m);
  }
}

// 표적 영역: 스테이지 시작 때 머리 위치와 정면 방향에 맞춰 놓는다
const field = new THREE.Group();
scene.add(field);
const markerGroup = new THREE.Group();
const targetGroup = new THREE.Group();
field.add(markerGroup, targetGroup);
{
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(0.5, 4, 6); // 사용자 뒤쪽 위에서 표적 앞면을 비춘다
  sun.target.position.set(0, 0, -6);
  field.add(sun, sun.target);
}

const Z = new THREE.Vector3(0, 0, 1);
function slotDir(az, el) {
  return new THREE.Vector3(
    Math.sin(az * DEG) * Math.cos(el * DEG),
    Math.sin(el * DEG),
    -Math.cos(az * DEG) * Math.cos(el * DEG));
}
function placeOnSphere(obj, az, el, D) {
  const d = slotDir(az, el);
  obj.position.copy(d).multiplyScalar(D);
  obj.quaternion.setFromUnitVectors(Z, d.negate());
}
const targetRadius = () => S.target * Math.tan(S.targetAngle * DEG / 2);

// 표적 자리 표시: 희미한 마법진 고리
const ringGeo = new THREE.RingGeometry(1.1, 1.17, 64);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2cf7a, transparent: true, opacity: 0.35, fog: false });
function buildMarkers() {
  markerGroup.clear();
  const r = targetRadius();
  for (const s of SLOTS) {
    const m = new THREE.Mesh(ringGeo, ringMat);
    placeOnSphere(m, s.az, s.el, S.target);
    m.scale.setScalar(r);
    markerGroup.add(m);
  }
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function headPose() {
  camera.getWorldPosition(_p);
  camera.getWorldQuaternion(_q);
  _e.setFromQuaternion(_q, 'YXZ');
  return { pos: _p.clone(), yaw: _e.y };
}
function anchorField() {
  const h = headPose();
  field.position.copy(h.pos);
  field.rotation.set(0, h.yaw, 0);
  decor.position.set(h.pos.x, 0, h.pos.z);
  decor.rotation.set(0, h.yaw, 0);
  buildMarkers();
}

// ============================================================
// 표적: 문양 방패 과녁 / 몬스터 (둘 다 반지름 1 단위 안에 맞춰 만든다)
// ============================================================
function starGeo(R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
const GEO = {
  board: new THREE.CircleGeometry(1, 48),
  rim: new THREE.RingGeometry(0.9, 1.0, 48),
  stud: new THREE.CircleGeometry(0.05, 12),
  circle: new THREE.CircleGeometry(0.55, 48),
  square: new THREE.PlaneGeometry(0.92, 0.92),
  triangle: new THREE.CircleGeometry(0.68, 3, Math.PI / 2),
  star: starGeo(0.7, 0.3),
  halo: new THREE.CircleGeometry(1.18, 48),
};
const woodMat = new THREE.MeshBasicMaterial({ color: 0x6b4a2b });
const ironMat = new THREE.MeshBasicMaterial({ color: 0x9a9aa3 });
const shapeMats = COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c.hex }));
const haloMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false });
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
let colliders = []; // 레이 판정 대상

function makeShield(spec, g) {
  const board = new THREE.Mesh(GEO.board, woodMat);
  const rim = new THREE.Mesh(GEO.rim, ironMat);
  rim.position.z = 0.03;
  g.add(board, rim);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(GEO.stud, ironMat);
    const a = i * Math.PI / 4;
    s.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.05);
    g.add(s);
  }
  const shape = new THREE.Mesh(GEO[SHAPES[spec.s].k], shapeMats[spec.c]);
  shape.position.z = 0.08;
  g.add(shape);
}

// 몬스터 재료
const MON = {
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  black: new THREE.MeshBasicMaterial({ color: 0x15100c }),
  stem: new THREE.MeshLambertMaterial({ color: 0xf0e2c4 }),
  body: COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c.hex })),
  dark: COLORS.map((c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c.hex).multiplyScalar(0.6) })),
  eye: new THREE.SphereGeometry(0.13, 12, 8),
  pupil: new THREE.SphereGeometry(0.065, 10, 6),
};
function addEyes(parent, y, z, gap = 0.2) {
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(MON.eye, MON.white);
    e.position.set(sx * gap, y, z);
    const p = new THREE.Mesh(MON.pupil, MON.black);
    p.position.set(sx * gap, y, z + 0.1);
    parent.add(e, p);
  }
}
// 종류마다 겉보기 크기가 방패 과녁(반지름 1)과 비슷하도록 맞춘 배율과 높이 보정
const MON_FIT = { slime: [1.2, 0.35], bat: [1.05, 0], mushroom: [1.2, 0.15], ghost: [1.1, 0.05] };
function makeMonster(spec, g) {
  const body = new THREE.Group();
  const mat = MON.body[spec.c], dark = MON.dark[spec.c];
  const k = MONSTERS[spec.s].k;
  if (k === 'slime') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.scale.y = 0.95; dome.position.y = -0.6;
    body.add(dome);
    addEyes(body, -0.05, 0.62, 0.26);
  } else if (k === 'bat') {
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), mat);
    body.add(torso);
    for (const sx of [-1, 1]) {
      const w = new THREE.Shape();
      w.moveTo(0, 0.2); w.lineTo(sx * 0.98, 0.35); w.lineTo(sx * 0.8, 0.0); w.lineTo(sx * 0.95, -0.28); w.lineTo(0, -0.15);
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(w), dark);
      wing.material = dark; wing.position.z = -0.05;
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), dark);
      ear.position.set(sx * 0.22, 0.45, 0);
      body.add(wing, ear);
    }
    addEyes(body, 0.08, 0.34, 0.15);
  } else if (k === 'mushroom') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.75, 16), MON.stem);
    stem.position.y = -0.5;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    cap.scale.y = 0.8; cap.position.y = -0.15;
    body.add(stem, cap);
    for (const [x, y] of [[-0.4, 0.2], [0.35, 0.3], [0, 0.45], [0.55, 0.05], [-0.6, -0.02]]) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), MON.white);
      dot.position.set(x, y, Math.sqrt(Math.max(0, 0.72 - x * x - (y + 0.15) ** 2 / 0.64)) + 0.05);
      body.add(dot);
    }
    addEyes(body, -0.45, 0.33, 0.13);
  } else { // ghost
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), mat);
    head.position.y = 0.2;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.6, 20, 1, true), mat);
    skirt.position.y = -0.1;
    body.add(head, skirt);
    for (const x of [-0.4, 0, 0.4]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), mat);
      tail.rotation.x = Math.PI; tail.position.set(x, -0.6, 0);
      body.add(tail);
    }
    addEyes(body, 0.25, 0.5, 0.2);
  }
  const [sc, dy] = MON_FIT[k];
  const fit = new THREE.Group(); // 크기·높이 보정
  fit.scale.setScalar(sc); fit.position.y = dy * sc;
  fit.add(body);
  g.add(fit);
  g.userData.body = body; // 둥실거림은 body에만
  g.userData.phase = Math.random() * Math.PI * 2;
}

function makeTarget(spec, kind) {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(GEO.halo, haloMat);
  halo.position.z = -0.15; halo.visible = false;
  const hit = new THREE.Mesh(GEO.board, hitMat); // 판정용 (보이지 않음)
  hit.position.z = 0.2;
  g.add(halo, hit);
  if (kind === 'monster') makeMonster(spec, g); else makeShield(spec, g);
  g.scale.setScalar(targetRadius());
  placeOnSphere(g, spec.az, spec.el, S.target);
  g.userData.spec = spec;
  g.userData.halo = halo;
  hit.userData.target = g;
  colliders.push(hit);
  targetGroup.add(g);
  return g;
}
function clearTargets() {
  targetGroup.clear();
  colliders = [];
}

const ri = (n) => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// 정답 하나 + 색만 같은 것 + 모양(종류)만 같은 것 + 나머지 무작위 (모두 다른 조합)
function genTargets(n) {
  const c0 = ri(4), s0 = ri(4);
  const items = [{ c: c0, s: s0, correct: true }];
  const used = new Set([c0 + ',' + s0]);
  const add = (c, s) => {
    const k = c + ',' + s;
    if (items.length >= n || used.has(k)) return false;
    used.add(k); items.push({ c, s, correct: false }); return true;
  };
  while (items.length < Math.min(n, 2) && !add(c0, ri(4)));
  while (items.length < Math.min(n, 3) && !add(ri(4), s0));
  while (items.length < n) add(ri(4), ri(4));
  const slots = shuffle(SLOTS.slice()).slice(0, n);
  return items.map((it, i) => ({ ...it, az: slots[i].az, el: slots[i].el }));
}
const cmdOf = (spec, kind) => COLORS[spec.c].word + ' ' + (kind === 'monster' ? MONSTERS : SHAPES)[spec.s].word;

// ============================================================
// 총 (VR 컨트롤러에 붙는다)
// ============================================================
function makeGun() {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x3b3b42 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xb8893a });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4426 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 10), metal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.1);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.02, 10), brass);
  band.rotation.x = Math.PI / 2; band.position.set(0, 0, -0.17);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.09), brass);
  body.position.set(0, -0.012, 0.01);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.035), wood);
  grip.position.set(0, -0.065, 0.05); grip.rotation.x = -0.35;
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 }));
  flash.position.set(0, 0, -0.22); flash.visible = false;
  g.add(barrel, band, body, grip, flash);
  g.userData.flash = flash;
  return g;
}

// ============================================================
// 캔버스 글자 도우미
// ============================================================
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function canvasTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}
function frame(c, W, H, r) {
  roundRect(c, 8, 8, W - 16, H - 16, r);
  c.fillStyle = UI.bg; c.fill();
  c.lineWidth = 5; c.strokeStyle = UI.border; c.stroke();
  roundRect(c, 20, 20, W - 40, H - 40, r - 10);
  c.lineWidth = 2; c.strokeStyle = 'rgba(217,180,90,0.45)'; c.stroke();
}

// ============================================================
// HUD (퀘스트 창): 머리를 따라다니고, 시선 아래 hudDown°, 시각각 hudAngle°로 크기 고정
// ============================================================
const hud = (() => {
  const { canvas, ctx, tex } = canvasTexture(1024, 512);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  mesh.renderOrder = 999;
  const group = new THREE.Group();
  group.add(mesh);
  group.visible = false;
  scene.add(group);
  return { canvas, ctx, tex, mesh, group, dist: 1.4, key: '' };
})();

function setHudDistance(d) {
  hud.dist = d;
  const a = S.hudDown * DEG;
  const w = 2 * d * Math.tan(S.hudAngle * DEG / 2);
  hud.mesh.scale.set(w, w, 1);
  hud.mesh.position.set(0, -d * Math.sin(a), -d * Math.cos(a));
  hud.mesh.rotation.set(-a, 0, 0); // 눈을 향하도록 기울임
}

function drawHUD(st) {
  const c = hud.ctx, W = 1024, H = 512;
  c.clearRect(0, 0, W, H);
  frame(c, W, H, 40);
  c.textBaseline = 'middle';
  c.font = `700 42px ${FONT}`; c.fillStyle = UI.text;
  c.textAlign = 'left'; c.fillText(`처치 ${st.kills} / ${st.goal}`, 56, 76);
  c.textAlign = 'center'; c.fillText(`EXP ${st.score}`, W / 2 + 30, 76);
  c.textAlign = 'right'; c.fillText(`콤보 ${st.combo}`, W - 56, 76);
  if (st.cmd) {
    c.textAlign = 'center';
    c.font = `900 150px ${FONT}`;
    c.fillStyle = st.cmdDim ? 'rgba(255,244,220,0.4)' : UI.title;
    c.fillText(st.cmd, W / 2, 262);
  }
  if (st.prompt) {
    c.textAlign = 'center';
    c.font = `700 52px ${FONT}`;
    c.fillStyle = st.promptColor || '#ffd36b';
    c.fillText(st.prompt, W / 2, 420);
  }
  hud.tex.needsUpdate = true;
}

function placeHUD() {
  camera.getWorldPosition(hud.group.position);
  camera.getWorldQuaternion(hud.group.quaternion);
  hud.group.updateMatrixWorld(true);
}

// ============================================================
// 월드 패널 (안내, 무기 선택, 설문)
// ============================================================
const panel = (() => {
  const W = 1024, H = 640;
  const { canvas, ctx, tex } = canvasTexture(W, H);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  mesh.renderOrder = 1000;
  mesh.visible = false;
  scene.add(mesh);
  const p = { W, H, canvas, ctx, tex, mesh, spec: null, rects: [], hover: -1 };

  p.show = (spec) => {
    p.spec = spec; p.hover = -1;
    const b = spec.buttons || [];
    const n = b.length, pad = 48, gap = 16, bh = b.some((x) => x.sub) ? 130 : 110;
    const y = H - pad - bh - (spec.footerL || spec.footerR ? 44 : 0);
    const bw = Math.min(360, (W - 2 * pad - gap * (n - 1)) / n);
    let x = (W - (bw * n + gap * (n - 1))) / 2;
    p.rects = b.map(() => { const r = { x, y, w: bw, h: bh }; x += bw + gap; return r; });
    p.draw();
    mesh.visible = true;
    placePanel();
  };
  p.hide = () => { mesh.visible = false; p.spec = null; p.rects = []; };
  p.draw = () => {
    const c = ctx, s = p.spec;
    c.clearRect(0, 0, W, H);
    frame(c, W, H, 36);
    c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = UI.title; c.font = `900 58px ${FONT}`;
    c.fillText(s.title || '', W / 2, 96);
    c.font = `500 35px ${FONT}`; c.fillStyle = UI.text;
    (s.lines || []).forEach((ln, i) => c.fillText(ln, W / 2, 180 + i * 52));
    (s.buttons || []).forEach((b, i) => {
      const r = p.rects[i];
      roundRect(c, r.x, r.y, r.w, r.h, 22);
      c.fillStyle = b.disabled ? UI.locked : i === p.hover ? UI.btnHover : UI.btn; c.fill();
      c.lineWidth = 3; c.strokeStyle = b.disabled ? '#5a4c38' : UI.btnBorder; c.stroke();
      c.fillStyle = b.disabled ? '#7d705c' : '#ffffff';
      c.font = `700 ${b.label.length > 4 ? 38 : 48}px ${FONT}`;
      c.fillText(b.label, r.x + r.w / 2, r.y + (b.sub ? 48 : r.h / 2 + 2));
      if (b.sub) {
        c.font = `500 28px ${FONT}`; c.fillStyle = b.disabled ? '#7d705c' : '#f7dfa6';
        c.fillText(b.sub, r.x + r.w / 2, r.y + 96);
      }
    });
    c.font = `500 30px ${FONT}`; c.fillStyle = UI.mute;
    if (s.footerL) { c.textAlign = 'left'; c.fillText(s.footerL, 56, H - 46); }
    if (s.footerR) { c.textAlign = 'right'; c.fillText(s.footerR, W - 56, H - 46); }
    tex.needsUpdate = true;
  };
  p.pick = (uv) => {
    const x = uv.x * W, y = (1 - uv.y) * H;
    return p.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  };
  p.setHover = (i) => {
    if (p.spec && p.spec.buttons && p.spec.buttons[i] && p.spec.buttons[i].disabled) i = -1;
    if (p.spec && i !== p.hover) { p.hover = i; p.draw(); }
  };
  p.click = (i) => {
    const b = p.spec && p.spec.buttons && p.spec.buttons[i];
    if (!b) return;
    if (b.disabled) { beep(180, 0.12, 'square', 0.05); if (b.onLocked) b.onLocked(); return; }
    beep(880, 0.05, 'sine', 0.1);
    b.onClick();
  };
  return p;
})();

function placePanel() {
  const h = headPose();
  const d = 1.5;
  panel.mesh.position.set(h.pos.x - Math.sin(h.yaw) * d, h.pos.y - 0.05, h.pos.z - Math.cos(h.yaw) * d);
  panel.mesh.rotation.set(0, h.yaw, 0);
  panel.mesh.updateMatrixWorld(true);
}

// ============================================================
// 소리
// ============================================================
let actx = null, noiseBuf = null;
function initAudio() {
  try {
    actx = actx || new AudioContext(); actx.resume();
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.25, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch { actx = null; }
}
function beep(freq, dur = 0.08, type = 'sine', vol = 0.12) {
  if (!actx) return;
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function bang() {
  if (!actx || !noiseBuf) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.18);
  const g = actx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t); src.stop(t + 0.22);
}

// ============================================================
// 입력: 컨트롤러 (VR) / 마우스 (브라우저)
// ============================================================
const raycaster = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

// 레이가 맞힌 것: 패널 우선 (항상 위에 그려지므로), 다음 표적
function castScene(rc) {
  if (panel.mesh.visible) {
    const h = rc.intersectObject(panel.mesh, false)[0];
    if (h) return { kind: 'panel', dist: h.distance, point: h.point, uv: h.uv };
  }
  const t = rc.intersectObjects(colliders, false)[0];
  if (t) return { kind: 'target', dist: t.distance, point: t.point, obj: t.object.userData.target };
  return null;
}

const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.7, fog: false }));
  line.scale.z = 10;
  const gun = makeGun();
  c.add(line, gun);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, fog: false }));
  dot.renderOrder = 1001;
  dot.visible = false;
  scene.add(dot);
  c.userData = { line, dot, gun, src: null, prevBtn: false, prevPause: false };
  c.visible = false;
  c.addEventListener('connected', (e) => { c.userData.src = e.data; c.visible = !e.data.hand; });
  c.addEventListener('disconnected', () => { c.userData.src = null; c.visible = false; dot.visible = false; });
  c.addEventListener('selectstart', () => { if (c.visible) onShoot(controllerRay(c), c); });
  scene.add(c);
  controllers.push(c);
}
function controllerRay(c) {
  _o.setFromMatrixPosition(c.matrixWorld);
  _d.set(0, 0, -1).transformDirection(c.matrixWorld);
  raycaster.set(_o, _d);
  return raycaster;
}

// A/X(4번) = 확인, B/Y(5번) = 일시정지
function pollButtons() {
  for (const c of controllers) {
    const gp = c.userData.src && c.userData.src.gamepad;
    if (!gp) continue;
    const b = gp.buttons;
    const a = !!(b[4] && b[4].pressed), p = !!(b[5] && b[5].pressed);
    if (a && !c.userData.prevBtn) onConfirm();
    if (p && !c.userData.prevPause) togglePause();
    c.userData.prevBtn = a;
    c.userData.prevPause = p;
  }
}

function updateRays() {
  let hover = -1;
  if (game.mode === 'vr') {
    for (const c of controllers) {
      if (!c.visible) continue;
      const res = castScene(controllerRay(c));
      c.userData.line.scale.z = res ? res.dist : 10;
      c.userData.line.material.color.set(res && res.kind === 'target' ? 0xffffff : 0xffc46b);
      const dot = c.userData.dot;
      dot.visible = !!res;
      if (res) { dot.position.copy(res.point); dot.scale.setScalar(Math.max(0.004, res.dist * 0.004)); }
      if (res && res.kind === 'panel') hover = panel.pick(res.uv);
    }
  } else if (game.mode === 'desktop' && mouse.inside) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const res = castScene(raycaster);
    if (res && res.kind === 'panel') hover = panel.pick(res.uv);
    renderer.domElement.style.cursor = res ? 'pointer' : 'crosshair';
  }
  panel.setHover(hover);
}

// 마우스: 드래그 = 둘러보기, 클릭 = 쏘기
const mouse = { ndc: new THREE.Vector2(), inside: false, down: null, yaw: 0, pitch: 0 };
const cvs = renderer.domElement;
function setNdc(e) {
  mouse.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  mouse.inside = true;
}
cvs.addEventListener('pointerdown', (e) => {
  if (game.mode !== 'desktop') return;
  initAudio();
  mouse.down = { x: e.clientX, y: e.clientY, drag: false };
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', (e) => {
  setNdc(e);
  const d = mouse.down;
  if (!d || game.mode !== 'desktop') return;
  if (!d.drag && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) d.drag = true;
  if (d.drag) {
    mouse.yaw += e.movementX * 0.25 * DEG;
    mouse.pitch = Math.max(-80 * DEG, Math.min(80 * DEG, mouse.pitch + e.movementY * 0.25 * DEG));
  }
});
cvs.addEventListener('pointerup', (e) => {
  const d = mouse.down;
  mouse.down = null;
  if (!d || d.drag || game.mode !== 'desktop') return;
  setNdc(e);
  raycaster.setFromCamera(mouse.ndc, camera);
  onShoot(raycaster, null);
});
cvs.addEventListener('pointerleave', () => { mouse.inside = false; });
addEventListener('keydown', (e) => {
  if (game.mode !== 'desktop') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) onConfirm(); }
  else if (e.code === 'Escape') togglePause();
});
function resetDeskCamera() {
  mouse.yaw = 0; mouse.pitch = 0;
  camera.position.copy(DESK_EYE);
  camera.rotation.set(0, 0, 0, 'YXZ');
}

function onShoot(rc, ctrl) {
  if (!game.mode) return;
  const res = castScene(rc);
  if (panel.mesh.visible) {
    if (res && res.kind === 'panel') panel.click(panel.pick(res.uv));
    return;
  }
  if (game.phase === 'play' && game.T && game.T.state === 'aim') {
    bang();
    if (ctrl) recoil(ctrl.userData.gun, performance.now());
  }
  if (game.phase === 'play') shoot(res);
}
function onConfirm() {
  if (game.phase === 'play') confirmCmd();
  else if (panel.mesh.visible && panel.spec && panel.spec.buttons && panel.spec.buttons.length === 1) panel.click(0);
}

// ============================================================
// 게임 진행
// ============================================================
const game = {
  mode: null,      // 'vr' | 'desktop' | null
  phase: 'idle',   // idle | starting | weapon | intro | play | clear | survey | final | done | paused
  rounds: [], ri: 0, R: null, T: null, nextTrialAt: 0,
  sessionId: '', fb: null, lastCmd: '', startFrames: 0, xrSession: null, pausedFrom: null,
};
let log = { trials: [], rounds: [], prefs: null };

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const confirmKey = () => (game.mode === 'vr' ? 'A/X 버튼' : 'Space');
const shootKey = () => (game.mode === 'vr' ? '방아쇠' : '클릭');
const pauseKey = () => (game.mode === 'vr' ? 'B/Y 버튼' : 'Esc');
const hudDistOf = (cond) => (cond === 'A' ? S.near : cond === 'B' ? S.focal : S.target);
const stageName = (r) => (r.practice ? '기초 훈련' : `훈련 ${r.pos}단계`);

function startSession(mode) {
  S = readForm();
  lsSet('hudexp.settings', JSON.stringify(S));
  game.mode = mode;
  game.sessionId = stamp();
  log = { trials: [], rounds: [], prefs: null };
  const rounds = [];
  if (S.practice) rounds.push({ practice: true, cond: 'B', pos: 0, goal: S.practiceKills, monsters: Math.min(S.monsterKills, 2) });
  let pos = 0;
  for (let r = 0; r < S.roundsPer; r++) {
    for (const ch of S.order) rounds.push({ practice: false, cond: ch, pos: ++pos, goal: S.stageKills, monsters: Math.min(S.monsterKills, S.stageKills) });
  }
  game.rounds = rounds;
  game.ri = 0;
  game.lastCmd = '';
  $('menu').hidden = true;
  $('help').hidden = mode !== 'desktop';
  if (mode === 'desktop') resetDeskCamera();
  game.phase = 'starting';
  game.startFrames = 3; // VR 첫 프레임의 머리 위치를 받은 뒤 안내판을 띄운다
}

function showWeapons(msg) {
  game.phase = 'weapon';
  panel.show({
    title: '무기를 고르세요',
    lines: [msg || '모험을 떠나기 전에 쓸 무기를 하나 고릅니다.'],
    buttons: WEAPONS.map((w) => ({
      label: w.label, sub: w.locked ? '잠김' : '선택 가능', disabled: w.locked,
      onLocked: () => showWeapons('아직 열리지 않은 무기입니다. 총을 골라 보세요.'),
      onClick: () => {
        panel.show({
          title: '총을 골랐습니다',
          lines: ['멀리 있는 적을 한 발씩 정확하게 노리는 무기.', '훈련장에서 쓰는 법을 익혀 봅시다.'],
          buttons: [{ label: '훈련장으로', onClick: showIntro }],
        });
      },
    })),
  });
}

function showIntro() {
  game.phase = 'intro';
  hud.group.visible = false;
  const r = game.rounds[game.ri];
  const total = game.rounds.filter((x) => !x.practice).length;
  const lines = r.practice
    ? [
      '교관: 퀘스트 창에 목표가 뜨면 읽어라.',
      `읽었으면 ${confirmKey()}, 나타난 적 중 목표를 ${shootKey()}!`,
      `목표 ${r.goal}개를 맞히면 끝. 마지막엔 몬스터도 나온다.`,
      `일시정지: ${pauseKey()}`,
    ]
    : [
      `목표 ${r.goal}개 처치 · 마지막 ${r.monsters}개는 몬스터`,
      '연속으로 맞히면 콤보 경험치!',
      '정면을 보고, 준비되면 시작을 누르세요.',
    ];
  panel.show({
    title: r.practice ? '기초 훈련' : `훈련 ${r.pos} / ${total}단계`,
    lines,
    buttons: [{ label: '시작', onClick: startRound }],
  });
}

function startRound() {
  panel.hide();
  anchorField();
  const r = game.rounds[game.ri];
  const d = hudDistOf(r.cond);
  setHudDistance(d);
  const now = performance.now();
  game.R = { ...r, hudDist: d, startT: now,
    score: 0, combo: 0, maxCombo: 0, hits: 0, wrongs: 0, misses: 0, n: 0 };
  game.T = null;
  game.fb = null;
  game.nextTrialAt = now + 800;
  game.phase = 'play';
  hud.key = '';
  hud.group.visible = true;
}

function newTrial(now) {
  const R = game.R;
  const kind = R.hits >= R.goal - R.monsters ? 'monster' : 'symbol';
  let specs;
  do { specs = genTargets(S.nTargets); } while (cmdOf(specs[0], kind) === game.lastCmd);
  game.lastCmd = cmdOf(specs[0], kind);
  R.n++;
  game.T = { n: R.n, kind, specs, cmd: cmdOf(specs[0], kind), state: 'read',
    tCmd: now, tConfirm: 0, tHit: 0, wrong: 0, miss: 0, early: 0 };
}

function confirmCmd() {
  const T = game.T;
  if (!T || T.state !== 'read') return;
  T.tConfirm = performance.now();
  T.state = 'aim';
  for (const s of T.specs) makeTarget(s, T.kind);
  beep(660, 0.04, 'triangle', 0.06);
}

function shoot(res) {
  const T = game.T, R = game.R;
  if (!T) return;
  if (T.state === 'read') { T.early++; return; }
  if (T.state !== 'aim') return;
  const now = performance.now();
  if (!res || res.kind !== 'target') { T.miss++; R.misses++; return; }
  const g = res.obj;
  if (g.userData.spec.correct) {
    T.tHit = now; T.state = 'done';
    R.combo++; R.maxCombo = Math.max(R.maxCombo, R.combo); R.hits++;
    const gain = 100 + 20 * Math.min(R.combo - 1, 10);
    R.score += gain;
    game.fb = { text: `${T.kind === 'monster' ? '처치!' : '명중!'} +${gain} EXP`, color: '#9dffb0', until: now + 700 };
    beep(988, 0.09, 'sine', 0.12);
    popAndClear(g, now);
    logTrial(T, true);
    game.T = null;
    game.nextTrialAt = now + S.itiMs;
  } else {
    T.wrong++; R.wrongs++; R.combo = 0;
    game.fb = { text: '목표가 아니에요!', color: '#ff8b7b', until: now + 600 };
    beep(160, 0.15, 'sawtooth', 0.06);
    flash(g, now);
  }
}

// 효과
const fx = [];
function popAndClear(hit, now) {
  for (const g of [...targetGroup.children]) if (g !== hit) targetGroup.remove(g);
  colliders = [];
  fx.push({ obj: hit, t0: now, dur: 180, base: hit.scale.x, kind: 'pop' });
}
function flash(g, now) {
  g.userData.halo.visible = true;
  fx.push({ obj: g, t0: now, dur: 280, kind: 'flash' });
}
function recoil(gun, now) {
  if (!gun) return;
  gun.userData.flash.visible = true;
  fx.push({ obj: gun, t0: now, dur: 130, kind: 'recoil' });
}
function updateFx(now) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], k = Math.min(1, (now - f.t0) / f.dur);
    if (f.kind === 'pop') {
      f.obj.scale.setScalar(f.base * (1 + 0.6 * k));
      if (k >= 1) targetGroup.remove(f.obj);
    } else if (f.kind === 'flash') {
      if (k >= 1) f.obj.userData.halo.visible = false;
    } else if (f.kind === 'recoil') {
      f.obj.rotation.x = 0.35 * (1 - k);
      if (k > 0.4) f.obj.userData.flash.visible = false;
    }
    if (k >= 1) fx.splice(i, 1);
  }
  // 몬스터는 살짝 둥실거린다
  for (const g of targetGroup.children) {
    const b = g.userData.body;
    if (b) b.position.y = Math.sin(now / 280 + g.userData.phase) * 0.05;
  }
}

function endRound() {
  game.T = null;
  clearTargets();
  hud.group.visible = false;
  beep(523, 0.15, 'sine', 0.1);
  setTimeout(() => beep(784, 0.25, 'sine', 0.1), 150);
  const R = game.R;
  R.wallSec = r1((performance.now() - R.startT) / 1000);
  game.phase = 'clear';
  panel.show({
    title: `${stageName(R)} 클리어!`,
    lines: [`걸린 시간 ${Math.round(R.wallSec)}초 · EXP ${R.score}`, `최대 콤보 ${R.maxCombo} · 빗나간 사격 ${R.wrongs + R.misses}`],
    buttons: [{
      label: R.practice ? '다음으로' : '모닥불에서 쉬기',
      onClick: () => {
        if (R.practice) { game.ri++; nextOrFinish(); return; }
        game.phase = 'survey';
        const title = '모닥불에서 쉬는 중';
        askScale(title, '지금 눈이 얼마나 피로한가요?', (eye) => {
          R.eye = eye;
          askScale(title, '지금 얼마나 어지러운가요?', (dz) => {
            R.dizzy = dz;
            logRound(R);
            game.ri++;
            nextOrFinish();
          });
        });
      },
    }],
  });
}
function askScale(title, q, cb) {
  panel.show({
    title, lines: [q],
    buttons: [1, 2, 3, 4, 5, 6, 7].map((v) => ({ label: String(v), onClick: () => cb(v) })),
    footerL: '1 = 전혀 없음', footerR: '7 = 매우 심함',
  });
}
function nextOrFinish() {
  if (game.ri < game.rounds.length) showIntro();
  else askFinals();
}
function askFinals() {
  game.phase = 'final';
  const seen = [];
  for (const r of game.rounds) if (!r.practice && !seen.includes(r.cond)) seen.push(r.cond);
  const btns = (cb) => seen.map((c, i) => ({ label: `${i + 1}단계`, onClick: () => cb(c) }));
  panel.show({
    title: '마지막 질문 (1/2)', lines: ['어느 단계에서 눈이 가장 편했나요?'],
    buttons: btns((c1) => {
      panel.show({
        title: '마지막 질문 (2/2)', lines: ['어느 단계가 가장 하기 좋았나요?'],
        buttons: btns((c2) => {
          for (const row of log.rounds) {
            row.pref_comfort = row.cond === c1 ? 1 : 0;
            row.pref_play = row.cond === c2 ? 1 : 0;
          }
          log.prefs = { comfort: c1, play: c2 };
          saveSession();
          finish();
        }),
      });
    }),
  });
}
function finish() {
  game.phase = 'done';
  saveSession();
  beep(659, 0.12, 'sine', 0.1);
  setTimeout(() => beep(880, 0.12, 'sine', 0.1), 130);
  setTimeout(() => beep(1175, 0.3, 'sine', 0.1), 260);
  panel.show({
    title: '튜토리얼 완료! 레벨 업',
    lines: ['총잡이의 기본기를 익혔습니다.', '이제 진짜 모험을 떠날 수 있어요.', '(기록이 저장되었습니다)'],
    buttons: [{ label: game.mode === 'vr' ? 'VR 나가기' : '메뉴로', onClick: abortToMenu }],
  });
}

// 일시정지: 진행 중이던 시행은 paused=1로 기록에서 빼고, 계속하면 새 목표부터 시작한다
function togglePause() {
  if (game.phase === 'paused') { resumeGame(); return; }
  if (!['weapon', 'intro', 'play', 'clear', 'survey', 'final'].includes(game.phase)) return;
  const from = { phase: game.phase, spec: panel.mesh.visible ? panel.spec : null };
  if (game.phase === 'play') {
    if (game.T) logTrial(game.T, false, true);
    game.T = null;
    clearTargets();
    hud.group.visible = false;
  }
  game.pausedFrom = from;
  game.phase = 'paused';
  panel.show({
    title: '일시정지',
    lines: from.phase === 'play' ? ['계속하면 새 목표부터 시작합니다.'] : ['계속하면 하던 화면으로 돌아갑니다.'],
    buttons: [
      { label: '계속하기', onClick: resumeGame },
      { label: game.mode === 'vr' ? 'VR 나가기' : '그만하기', onClick: abortToMenu },
    ],
    footerL: '지금까지 기록은 저장되어 있습니다',
  });
}
function resumeGame() {
  const from = game.pausedFrom;
  game.pausedFrom = null;
  game.phase = from.phase;
  if (from.phase === 'play') {
    panel.hide();
    game.nextTrialAt = performance.now() + 800;
    hud.key = '';
    hud.group.visible = true;
  } else if (from.spec) {
    panel.show(from.spec);
  }
}

// 중간에 그만두거나 끝났을 때
function abortToMenu() {
  if (game.mode === 'vr' && game.xrSession) { game.xrSession.end(); return; } // onSessionEnd에서 이어짐
  stopGame();
}
function stopGame() {
  if (game.phase === 'play' && game.T) logTrial(game.T, false);
  if (game.sessionId && (log.trials.length || log.rounds.length)) saveSession();
  game.phase = 'idle'; game.mode = null; game.T = null; game.R = null;
  panel.hide();
  hud.group.visible = false;
  clearTargets();
  for (const c of controllers) c.userData.dot.visible = false;
  resetDeskCamera();
  $('help').hidden = true;
  $('menu').hidden = false;
  renderCvs();
  renderHistory();
}

// ============================================================
// 기록
// ============================================================
const r1 = (x) => Math.round(x * 10) / 10;
function logTrial(T, completed, paused = false) {
  const R = game.R;
  log.trials.push({
    session: game.sessionId, participant: S.pid, order: S.order, mode: game.mode,
    fps: (game.xrSession && game.xrSession.frameRate) || '',
    practice: R.practice ? 1 : 0, round_pos: R.pos, cond: R.cond, cond_name: COND[R.cond].name,
    hud_dist_m: R.hudDist, target_dist_m: S.target, trial: T.n, target_kind: T.kind, command: T.cmd,
    target_az_deg: T.specs[0].az, target_el_deg: T.specs[0].el,
    t_in_round_ms: r1(T.tCmd - R.startT),
    read_ms: T.tConfirm ? r1(T.tConfirm - T.tCmd) : '',
    aim_ms: T.tHit ? r1(T.tHit - T.tConfirm) : '',
    total_ms: T.tHit ? r1(T.tHit - T.tCmd) : '',
    wrong_hits: T.wrong, misses: T.miss, early_shots: T.early,
    combo_after: R.combo, score_after: R.score, completed: completed ? 1 : 0,
    paused: paused ? 1 : 0,
  });
  saveSession();
}
function logRound(R) {
  log.rounds.push({
    session: game.sessionId, participant: S.pid, order: S.order, mode: game.mode,
    round_pos: R.pos, cond: R.cond, cond_name: COND[R.cond].name, hud_dist_m: R.hudDist,
    goal: R.goal, monster_trials: R.monsters, wall_sec: R.wallSec,
    hits: R.hits, wrong_hits: R.wrongs, misses: R.misses,
    score: R.score, max_combo: R.maxCombo, eye_fatigue: R.eye, dizziness: R.dizzy,
    pref_comfort: '', pref_play: '',
  });
  saveSession();
}
function saveSession() {
  lsSet('hudexp.s.' + game.sessionId, JSON.stringify({
    sessionId: game.sessionId, settings: S, mode: game.mode, done: game.phase === 'done', log,
  }));
}
function listSaved() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hudexp.s.')) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch { /* 무시 */ } }
    }
  } catch { /* 저장소 사용 불가 */ }
  return out.sort((a, b) => b.sessionId.localeCompare(a.sessionId));
}
function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// 조건별 요약 (연습 제외, 끝낸 시행만)
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = (x) => (Number.isFinite(x) ? Math.round(x) : '–');
function summaryHTML(sess) {
  const tr = sess.log.trials.filter((t) => !t.practice && t.completed);
  const rows = ['A', 'B', 'C'].map((c) => {
    const ts = tr.filter((t) => t.cond === c);
    const rd = sess.log.rounds.filter((r) => r.cond === c);
    return `<tr><td>${c} ${COND[c].label}</td><td>${ts.length}</td>
      <td>${fmt(median(ts.map((t) => t.read_ms)))}</td><td>${fmt(median(ts.map((t) => t.aim_ms)))}</td>
      <td>${ts.reduce((s, t) => s + t.wrong_hits, 0)}</td>
      <td>${rd.length ? rd.map((r) => r.eye_fatigue).join('/') : '–'}</td>
      <td>${rd.length ? rd.map((r) => r.dizziness).join('/') : '–'}</td></tr>`;
  }).join('');
  const pref = sess.log.prefs ? `<p class="note">가장 편했던 단계: ${sess.log.prefs.comfort} · 가장 하기 좋았던 단계: ${sess.log.prefs.play}</p>` : '';
  return `<p class="note">${sess.settings.pid} · 순서 ${sess.settings.order} · ${sess.sessionId}</p>
    <table><thead><tr><th>조건</th><th>시행</th><th>읽기 중앙값(ms)</th><th>조준 중앙값(ms)</th><th>오답</th><th>눈 피로</th><th>어지러움</th></tr></thead>
    <tbody>${rows}</tbody></table>${pref}`;
}
function renderCvs() {
  const last = listSaved()[0];
  $('resultsCard').hidden = !last;
  if (last) $('summary').innerHTML = summaryHTML(last);
}
function renderHistory() {
  const list = listSaved();
  const box = $('history');
  if (!list.length) { box.textContent = '아직 없음'; return; }
  box.innerHTML = list.map((s, i) => `<div class="hist-item">
      <div class="meta"><b>${s.settings.pid}</b> · ${s.settings.order} · ${s.mode === 'vr' ? 'VR' : '브라우저'} · ${s.sessionId}
        · 시행 ${s.log.trials.length}개 · ${s.done ? '완료' : '중단'}</div>
      <div class="btns"><button class="small" data-i="${i}" data-k="trials">시행 CSV</button>
        <button class="small" data-i="${i}" data-k="rounds">스테이지 CSV</button></div></div>`).join('');
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = list[+b.dataset.i];
    const rows = b.dataset.k === 'trials' ? s.log.trials : s.log.rounds;
    if (!rows.length) { $('status').textContent = '내려받을 기록이 없습니다.'; return; }
    download(`${s.settings.pid}_${s.settings.order}_${b.dataset.k}_${s.sessionId}.csv`, toCSV(rows));
  };
}

// ============================================================
// 매 프레임
// ============================================================
function hudState(now) {
  const R = game.R, T = game.T;
  const st = { kills: R.hits, goal: R.goal, score: R.score, combo: R.combo };
  const fb = game.fb && now < game.fb.until ? game.fb : null;
  if (T) {
    if (T.state === 'read') { st.cmd = T.cmd; st.prompt = game.mode === 'vr' ? 'A/X 버튼으로 확인' : 'Space로 확인'; }
    else {
      if (S.keepCmd) { st.cmd = T.cmd; st.cmdDim = true; }
      st.prompt = game.mode === 'vr' ? '방아쇠로 쏘세요' : '클릭으로 쏘세요';
      st.promptColor = '#f7dfa6';
    }
  }
  if (fb) { st.prompt = fb.text; st.promptColor = fb.color; }
  return st;
}

function loop() {
  const now = performance.now();
  if (renderer.xr.isPresenting && renderer.xr.updateCamera) renderer.xr.updateCamera(camera);
  else if (game.mode !== 'vr') camera.rotation.set(-mouse.pitch, -mouse.yaw, 0, 'YXZ');
  scene.updateMatrixWorld();

  if (game.phase === 'starting' && --game.startFrames <= 0) { anchorField(); showWeapons(); }
  if (game.phase === 'play' && !game.T && now >= game.nextTrialAt) {
    if (game.R.hits >= game.R.goal) endRound();
    else newTrial(now);
  }
  if (game.phase === 'play') {
    const st = hudState(now);
    const key = JSON.stringify(st);
    if (key !== hud.key) { hud.key = key; drawHUD(st); }
    // 확인 뒤 표적을 찾는 동안에는 HUD를 숨겨 표적을 가리지 않게 한다
    hud.group.visible = !(S.hideHud && game.T && game.T.state === 'aim');
  }
  placeHUD();
  if (game.mode === 'vr') pollButtons();
  updateRays();
  updateFx(now);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ============================================================
// 시작 버튼
// ============================================================
const fontsReady = Promise.race([
  Promise.all([document.fonts.load(`900 150px "Noto Sans KR"`), document.fonts.load(`700 48px "Noto Sans KR"`), document.fonts.load(`500 36px "Noto Sans KR"`)]),
  new Promise((r) => setTimeout(r, 3000)),
]).catch(() => {});

async function enterVR() {
  try {
    await fontsReady;
    initAudio();
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    session.addEventListener('end', onSessionEnd);
    await renderer.xr.setSession(session);
    try { renderer.xr.setFoveation(0); } catch { /* 무시 */ }
    try {
      if (session.updateTargetFrameRate && session.supportedFrameRates) {
        const rates = [...session.supportedFrameRates];
        await session.updateTargetFrameRate(rates.includes(90) ? 90 : Math.max(...rates));
      }
    } catch { /* 기본 주사율 사용 */ }
    game.xrSession = session;
    startSession('vr');
  } catch (e) {
    $('status').textContent = 'VR 시작 실패: ' + e.message;
  }
}
function onSessionEnd() {
  game.xrSession = null;
  stopGame();
}

$('btnVR').onclick = enterVR;
$('btnDesk').onclick = async () => { await fontsReady; initAudio(); startSession('desktop'); };

(async () => {
  fillForm();
  renderCvs();
  renderHistory();
  anchorField();
  let ok = false;
  try { ok = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { ok = false; }
  $('btnVR').disabled = !ok;
  $('status').textContent = ok
    ? 'VR 준비됨. 헤드셋을 쓰고 VR로 시작을 누르세요.'
    : (window.isSecureContext ? '이 브라우저에서는 VR을 쓸 수 없습니다. Quest 브라우저에서 여세요.' : 'VR은 HTTPS 주소에서만 됩니다.');
})();

// 테스트용: 주소에 ?debug 가 있을 때만 정답 자동 사격 도우미를 연다
if (location.search.includes('debug')) {
  window.__dbg = {
    game, log: () => log, tick: () => loop(), click: (i) => panel.click(i), panelTitle: () => panel.spec && panel.spec.title,
    hitCorrect() {
      const g = targetGroup.children.find((x) => x.userData.spec && x.userData.spec.correct);
      if (g) shoot({ kind: 'target', obj: g });
      return !!g;
    },
  };
}
