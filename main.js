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
const SHAPES = [
  { k: 'circle', word: '원' },
  { k: 'square', word: '네모' },
  { k: 'triangle', word: '세모' },
  { k: 'star', word: '별' },
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
  roundSec: 60, roundsPer: 1, practice: true, practiceSec: 30,
  hudAngle: 20, hudDown: 10, nTargets: 4, targetAngle: 5, itiMs: 400, keepCmd: true,
};
const FIELDS = [
  ['pid', 'text'], ['order', 'text'],
  ['near', 'num'], ['focal', 'num'], ['target', 'num'],
  ['roundSec', 'num'], ['roundsPer', 'num'], ['practice', 'check'], ['practiceSec', 'num'],
  ['hudAngle', 'num'], ['hudDown', 'num'], ['nTargets', 'num'], ['targetAngle', 'num'],
  ['itiMs', 'num'], ['keepCmd', 'check'],
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
scene.background = new THREE.Color(0x0b1020);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 200);
const DESK_EYE = new THREE.Vector3(0, 1.6, 0);
camera.position.copy(DESK_EYE);
scene.add(camera);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 바닥
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshBasicMaterial({ color: 0x0e152a }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
  scene.add(new THREE.GridHelper(100, 100, 0x2b3c6b, 0x18223f));
}

// 표적 영역: 라운드 시작 때 머리 위치와 정면 방향에 맞춰 놓는다
const field = new THREE.Group();
scene.add(field);
const markerGroup = new THREE.Group();
const targetGroup = new THREE.Group();
field.add(markerGroup, targetGroup);

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

const ringGeo = new THREE.RingGeometry(1.08, 1.16, 64);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x5f7fb8, transparent: true, opacity: 0.35 });
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
  buildMarkers();
}

// ============================================================
// 표적
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
  rim: new THREE.RingGeometry(0.93, 1.0, 48),
  circle: new THREE.CircleGeometry(0.6, 48),
  square: new THREE.PlaneGeometry(1.0, 1.0),
  triangle: new THREE.CircleGeometry(0.74, 3, Math.PI / 2),
  star: starGeo(0.76, 0.32),
};
const rimMat = new THREE.MeshBasicMaterial({ color: 0x8fa3cc });
const shapeMats = COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c.hex }));
let boards = []; // 레이 판정 대상

function makeTarget(spec) {
  const g = new THREE.Group();
  const boardMat = new THREE.MeshBasicMaterial({ color: 0x1b2337 });
  const board = new THREE.Mesh(GEO.board, boardMat);
  const rim = new THREE.Mesh(GEO.rim, rimMat);
  rim.position.z = 0.04;
  const shape = new THREE.Mesh(GEO[SHAPES[spec.s].k], shapeMats[spec.c]);
  shape.position.z = 0.08;
  g.add(board, rim, shape);
  g.scale.setScalar(targetRadius());
  placeOnSphere(g, spec.az, spec.el, S.target);
  g.userData = { spec, boardMat };
  board.userData.target = g;
  boards.push(board);
  targetGroup.add(g);
  return g;
}
function clearTargets() {
  targetGroup.clear();
  boards = [];
}

const ri = (n) => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// 정답 하나 + 색만 같은 것 + 모양만 같은 것 + 나머지 무작위 (모두 다른 조합)
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
const cmdOf = (spec) => COLORS[spec.c].word + ' ' + SHAPES[spec.s].word;

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

// ============================================================
// HUD: 머리를 따라다니고, 시선 아래 hudDown°, 시각각 hudAngle°로 크기 고정
// ============================================================
const hud = (() => {
  const { canvas, ctx, tex } = canvasTexture(1024, 512);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
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
  roundRect(c, 10, 10, W - 20, H - 20, 40);
  c.fillStyle = 'rgba(8,12,24,0.82)'; c.fill();
  c.lineWidth = 5; c.strokeStyle = 'rgba(110,160,255,0.7)'; c.stroke();
  c.textBaseline = 'middle';
  c.font = `700 44px ${FONT}`; c.fillStyle = '#bcd0ff';
  c.textAlign = 'left';
  c.fillStyle = st.paused ? '#6b7899' : '#ffd36b'; // 멈춰 있을 때는 흐리게
  c.fillText(`남은 시간 ${st.sec}`, 50, 72);
  c.fillStyle = '#bcd0ff';
  c.textAlign = 'center'; c.fillText(`점수 ${st.score}`, W / 2 + 40, 72);
  c.textAlign = 'right'; c.fillText(`콤보 ${st.combo}`, W - 50, 72);
  if (st.cmd) {
    c.textAlign = 'center';
    c.font = `900 150px ${FONT}`;
    c.fillStyle = st.cmdDim ? 'rgba(255,255,255,0.4)' : '#ffffff';
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
// 월드 패널 (안내, 설문)
// ============================================================
const panel = (() => {
  const W = 1024, H = 640;
  const { canvas, ctx, tex } = canvasTexture(W, H);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2 * H / W),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 1000;
  mesh.visible = false;
  scene.add(mesh);
  const p = { W, H, canvas, ctx, tex, mesh, spec: null, rects: [], hover: -1 };

  p.show = (spec) => {
    p.spec = spec; p.hover = -1;
    const b = spec.buttons || [];
    const n = b.length, pad = 48, gap = 16, bh = 110;
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
    roundRect(c, 8, 8, W - 16, H - 16, 36);
    c.fillStyle = 'rgba(14,20,38,0.94)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = 'rgba(110,160,255,0.6)'; c.stroke();
    c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = '#ffffff'; c.font = `900 60px ${FONT}`;
    c.fillText(s.title || '', W / 2, 92);
    c.font = `500 36px ${FONT}`; c.fillStyle = '#c9d6ff';
    (s.lines || []).forEach((ln, i) => c.fillText(ln, W / 2, 178 + i * 54));
    (s.buttons || []).forEach((b, i) => {
      const r = p.rects[i];
      roundRect(c, r.x, r.y, r.w, r.h, 22);
      c.fillStyle = i === p.hover ? '#4f7cff' : '#28335a'; c.fill();
      c.lineWidth = 3; c.strokeStyle = '#6d8fe0'; c.stroke();
      c.fillStyle = '#ffffff'; c.font = `700 ${b.label.length > 4 ? 38 : 48}px ${FONT}`;
      c.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 2);
    });
    c.font = `500 30px ${FONT}`; c.fillStyle = '#8d9bc4';
    if (s.footerL) { c.textAlign = 'left'; c.fillText(s.footerL, 56, H - 46); }
    if (s.footerR) { c.textAlign = 'right'; c.fillText(s.footerR, W - 56, H - 46); }
    tex.needsUpdate = true;
  };
  p.pick = (uv) => {
    const x = uv.x * W, y = (1 - uv.y) * H;
    return p.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  };
  p.setHover = (i) => { if (p.spec && i !== p.hover) { p.hover = i; p.draw(); } };
  p.click = (i) => {
    const b = p.spec && p.spec.buttons && p.spec.buttons[i];
    if (b) { beep(880, 0.05, 'sine', 0.1); b.onClick(); }
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
let actx = null;
function initAudio() {
  try { actx = actx || new AudioContext(); actx.resume(); } catch { actx = null; }
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
  const t = rc.intersectObjects(boards, false)[0];
  if (t) return { kind: 'target', dist: t.distance, point: t.point, obj: t.object.userData.target };
  return null;
}

const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
const controllers = [];
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const line = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0x66ddff }));
  line.scale.z = 10;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.08), new THREE.MeshBasicMaterial({ color: 0x8899bb }));
  tip.position.z = 0.03;
  c.add(line, tip);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  dot.renderOrder = 1001;
  dot.visible = false;
  scene.add(dot);
  c.userData = { line, dot, src: null, prevBtn: false };
  c.visible = false;
  c.addEventListener('connected', (e) => { c.userData.src = e.data; c.visible = !e.data.hand; });
  c.addEventListener('disconnected', () => { c.userData.src = null; c.visible = false; dot.visible = false; });
  c.addEventListener('selectstart', () => { if (c.visible) onShoot(controllerRay(c)); });
  scene.add(c);
  controllers.push(c);
}
function controllerRay(c) {
  _o.setFromMatrixPosition(c.matrixWorld);
  _d.set(0, 0, -1).transformDirection(c.matrixWorld);
  raycaster.set(_o, _d);
  return raycaster;
}

// A/X(4번), B/Y(5번) 버튼 = 확인
function pollButtons() {
  for (const c of controllers) {
    const gp = c.userData.src && c.userData.src.gamepad;
    if (!gp) continue;
    const b = gp.buttons;
    const pressed = !!((b[4] && b[4].pressed) || (b[5] && b[5].pressed));
    if (pressed && !c.userData.prevBtn) onConfirm();
    c.userData.prevBtn = pressed;
  }
}

function updateRays() {
  let hover = -1;
  if (game.mode === 'vr') {
    for (const c of controllers) {
      if (!c.visible) continue;
      const res = castScene(controllerRay(c));
      c.userData.line.scale.z = res ? res.dist : 10;
      c.userData.line.material.color.set(res && res.kind === 'target' ? 0xffffff : 0x66ddff);
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
  onShoot(raycaster);
});
cvs.addEventListener('pointerleave', () => { mouse.inside = false; });
addEventListener('keydown', (e) => {
  if (game.mode !== 'desktop') return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) onConfirm(); }
  else if (e.code === 'Escape') abortToMenu();
});
function resetDeskCamera() {
  mouse.yaw = 0; mouse.pitch = 0;
  camera.position.copy(DESK_EYE);
  camera.rotation.set(0, 0, 0, 'YXZ');
}

function onShoot(rc) {
  if (!game.mode) return;
  const res = castScene(rc);
  if (panel.mesh.visible) {
    if (res && res.kind === 'panel') panel.click(panel.pick(res.uv));
    return;
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
  phase: 'idle',   // idle | starting | intro | play | survey | final | done
  rounds: [], ri: 0, R: null, T: null, nextTrialAt: 0,
  sessionId: '', fb: null, lastCmd: '', startFrames: 0, xrSession: null,
};
let log = { trials: [], rounds: [], prefs: null };

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const confirmName = () => (game.mode === 'vr' ? 'A/X 버튼으로' : 'Space로');
const shootName = () => (game.mode === 'vr' ? '방아쇠로' : '클릭해서');
const hudDistOf = (cond) => (cond === 'A' ? S.near : cond === 'B' ? S.focal : S.target);

function startSession(mode) {
  S = readForm();
  lsSet('hudexp.settings', JSON.stringify(S));
  game.mode = mode;
  game.sessionId = stamp();
  log = { trials: [], rounds: [], prefs: null };
  const rounds = [];
  if (S.practice) rounds.push({ practice: true, cond: 'B', pos: 0 });
  let pos = 0;
  for (let r = 0; r < S.roundsPer; r++) for (const ch of S.order) rounds.push({ practice: false, cond: ch, pos: ++pos });
  game.rounds = rounds;
  game.ri = 0;
  game.lastCmd = '';
  $('menu').hidden = true;
  $('help').hidden = mode !== 'desktop';
  if (mode === 'desktop') resetDeskCamera();
  game.phase = 'starting';
  game.startFrames = 3; // VR 첫 프레임의 머리 위치를 받은 뒤 안내판을 띄운다
}

function showIntro() {
  game.phase = 'intro';
  hud.group.visible = false;
  const r = game.rounds[game.ri];
  const total = game.rounds.filter((x) => !x.practice).length;
  const sec = r.practice ? S.practiceSec : S.roundSec;
  panel.show({
    title: r.practice ? '연습 판' : `${r.pos} / ${total}번째 판`,
    lines: [
      `지령을 읽고 ${confirmName()} 확인 → 맞는 표적을 ${shootName()} 쏘기`,
      `제한 시간 ${sec}초 (지령을 읽는 동안은 멈춤) · 연속 명중은 콤보`,
      '정면을 보고, 준비되면 시작을 누르세요',
    ],
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
  const sec = r.practice ? S.practiceSec : S.roundSec;
  // 남은 시간은 표적을 찾아 쏘는 동안(확인 → 명중)에만 줄어든다
  game.R = { ...r, hudDist: d, sec, startT: now, leftMs: sec * 1000, lastT: now,
    score: 0, combo: 0, maxCombo: 0, hits: 0, wrongs: 0, misses: 0, n: 0 };
  game.T = null;
  game.fb = null;
  game.nextTrialAt = now + 800;
  game.phase = 'play';
  hud.key = '';
  hud.group.visible = true;
}

function newTrial(now) {
  let specs;
  do { specs = genTargets(S.nTargets); } while (cmdOf(specs[0]) === game.lastCmd);
  game.lastCmd = cmdOf(specs[0]);
  game.R.n++;
  game.T = { n: game.R.n, specs, cmd: cmdOf(specs[0]), state: 'read',
    tCmd: now, tConfirm: 0, tHit: 0, wrong: 0, miss: 0, early: 0 };
}

function confirmCmd() {
  const T = game.T;
  if (!T || T.state !== 'read') return;
  T.tConfirm = performance.now();
  T.state = 'aim';
  for (const s of T.specs) makeTarget(s);
  beep(660, 0.04, 'triangle', 0.06);
}

function shoot(res) {
  const T = game.T, R = game.R;
  if (!T) return;
  if (T.state === 'read') { T.early++; return; }
  if (T.state !== 'aim') return;
  const now = performance.now();
  if (!res || res.kind !== 'target') {
    T.miss++; R.misses++;
    beep(220, 0.05, 'square', 0.03);
    return;
  }
  const g = res.obj;
  if (g.userData.spec.correct) {
    T.tHit = now; T.state = 'done';
    R.combo++; R.maxCombo = Math.max(R.maxCombo, R.combo); R.hits++;
    const gain = 100 + 20 * Math.min(R.combo - 1, 10);
    R.score += gain;
    game.fb = { text: `명중! +${gain}`, color: '#7dffa8', until: now + 700 };
    beep(988, 0.09, 'sine', 0.14);
    popAndClear(g, now);
    logTrial(T, true);
    game.T = null;
    game.nextTrialAt = now + S.itiMs;
  } else {
    T.wrong++; R.wrongs++; R.combo = 0;
    game.fb = { text: '틀렸어요!', color: '#ff7b7b', until: now + 600 };
    beep(160, 0.15, 'sawtooth', 0.06);
    flash(g, now);
  }
}

// 효과
const fx = [];
function popAndClear(hit, now) {
  for (const g of [...targetGroup.children]) if (g !== hit) targetGroup.remove(g);
  boards = [];
  fx.push({ obj: hit, t0: now, dur: 160, base: hit.scale.x, kind: 'pop' });
}
function flash(g, now) {
  g.userData.boardMat.color.set(0xaa2222);
  fx.push({ obj: g, t0: now, dur: 250, kind: 'flash' });
}
function updateFx(now) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], k = (now - f.t0) / f.dur;
    if (f.kind === 'pop') {
      f.obj.scale.setScalar(f.base * (1 + 0.6 * Math.min(k, 1)));
      if (k >= 1) targetGroup.remove(f.obj);
    } else if (k >= 1) {
      f.obj.userData.boardMat.color.set(0x1b2337);
    }
    if (k >= 1) fx.splice(i, 1);
  }
}

function endRound() {
  if (game.T) logTrial(game.T, false); // 시간이 다 돼 끝나지 못한 시행
  game.T = null;
  clearTargets();
  hud.group.visible = false;
  beep(523, 0.3, 'sine', 0.1);
  const R = game.R;
  if (R.practice) { game.ri++; nextOrFinish(); return; }
  game.phase = 'survey';
  const title = `${R.pos}번째 판 끝! 점수 ${R.score}`;
  askScale(title, '지금 눈이 얼마나 피로한가요?', (eye) => {
    R.eye = eye;
    askScale(title, '지금 얼마나 어지러운가요?', (dz) => {
      R.dizzy = dz;
      logRound(R);
      game.ri++;
      nextOrFinish();
    });
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
  const btns = (cb) => seen.map((c, i) => ({ label: `${i + 1}번째 판`, onClick: () => cb(c) }));
  panel.show({
    title: '마지막 질문 (1/2)', lines: ['어느 판에서 눈이 가장 편했나요?'],
    buttons: btns((c1) => {
      panel.show({
        title: '마지막 질문 (2/2)', lines: ['어느 판이 가장 하기 좋았나요?'],
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
  panel.show({
    title: '끝! 수고하셨습니다',
    lines: ['결과가 저장되었습니다.', game.mode === 'vr' ? '버튼을 누르면 VR에서 나갑니다.' : '버튼을 누르면 메뉴로 돌아갑니다.'],
    buttons: [{ label: game.mode === 'vr' ? 'VR 나가기' : '메뉴로', onClick: abortToMenu }],
  });
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
function logTrial(T, completed) {
  const R = game.R;
  log.trials.push({
    session: game.sessionId, participant: S.pid, order: S.order, mode: game.mode,
    fps: (game.xrSession && game.xrSession.frameRate) || '',
    practice: R.practice ? 1 : 0, round_pos: R.pos, cond: R.cond, cond_name: COND[R.cond].name,
    hud_dist_m: R.hudDist, target_dist_m: S.target, trial: T.n, command: T.cmd,
    target_az_deg: T.specs[0].az, target_el_deg: T.specs[0].el,
    t_in_round_ms: r1(T.tCmd - R.startT),
    read_ms: T.tConfirm ? r1(T.tConfirm - T.tCmd) : '',
    aim_ms: T.tHit ? r1(T.tHit - T.tConfirm) : '',
    total_ms: T.tHit ? r1(T.tHit - T.tCmd) : '',
    wrong_hits: T.wrong, misses: T.miss, early_shots: T.early,
    combo_after: R.combo, score_after: R.score, completed: completed ? 1 : 0,
  });
  saveSession();
}
function logRound(R) {
  log.rounds.push({
    session: game.sessionId, participant: S.pid, order: S.order, mode: game.mode,
    round_pos: R.pos, cond: R.cond, cond_name: COND[R.cond].name, hud_dist_m: R.hudDist,
    round_sec: R.sec, wall_sec: r1((performance.now() - R.startT) / 1000), hits: R.hits, wrong_hits: R.wrongs, misses: R.misses,
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
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
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
  const pref = sess.log.prefs ? `<p class="note">가장 편했던 판: ${sess.log.prefs.comfort} · 가장 하기 좋았던 판: ${sess.log.prefs.play}</p>` : '';
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
        <button class="small" data-i="${i}" data-k="rounds">판 CSV</button></div></div>`).join('');
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
  const st = { sec: Math.max(0, Math.ceil(R.leftMs / 1000)), paused: !(T && T.state === 'aim'), score: R.score, combo: R.combo };
  const fb = game.fb && now < game.fb.until ? game.fb : null;
  if (T) {
    if (T.state === 'read') { st.cmd = T.cmd; st.prompt = `${confirmName()} 확인`; }
    else { if (S.keepCmd) { st.cmd = T.cmd; st.cmdDim = true; } st.prompt = `${shootName()} 쏘세요`; st.promptColor = '#9fb4ff'; }
  }
  if (fb) { st.prompt = fb.text; st.promptColor = fb.color; }
  return st;
}

function loop() {
  const now = performance.now();
  if (renderer.xr.isPresenting && renderer.xr.updateCamera) renderer.xr.updateCamera(camera);
  else if (game.mode !== 'vr') camera.rotation.set(-mouse.pitch, -mouse.yaw, 0, 'YXZ');
  scene.updateMatrixWorld();

  if (game.phase === 'starting' && --game.startFrames <= 0) { anchorField(); showIntro(); }
  if (game.phase === 'play') {
    const R = game.R;
    if (game.T && game.T.state === 'aim') R.leftMs -= now - R.lastT;
    R.lastT = now;
    if (R.leftMs <= 0) endRound();
    else if (!game.T && now >= game.nextTrialAt) newTrial(now);
  }
  if (game.phase === 'play') {
    const st = hudState(now);
    const key = JSON.stringify(st);
    if (key !== hud.key) { hud.key = key; drawHUD(st); }
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
