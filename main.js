import * as THREE from 'three';
import {
  DEG, initArt, TX, buildWorld, canvasTex, drawQuest, drawPanel,
  makeShield, makeMonster, makeGun, makeMarker, makeHalo, makeBurst, makeFloatText,
} from './art.js';

// ============================================================
// 상수
// ============================================================
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
  { label: '검', icon: 'sword', locked: true },
  { label: '활', icon: 'bow', locked: true },
  { label: '지팡이', icon: 'staff', locked: true },
  { label: '총', icon: 'gun', locked: false },
];
// 표적이 나올 수 있는 자리 (정면 기준 방위각, 올려본 각)
const SLOTS = [];
for (const el of [0, 12]) for (const az of [-30, -15, 0, 15, 30]) SLOTS.push({ az, el });

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
initArt(renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
const DESK_EYE = new THREE.Vector3(0, 1.6, 0);
camera.position.copy(DESK_EYE);
scene.add(camera);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 배경: 스테이지 시작 때 정면 방향에 맞춰 바닥에 놓는다
const decor = new THREE.Group();
scene.add(decor);
const world = buildWorld(scene, decor);

// 표적 영역: 스테이지 시작 때 머리 위치와 정면 방향에 맞춰 놓는다
const field = new THREE.Group();
scene.add(field);
const markerGroup = new THREE.Group();
const targetGroup = new THREE.Group();
field.add(markerGroup, targetGroup);
{
  const fill = new THREE.DirectionalLight(0xfff1dc, 1.3); // 사용자 뒤에서 표적 앞면을 비춘다
  fill.position.set(0.5, 3, 6);
  fill.target.position.set(0, 0, -6);
  field.add(fill, fill.target);
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

function buildMarkers() {
  markerGroup.clear();
  const r = targetRadius();
  for (const s of SLOTS) {
    const m = makeMarker();
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
// 표적: 문양 방패 과녁 / 몬스터 (반지름 1 단위 안)
// ============================================================
const HIT_GEO = new THREE.CircleGeometry(1, 32);
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
let colliders = []; // 레이 판정 대상

function makeTarget(spec, kind) {
  const g = new THREE.Group();
  const halo = makeHalo();
  halo.position.z = -0.15; halo.visible = false;
  const hit = new THREE.Mesh(HIT_GEO, hitMat); // 판정용 (보이지 않음)
  hit.position.z = 0.2;
  g.add(halo, hit);
  if (kind === 'monster') {
    const m = makeMonster(MONSTERS[spec.s].k, COLORS[spec.c].hex);
    g.add(m.root);
    g.userData.body = m.body;
    g.userData.phase = Math.random() * Math.PI * 2;
  } else {
    g.add(makeShield(SHAPES[spec.s].k, COLORS[spec.c].hex));
  }
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
// HUD (퀘스트 창): 머리를 따라다니고, 시선 아래 hudDown°, 시각각 hudAngle°로 크기 고정
// ============================================================
const hud = (() => {
  const { ctx, tex } = canvasTex(1024, 512);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  mesh.renderOrder = 999;
  const group = new THREE.Group();
  group.add(mesh);
  group.visible = false;
  scene.add(group);
  return { ctx, tex, mesh, group, dist: 1.4, key: '' };
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
  drawQuest(hud.ctx, 1024, 512, st);
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
  const { ctx, tex } = canvasTex(W, H);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  mesh.renderOrder = 1000;
  mesh.visible = false;
  scene.add(mesh);
  const p = { W, H, ctx, tex, mesh, spec: null, rects: [], hover: -1, t0: 0 };

  p.show = (spec) => {
    p.spec = spec; p.hover = -1;
    const b = spec.buttons || [];
    const cards = b.some((x) => x.icon);
    const n = b.length, pad = 48, gap = cards ? 20 : 16;
    const bh = cards ? 250 : b.some((x) => x.sub) ? 130 : 110;
    const y = H - pad - bh - (spec.footerL || spec.footerR ? 44 : 0);
    const bw = Math.min(360, (W - 2 * pad - gap * (n - 1)) / n);
    let x = (W - (bw * n + gap * (n - 1))) / 2;
    p.rects = b.map(() => { const r = { x, y, w: bw, h: bh }; x += bw + gap; return r; });
    p.draw();
    if (!mesh.visible) p.t0 = performance.now(); // 새로 나타날 때만 살짝 커지며 등장
    mesh.visible = true;
    placePanel();
  };
  p.hide = () => { mesh.visible = false; p.spec = null; p.rects = []; };
  p.draw = () => { drawPanel(ctx, W, H, p.spec, p.rects, p.hover); tex.needsUpdate = true; };
  p.pick = (uv) => {
    const x = uv.x * W, y = (1 - uv.y) * H;
    return p.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  };
  p.setHover = (i) => {
    if (p.spec && p.spec.buttons && p.spec.buttons[i] && p.spec.buttons[i].disabled) i = -1;
    if (p.spec && i !== p.hover) { p.hover = i; p.draw(); if (i >= 0) beep(1400, 0.02, 'sine', 0.03); }
  };
  p.click = (i) => {
    const b = p.spec && p.spec.buttons && p.spec.buttons[i];
    if (!b) return;
    if (b.disabled) { beep(180, 0.12, 'square', 0.05); if (b.onLocked) b.onLocked(); return; }
    chime([880, 1320], 0.05, 0.08);
    b.onClick();
  };
  p.animate = (now) => {
    if (!mesh.visible) return;
    const k = Math.min(1, (now - p.t0) / 180), e = 1 - (1 - k) ** 3;
    mesh.scale.setScalar(0.92 + 0.08 * e);
    mesh.material.opacity = e;
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
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.3, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
  } catch { actx = null; }
}
function beep(freq, dur = 0.08, type = 'sine', vol = 0.12, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function chime(freqs, step = 0.07, vol = 0.1, dur = 0.22) {
  freqs.forEach((f, i) => { beep(f, dur, 'sine', vol, i * step); beep(f * 2, dur * 0.7, 'sine', vol * 0.25, i * step); });
}
function bang() {
  if (!actx || !noiseBuf) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.22);
  const g = actx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t); src.stop(t + 0.28);
  const o = actx.createOscillator(), og = actx.createGain(); // 낮은 쿵
  o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(og).connect(actx.destination); o.start(t); o.stop(t + 0.2);
}

// ============================================================
// 입력: 컨트롤러 (VR) / 마우스 (브라우저)
// ============================================================
const raycaster = new THREE.Raycaster();
const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const MUZZLE = 0.24; // 컨트롤러 원점에서 총구까지

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

// 총구에서 나가는 마법 조준선 (앞으로 갈수록 흐려짐)
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
laserGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.86, 0.55, 0.3, 0.22, 0.1], 3));
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  line.position.z = -MUZZLE;
  line.scale.z = 10;
  const gun = makeGun();
  c.add(line, gun);
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.reticle, color: 0xffd98a, depthTest: false, transparent: true, fog: false }));
  reticle.renderOrder = 1001;
  reticle.visible = false;
  scene.add(reticle);
  c.userData = { line, reticle, gun, src: null, prevBtn: false, prevPause: false };
  c.visible = false;
  c.addEventListener('connected', (e) => { c.userData.src = e.data; c.visible = !e.data.hand; });
  c.addEventListener('disconnected', () => { c.userData.src = null; c.visible = false; reticle.visible = false; });
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

function updateRays(now) {
  let hover = -1;
  if (game.mode === 'vr') {
    for (const c of controllers) {
      if (!c.visible) continue;
      const res = castScene(controllerRay(c));
      c.userData.line.scale.z = Math.max(0.01, (res ? res.dist : 12) - MUZZLE);
      const ret = c.userData.reticle;
      ret.visible = !!res;
      if (res) {
        ret.position.copy(res.point);
        ret.scale.setScalar(Math.max(0.012, res.dist * 0.03));
        ret.material.color.set(res.kind === 'target' ? 0xffffff : 0xffd98a);
      }
      if (res && res.kind === 'panel') hover = panel.pick(res.uv);
      const gem = c.userData.gun.userData;
      const s = 0.5 + 0.5 * Math.sin(now * 0.004 + controllers.indexOf(c));
      gem.gem.color.setRGB(0.3 + 0.4 * s, 0.9 + 0.1 * s, 1);
      gem.glow.material.opacity = 0.35 + 0.35 * s;
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
    kicker: '모험의 시작',
    title: '무기를 고르세요',
    lines: [msg || '모험을 떠나기 전에 쓸 무기를 하나 고릅니다.'],
    buttons: WEAPONS.map((w) => ({
      label: w.label, icon: w.icon, sub: w.locked ? '잠김' : '선택 가능', disabled: w.locked,
      onLocked: () => showWeapons('아직 열리지 않은 무기입니다. 총을 골라 보세요.'),
      onClick: () => {
        panel.show({
          kicker: '무기 획득',
          title: '마법 리볼버',
          lines: ['룬이 새겨진 총. 멀리 있는 적도 한 발에 정확하게.', '훈련장에서 쓰는 법을 익혀 봅시다.'],
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
    kicker: '총잡이 훈련장',
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
  beep(660, 0.05, 'triangle', 0.06);
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
    chime(T.kind === 'monster' ? [784, 1175] : [1047, 1568], 0.05, 0.09, 0.18);
    popAndClear(g, gain, now);
    logTrial(T, true);
    game.T = null;
    game.nextTrialAt = now + S.itiMs;
  } else {
    T.wrong++; R.wrongs++; R.combo = 0;
    game.fb = { text: '목표가 아니에요!', color: '#ff8b7b', until: now + 600 };
    beep(160, 0.18, 'sawtooth', 0.06);
    flash(g, now);
  }
}

// 효과
const fx = [];   // 표적 튀기기·반동 같은 짧은 애니메이션
const fxObj = []; // 장면에 잠깐 붙였다가 떼는 입자·글자
function addFxObj(o) { scene.add(o.obj); fxObj.push(o); }
const _w = new THREE.Vector3();
function popAndClear(hit, gain, now) {
  for (const g of [...targetGroup.children]) if (g !== hit) targetGroup.remove(g);
  colliders = [];
  fx.push({ obj: hit, t0: now, dur: 180, base: hit.scale.x, kind: 'pop' });
  // 효과는 다음 지령(itiMs 뒤)보다 먼저 끝나게 짧게 둔다
  const r = targetRadius();
  hit.getWorldPosition(_w);
  const toEye = camera.getWorldPosition(new THREE.Vector3()).sub(_w).normalize().multiplyScalar(r * 0.8);
  addFxObj(makeBurst(_w.clone().add(toEye), COLORS[hit.userData.spec.c].hex, r, now));
  addFxObj(makeFloatText(`+${gain}`, _w.clone().setY(_w.y + r * 0.8), r, now));
}
function flash(g, now) {
  g.userData.halo.visible = true;
  fx.push({ obj: g, t0: now, dur: 280, kind: 'flash' });
}
function recoil(gun, now) {
  if (!gun) return;
  gun.userData.flash.visible = true;
  gun.userData.flash.material.rotation = Math.random() * Math.PI;
  fx.push({ obj: gun, t0: now, dur: 140, kind: 'recoil', drum0: gun.userData.drum.rotation.y });
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
      f.obj.userData.drum.rotation.y = f.drum0 + (Math.PI / 3) * k;
      if (k > 0.4) f.obj.userData.flash.visible = false;
    }
    if (k >= 1) fx.splice(i, 1);
  }
  for (let i = fxObj.length - 1; i >= 0; i--) {
    const o = fxObj[i];
    if (now - o.t0 >= o.dur) { scene.remove(o.obj); o.dispose(); fxObj.splice(i, 1); } else o.update(now);
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
  chime([523, 659, 784], 0.11, 0.09, 0.3);
  const R = game.R;
  R.wallSec = r1((performance.now() - R.startT) / 1000);
  game.phase = 'clear';
  panel.show({
    kicker: '스테이지 클리어',
    title: `${stageName(R)} 클리어!`,
    stats: [
      { label: '걸린 시간', value: `${Math.round(R.wallSec)}초` },
      { label: '경험치', value: R.score },
      { label: '최대 콤보', value: R.maxCombo },
    ],
    footerL: `빗나간 사격 ${R.wrongs + R.misses}`,
    buttons: [{
      label: R.practice ? '다음으로' : '모닥불에서 쉬기',
      onClick: () => {
        if (R.practice) { game.ri++; nextOrFinish(); return; }
        game.phase = 'survey';
        askScale('지금 눈이 얼마나 피로한가요?', (eye) => {
          R.eye = eye;
          askScale('지금 얼마나 어지러운가요?', (dz) => {
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
function askScale(q, cb) {
  panel.show({
    kicker: '휴식',
    title: '모닥불에서 쉬는 중',
    lines: [q],
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
    kicker: '튜토리얼 정리', title: '마지막 질문 (1/2)', lines: ['어느 단계에서 눈이 가장 편했나요?'],
    buttons: btns((c1) => {
      panel.show({
        kicker: '튜토리얼 정리', title: '마지막 질문 (2/2)', lines: ['어느 단계가 가장 하기 좋았나요?'],
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
  chime([659, 880, 1175, 1568], 0.12, 0.1, 0.35);
  panel.show({
    kicker: '튜토리얼 완료',
    title: '레벨 업!',
    glow: true,
    lines: ['총잡이의 기본기를 익혔습니다.', '이제 진짜 모험을 떠날 수 있어요.'],
    footerL: '기록이 저장되었습니다',
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
  for (const c of controllers) c.userData.reticle.visible = false;
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
  updateRays(now);
  updateFx(now);
  panel.animate(now);
  world.update(now);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ============================================================
// 시작 버튼
// ============================================================
const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load('900 150px "Noto Sans KR"'), document.fonts.load('700 48px "Noto Sans KR"'),
    document.fonts.load('500 36px "Noto Sans KR"'), document.fonts.load('900 58px "Noto Serif KR"'),
  ]),
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
    look: (yawDeg, pitchDeg = 0) => { mouse.yaw = yawDeg * DEG; mouse.pitch = pitchDeg * DEG; },
    // 모든 몬스터(또는 과녁)를 한 번에 늘어놓아 모양을 확인한다
    showcase(kind = 'monster') {
      clearTargets();
      for (let s = 0; s < 4; s++) for (let c = 0; c < 2; c++) {
        const slot = SLOTS[c * 5 + s];
        makeTarget({ c: (s + c * 2) % 4, s, az: slot.az, el: slot.el, correct: false }, kind);
      }
    },
    hitCorrect() {
      const g = targetGroup.children.find((x) => x.userData.spec && x.userData.spec.correct);
      if (g) shoot({ kind: 'target', obj: g });
      return !!g;
    },
  };
}
