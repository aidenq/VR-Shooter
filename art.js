// 그림 담당: 하늘·지형·소품, 표적·몬스터·총 모델, 효과, HUD·패널 그리기.
// 실험에 영향을 주지 않도록 표적이 나오는 정면(방위각 ±50° 안팎, 지평선 위)은 비워 둔다.
// 배경은 고정된 씨앗값으로 만들어서 모든 참가자와 모든 스테이지가 똑같은 장면을 본다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';
export const SERIF = '"Noto Serif KR", "Noto Sans KR", serif';
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
let ANISO = 1;

export const TX = {};
const G = {};
const MAT = {};

// 고정 씨앗 난수
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function dirAzEl(az, el) {
  return new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
}
const at = (az, dist, y = 0) => new THREE.Vector3(Math.sin(az * DEG) * dist, y, -Math.cos(az * DEG) * dist);

// ============================================================
// 캔버스 도우미
// ============================================================
export function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
export function canvasTex(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISO;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}
function makeTex(w, h, draw, repeat = 0) {
  const { ctx, tex } = canvasTex(w, h);
  draw(ctx, w, h);
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); }
  tex.needsUpdate = true;
  return tex;
}
function diamond(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill();
}
export function goldText(c, text, x, y, size, font = SERIF, weight = 900) {
  c.font = `${weight} ${size}px ${font}`;
  const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, '#fff6d0'); g.addColorStop(0.5, '#f2c95e'); g.addColorStop(1, '#b07a26');
  c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
  c.fillStyle = g; c.fillText(text, x, y);
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
}
export function divider(c, cx, y, w) {
  const g = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, 'rgba(230,195,106,0)'); g.addColorStop(0.5, 'rgba(230,195,106,0.95)'); g.addColorStop(1, 'rgba(230,195,106,0)');
  c.fillStyle = g; c.fillRect(cx - w / 2, y - 1, w, 2);
  c.fillStyle = '#f6dc90'; diamond(c, cx, y, 8);
  c.fillStyle = '#d9b45a'; diamond(c, cx - 24, y, 4); diamond(c, cx + 24, y, 4);
}
function corner(c, x, y, sx, sy) {
  c.save(); c.translate(x, y); c.scale(sx, sy);
  c.strokeStyle = '#e6c36a'; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(12, 62); c.quadraticCurveTo(12, 12, 62, 12); c.stroke();
  c.beginPath(); c.moveTo(24, 42); c.quadraticCurveTo(24, 24, 42, 24); c.stroke();
  c.fillStyle = '#f6dc90'; diamond(c, 12, 12, 7);
  c.restore();
}
// 금색 테두리 창 (HUD와 패널 공통)
export function drawFrame(c, W, H, radius = 36) {
  c.save();
  rr(c, 6, 6, W - 12, H - 12, radius);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(38,30,56,0.95)'); g.addColorStop(1, 'rgba(13,10,19,0.95)');
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  const rg = c.createRadialGradient(W / 2, -H * 0.15, 10, W / 2, -H * 0.15, W * 0.75);
  rg.addColorStop(0, 'rgba(255,200,120,0.2)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
  c.fillStyle = rg; c.fillRect(0, 0, W, H);
  c.restore();
  rr(c, 6, 6, W - 12, H - 12, radius);
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#f7dc8e'); bg.addColorStop(0.5, '#9c6e26'); bg.addColorStop(1, '#f0cf7a');
  c.lineWidth = 6; c.strokeStyle = bg; c.stroke();
  rr(c, 18, 18, W - 36, H - 36, Math.max(6, radius - 12));
  c.lineWidth = 2; c.strokeStyle = 'rgba(230,195,106,0.4)'; c.stroke();
  for (const [x, y, sx, sy] of [[18, 18, 1, 1], [W - 18, 18, -1, 1], [18, H - 18, 1, -1], [W - 18, H - 18, -1, -1]]) corner(c, x, y, sx, sy);
  c.restore();
}

// 아이콘 (가운데 cx, cy, 크기 s 픽셀)
export function drawIcon(c, kind, cx, cy, s, o = {}) {
  c.save(); c.translate(cx, cy); c.scale(s / 2, s / 2);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const ink = '#1e1714';
  if (kind === 'sword') {
    c.rotate(-Math.PI / 4);
    const bl = c.createLinearGradient(-0.13, 0, 0.13, 0); bl.addColorStop(0, '#f6f9fd'); bl.addColorStop(1, '#8f9bb0');
    c.beginPath(); c.moveTo(0, -0.98); c.lineTo(0.13, -0.78); c.lineTo(0.13, 0.32); c.lineTo(-0.13, 0.32); c.lineTo(-0.13, -0.78); c.closePath();
    c.fillStyle = bl; c.fill(); c.lineWidth = 0.045; c.strokeStyle = ink; c.stroke();
    c.beginPath(); c.moveTo(0, -0.78); c.lineTo(0, 0.26); c.lineWidth = 0.025; c.strokeStyle = 'rgba(60,70,90,0.6)'; c.stroke();
    c.lineWidth = 0.045; c.strokeStyle = ink;
    c.fillStyle = '#e6c36a'; rr(c, -0.46, 0.3, 0.92, 0.14, 0.06); c.fill(); c.stroke();
    c.fillStyle = '#6e3f22'; rr(c, -0.07, 0.44, 0.14, 0.36, 0.03); c.fill(); c.stroke();
    c.fillStyle = '#e6c36a'; c.beginPath(); c.arc(0, 0.87, 0.1, 0, Math.PI * 2); c.fill(); c.stroke();
  } else if (kind === 'bow') {
    c.rotate(-Math.PI / 4);
    c.beginPath(); c.moveTo(-0.08, -0.92); c.quadraticCurveTo(0.85, 0, -0.08, 0.92);
    c.lineWidth = 0.15; c.strokeStyle = '#2e1a0e'; c.stroke(); c.lineWidth = 0.09; c.strokeStyle = '#b07440'; c.stroke();
    c.beginPath(); c.moveTo(-0.08, -0.92); c.lineTo(-0.08, 0.92); c.lineWidth = 0.025; c.strokeStyle = '#efe8d6'; c.stroke();
    c.beginPath(); c.moveTo(-0.78, 0); c.lineTo(0.62, 0); c.lineWidth = 0.055; c.strokeStyle = '#d9c9a6'; c.stroke();
    c.fillStyle = '#cfd5df'; c.beginPath(); c.moveTo(0.94, 0); c.lineTo(0.6, -0.13); c.lineTo(0.6, 0.13); c.closePath(); c.fill();
    c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(-0.8, 0); c.lineTo(-0.58, -0.15); c.lineTo(-0.46, -0.15); c.lineTo(-0.62, 0);
    c.lineTo(-0.46, 0.15); c.lineTo(-0.58, 0.15); c.closePath(); c.fill();
  } else if (kind === 'staff') {
    c.rotate(Math.PI / 7);
    c.fillStyle = '#7a4a26'; rr(c, -0.065, -0.52, 0.13, 1.48, 0.05); c.fill(); c.lineWidth = 0.045; c.strokeStyle = '#2b1a10'; c.stroke();
    const og = c.createRadialGradient(0, -0.72, 0.02, 0, -0.72, 0.38);
    og.addColorStop(0, '#ffffff'); og.addColorStop(0.35, 'rgba(142,244,255,0.9)'); og.addColorStop(1, 'rgba(60,140,255,0)');
    c.fillStyle = og; c.beginPath(); c.arc(0, -0.72, 0.38, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5fd8ff'; c.beginPath(); c.arc(0, -0.72, 0.16, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e6c36a'; c.lineWidth = 0.065;
    c.beginPath(); c.moveTo(-0.06, -0.5); c.quadraticCurveTo(-0.34, -0.72, -0.12, -0.96); c.stroke();
    c.beginPath(); c.moveTo(0.06, -0.5); c.quadraticCurveTo(0.34, -0.72, 0.12, -0.96); c.stroke();
  } else if (kind === 'gun') {
    c.translate(0.04, 0.02);
    c.lineWidth = 0.045; c.strokeStyle = ink;
    const sg = c.createLinearGradient(0, -0.36, 0, -0.12); sg.addColorStop(0, '#d6dce6'); sg.addColorStop(1, '#5b6270');
    c.fillStyle = sg; rr(c, -0.18, -0.35, 1.06, 0.2, 0.04); c.fill(); c.stroke();
    c.fillStyle = '#e6c36a'; rr(c, 0.76, -0.38, 0.14, 0.26, 0.03); c.fill(); c.stroke();
    c.fillStyle = '#c4923e'; rr(c, -0.52, -0.4, 0.46, 0.42, 0.06); c.fill(); c.stroke();
    c.fillStyle = '#8a6a2e'; rr(c, -0.36, -0.32, 0.32, 0.27, 0.08); c.fill(); c.stroke();
    c.fillStyle = '#6e3f22'; c.beginPath(); c.moveTo(-0.52, -0.02); c.lineTo(-0.2, -0.02);
    c.quadraticCurveTo(-0.28, 0.4, -0.4, 0.8); c.lineTo(-0.8, 0.74); c.quadraticCurveTo(-0.64, 0.36, -0.52, -0.02); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(-0.1, 0.06, 0.14, 0, Math.PI); c.lineWidth = 0.055; c.strokeStyle = '#c4923e'; c.stroke();
    c.fillStyle = '#3a3a44'; c.beginPath(); c.moveTo(-0.5, -0.38); c.lineTo(-0.68, -0.55); c.lineTo(-0.58, -0.6); c.lineTo(-0.42, -0.4); c.closePath(); c.fill();
    const gg = c.createRadialGradient(-0.58, 0.34, 0, -0.58, 0.34, 0.2);
    gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.4, '#5ff2ff'); gg.addColorStop(1, 'rgba(95,242,255,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(-0.58, 0.34, 0.2, 0, Math.PI * 2); c.fill();
  } else if (kind === 'lock') {
    c.lineWidth = 0.14; c.strokeStyle = '#bdb6aa';
    c.beginPath(); c.moveTo(-0.33, 0.05); c.lineTo(-0.33, -0.2); c.arc(0, -0.2, 0.33, Math.PI, 0); c.lineTo(0.33, 0.05); c.stroke();
    const lg = c.createLinearGradient(0, 0, 0, 0.85); lg.addColorStop(0, '#f0cf7a'); lg.addColorStop(1, '#9a6a24');
    c.fillStyle = lg; rr(c, -0.5, -0.02, 1.0, 0.84, 0.12); c.fill(); c.lineWidth = 0.055; c.strokeStyle = '#3a2610'; c.stroke();
    c.fillStyle = '#2a1a0c'; c.beginPath(); c.arc(0, 0.3, 0.1, 0, Math.PI * 2); c.fill(); c.fillRect(-0.04, 0.3, 0.08, 0.26);
  } else if (kind === 'target') {
    for (const [r, col] of [[0.9, '#d9443a'], [0.66, '#f4ead8'], [0.42, '#d9443a'], [0.18, '#f4ead8']]) {
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = col; c.fill();
    }
    c.lineWidth = 0.07; c.strokeStyle = '#2a1a10'; c.beginPath(); c.arc(0, 0, 0.9, 0, Math.PI * 2); c.stroke();
  } else if (kind === 'gem') {
    c.beginPath(); c.moveTo(0, -0.9); c.lineTo(0.72, -0.25); c.lineTo(0, 0.95); c.lineTo(-0.72, -0.25); c.closePath();
    const g2 = c.createLinearGradient(-0.7, -0.9, 0.7, 0.9); g2.addColorStop(0, '#d6faff'); g2.addColorStop(0.5, '#5fb8ff'); g2.addColorStop(1, '#6a4cff');
    c.fillStyle = g2; c.fill(); c.lineWidth = 0.07; c.strokeStyle = '#1d1640'; c.stroke();
    c.beginPath(); c.moveTo(-0.72, -0.25); c.lineTo(0.72, -0.25); c.moveTo(-0.3, -0.25); c.lineTo(0, 0.95); c.lineTo(0.3, -0.25);
    c.lineWidth = 0.04; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
  } else if (kind === 'flame') {
    const hot = !!o.hot;
    c.beginPath(); c.moveTo(0, -0.95); c.bezierCurveTo(0.55, -0.4, 0.78, 0.1, 0.56, 0.5);
    c.bezierCurveTo(0.4, 0.86, -0.4, 0.86, -0.56, 0.5); c.bezierCurveTo(-0.78, 0.1, -0.3, -0.3, 0, -0.95); c.closePath();
    const fg = c.createLinearGradient(0, -0.95, 0, 0.8);
    fg.addColorStop(0, hot ? '#ffe96b' : '#b98a5a'); fg.addColorStop(1, hot ? '#ff4a1c' : '#6e3a26');
    c.fillStyle = fg; c.fill();
    c.beginPath(); c.moveTo(0, -0.2); c.bezierCurveTo(0.3, 0.1, 0.32, 0.4, 0.2, 0.6);
    c.bezierCurveTo(0.1, 0.75, -0.1, 0.75, -0.2, 0.6); c.bezierCurveTo(-0.32, 0.4, -0.2, 0.1, 0, -0.2); c.closePath();
    c.fillStyle = hot ? '#fff6c0' : '#d9b48a'; c.fill();
  }
  c.restore();
}

// ============================================================
// HUD (퀘스트 창) — 글자 크기·배치는 이전과 같게 유지
// ============================================================
export function drawQuest(c, W, H, st) {
  c.clearRect(0, 0, W, H);
  drawFrame(c, W, H, 40);
  c.save(); rr(c, 32, 32, W - 64, 86, 22); c.fillStyle = 'rgba(0,0,0,0.32)'; c.fill(); c.restore();
  c.textBaseline = 'middle';
  c.font = `700 40px ${FONT}`; c.fillStyle = '#f4e8cc';
  const y = 75;
  drawIcon(c, 'target', 74, y, 46);
  c.textAlign = 'left'; c.fillText(`${st.kills} / ${st.goal}`, 108, y);
  const exp = `EXP ${st.score}`;
  const ew = c.measureText(exp).width;
  const ex = W / 2 + 24;
  drawIcon(c, 'gem', ex - ew / 2 - 32, y, 40);
  c.textAlign = 'center'; c.fillStyle = '#f4e8cc'; c.fillText(exp, ex, y);
  const cb = `콤보 ${st.combo}`;
  const cw = c.measureText(cb).width;
  c.textAlign = 'right'; c.fillStyle = st.combo >= 3 ? '#ffd27a' : '#f4e8cc'; c.fillText(cb, W - 60, y);
  drawIcon(c, 'flame', W - 60 - cw - 28, y, 42, { hot: st.combo >= 3 });
  if (st.cmd) {
    c.textAlign = 'center'; c.font = `900 150px ${FONT}`;
    c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
    c.fillStyle = st.cmdDim ? 'rgba(255,244,220,0.4)' : '#fffaf0';
    c.fillText(st.cmd, W / 2, 266);
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  }
  if (st.prompt) {
    divider(c, W / 2, 362, 440);
    c.textAlign = 'center'; c.font = `700 50px ${FONT}`;
    c.fillStyle = st.promptColor || '#ffd36b';
    c.fillText(st.prompt, W / 2, 422);
  }
}

// ============================================================
// 패널 (안내, 무기 선택, 설문)
// ============================================================
export function drawButton(c, r, b, hover) {
  const { x, y, w, h } = r;
  const hot = hover && !b.disabled;
  c.save();
  if (hot) { c.shadowColor = 'rgba(255,200,100,0.85)'; c.shadowBlur = 28; }
  rr(c, x, y, w, h, 18);
  const g = c.createLinearGradient(0, y, 0, y + h);
  if (b.disabled) { g.addColorStop(0, '#26222c'); g.addColorStop(1, '#16131a'); }
  else if (hot) { g.addColorStop(0, '#dcac4e'); g.addColorStop(1, '#7c541c'); }
  else { g.addColorStop(0, '#47395a'); g.addColorStop(1, '#241c30'); }
  c.fillStyle = g; c.fill();
  c.shadowBlur = 0; c.shadowColor = 'transparent';
  c.lineWidth = 3; c.strokeStyle = b.disabled ? '#4a4252' : hot ? '#fff0b8' : '#c9a24f'; c.stroke();
  rr(c, x + 5, y + 5, w - 10, Math.min(h * 0.42, 56), 13); c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const labelColor = b.disabled ? '#77707f' : '#fff8e6';
  if (b.icon) {
    c.globalAlpha = b.disabled ? 0.35 : 1;
    drawIcon(c, b.icon, x + w / 2, y + h * 0.37, Math.min(w, h) * 0.62);
    c.globalAlpha = 1;
    c.font = `900 44px ${SERIF}`; c.fillStyle = labelColor; c.fillText(b.label, x + w / 2, y + h * 0.74);
    if (b.sub) { c.font = `500 24px ${FONT}`; c.fillStyle = b.disabled ? '#77707f' : '#f7dfa6'; c.fillText(b.sub, x + w / 2, y + h * 0.89); }
    if (b.disabled) drawIcon(c, 'lock', x + w - 34, y + 36, 40);
  } else {
    c.font = `700 ${b.label.length > 4 ? 38 : 46}px ${FONT}`; c.fillStyle = labelColor;
    c.fillText(b.label, x + w / 2, y + (b.sub ? h * 0.38 : h / 2 + 2));
    if (b.sub) { c.font = `500 26px ${FONT}`; c.fillStyle = '#f7dfa6'; c.fillText(b.sub, x + w / 2, y + h * 0.74); }
  }
  c.restore();
}
function drawStats(c, W, y, stats) {
  const n = stats.length, bw = 250, bh = 112, gap = 22;
  let x = (W - (n * bw + (n - 1) * gap)) / 2;
  for (const st of stats) {
    rr(c, x, y, bw, bh, 16); c.fillStyle = 'rgba(0,0,0,0.32)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(230,195,106,0.5)'; c.stroke();
    c.textAlign = 'center';
    c.font = `500 26px ${FONT}`; c.fillStyle = '#b8a888'; c.fillText(st.label, x + bw / 2, y + 30);
    goldText(c, String(st.value), x + bw / 2, y + 76, 46);
    x += bw + gap;
  }
}
export function drawPanel(c, W, H, s, rects, hover) {
  c.clearRect(0, 0, W, H);
  drawFrame(c, W, H, 36);
  c.textBaseline = 'middle'; c.textAlign = 'center';
  const ty = s.kicker ? 106 : 96;
  if (s.glow) {
    const g = c.createRadialGradient(W / 2, ty, 10, W / 2, ty, 380);
    g.addColorStop(0, 'rgba(255,214,120,0.5)'); g.addColorStop(1, 'rgba(255,214,120,0)');
    c.save(); rr(c, 8, 8, W - 16, H - 16, 34); c.clip(); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.translate(W / 2, ty); c.fillStyle = 'rgba(255,230,160,0.12)';
    for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.beginPath(); c.moveTo(0, 0); c.lineTo(-30, -520); c.lineTo(30, -520); c.closePath(); c.fill(); }
    c.restore();
  }
  if (s.kicker) { c.font = `700 26px ${FONT}`; c.fillStyle = '#c9a86a'; c.fillText(s.kicker, W / 2, 56); }
  goldText(c, s.title || '', W / 2, ty, 58);
  divider(c, W / 2, ty + 50, 540);
  let y = ty + 100;
  c.font = `500 34px ${FONT}`; c.fillStyle = '#ece0c6';
  for (const ln of s.lines || []) { c.fillText(ln, W / 2, y); y += 50; }
  if (s.stats) drawStats(c, W, y - 10, s.stats);
  (s.buttons || []).forEach((b, i) => drawButton(c, rects[i], b, i === hover));
  c.font = `500 28px ${FONT}`; c.fillStyle = '#a99a7e';
  if (s.footerL) { c.textAlign = 'left'; c.fillText(s.footerL, 92, H - 44); }
  if (s.footerR) { c.textAlign = 'right'; c.fillText(s.footerR, W - 92, H - 44); }
}

// ============================================================
// 텍스처
// ============================================================
function drawRune(c, W) {
  const R = rng(99), cx = W / 2, r = W / 2;
  c.translate(cx, cx);
  c.strokeStyle = '#ffe6a8'; c.fillStyle = '#ffe6a8';
  c.shadowColor = '#ffc860'; c.shadowBlur = W * 0.02;
  const circle = (rad, lw) => { c.lineWidth = lw; c.beginPath(); c.arc(0, 0, rad, 0, Math.PI * 2); c.stroke(); };
  circle(r * 0.97, W * 0.009); circle(r * 0.86, W * 0.007); circle(r * 0.81, W * 0.003);
  const n = 28;
  c.lineWidth = W * 0.005;
  for (let i = 0; i < n; i++) {
    c.save(); c.rotate(i / n * Math.PI * 2); c.translate(0, -r * 0.915);
    const s = r * 0.035;
    c.beginPath();
    for (let k = 0; k < 3; k++) {
      const x0 = (R() - 0.5) * 2 * s, y0 = (R() - 0.5) * 2 * s, x1 = (R() - 0.5) * 2 * s, y1 = (R() - 0.5) * 2 * s;
      c.moveTo(x0, y0); c.lineTo(x1, y1);
    }
    c.stroke(); c.restore();
  }
  for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); diamond(c, 0, -r * 0.97, W * 0.018); c.restore(); }
}
function drawWood(c, W) {
  const R = rng(3), n = 5, pw = W / n;
  const base = ['#7b5232', '#6e472a', '#835a37', '#744c2e', '#6a4428'];
  for (let i = 0; i < n; i++) {
    c.fillStyle = base[i]; c.fillRect(i * pw, 0, pw, W);
    c.strokeStyle = 'rgba(40,22,10,0.35)'; c.lineWidth = 1.2;
    for (let k = 0; k < 9; k++) {
      const x0 = i * pw + R() * pw;
      c.beginPath();
      for (let y = 0; y <= W; y += 8) { const x = x0 + Math.sin(y * 0.05 + k) * 2.5; if (y) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    }
    if (R() < 0.6) {
      const kx = i * pw + pw * (0.3 + R() * 0.4), ky = R() * W;
      c.strokeStyle = 'rgba(40,22,10,0.5)';
      for (let r = 3; r < 12; r += 3) { c.beginPath(); c.ellipse(kx, ky, r * 0.6, r, 0, 0, Math.PI * 2); c.stroke(); }
    }
    c.fillStyle = 'rgba(20,10,5,0.75)'; c.fillRect(i * pw - 1.5, 0, 3, W);
  }
  const g = c.createRadialGradient(W / 2, W / 2, W * 0.2, W / 2, W / 2, W * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
  c.fillStyle = g; c.fillRect(0, 0, W, W);
}
function drawGrass(c, W) {
  const R = rng(7);
  c.fillStyle = '#3b6230'; c.fillRect(0, 0, W, W);
  for (let i = 0; i < 60; i++) {
    const x = R() * W, y = R() * W, r = 20 + R() * 60, dark = R() < 0.5;
    for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) {
      const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, dark ? 'rgba(28,58,24,0.35)' : 'rgba(115,150,60,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  const cols = ['#2e5426', '#477a34', '#5a8f3e', '#355f2a', '#6c9e46', '#3f6b2f'];
  c.lineWidth = 1.4;
  for (let i = 0; i < 9000; i++) {
    const x = R() * W, y = R() * W, l = 3 + R() * 6, a = -Math.PI / 2 + (R() - 0.5) * 0.9;
    c.strokeStyle = cols[(R() * cols.length) | 0];
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  for (let i = 0; i < 50; i++) { c.fillStyle = R() < 0.5 ? '#f4e48a' : '#f2f0ea'; c.beginPath(); c.arc(R() * W, R() * W, 1.6, 0, Math.PI * 2); c.fill(); }
}
function drawStone(c, W) {
  const R = rng(11), cx = W / 2;
  c.fillStyle = '#2e2b34'; c.fillRect(0, 0, W, W);
  const rings = [0, 0.2, 0.42, 0.64, 0.84, 1.0];
  for (let j = 0; j < rings.length - 1; j++) {
    const r0 = rings[j] * cx, r1 = rings[j + 1] * cx, segs = j === 0 ? 1 : 6 + j * 5, off = R() * Math.PI;
    for (let s = 0; s < segs; s++) {
      const a0 = off + s / segs * Math.PI * 2, a1 = off + (s + 1) / segs * Math.PI * 2, v = (100 + R() * 45) | 0;
      c.fillStyle = `rgb(${v},${v - 6},${v + 10})`;
      c.beginPath();
      if (j === 0) c.arc(cx, cx, r1 - 3, 0, Math.PI * 2);
      else { c.arc(cx, cx, r1 - 3, a0 + 0.014, a1 - 0.014); c.arc(cx, cx, r0 + 3, a1 - 0.014, a0 + 0.014, true); c.closePath(); }
      c.fill();
    }
  }
  for (let i = 0; i < 4000; i++) { c.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'; c.fillRect(R() * W, R() * W, 1.5, 1.5); }
}
function cloudDrawer(seed) {
  return (c, W, H) => {
    const R = rng(seed);
    for (let i = 0; i < 18; i++) {
      const x = W * (0.12 + R() * 0.76), y = H * (0.42 + R() * 0.28), r = H * (0.16 + R() * 0.24);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  };
}
function drawFlash(c, W) {
  const cx = W / 2;
  const g = c.createRadialGradient(cx, cx, 0, cx, cx, cx);
  g.addColorStop(0, 'rgba(255,255,235,1)'); g.addColorStop(0.25, 'rgba(255,210,110,0.9)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, W);
  c.translate(cx, cx); c.fillStyle = 'rgba(255,232,170,0.9)';
  for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -cx * 0.95); c.lineTo(cx * 0.07, 0); c.lineTo(-cx * 0.07, 0); c.closePath(); c.fill(); }
}
function drawFlame(c, W, H) {
  const g = c.createRadialGradient(W / 2, H * 0.7, 2, W / 2, H * 0.6, H * 0.5);
  g.addColorStop(0, 'rgba(255,250,215,1)'); g.addColorStop(0.3, 'rgba(255,190,80,0.95)');
  g.addColorStop(0.65, 'rgba(255,90,30,0.55)'); g.addColorStop(1, 'rgba(200,40,10,0)');
  c.fillStyle = g; c.beginPath(); c.moveTo(W / 2, 4);
  c.bezierCurveTo(W * 0.98, H * 0.45, W * 0.95, H * 0.96, W / 2, H - 4);
  c.bezierCurveTo(W * 0.05, H * 0.96, W * 0.02, H * 0.45, W / 2, 4); c.fill();
}
function drawHalo(c, W) {
  const cx = W / 2;
  const g = c.createRadialGradient(cx, cx, cx * 0.5, cx, cx, cx);
  g.addColorStop(0, 'rgba(255,60,40,0)'); g.addColorStop(0.55, 'rgba(255,70,50,0.95)'); g.addColorStop(1, 'rgba(255,40,20,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, W);
}
function drawBanner(c, W, H) {
  const shape = () => { c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(W / 2, H * 0.84); c.lineTo(0, H); c.closePath(); };
  shape(); c.save(); c.clip();
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7e1a34'); g.addColorStop(1, '#3a0816');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
  c.save(); c.translate(W / 2, H / 2); c.scale(0.86, 0.93); c.translate(-W / 2, -H / 2);
  shape(); c.lineWidth = 9; c.strokeStyle = '#d9b45a'; c.stroke(); c.restore();
  drawIcon(c, 'gun', W / 2, H * 0.36, W * 0.6);
  c.fillStyle = '#d9b45a';
  for (let i = -1; i <= 1; i++) diamond(c, W / 2 + i * 34, H * 0.6, i ? 8 : 12);
}
function drawMoon(c, W) {
  const cx = W / 2;
  const g = c.createRadialGradient(cx, cx, cx * 0.3, cx, cx, cx);
  g.addColorStop(0, 'rgba(255,245,220,0.45)'); g.addColorStop(1, 'rgba(255,245,220,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, W);
  c.fillStyle = '#fff4d6'; c.beginPath(); c.arc(cx, cx, cx * 0.34, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(cx + cx * 0.17, cx - cx * 0.09, cx * 0.3, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'source-over';
}
function drawReticle(c, W) {
  const cx = W / 2;
  c.strokeStyle = '#ffffff'; c.lineWidth = W * 0.07;
  c.beginPath(); c.arc(cx, cx, cx * 0.6, 0, Math.PI * 2); c.stroke();
  c.lineWidth = W * 0.06;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * cx * 0.72, cx + Math.sin(a) * cx * 0.72); c.lineTo(cx + Math.cos(a) * cx * 0.95, cx + Math.sin(a) * cx * 0.95); c.stroke();
  }
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cx, cx * 0.14, 0, Math.PI * 2); c.fill();
}

// ============================================================
// 초기화: 렌더러를 만든 다음 한 번 부른다
// ============================================================
export function initArt(renderer) {
  ANISO = renderer.capabilities.getMaxAnisotropy();
  TX.dot = makeTex(64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  });
  TX.rune = makeTex(512, 512, drawRune);
  TX.wood = makeTex(256, 256, drawWood);
  TX.grass = makeTex(512, 512, drawGrass, 80);
  TX.stone = makeTex(512, 512, drawStone);
  TX.clouds = [5, 8, 13].map((s) => makeTex(256, 128, cloudDrawer(s)));
  TX.flash = makeTex(128, 128, drawFlash);
  TX.flame = makeTex(64, 128, drawFlame);
  TX.halo = makeTex(256, 256, drawHalo);
  TX.banner = makeTex(256, 512, drawBanner);
  TX.moon = makeTex(128, 128, drawMoon);
  TX.reticle = makeTex(128, 128, drawReticle);
  TX.toon = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  TX.toon.minFilter = TX.toon.magFilter = THREE.NearestFilter;
  TX.toon.generateMipmaps = false;
  TX.toon.needsUpdate = true;

  MAT.outline = new THREE.MeshBasicMaterial({ color: 0x1a0e14, side: THREE.BackSide });
  MAT.ink = new THREE.MeshBasicMaterial({ color: 0x140c10 });
  MAT.white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  MAT.shine = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  MAT.stem = new THREE.MeshToonMaterial({ color: 0xf0e2c4, gradientMap: TX.toon });
  MAT.gill = new THREE.MeshToonMaterial({ color: 0xc9b48e, gradientMap: TX.toon });
  MAT.wood = new THREE.MeshLambertMaterial({ map: TX.wood });
  MAT.iron = new THREE.MeshLambertMaterial({ color: 0x8b90a2 });
  MAT.marker = new THREE.MeshBasicMaterial({ map: TX.rune, color: 0xffd98a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  MAT.halo = new THREE.MeshBasicMaterial({ map: TX.halo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  G.dome = new THREE.SphereGeometry(0.85, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  G.disc = new THREE.CircleGeometry(0.85, 32);
  G.blob = new THREE.SphereGeometry(0.85, 32, 20);
  G.eye = new THREE.SphereGeometry(0.13, 14, 10);
  G.pupil = new THREE.SphereGeometry(0.068, 10, 8);
  G.hl = new THREE.SphereGeometry(0.028, 8, 6);
  G.brow = new THREE.BoxGeometry(0.2, 0.05, 0.04);
  G.batBody = new THREE.SphereGeometry(0.45, 24, 16);
  G.ear = new THREE.ConeGeometry(0.12, 0.32, 8);
  G.fang = new THREE.ConeGeometry(0.035, 0.1, 6);
  G.wingL = wingGeo(-1); G.wingR = wingGeo(1);
  G.stem = new THREE.CylinderGeometry(0.3, 0.36, 0.75, 18);
  G.spot = new THREE.SphereGeometry(0.12, 12, 8);
  G.head = new THREE.SphereGeometry(0.55, 24, 16);
  G.skirt = new THREE.CylinderGeometry(0.55, 0.62, 0.6, 24, 1, true);
  G.tail = new THREE.ConeGeometry(0.22, 0.4, 10);
  G.mouth = new THREE.SphereGeometry(0.1, 12, 8);
  G.board = new THREE.CircleGeometry(1, 48);
  G.rim = new THREE.TorusGeometry(0.95, 0.065, 8, 48);
  G.stud = new THREE.SphereGeometry(0.05, 8, 6);
  G.circle = new THREE.CircleGeometry(0.55, 48);
  G.square = new THREE.PlaneGeometry(0.92, 0.92);
  G.triangle = new THREE.CircleGeometry(0.68, 3, Math.PI / 2);
  G.star = starGeo(0.7, 0.3);
  G.halo = new THREE.PlaneGeometry(2.6, 2.6);
  G.marker = new THREE.PlaneGeometry(2.52, 2.52);
}
function starGeo(R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
    if (i) s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}
function wingGeo(sx) {
  const w = new THREE.Shape();
  const pts = [[0, 0.22], [0.62, 0.44], [1.0, 0.34], [0.84, 0.08], [0.98, -0.2], [0.7, -0.12], [0.55, -0.3], [0, -0.14]];
  pts.forEach(([x, y], i) => (i ? w.lineTo(sx * x, y) : w.moveTo(sx * x, y)));
  w.closePath();
  return new THREE.ExtrudeGeometry(w, { depth: 0.05, bevelEnabled: false });
}

// ============================================================
// 표적
// ============================================================
const paintCache = new Map();
const paint = (hex) => { if (!paintCache.has(hex)) paintCache.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return paintCache.get(hex); };
const toonCache = new Map();
const toon = (hex) => { if (!toonCache.has(hex)) toonCache.set(hex, new THREE.MeshToonMaterial({ color: hex, gradientMap: TX.toon })); return toonCache.get(hex); };
const darker = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
function ol(mesh, t = 0.07) {
  const o = new THREE.Mesh(mesh.geometry, MAT.outline);
  o.scale.setScalar(1 + t);
  mesh.add(o);
  return mesh;
}
function eyes(p, y, z, gap, s = 1) {
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(G.eye, MAT.white); e.scale.setScalar(s); e.position.set(sx * gap, y, z);
    const pu = new THREE.Mesh(G.pupil, MAT.ink); pu.scale.setScalar(s); pu.position.set(sx * gap - sx * 0.012, y - 0.01, z + 0.09 * s);
    const h = new THREE.Mesh(G.hl, MAT.white); h.position.set(sx * gap + 0.03 * s, y + 0.035 * s, z + 0.15 * s);
    p.add(e, pu, h);
  }
}
function brows(p, y, z, gap, ang = 0.38, s = 1) {
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(G.brow, MAT.ink); b.scale.setScalar(s); b.position.set(sx * gap, y, z); b.rotation.z = sx * ang;
    p.add(b);
  }
}

export function makeMarker() { return new THREE.Mesh(G.marker, MAT.marker); }
export function makeHalo() { return new THREE.Mesh(G.halo, MAT.halo); }

// 문양 방패 과녁 (반지름 1)
export function makeShield(shapeKey, hex) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(G.board, MAT.wood);
  const rim = new THREE.Mesh(G.rim, MAT.iron); rim.position.z = 0.02;
  g.add(board, rim);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    const s = new THREE.Mesh(G.stud, MAT.iron); s.position.set(Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.03);
    g.add(s);
  }
  const out = new THREE.Mesh(G[shapeKey], MAT.ink); out.scale.setScalar(1.16); out.position.z = 0.05;
  const sym = new THREE.Mesh(G[shapeKey], paint(hex)); sym.position.z = 0.07;
  g.add(out, sym);
  return g;
}

// 몬스터 (방패 과녁과 겉보기 크기가 비슷하도록 MON_FIT으로 맞춤). body만 둥실거린다.
const MON_FIT = { slime: [1.12, 0.03], bat: [1.2, -0.03], mushroom: [1.2, 0.15], ghost: [1.1, 0.05] };
export function makeMonster(kind, hex) {
  const body = new THREE.Group();
  const mat = toon(hex), dark = toon(darker(hex, 0.6));
  if (kind === 'slime') {
    const blob = ol(new THREE.Mesh(G.blob, mat)); blob.scale.set(1, 0.8, 0.85); blob.position.y = -0.05;
    body.add(blob);
    const shine = new THREE.Mesh(G.eye, MAT.shine); shine.scale.set(1.4, 0.8, 0.5); shine.position.set(-0.42, 0.3, 0.6);
    body.add(shine);
    eyes(body, 0.02, 0.68, 0.26); brows(body, 0.22, 0.66, 0.26);
  } else if (kind === 'bat') {
    body.add(ol(new THREE.Mesh(G.batBody, mat)));
    for (const sx of [-1, 1]) {
      const wing = ol(new THREE.Mesh(sx < 0 ? G.wingL : G.wingR, dark), 0.05); wing.position.z = -0.1;
      const ear = ol(new THREE.Mesh(G.ear, dark)); ear.position.set(sx * 0.22, 0.48, 0); ear.rotation.z = -sx * 0.25;
      const fang = new THREE.Mesh(G.fang, MAT.white); fang.rotation.x = Math.PI; fang.position.set(sx * 0.08, -0.2, 0.41);
      body.add(wing, ear, fang);
    }
    eyes(body, 0.08, 0.37, 0.15, 0.9); brows(body, 0.25, 0.4, 0.15, 0.38, 0.9);
  } else if (kind === 'mushroom') {
    const stem = ol(new THREE.Mesh(G.stem, MAT.stem)); stem.position.y = -0.5; body.add(stem);
    const cap = ol(new THREE.Mesh(G.dome, mat)); cap.scale.y = 0.8; cap.position.y = -0.15; body.add(cap);
    const under = new THREE.Mesh(G.disc, MAT.gill); under.rotation.x = Math.PI / 2; cap.add(under);
    for (const [a, t] of [[-0.75, 0.9], [0.55, 0.75], [0.05, 0.35], [0.95, 1.15], [-0.35, 1.25], [-1.1, 1.3]]) {
      const n = new THREE.Vector3(Math.sin(t) * Math.sin(a), Math.cos(t), Math.sin(t) * Math.cos(a));
      const spot = new THREE.Mesh(G.spot, MAT.white); spot.scale.set(1, 1, 0.3);
      spot.position.copy(n).multiplyScalar(0.85);
      spot.quaternion.setFromUnitVectors(Z, n);
      cap.add(spot);
    }
    eyes(body, -0.45, 0.34, 0.13, 0.85); brows(body, -0.3, 0.36, 0.13, 0.3, 0.8);
  } else { // ghost
    const head = ol(new THREE.Mesh(G.head, mat)); head.position.y = 0.2; body.add(head);
    const skirt = ol(new THREE.Mesh(G.skirt, mat)); skirt.position.y = -0.1; body.add(skirt);
    for (const x of [-0.4, 0, 0.4]) {
      const tail = ol(new THREE.Mesh(G.tail, mat)); tail.rotation.x = Math.PI; tail.position.set(x, -0.6, 0);
      body.add(tail);
    }
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(G.eye, MAT.ink); e.scale.set(0.8, 1.25, 0.6); e.position.set(sx * 0.2, 0.28, 0.5);
      const h = new THREE.Mesh(G.hl, MAT.white); h.position.set(sx * 0.2 + 0.03, 0.37, 0.58);
      body.add(e, h);
    }
    const mouth = new THREE.Mesh(G.mouth, MAT.ink); mouth.scale.set(1.1, 0.7, 0.5); mouth.position.set(0, 0.02, 0.53);
    body.add(mouth);
  }
  const [sc, dy] = MON_FIT[kind];
  const root = new THREE.Group();
  root.scale.setScalar(sc); root.position.y = dy * sc;
  root.add(body);
  return { root, body };
}

// ============================================================
// 마법 리볼버 (컨트롤러 레이 방향 -Z로 총열이 향한다)
// ============================================================
export function makeGun() {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x4a4f5c, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23252c });
  const brass = new THREE.MeshLambertMaterial({ color: 0xc8963e, flatShading: true });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6e3f22, flatShading: true });
  const gemMat = new THREE.MeshBasicMaterial({ color: 0x5ff2ff });
  const mesh = (geo, mat, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); g.add(m); return m; };
  mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.19, 10), steel, 0, 0.004, -0.115, Math.PI / 2);
  mesh(new THREE.BoxGeometry(0.008, 0.008, 0.17), brass, 0, 0.021, -0.11);
  mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.016, 12), brass, 0, 0.004, -0.205, Math.PI / 2);
  const drum = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.046, 6), brass, 0, 0, -0.01, Math.PI / 2);
  mesh(new THREE.BoxGeometry(0.03, 0.046, 0.07), steel, 0, -0.002, 0.03);
  mesh(new THREE.BoxGeometry(0.01, 0.026, 0.016), dark, 0, 0.028, 0.062, -0.4);
  mesh(new THREE.BoxGeometry(0.028, 0.11, 0.038), wood, 0, -0.068, 0.068, -0.42);
  mesh(new THREE.SphereGeometry(0.02, 10, 8), brass, 0, -0.122, 0.094);
  mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 16, Math.PI), brass, 0, -0.03, 0.022, 0, Math.PI / 2).rotation.z = Math.PI;
  const gem = mesh(new THREE.SphereGeometry(0.009, 10, 8), gemMat, 0.017, 0.005, 0.03);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.dot, color: 0x5ff2ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.copy(gem.position); glow.scale.setScalar(0.045); g.add(glow);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  flash.position.set(0, 0.004, -0.25); flash.scale.setScalar(0.1); flash.visible = false; g.add(flash);
  g.userData = { flash, drum, gem: gemMat, glow };
  return g;
}

// ============================================================
// 효과
// ============================================================
export function makeBurst(pos, hex, scale, now) {
  const n = 34;
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c1 = new THREE.Color(hex), c2 = new THREE.Color(0xffe2a0), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.set([pos.x, pos.y, pos.z], i * 3);
    d.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(scale * (3.5 + Math.random() * 4));
    v.set([d.x, d.y, d.z], i * 3);
    const c = c1.clone().lerp(c2, Math.random() * 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: scale * 0.5, map: TX.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const obj = new THREE.Points(geo, mat);
  let last = now;
  return {
    obj, t0: now, dur: 380,
    update(t) {
      const dt = (t - last) / 1000; last = t;
      for (let i = 0; i < n; i++) {
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
        v[i * 3 + 1] -= scale * 6 * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - (t - this.t0) / this.dur);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
export function makeFloatText(text, pos, scale, now) {
  const { ctx, tex } = canvasTex(256, 96);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  goldText(ctx, text, 128, 50, 64, FONT, 900);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
  const obj = new THREE.Sprite(mat);
  obj.renderOrder = 998;
  obj.scale.set(scale * 2.6, scale * 0.98, 1);
  obj.position.copy(pos);
  const y0 = pos.y;
  return {
    obj, t0: now, dur: 380,
    update(t) {
      const k = (t - this.t0) / this.dur;
      obj.position.y = y0 + scale * 1.4 * k;
      mat.opacity = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
    },
    dispose() { tex.dispose(); mat.dispose(); },
  };
}

// ============================================================
// 세계: 노을 하늘, 별, 달, 구름, 산, 숲, 울타리, 횃불 기둥, 반딧불
// ============================================================
const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = `
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec2 hz = normalize(d.xz + vec2(1e-5));
  vec2 sz = normalize(sunDir.xz);
  float warm = pow(clamp(dot(hz, sz) * 0.5 + 0.5, 0.0, 1.0), 2.5);
  vec3 horizon = mix(vec3(0.55, 0.49, 0.71), vec3(1.0, 0.63, 0.40), warm);
  vec3 mid = mix(vec3(0.30, 0.28, 0.52), vec3(0.62, 0.38, 0.52), warm);
  vec3 top = vec3(0.05, 0.06, 0.16);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, top, smoothstep(0.15, 0.8, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += vec3(1.0, 0.75, 0.45) * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
  col = mix(col, vec3(0.20, 0.17, 0.26), smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
}`;

function ni(g) { return g.index ? g.toNonIndexed() : g; }
function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function place(g, pos, rotY = 0, s = 1) {
  g.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(Y, rotY), new THREE.Vector3(s, s, s)));
  return g;
}
function mergedMesh(list) {
  return new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

export function buildWorld(scene, decor) {
  const R = rng(20261127);
  const rnd = (a, b) => a + R() * (b - a);
  const SUN = dirAzEl(-118, 5);
  scene.background = new THREE.Color(0x14122a);
  scene.fog = new THREE.Fog(0x7a6c9c, 45, 170);

  decor.add(new THREE.HemisphereLight(0xcfc4ff, 0x3a4a2a, 1.4));
  const sun = new THREE.DirectionalLight(0xffc896, 1.7);
  sun.position.copy(SUN).multiplyScalar(30);
  decor.add(sun, sun.target);

  // 하늘
  const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 48, 24),
    new THREE.ShaderMaterial({ uniforms: { sunDir: { value: SUN } }, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  decor.add(sky);

  // 별 (높은 하늘에만)
  {
    const n = 600, p = [], col = [];
    for (let i = 0; i < n; i++) {
      const y = 0.3 + R() * 0.7, a = R() * Math.PI * 2, rxz = Math.sqrt(1 - y * y);
      const b = (0.35 + 0.65 * R()) * Math.min(1, (y - 0.3) / 0.3);
      p.push(Math.cos(a) * rxz * 220, y * 220, Math.sin(a) * rxz * 220);
      col.push(b, b, b * 1.05);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
    stars.renderOrder = -9;
    decor.add(stars);
  }

  // 달 (오른쪽 뒤)
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.moon, transparent: true, depthWrite: false, fog: false }));
  moon.position.copy(dirAzEl(150, 32)).multiplyScalar(200); moon.scale.setScalar(26); moon.renderOrder = -8;
  decor.add(moon);

  // 구름: 정면에는 아주 높이만
  const sunH = new THREE.Vector3(SUN.x, 0, SUN.z).normalize();
  for (let i = 0; i < 18; i++) {
    let az, el;
    if (i < 4) { az = rnd(-45, 45); el = rnd(30, 44); } else { az = rnd(55, 305); el = rnd(7, 24); }
    const warm = Math.max(0, dirAzEl(az, 0).dot(sunH));
    const col = new THREE.Color(0xb8a8e0).lerp(new THREE.Color(0xffb48a), warm);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.clouds[i % 3], color: col, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    s.position.copy(dirAzEl(az, el)).multiplyScalar(180);
    s.scale.set(rnd(50, 85), rnd(18, 28), 1);
    s.renderOrder = -7;
    decor.add(s);
  }

  // 먼 산 (정면은 지평선 아래로 낮게) + 가까운 언덕 (옆·뒤)
  {
    const list = [];
    const cols = [0x3b3556, 0x342f4e, 0x433a60];
    for (let az = 0; az < 360; az += 9) {
      const front = az < 48 || az > 312;
      const d = rnd(125, 150), h = front ? rnd(0.4, 1.0) : rnd(16, 36), r = rnd(12, 22), ry = R() * Math.PI;
      const p = at(az + rnd(-3, 3), d, h / 2 - 0.3);
      list.push(colored(place(ni(new THREE.ConeGeometry(r, h, 7)), p, ry), cols[(az / 9 | 0) % 3]));
      if (!front && h > 26) {
        list.push(colored(place(ni(new THREE.ConeGeometry(r * 0.3, h * 0.3, 7)), p.clone().setY(h - 0.3 - h * 0.15 + 0.05), ry), 0xe6e2f2));
      }
    }
    for (let az = 60; az <= 300; az += 11) {
      const h = rnd(6, 13);
      list.push(colored(place(ni(new THREE.ConeGeometry(rnd(10, 16), h, 6)), at(az + rnd(-4, 4), rnd(75, 95), h / 2 - 0.3), R() * 3), 0x2a3a36));
    }
    decor.add(mergedMesh(list));
  }

  // 땅, 돌 바닥, 바닥 마법진
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), new THREE.MeshLambertMaterial({ map: TX.grass }));
  ground.rotation.x = -Math.PI / 2;
  decor.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshLambertMaterial({ map: TX.stone }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.01;
  decor.add(pad);
  const floorRune = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6),
    new THREE.MeshBasicMaterial({ map: TX.rune, color: 0xffcf70, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  floorRune.rotation.x = -Math.PI / 2; floorRune.position.y = 0.02;
  decor.add(floorRune);

  // 울타리, 나무, 바위, 풀 (옆과 뒤 위주, 하나로 합쳐 그리기)
  {
    const list = [];
    let prev = null;
    for (let az = 66; az <= 294; az += 7.5) {
      const p = at(az, 8.5);
      list.push(colored(place(ni(new THREE.BoxGeometry(0.14, 1.2, 0.14)), p.clone().setY(0.6)), 0x6a4a2e));
      if (prev) {
        for (const h of [0.5, 0.95]) {
          const mid = prev.clone().add(p).multiplyScalar(0.5).setY(h);
          list.push(colored(place(ni(new THREE.BoxGeometry(0.06, 0.1, prev.distanceTo(p))), mid, Math.atan2(p.x - prev.x, p.z - prev.z)), 0x7a5634));
        }
      }
      prev = p;
    }
    const leaves = [0x2d5a33, 0x25492c, 0x386b3a, 0x2f4f3f];
    for (let i = 0; i < 55; i++) {
      const az = rnd(72, 288), d = rnd(11, 42), h = rnd(3.5, 7.5), p = at(az, d), lc = leaves[i % 4];
      list.push(colored(place(ni(new THREE.CylinderGeometry(0.12 * h / 5, 0.2 * h / 5, h * 0.35, 6)), p.clone().setY(h * 0.175)), 0x5a3d25));
      list.push(colored(place(ni(new THREE.ConeGeometry(h * 0.3, h * 0.55, 7)), p.clone().setY(h * 0.5), R() * 6), lc));
      list.push(colored(place(ni(new THREE.ConeGeometry(h * 0.22, h * 0.45, 7)), p.clone().setY(h * 0.78), R() * 6), lc + 0x060806));
    }
    for (let i = 0; i < 45; i++) {
      let az = rnd(-180, 180);
      if (Math.abs(az) < 50) az += az < 0 ? -55 : 55;
      const s = rnd(0.15, 0.55);
      list.push(colored(place(ni(new THREE.DodecahedronGeometry(1, 0)), at(az, rnd(3.2, 22), s * 0.25), R() * 6, s), [0x77727f, 0x6a6672, 0x85808c][i % 3]));
    }
    const grassCols = [0x3f7a34, 0x4f8a3a, 0x356a2c, 0x5c9a40];
    for (let i = 0; i < 320; i++) {
      const c = at(rnd(-180, 180), rnd(2.7, 26));
      for (let k = 0; k < 5; k++) {
        const h = rnd(0.18, 0.42);
        const g = ni(new THREE.ConeGeometry(0.035, h, 3));
        g.rotateZ(rnd(-0.3, 0.3));
        list.push(colored(place(g, new THREE.Vector3(c.x + rnd(-0.15, 0.15), h / 2, c.z + rnd(-0.15, 0.15)), R() * 6), grassCols[(R() * 4) | 0]));
      }
    }
    decor.add(mergedMesh(list));
  }

  // 횃불 기둥 + 깃발 (양옆 ±58°)
  const flames = [];
  {
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8f8a9c, flatShading: true });
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x3a3840, flatShading: true });
    const bannerMat = new THREE.MeshLambertMaterial({ map: TX.banner, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
    for (const az of [-58, 58]) {
      const g = new THREE.Group();
      g.position.copy(at(az, 5.4)); g.rotation.y = -az * DEG;
      const part = (geo, mat, y, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(0, y, z); g.add(m); return m; };
      part(new THREE.BoxGeometry(1.0, 0.35, 1.0), stoneMat, 0.175);
      part(new THREE.CylinderGeometry(0.3, 0.36, 2.9, 10), stoneMat, 1.8);
      part(new THREE.BoxGeometry(0.85, 0.25, 0.85), stoneMat, 3.37);
      part(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 12), ironMat, 3.65);
      part(new THREE.BoxGeometry(1.1, 0.05, 0.05), ironMat, 3.1, 0.45);
      part(new THREE.PlaneGeometry(0.85, 1.7), bannerMat, 2.24, 0.48);
      for (let k = 0; k < 3; k++) {
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.flame, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        f.position.set((k - 1) * 0.12, k === 1 ? 4.12 : 4.0, 0);
        f.userData.base = k === 1 ? 0.9 : 0.62; f.userData.k = flames.length;
        g.add(f); flames.push(f);
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.dot, color: 0xff9a40, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.position.y = 3.95; glow.scale.setScalar(2.2);
      g.add(glow);
      decor.add(g);
    }
  }

  // 반딧불 (옆·뒤)
  const FN = 80, base = new Float32Array(FN * 3), ph = new Float32Array(FN);
  for (let i = 0; i < FN; i++) {
    const p = at(rnd(65, 295), rnd(2.8, 12), rnd(0.3, 2.2));
    base.set([p.x, p.y, p.z], i * 3); ph[i] = R() * 100;
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
  fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FN * 3), 3));
  const fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.09, map: TX.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  fireflies.frustumCulled = false;
  decor.add(fireflies);

  return {
    update(t) {
      for (const f of flames) {
        const i = f.userData.k, s = f.userData.base * (1 + 0.1 * Math.sin(t * 0.012 + i * 1.7) + 0.05 * Math.sin(t * 0.029 + i));
        f.scale.set(s * 0.6, s, 1);
        f.material.opacity = 0.85 + 0.15 * Math.sin(t * 0.02 + i);
      }
      const pa = fg.attributes.position.array, ca = fg.attributes.color.array;
      for (let i = 0; i < FN; i++) {
        const q = ph[i];
        pa[i * 3] = base[i * 3] + Math.sin(t * 0.0005 + q) * 0.4;
        pa[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.0007 + q * 2) * 0.25;
        pa[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.0004 + q) * 0.4;
        const b = Math.max(0, Math.sin(t * 0.003 + q * 5));
        ca[i * 3] = 0.85 * b; ca[i * 3 + 1] = b; ca[i * 3 + 2] = 0.45 * b;
      }
      fg.attributes.position.needsUpdate = true;
      fg.attributes.color.needsUpdate = true;
      floorRune.rotation.z = t * 0.00005;
    },
  };
}
