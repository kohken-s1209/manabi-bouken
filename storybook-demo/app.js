/* Knowledge Village — storybook UI demo.
 * Standalone: no network, no storage, no external libraries.
 * All artwork is drawn procedurally with the Canvas 2D API (original code-authored drawings).
 * State lives in memory only; reload resets the demo. Rewards are SIMULATED. */
(() => {
'use strict';

/* ======================================================================
 * 1. Game data
 * ==================================================================== */
const WORLD = 8;                    // world grid is WORLD x WORLD tiles
const N_MIN = 4, N_MAX = 8;         // land side length (4x4 = 16 tiles at start)
const EXPAND_COST = {5: 20, 6: 35, 7: 50, 8: 70};
const SKILL_NAME = {math: '算数', japanese: '国語', english: '英語'};
const loOf = n => Math.floor((WORLD - n) / 2);

// h = visual height in "uz" units (used for tap hit-testing); cost keys map to HUD currencies.
const ITEMS = {
  house:       {name: '小さな家',   w: 1, h: 1, cost: {wood: 8},                         need: [],                                  top: 1.5},
  garden:      {name: 'お花畑',     w: 1, h: 1, cost: {wood: 3},                         need: [],                                  top: 0.5},
  shop:        {name: '雑貨屋',     w: 2, h: 2, cost: {wood: 22},                        need: [],                                  top: 1.6},
  library:     {name: '図書館',     w: 3, h: 2, cost: {wood: 30, books: 8},              need: ['japanese'],                        top: 2.1},
  observatory: {name: '天文台',     w: 2, h: 2, cost: {wood: 25, books: 6},              need: ['math', 'japanese'],                top: 2.5},
  cafe:        {name: '国際カフェ', w: 2, h: 2, cost: {wood: 18, books: 6, globe: 3},   need: ['japanese', 'english'],             top: 1.6},
  trading:     {name: '貿易商店',   w: 2, h: 2, cost: {wood: 28, globe: 4},              need: ['math', 'english'],                 top: 2.1},
  hall:        {name: '交流ホール', w: 3, h: 3, cost: {wood: 55, books: 14, globe: 8},  need: ['math', 'japanese', 'english'],    top: 2.4},
};
const RES_ICON = {wood: '🪵', books: '📚', globe: '🌍'};
const SKILL_NEED = 2;               // study each required subject this many times to unlock

const S = {
  n: N_MIN, wood: 28, books: 0, globe: 0, points: 0,
  skills: {math: 0, japanese: 0, english: 0},
  blds: [{id: 1, type: 'house', x: 3, y: 3}],
  stored: {}, nextId: 2,
};
const ui = {mode: 'explore', sel: null, buildType: null, ghost: null, moveId: null};

/* ======================================================================
 * 2. Small helpers
 * ==================================================================== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hex2rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(hex, f) {      // f>0 lighten, f<0 darken
  const c = hex2rgb(hex).map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); }

/* ======================================================================
 * 3. Canvas, view and projection
 * ==================================================================== */
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let W = 0, H = 0, dpr = 1, bg = null, T = 0;
const view = {tw: 60, cx: 0, cy: 0, c: 4, lo: 2, hi: 6};
const tgt = {tw: 60, cx: 0, cy: 0, c: 4, lo: 2, hi: 6};
let gridA = 0, area = {top: 120, bottom: 600};

function makeP(tw, cx, cy, c) {
  const th = tw / 2;
  return (gx, gy, z) => [cx + (gx - gy) * tw / 2, cy + (gx + gy - 2 * c) * th / 2 - (z || 0)];
}
const curP = () => makeP(view.tw, view.cx, view.cy, view.c);

function computeTarget() {
  const n = S.n, lo = loOf(n), ah = Math.max(120, area.bottom - area.top);
  const twW = W * 0.70 / n;
  const twH = ah * 0.88 / (n / 2 + 1.5);
  tgt.tw = clamp(Math.min(twW, twH), 24, 170);
  tgt.cx = W / 2;
  tgt.c = lo + n / 2; tgt.lo = lo; tgt.hi = lo + n;
  const total = tgt.tw * (n / 2 + 1.4);
  tgt.cy = area.top + (ah - total) / 2 + tgt.tw * 1.1 + n * tgt.tw / 4;
}
function snapView() { computeTarget(); Object.assign(view, tgt); }

function layout() {
  const root = document.documentElement.style;
  const bar = document.querySelector('.bar');
  const barH = bar.offsetHeight;
  root.setProperty('--bar-h', barH + 'px');
  const sheet = $('sheet');
  const sheetH = sheet.classList.contains('open') ? sheet.offsetHeight : 0;
  root.setProperty('--above', (barH + sheetH) + 'px');
  const hud = document.querySelector('.hud');
  const hudB = hud.getBoundingClientRect().bottom;
  root.setProperty('--hud-h', hudB + 'px');
  // reserve hint/action-bar space up front so the map never shifts under a tapping finger
  const placing = ui.mode === 'build' || ui.mode === 'move';
  area.top = hudB + 44;
  area.bottom = window.innerHeight - barH - sheetH - (placing ? 60 : 0) - 6;
  computeTarget();
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  bg = buildBackdrop(W, H, dpr);
  layout(); snapView(); dirty = true;
}

/* tile <-> screen */
function screenToGrid(px, py) {
  const u = (px - view.cx) / (view.tw / 2), v = (py - view.cy) / (view.tw / 4);
  return [(u + v) / 2 + view.c, (v - u) / 2 + view.c];
}
function tileAt(px, py) {
  const [gx, gy] = screenToGrid(px, py);
  const x = Math.floor(gx), y = Math.floor(gy);
  return inLand(x, y) ? {x, y} : null;
}
function inLand(x, y) { const lo = loOf(S.n); return x >= lo && x < lo + S.n && y >= lo && y < lo + S.n; }

/* ======================================================================
 * 4. Art — trees, bushes, rocks (procedural, original)
 * ==================================================================== */
const TREE_COL = [
  ['#2f7a45', '#4a9a4c', '#7bbf55', '#b4dc78'],   // 0 leafy green
  ['#c8628c', '#e68aae', '#f5b5cb', '#ffe0ea'],   // 1 blossom
  ['#25683f', '#3a8750', '#5ea560', '#8bc474'],   // 2 conifer
  ['#b8501f', '#df7b2b', '#f0a640', '#f8cf74'],   // 3 autumn
  ['#3f8f4e', '#68b153', '#99d062', '#cfe88a'],   // 4 spring light
];
const BLOBS = [[-.62, .12, .66], [.62, .14, .66], [0, -.42, .82], [-.34, -.2, .74], [.36, -.18, .74], [0, .16, .86]];

function drawTree(c, x, y, s, kind, seed) {
  const col = TREE_COL[kind];
  c.save();
  c.globalAlpha *= 1;
  // cast shadow toward upper-left
  c.fillStyle = 'rgba(30,70,30,.22)';
  c.beginPath(); c.ellipse(x - s * 0.14, y - s * 0.01, s * 0.3, s * 0.085, 0, 0, 6.2832); c.fill();
  if (kind === 2) {                                   // conifer
    c.fillStyle = '#6e4a2b'; c.fillRect(x - s * 0.035, y - s * 0.2, s * 0.07, s * 0.2);
    for (let i = 0; i < 3; i++) {
      const by = y - s * (0.14 + 0.24 * i), ty = by - s * 0.42, hw = s * (0.27 - 0.05 * i);
      poly(c, [[x, ty], [x + hw, by], [x - hw, by]], col[0]);
      poly(c, [[x, ty], [x, by], [x - hw, by]], col[1]);
      poly(c, [[x, ty + s * 0.05], [x - hw * 0.45, by - s * 0.06], [x - hw * 0.8, by]], col[2]);
    }
    c.restore(); return;
  }
  c.fillStyle = '#7a5230'; c.fillRect(x - s * 0.045, y - s * 0.34, s * 0.09, s * 0.34);
  c.fillStyle = '#9a6c3f'; c.fillRect(x - s * 0.045, y - s * 0.34, s * 0.035, s * 0.34);
  const R = s * 0.34, cy = y - s * 0.6, r = rng(seed * 7 + 3);
  const passes = [[0, 0, 1, col[0]], [-.08, -.1, .88, col[1]], [-.2, -.26, .56, col[2]]];
  passes.forEach(([ox, oy, k, color], pi) => {
    BLOBS.forEach((b, bi) => {
      if (pi === 2 && bi > 4) return;
      circle(c, x + (b[0] + ox) * R, cy + (b[1] + oy) * R, b[2] * R * k, color);
    });
  });
  for (let i = 0; i < 6; i++) circle(c, x + (r() - .62) * R * 1.3, cy + (r() - .75) * R * 1.2, R * 0.09, col[3]);
  for (let i = 0; i < 5; i++) circle(c, x + (r() - .3) * R * 1.4, cy + (r() - .1) * R * 1.0, R * 0.07, col[0]);
  c.restore();
}
function drawBush(c, x, y, s, kind, seed) {
  const col = TREE_COL[kind === 1 ? 1 : 4], r = rng(seed * 5 + 1);
  c.fillStyle = 'rgba(30,70,30,.2)';
  c.beginPath(); c.ellipse(x - s * 0.1, y, s * 0.34, s * 0.09, 0, 0, 6.2832); c.fill();
  const bl = [[-.5, -.22, .34], [.5, -.2, .32], [0, -.34, .4], [-.16, -.14, .36], [.2, -.12, .34]];
  bl.forEach(b => circle(c, x + b[0] * s, y + b[1] * s, b[2] * s, col[0]));
  bl.forEach(b => circle(c, x + (b[0] - .05) * s, y + (b[1] - .06) * s, b[2] * s * .82, col[1]));
  bl.slice(2).forEach(b => circle(c, x + (b[0] - .12) * s, y + (b[1] - .13) * s, b[2] * s * .45, col[2]));
  for (let i = 0; i < 4; i++) circle(c, x + (r() - .5) * s * .8, y - s * (.12 + r() * .3), s * .035, ['#fff3a8', '#ffffff', '#ffc2d4'][i % 3]);
}
function drawRock(c, x, y, s) {
  c.fillStyle = 'rgba(30,60,30,.2)';
  c.beginPath(); c.ellipse(x - s * .08, y, s * .36, s * .09, 0, 0, 6.2832); c.fill();
  poly(c, [[x - s * .34, y], [x - s * .26, y - s * .26], [x + s * .02, y - s * .36], [x + s * .3, y - s * .2], [x + s * .36, y]], '#8d8b82');
  poly(c, [[x - s * .26, y - s * .26], [x + s * .02, y - s * .36], [x + s * .12, y - s * .2], [x - s * .12, y - s * .1]], '#b4b1a4');
  circle(c, x - s * .1, y - s * .3, s * .07, '#7fb85a');
}
function drawFlowerPatch(c, x, y, s, seed) {
  const r = rng(seed * 11 + 5), cols = ['#fff6b0', '#ffb3c6', '#ffffff', '#ffd27a', '#c9b6ff'];
  for (let i = 0; i < 7; i++) {
    const fx = x + (r() - .5) * s * .9, fy = y + (r() - .5) * s * .3;
    c.strokeStyle = '#4f9a3f'; c.lineWidth = Math.max(1, s * .03);
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - s * .1); c.stroke();
    circle(c, fx, fy - s * .12, s * .06, cols[i % 5]); circle(c, fx, fy - s * .12, s * .022, '#e8a23a');
  }
}
function drawCloud(c, x, y, s) {
  c.fillStyle = 'rgba(255,255,255,.92)';
  [[0, 0, .5], [.5, -.12, .6], [1.05, 0, .5], [.55, .1, .5], [.15, .12, .4], [.95, .12, .4]].forEach(b => { c.beginPath(); c.arc(x + b[0] * s, y + b[1] * s, b[2] * s * .6, 0, 6.2832); c.fill(); });
  c.fillStyle = 'rgba(214,232,240,.55)';
  c.beginPath(); c.ellipse(x + .55 * s, y + .22 * s, .75 * s, .12 * s, 0, 0, 6.2832); c.fill();
}

/* ======================================================================
 * 5. Backdrop (cached): sky, hills, meadow, layered forest
 * ==================================================================== */
function buildBackdrop(w, h, ratio) {
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(w * ratio); c.height = Math.round(h * ratio); const x = c.getContext('2d'); x.scale(ratio, ratio); return [c, x]; };
  const [skyC, sk] = mk(), [farC, fr] = mk();
  const hy = h * 0.36;
  let g = sk.createLinearGradient(0, 0, 0, hy * 1.15);
  g.addColorStop(0, '#79c6e6'); g.addColorStop(.6, '#bfe6ee'); g.addColorStop(1, '#f6f0cb');
  sk.fillStyle = g; sk.fillRect(0, 0, w, h);
  g = sk.createRadialGradient(w * .8, h * .08, 0, w * .8, h * .08, w * .7);
  g.addColorStop(0, 'rgba(255,248,200,.85)'); g.addColorStop(1, 'rgba(255,248,200,0)');
  sk.fillStyle = g; sk.fillRect(0, 0, w, h);
  // light shafts
  sk.fillStyle = 'rgba(255,255,230,.10)';
  for (let i = 0; i < 4; i++) { const x0 = w * (.5 + i * .13); poly(sk, [[x0, 0], [x0 + w * .07, 0], [x0 - w * .25, h * .55], [x0 - w * .35, h * .55]], 'rgba(255,255,230,.07)'); }

  // distant hills
  const ridge = (base, amp, f1, ph, color, treeCol, trees) => {
    fr.beginPath(); fr.moveTo(0, h);
    const pts = [];
    for (let x = 0; x <= w + 8; x += 8) { const y = base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f1 * 2.3 + ph * 1.7) * amp * .4; pts.push([x, y]); fr.lineTo(x, y); }
    fr.lineTo(w, h); fr.closePath();
    const gg = fr.createLinearGradient(0, base - amp, 0, base + h * .1); gg.addColorStop(0, color[0]); gg.addColorStop(1, color[1]);
    fr.fillStyle = gg; fr.fill();
    const rr = rng(Math.round(ph * 100));
    for (let i = 0; i < trees; i++) {
      const p = pts[Math.floor(rr() * pts.length)], s = h * (.035 + rr() * .02);
      poly(fr, [[p[0], p[1] - s], [p[0] + s * .3, p[1] + 2], [p[0] - s * .3, p[1] + 2]], treeCol);
    }
  };
  ridge(hy - h * .1, h * .035, .006, 1.2, ['#a5cfc0', '#b9dcc4'], '#8dbfa7', 26);
  ridge(hy - h * .045, h * .03, .009, 4.1, ['#86c19a', '#a2d29a'], '#6fae88', 34);

  // meadow
  g = fr.createLinearGradient(0, hy - h * .03, 0, h);
  g.addColorStop(0, '#a9d96a'); g.addColorStop(.5, '#8fcb5c'); g.addColorStop(1, '#6fb050');
  fr.fillStyle = g;
  fr.beginPath(); fr.moveTo(0, h); fr.lineTo(0, hy);
  for (let x = 0; x <= w + 10; x += 10) fr.lineTo(x, hy - Math.sin(x * .012) * h * .012 - Math.sin(x * .031) * h * .006);
  fr.lineTo(w, h); fr.closePath(); fr.fill();
  const r = rng(42);
  for (let i = 0; i < 6; i++) {       // soft light patches
    const x = r() * w, y = hy + r() * (h - hy), rad = w * (.12 + r() * .18);
    const gg = fr.createRadialGradient(x, y, 0, x, y, rad); gg.addColorStop(0, 'rgba(220,240,140,.28)'); gg.addColorStop(1, 'rgba(220,240,140,0)');
    fr.fillStyle = gg; fr.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const blades = Math.round(w * h / 420);
  for (let i = 0; i < blades; i++) {
    const x = r() * w, y = hy + r() * (h - hy), s = 2 + (y / h) * 6;
    fr.strokeStyle = r() < .5 ? 'rgba(70,140,60,.35)' : 'rgba(190,230,110,.4)'; fr.lineWidth = 1;
    fr.beginPath(); fr.moveTo(x, y); fr.lineTo(x + (r() - .5) * 3, y - s); fr.stroke();
  }
  for (let i = 0; i < blades / 12; i++) {
    const x = r() * w, y = hy + 10 + r() * (h - hy - 10), s = 1.6 + (y / h) * 2.6;
    circle(fr, x, y, s, ['#fff7b8', '#ffffff', '#ffc4d6', '#ffe08a'][i % 4]); circle(fr, x, y, s * .4, '#e6a53c');
  }

  // layered forest rows, back to front
  const rows = 4;
  for (let k = 0; k < rows; k++) {
    const rr = rng(100 + k), base = hy + h * (.012 + k * .042), sz = Math.min(w * .5, h * (.15 + k * .03));
    const step = sz * (.46 + k * .02);
    for (let x = -sz * .5; x < w + sz; x += step) {
      const kind = pickKind(rr());
      const jitter = (rr() - .5) * step * .5;
      drawTree(fr, x + jitter, base + (rr() - .5) * h * .01, sz * (.85 + rr() * .3), kind, Math.floor(rr() * 1000));
    }
    // meadow tuft line between rows for depth
    const gg = fr.createLinearGradient(0, base, 0, base + h * .03); gg.addColorStop(0, 'rgba(120,180,80,0)'); gg.addColorStop(1, 'rgba(150,205,90,.55)');
    fr.fillStyle = gg; fr.fillRect(0, base, w, h * .03);
  }
  // tall side trees framing the scene
  const side = rng(777);
  for (let i = 0; i < 6; i++) {
    const sz = h * (.24 + side() * .08), y = h * (.5 + i * .075);
    drawTree(fr, -sz * .1 + side() * sz * .2, y, sz, pickKind(side()), 900 + i);
    drawTree(fr, w + sz * .1 - side() * sz * .2, y + h * .03, sz, pickKind(side()), 950 + i);
  }
  return {sky: skyC, far: farC};
}
function pickKind(v) { return v < .56 ? 0 : v < .68 ? 1 : v < .82 ? 2 : v < .91 ? 3 : 4; }

/* ======================================================================
 * 6. Water — waterfall cliff, pool and stream (hugs the land plot)
 * ==================================================================== */
let streamPts = [];
function drawWater(P) {
  const tw = view.tw, th = tw / 2, r = (view.hi - view.lo) / 2, cx = view.cx, cy = view.cy;
  const Lx = cx - r * tw, Ty = cy - r * th;
  const eBL = f => [cx - f * r * tw, Ty + f * r * th], eFL = f => [Lx + f * r * tw, cy + f * r * th];
  const n1 = [-.447, -.894], n2 = [-.447, .894];
  const add = (p, n, d) => [p[0] + n[0] * d * tw, p[1] + n[1] * d * tw];
  const minX = W * 0.035;
  let pts = [add(eBL(.38), n1, 1.05), add(eBL(.82), n1, .95), [Lx - tw * .95, cy], add(eFL(.3), n2, 1.0), add(eFL(.72), n2, 1.15)];
  const last = pts[4];
  pts.push([last[0] + tw * .35, last[1] + tw * 1.2], [last[0] + tw * .8, H + tw]);
  pts = pts.map(p => [Math.max(minX, p[0]), p[1]]);
  const wdt = clamp(tw * .5, 14, 70);
  // sample smooth path
  const path = new Path2D();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  path.moveTo(pts[0][0], pts[0][1]);
  streamPts = [];
  let prev = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    path.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, a = 1 - t;
      streamPts.push([a * a * prev[0] + 2 * a * t * pts[i][0] + t * t * m[0], a * a * prev[1] + 2 * a * t * pts[i][1] + t * t * m[1]]);
    }
    prev = m;
  }
  path.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);

  // cliff + waterfall at the stream source
  const p0 = pts[0], ch = Math.max(tw * 1.9, H * .13), cw = tw * 1.5, top = p0[1] - ch;
  ctx.save();
  const rock = ctx.createLinearGradient(p0[0] - cw / 2, 0, p0[0] + cw / 2, 0);
  rock.addColorStop(0, '#a79b83'); rock.addColorStop(.55, '#8c8068'); rock.addColorStop(1, '#6f6652');
  ctx.fillStyle = rock;
  ctx.beginPath();
  ctx.moveTo(p0[0] - cw * .62, p0[1] + 4);
  ctx.quadraticCurveTo(p0[0] - cw * .66, top + ch * .4, p0[0] - cw * .44, top + ch * .08);
  ctx.quadraticCurveTo(p0[0] - cw * .1, top - ch * .06, p0[0] + cw * .3, top + ch * .04);
  ctx.quadraticCurveTo(p0[0] + cw * .62, top + ch * .14, p0[0] + cw * .6, p0[1] + 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(70,60,40,.35)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) { const yy = top + ch * (.18 + i * .12); ctx.beginPath(); ctx.moveTo(p0[0] - cw * .55, yy); ctx.lineTo(p0[0] - cw * .1 + (i % 3) * cw * .12, yy + ch * .03); ctx.stroke(); }
  // mossy top
  ctx.fillStyle = '#6fae48';
  ctx.beginPath(); ctx.ellipse(p0[0] - cw * .05, top + ch * .07, cw * .5, ch * .08, 0, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#9bd25f';
  ctx.beginPath(); ctx.ellipse(p0[0] - cw * .12, top + ch * .05, cw * .38, ch * .05, 0, 0, 6.2832); ctx.fill();
  // fall
  const fx = p0[0] + cw * .02, fw = cw * .3;
  const wg = ctx.createLinearGradient(0, top, 0, p0[1]);
  wg.addColorStop(0, '#e9fbff'); wg.addColorStop(.5, '#bfeaf5'); wg.addColorStop(1, '#8fd3e8');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.moveTo(fx - fw / 2, top + ch * .06); ctx.lineTo(fx + fw / 2, top + ch * .06); ctx.lineTo(fx + fw * .62, p0[1]); ctx.lineTo(fx - fw * .62, p0[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, fw * .08); ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const xx = fx + (i - 1.5) * fw * .25;
    ctx.setLineDash([ch * .12, ch * .1]); ctx.lineDashOffset = -T * ch * .9 - i * 9;
    ctx.beginPath(); ctx.moveTo(xx, top + ch * .08); ctx.lineTo(xx * 1 + (i - 1.5) * fw * .03, p0[1]); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
  // trees on the cliff top
  drawTree(ctx, p0[0] - cw * .3, top + ch * .1, tw * 1.3, 4, 31);
  drawTree(ctx, p0[0] + cw * .36, top + ch * .12, tw * 1.05, 0, 32);

  // stream body
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#6a8f3f'; ctx.lineWidth = wdt + 10; ctx.stroke(path);              // grassy bank
  ctx.strokeStyle = '#c2a76f'; ctx.lineWidth = wdt + 4; ctx.stroke(path);                // sand edge
  ctx.strokeStyle = '#5db4d4'; ctx.lineWidth = wdt; ctx.stroke(path);
  ctx.strokeStyle = '#8fd6ea'; ctx.lineWidth = wdt * .6; ctx.stroke(path);
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = Math.max(1.5, wdt * .07);
  ctx.setLineDash([wdt * .6, wdt * 1.1]); ctx.lineDashOffset = -T * wdt * 1.4; ctx.stroke(path);
  ctx.lineDashOffset = -T * wdt * 1.4 - wdt * .8; ctx.lineWidth = Math.max(1, wdt * .05); ctx.stroke(path);
  ctx.setLineDash([]);
  ctx.restore();
  // pool + mist at fall base
  ctx.fillStyle = '#6cc0dc'; ctx.beginPath(); ctx.ellipse(p0[0] + cw * .02, p0[1] + 2, cw * .5, cw * .14, 0, 0, 6.2832); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  const pulse = .5 + .5 * Math.sin(T * 2.4);
  ctx.beginPath(); ctx.ellipse(p0[0] + cw * .02, p0[1], cw * (.3 + pulse * .05), cw * .09, 0, 0, 6.2832); ctx.fill();
  circle(ctx, p0[0] - cw * .1, p0[1] - cw * .08 - pulse * 4, cw * .1, 'rgba(255,255,255,.35)');
  circle(ctx, p0[0] + cw * .18, p0[1] - cw * .1 - pulse * 6, cw * .13, 'rgba(255,255,255,.3)');
  // reeds + stones along the bank
  const rr = rng(5);
  for (let i = 0; i < streamPts.length; i += 3) {
    const p = streamPts[i];
    if (rr() < .6) drawRock(ctx, p[0] + wdt * .7 * (rr() < .5 ? -1 : 1), p[1] + 3, tw * .18);
    else drawFlowerPatch(ctx, p[0] - wdt * .8, p[1] + 2, tw * .35, i);
  }
}
function nearStream(x, y, d) {
  for (let i = 0; i < streamPts.length; i++) { const p = streamPts[i], dx = p[0] - x, dy = (p[1] - y) * 1.3; if (dx * dx + dy * dy < d * d) return true; }
  return false;
}

/* ======================================================================
 * 7. Land plot, fences, decorations
 * ==================================================================== */
const tufts = [];
(function () {
  const cols = ['#fff6b0', '#ffb3c6', '#ffffff', '#ffd27a', '#c9b6ff'];
  for (let x = 0; x < WORLD; x++) for (let y = 0; y < WORLD; y++) {
    const r = rng(x * 131 + y * 17 + 9), list = [];
    for (let i = 0; i < 3; i++) list.push({dx: .12 + r() * .76, dy: .12 + r() * .76, f: r() < .38 ? cols[Math.floor(r() * 5)] : null});
    tufts.push({x, y, list});
  }
})();

function drawLand(P) {
  const {lo, hi, tw} = view, dz = tw * .2;
  const A = P(lo, lo), B = P(hi, lo), C = P(hi, hi), D = P(lo, hi);
  const ex = .45;
  poly(ctx, [P(lo - ex, lo - ex), P(hi + ex, lo - ex), P(hi + ex, hi + ex), P(lo - ex, hi + ex)], 'rgba(200,232,130,.5)');
  poly(ctx, [P(lo - ex * .5, lo - ex * .5), P(hi + ex * .5, lo - ex * .5), P(hi + ex * .5, hi + ex * .5), P(lo - ex * .5, hi + ex * .5)], 'rgba(190,226,120,.7)');
  // soft drop shadow under the plot
  poly(ctx, [[D[0], D[1] + dz], [C[0], C[1] + dz], [B[0], B[1] + dz], [C[0], C[1] + dz * 2.6]], 'rgba(40,70,25,.25)');
  // earth faces
  let g = ctx.createLinearGradient(0, D[1], 0, D[1] + dz + tw * .2);
  g.addColorStop(0, '#b98853'); g.addColorStop(1, '#7c5230');
  poly(ctx, [D, C, [C[0], C[1] + dz], [D[0], D[1] + dz]], g);
  g = ctx.createLinearGradient(0, B[1], 0, B[1] + dz + tw * .2);
  g.addColorStop(0, '#9a6b3e'); g.addColorStop(1, '#684426');
  poly(ctx, [C, B, [B[0], B[1] + dz], [C[0], C[1] + dz]], g);
  const rr = rng(8);
  for (let i = 0; i < (hi - lo) * 5; i++) {   // pebbles in the earth bank
    const f = rr(), onLeft = rr() < .5;
    const a = onLeft ? D : C, b = onLeft ? C : B, x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f) + dz * (.25 + rr() * .55);
    ctx.fillStyle = rr() < .5 ? 'rgba(220,190,140,.55)' : 'rgba(80,50,25,.4)';
    ctx.beginPath(); ctx.ellipse(x, y, tw * .04, tw * .025, 0, 0, 6.2832); ctx.fill();
  }
  // lawn top
  g = ctx.createLinearGradient(A[0], A[1], C[0], C[1]);
  g.addColorStop(0, '#b3e174'); g.addColorStop(.55, '#97d066'); g.addColorStop(1, '#85c458');
  poly(ctx, [A, B, C, D], g, '#d2ee98', 2);
  // grass lip
  ctx.strokeStyle = '#6aa844'; ctx.lineWidth = Math.max(2, tw * .045); ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(D[0], D[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  // grass tufts and flowers (organic, not a grid)
  tufts.forEach(t => {
    if (t.x + .5 < lo || t.x + .5 > hi || t.y + .5 < lo || t.y + .5 > hi) return;
    t.list.forEach(o => {
      const p = P(t.x + o.dx, t.y + o.dy), s = tw * .07;
      if (o.f) { circle(ctx, p[0], p[1] - s, s * .55, o.f); circle(ctx, p[0], p[1] - s, s * .2, '#e6a53c'); }
      ctx.strokeStyle = '#5f9d3d'; ctx.lineWidth = Math.max(1, tw * .014);
      ctx.beginPath(); ctx.moveTo(p[0] - s * .6, p[1]); ctx.lineTo(p[0] - s * .9, p[1] - s * 1.3); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - s * 1.6); ctx.moveTo(p[0] + s * .6, p[1]); ctx.lineTo(p[0] + s * 1.0, p[1] - s * 1.2); ctx.stroke();
    });
  });
}
function drawFences(P) {
  const {lo, hi, tw} = view, f = tw * .2;
  ctx.lineCap = 'round';
  const edge = (fn) => {
    const pts = [];
    for (let k = 0; lo + k <= hi + .001; k++) pts.push(lo + k);
    [.4, .78].forEach(h => { ctx.strokeStyle = '#a9733f'; ctx.lineWidth = Math.max(1.5, tw * .03); ctx.beginPath(); pts.forEach((v, i) => { const p = fn(v, f * h); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke(); });
    pts.forEach(v => {
      const b = fn(v, 0), t = fn(v, f);
      ctx.strokeStyle = '#8a5e36'; ctx.lineWidth = Math.max(2.5, tw * .05); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
      ctx.strokeStyle = '#d9a566'; ctx.lineWidth = Math.max(1.5, tw * .025); ctx.beginPath(); ctx.moveTo(b[0] - 1, b[1]); ctx.lineTo(t[0] - 1, t[1]); ctx.stroke();
    });
  };
  edge((v, z) => P(lo, v, z));     // back-left edge
  edge((v, z) => P(v, lo, z));     // back-right edge
}

/* ======================================================================
 * 8. Buildings (procedural isometric drawings)
 * ==================================================================== */
const SPEC = {
  house:   {wall: '#f7e6c2', roof: '#d9432f', wh: .85, rh: .7,  door: {f: 'L', t: .5},  wins: [{f: 'R', t: .5}, {f: 'L', t: .17, s: .8}, {f: 'L', t: .83, s: .8}], chimney: true},
  shop:    {wall: '#f3d8a2', roof: '#e0873a', wh: .9,  rh: .62, door: {f: 'L', t: .27}, wins: [{f: 'L', t: .72, big: true}, {f: 'R', t: .3}, {f: 'R', t: .7}], awning: true},
  library: {wall: '#eee3cb', roof: '#5b7fc0', wh: 1.0, rh: .72, door: {f: 'L', t: .5},  wins: [{f: 'L', t: .17}, {f: 'L', t: .33}, {f: 'L', t: .67}, {f: 'L', t: .83}, {f: 'R', t: .3}, {f: 'R', t: .7}], cupola: true},
  cafe:    {wall: '#fcefdc', roof: '#e48aa0', wh: .85, rh: .58, door: {f: 'L', t: .72}, wins: [{f: 'L', t: .28, big: true}, {f: 'R', t: .3}, {f: 'R', t: .7}], parasol: true},
  trading: {wall: '#ead6ac', roof: '#3f9d94', wh: .9,  rh: .6,  door: {f: 'L', t: .3},  wins: [{f: 'L', t: .72}, {f: 'R', t: .3}, {f: 'R', t: .7}], mast: true},
  hall:    {wall: '#f6dfc8', roof: '#8f6bb8', wh: 1.1, rh: .95, door: {f: 'L', t: .5, w: .2}, wins: [{f: 'L', t: .15}, {f: 'L', t: .3}, {f: 'L', t: .7}, {f: 'L', t: .85}, {f: 'R', t: .2}, {f: 'R', t: .5}, {f: 'R', t: .8}], flags: true},
};

function drawBuilding(c, P, tw, type, x, y, alpha, time) {
  c.save();
  c.globalAlpha = alpha == null ? 1 : alpha;
  if (type === 'garden') drawGarden(c, P, tw, x, y, time);
  else if (type === 'observatory') drawObservatory(c, P, tw, x, y, time);
  else drawHouse(c, P, tw, x, y, type, time);
  c.restore();
}
function groundShadow(c, P, x0, x1, y0, y1, len) {
  [[len, .26, .06], [len * .66, .2, .1], [len * .3, .16, .12]].forEach(([l, pad, a]) => {
    poly(c, [P(x0 - l, y0 - pad * .2), P(x1 + pad * .3, y0 - pad * .2), P(x1 + pad * .3, y1 + pad * .3), P(x0 - l, y1 + pad * .3)], `rgba(30,65,30,${a + .06})`);
  });
}
function drawHouse(c, P, tw, bx, by, type, time) {
  const s = SPEC[type], it = ITEMS[type], uz = tw * .55, m = .08;
  const x0 = bx + m, x1 = bx + it.w - m, y0 = by + m, y1 = by + it.h - m;
  const wh = s.wh * uz, rh = s.rh * uz, zt = wh + rh;
  const wallR = s.wall, wallL = shade(s.wall, -.2), roof = s.roof;
  groundShadow(c, P, x0, x1, y0, y1, .5 + (wh + rh) / uz * .55);
  // walls with stone foundation
  poly(c, [P(x0, y1), P(x1, y1), P(x1, y1, wh), P(x0, y1, wh)], wallL);
  poly(c, [P(x1, y1), P(x1, y0), P(x1, y0, wh), P(x1, y1, wh)], wallR);
  const fz = uz * .13;
  poly(c, [P(x0, y1), P(x1, y1), P(x1, y1, fz), P(x0, y1, fz)], '#a99a80');
  poly(c, [P(x1, y1), P(x1, y0), P(x1, y0, fz), P(x1, y1, fz)], '#c1b399');
  c.strokeStyle = 'rgba(90,60,35,.5)'; c.lineWidth = 1.2;
  c.beginPath(); const e0 = P(x1, y1), e1 = P(x1, y1, wh); c.moveTo(e0[0], e0[1]); c.lineTo(e1[0], e1[1]); c.stroke();
  // wall decorations on face f at fraction t
  const FP = (f, t, z) => f === 'L' ? P(lerp(x0, x1, t), y1, z) : P(x1, lerp(y1, y0, t), z);
  const quad = (f, ta, tb, za, zb) => [FP(f, ta, za), FP(f, tb, za), FP(f, tb, zb), FP(f, ta, zb)];
  const flen = f => (f === 'L' ? (x1 - x0) : (y1 - y0));
  const win = (w) => {
    const hw = (w.big ? .17 : .1) * (w.s || 1) / Math.max(.6, flen(w.f) / 1.0) * (flen(w.f) > 1.5 ? 1.3 : 1);
    const za = wh * .4, zb = wh * (w.big ? .82 : .78);
    poly(c, quad(w.f, w.t - hw - .02, w.t + hw + .02, za - uz * .04, zb + uz * .04), '#fff2d6', '#8a5e36', 1.2);
    const gl = c.createLinearGradient(...FP(w.f, w.t - hw, zb), ...FP(w.f, w.t + hw, za));
    gl.addColorStop(0, '#bfe9f6'); gl.addColorStop(1, '#6fb4d4');
    poly(c, quad(w.f, w.t - hw, w.t + hw, za, zb), gl);
    c.strokeStyle = '#fff2d6'; c.lineWidth = 1.1;
    c.beginPath(); let a = FP(w.f, w.t, za), b = FP(w.f, w.t, zb); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    a = FP(w.f, w.t - hw, (za + zb) / 2); b = FP(w.f, w.t + hw, (za + zb) / 2); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    // flower box
    poly(c, quad(w.f, w.t - hw, w.t + hw, za - uz * .08, za), '#a9733f');
    const fb = FP(w.f, w.t, za + 1);
    for (let i = -1; i <= 1; i++) circle(c, fb[0] + i * tw * .035, fb[1] - tw * .015, tw * .02, i ? '#ff9ab4' : '#ffd86a');
  };
  s.wins.forEach(win);
  const dw = s.door.w || .14;
  poly(c, quad(s.door.f, s.door.t - dw - .02, s.door.t + dw + .02, 0, wh * .66), '#fff2d6', '#8a5e36', 1.2);
  poly(c, quad(s.door.f, s.door.t - dw, s.door.t + dw, 0, wh * .62), '#8a5230');
  poly(c, quad(s.door.f, s.door.t - dw, s.door.t, 0, wh * .62), '#a0663a');
  const kn = FP(s.door.f, s.door.t + dw * .6, wh * .3); circle(c, kn[0], kn[1], tw * .018, '#ffd86a');

  // roof
  const ax = (it.w > it.h) ? 'x' : (it.w < it.h ? 'y' : 'x');
  const Q = (u, v, z) => ax === 'x' ? P(u, v, z) : P(v, u, z);
  const [u0, u1, v0, v1] = ax === 'x' ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const ov = .16, vm = (v0 + v1) / 2, ez = wh - uz * .06;
  const slopeCol = ax === 'x' ? shade(roof, -.1) : shade(roof, .08);
  const gableWall = ax === 'x' ? wallR : wallL;
  poly(c, [Q(u1, v1, wh), Q(u1, v0, wh), Q(u1, vm, zt)], gableWall);
  // round attic window on gable
  const gc = Q(u1, vm, wh + rh * .35); circle(c, gc[0], gc[1], tw * .06, '#fff2d6'); circle(c, gc[0], gc[1], tw * .042, '#7fbcd8');
  const slope = [Q(u0 - ov, v1 + ov, ez), Q(u1 + ov, v1 + ov, ez), Q(u1 + ov, vm, zt), Q(u0 - ov, vm, zt)];
  const rg = c.createLinearGradient(...slope[0], ...slope[3]);
  rg.addColorStop(0, shade(roof, ax === 'x' ? -.16 : .02)); rg.addColorStop(1, slopeCol);
  poly(c, slope, rg);
  c.strokeStyle = shade(roof, -.3); c.lineWidth = 1; c.globalAlpha *= .55;
  for (let k = 1; k <= 4; k++) {
    const f = k / 5, a = Q(u0 - ov, lerp(v1 + ov, vm, f), lerp(ez, zt, f)), b = Q(u1 + ov, lerp(v1 + ov, vm, f), lerp(ez, zt, f));
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  c.globalAlpha /= .55;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = shade(roof, -.28); c.lineWidth = Math.max(2, tw * .05);       // fascia + barge boards
  c.beginPath(); let a = Q(u0 - ov, v1 + ov, ez), b = Q(u1 + ov, v1 + ov, ez); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  c.beginPath(); const q0 = Q(u1 + ov, v1 + ov, ez), q1 = Q(u1 + ov, vm, zt), q2 = Q(u1 + ov, v0 - ov, ez);
  c.moveTo(q0[0], q0[1]); c.lineTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.stroke();
  c.strokeStyle = shade(roof, .35); c.lineWidth = Math.max(1.5, tw * .028);     // ridge highlight
  a = Q(u0 - ov, vm, zt); b = Q(u1 + ov, vm, zt); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();

  const box = (bu0, bu1, bv0, bv1, z0, z1, cV, cU, cT) => {
    poly(c, [Q(bu0, bv1, z0), Q(bu1, bv1, z0), Q(bu1, bv1, z1), Q(bu0, bv1, z1)], cV);
    poly(c, [Q(bu1, bv1, z0), Q(bu1, bv0, z0), Q(bu1, bv0, z1), Q(bu1, bv1, z1)], cU);
    poly(c, [Q(bu0, bv0, z1), Q(bu1, bv0, z1), Q(bu1, bv1, z1), Q(bu0, bv1, z1)], cT);
  };
  const cV = ax === 'x' ? '#9a6a55' : '#c08a70', cU = ax === 'x' ? '#c08a70' : '#9a6a55';
  const roofZ = v => zt - (v - vm) / (v1 + ov - vm) * (zt - ez);
  if (s.chimney) {
    const cu = lerp(u0, u1, .2), cv = vm + .12;
    box(cu - .07, cu + .07, cv - .07, cv + .07, roofZ(cv + .07) - uz * .05, zt + uz * .3, cV, cU, '#5a4030');
    const sp = Q(cu, cv, zt + uz * .34);
    for (let i = 0; i < 3; i++) { const ph = ((time * .35 + i / 3) % 1); circle(c, sp[0] + ph * tw * .1 - tw * .03, sp[1] - ph * tw * .45, tw * (.035 + ph * .05), `rgba(255,255,255,${.55 * (1 - ph)})`); }
  }
  if (s.cupola) {
    const cu = (u0 + u1) / 2;
    box(cu - .12, cu + .12, vm - .12, vm + .12, zt - uz * .05, zt + uz * .45, '#f0e3c8', '#d4c4a4', '#d4c4a4');
    poly(c, [Q(cu - .16, vm + .16, zt + uz * .45), Q(cu + .16, vm + .16, zt + uz * .45), Q(cu + .16, vm - .16, zt + uz * .45), Q(cu - .16, vm - .16, zt + uz * .45), Q(cu, vm, zt + uz * .8)], shade(roof, -.1));
  }
  if (s.awning) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const ta = .06 + i * (.88 / n), tb = ta + .88 / n, z0 = wh * .78, z1 = wh * .62, off = .22;
      const pa = FP('L', ta, z0), pb = FP('L', tb, z0);
      poly(c, [pa, pb, [pb[0] - off * tw * .5, pb[1] + off * tw * .25 + (z0 - z1)], [pa[0] - off * tw * .5, pa[1] + off * tw * .25 + (z0 - z1)]], i % 2 ? '#ffffff' : '#d9432f', 'rgba(90,50,30,.25)', .8);
    }
    for (let i = 0; i < 2; i++) { const p = P(x0 + .18 + i * .35, y1 + .35); poly(c, [[p[0] - tw * .06, p[1] - tw * .05], [p[0] + tw * .06, p[1] - tw * .07], [p[0] + tw * .05, p[1] + tw * .03], [p[0] - tw * .07, p[1] + tw * .04]], '#b98052', '#7a5230', 1); circle(c, p[0], p[1] - tw * .09, tw * .035, i ? '#ff9a6a' : '#9bd35f'); }
  }
  if (s.parasol) {
    const p = P(x0 + .3, y1 + .42);
    c.fillStyle = 'rgba(30,65,30,.18)'; c.beginPath(); c.ellipse(p[0] - tw * .06, p[1] + 1, tw * .16, tw * .05, 0, 0, 6.2832); c.fill();
    c.strokeStyle = '#8a5e36'; c.lineWidth = 2; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - tw * .34); c.stroke();
    c.fillStyle = '#ffe9c4'; c.beginPath(); c.ellipse(p[0], p[1] - tw * .08, tw * .1, tw * .035, 0, 0, 6.2832); c.fill();
    for (let i = 0; i < 4; i++) { const a0 = Math.PI + i * Math.PI / 4; c.fillStyle = i % 2 ? '#fff' : '#e48aa0'; c.beginPath(); c.moveTo(p[0], p[1] - tw * .34 - tw * .05); c.arc(p[0], p[1] - tw * .3, tw * .17, a0, a0 + Math.PI / 4); c.closePath(); c.fill(); }
  }
  if (s.mast) {
    const mu = lerp(u0, u1, .5), top = Q(mu, vm, zt), up = tw * .6;
    c.strokeStyle = '#6a4a2a'; c.lineWidth = Math.max(2, tw * .035); c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(top[0], top[1] - up); c.stroke();
    const wv = Math.sin(time * 3) * tw * .03;
    poly(c, [[top[0], top[1] - up], [top[0] + tw * .26, top[1] - up + tw * .06 + wv], [top[0], top[1] - up + tw * .14]], '#e0572e');
    for (let i = 0; i < 2; i++) {      // crates and barrel
      const p = P(x1 + .2 - i * .3, y1 + .12 + i * .2), s2 = tw * .09;
      poly(c, [[p[0] - s2, p[1] - s2], [p[0], p[1] - s2 * 1.5], [p[0] + s2, p[1] - s2], [p[0], p[1] - s2 * .5]], '#e1b878');
      poly(c, [[p[0] - s2, p[1] - s2], [p[0], p[1] - s2 * .5], [p[0], p[1] + s2 * .5], [p[0] - s2, p[1]]], '#b07c47');
      poly(c, [[p[0], p[1] - s2 * .5], [p[0] + s2, p[1] - s2], [p[0] + s2, p[1]], [p[0], p[1] + s2 * .5]], '#c99560');
    }
  }
  if (s.flags) {
    [lerp(u0, u1, .06), lerp(u0, u1, .94)].forEach((u, i) => {
      const top = Q(u, vm, zt), up = tw * .5, wv = Math.sin(time * 3 + i) * tw * .03;
      c.strokeStyle = '#6a4a2a'; c.lineWidth = Math.max(2, tw * .03); c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(top[0], top[1] - up); c.stroke();
      poly(c, [[top[0], top[1] - up], [top[0] + tw * .2, top[1] - up + tw * .05 + wv], [top[0], top[1] - up + tw * .11]], i ? '#ffd86a' : '#e0572e');
    });
  }
}
function drawGarden(c, P, tw, bx, by, time) {
  const x0 = bx + .06, x1 = bx + .94, y0 = by + .06, y1 = by + .94;
  poly(c, [P(x0 - .05, y0 - .05), P(x1 + .05, y0 - .05), P(x1 + .05, y1 + .05), P(x0 - .05, y1 + .05)], '#a9936b');
  poly(c, [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], '#7a5430');
  poly(c, [P(x0 + .05, y0 + .05), P(x1 - .05, y0 + .05), P(x1 - .05, y1 - .05), P(x0 + .05, y1 - .05)], '#8a6238');
  const r = rng(bx * 31 + by * 7 + 3), cols = ['#ff8fae', '#ffd45e', '#ffffff', '#b99aff', '#ff9a52'];
  const items = [];
  for (let i = 0; i < 9; i++) items.push([.14 + r() * .72, .14 + r() * .72, cols[i % 5]]);
  items.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])).forEach(([u, v, col], i) => {
    const p = P(bx + u, by + v), sw = Math.sin(time * 1.6 + i) * tw * .012, h = tw * (.12 + r() * .06);
    c.strokeStyle = '#4f9a3f'; c.lineWidth = Math.max(1.5, tw * .022);
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + sw, p[1] - h); c.stroke();
    c.fillStyle = '#6cb34a'; c.beginPath(); c.ellipse(p[0] - tw * .03, p[1] - h * .4, tw * .035, tw * .016, -.6, 0, 6.2832); c.fill();
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; circle(c, p[0] + sw + Math.cos(a) * tw * .035, p[1] - h + Math.sin(a) * tw * .03, tw * .028, col); }
    circle(c, p[0] + sw, p[1] - h, tw * .02, '#f1a72f');
  });
}
function drawObservatory(c, P, tw, bx, by, time) {
  const uz = tw * .55, cxg = bx + 1, cyg = by + 1, B = P(cxg, cyg), rx = .78 * tw * .7071, ry = rx / 2, hp = uz * 1.35;
  groundShadow(c, P, cxg - .75, cxg + .75, cyg - .75, cyg + .75, 1.7);
  // round stone base
  let g = c.createLinearGradient(B[0] - rx, 0, B[0] + rx, 0);
  g.addColorStop(0, '#a7b3b8'); g.addColorStop(.55, '#d3dade'); g.addColorStop(1, '#ecf0ee');
  const body = (r1, r2, h1, col) => {
    c.beginPath(); c.moveTo(B[0] - r1, B[1] - h1); c.lineTo(B[0] - r1, B[1]);
    c.ellipse(B[0], B[1], r1, r2, 0, Math.PI, 0, true); c.lineTo(B[0] + r1, B[1] - h1);
    c.ellipse(B[0], B[1] - h1, r1, r2, 0, 0, Math.PI, true); c.closePath(); c.fillStyle = col; c.fill();
  };
  body(rx, ry, hp, g);
  c.strokeStyle = 'rgba(100,110,115,.35)'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.ellipse(B[0], B[1] - hp * i / 4, rx, ry, 0, 0, Math.PI); c.stroke(); }
  // windows
  for (let i = 0; i < 2; i++) { const ang = Math.PI * (.35 + i * .3), wx = B[0] + Math.cos(ang) * rx * .92, wy = B[1] - hp * .5 + Math.sin(ang) * ry * .92; poly(c, [[wx - tw * .035, wy - tw * .09], [wx + tw * .035, wy - tw * .09], [wx + tw * .035, wy + tw * .05], [wx - tw * .035, wy + tw * .05]], '#6fb4d4', '#fff2d6', 1.2); }
  // gold band + door
  c.strokeStyle = '#e8b64a'; c.lineWidth = Math.max(2, tw * .04); c.beginPath(); c.ellipse(B[0], B[1] - hp, rx, ry, 0, 0, Math.PI); c.stroke();
  poly(c, [[B[0] - tw * .06, B[1] + ry * .98], [B[0] + tw * .06, B[1] + ry * .98], [B[0] + tw * .06, B[1] + ry * .98 - tw * .17], [B[0] - tw * .06, B[1] + ry * .98 - tw * .17]], '#8a5230');
  // dome
  const top = B[1] - hp, rd = rx * .94;
  g = c.createRadialGradient(B[0] - rd * .4, top - rd * .6, rd * .1, B[0], top - rd * .2, rd * 1.1);
  g.addColorStop(0, '#d4e8f8'); g.addColorStop(.5, '#7fa7d2'); g.addColorStop(1, '#4f6fa6');
  c.beginPath(); c.moveTo(B[0] - rd, top); c.arc(B[0], top, rd, Math.PI, 2 * Math.PI); c.ellipse(B[0], top, rd, rd * .5, 0, 0, Math.PI); c.closePath(); c.fillStyle = g; c.fill();
  // slit + telescope
  poly(c, [[B[0] - rd * .12, top + rd * .42], [B[0] + rd * .12, top + rd * .42], [B[0] + rd * .1, top - rd * .98], [B[0] - rd * .1, top - rd * .98]], '#2a3a5c');
  const sway = Math.sin(time * .8) * rd * .06;
  c.strokeStyle = '#d8c28a'; c.lineWidth = Math.max(3, tw * .06); c.lineCap = 'round';
  c.beginPath(); c.moveTo(B[0], top - rd * .1); c.lineTo(B[0] + rd * .38 + sway, top - rd * .72); c.stroke();
  c.strokeStyle = '#e8b64a'; c.lineWidth = Math.max(1.5, tw * .025); c.beginPath(); c.ellipse(B[0], top, rd, rd * .5, 0, 0, Math.PI); c.stroke();
  // twinkle
  const tw2 = (Math.sin(time * 3) + 1) / 2;
  c.fillStyle = `rgba(255,240,150,${.4 + tw2 * .6})`; star(c, B[0] + rd * .75, top - rd * 1.0, tw * (.05 + tw2 * .03));
}
function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .35 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }

function buildingPolyHull(b, P, uz) {
  const it = ITEMS[b.type], pts = [];
  [[b.x, b.y], [b.x + it.w, b.y], [b.x + it.w, b.y + it.h], [b.x, b.y + it.h]].forEach(([gx, gy]) => { pts.push(P(gx, gy, 0)); pts.push(P(gx, gy, it.top * uz)); });
  return hull(pts);
}
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  pts.forEach(p => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
  pts.slice().reverse().forEach(p => { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function inHull(h, x, y) { let s = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length], v = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (v !== 0) { if (s && Math.sign(v) !== s) return false; s = Math.sign(v); } } return true; }
function hitBuilding(px, py) {
  const P = curP(), uz = view.tw * .55;
  const order = S.blds.slice().sort((a, b) => (b.x + ITEMS[b.type].w + b.y + ITEMS[b.type].h) - (a.x + ITEMS[a.type].w + a.y + ITEMS[a.type].h));
  return order.find(b => inHull(buildingPolyHull(b, P, uz), px, py)) || null;
}

/* ======================================================================
 * 9. Scenery objects on unexplored tiles
 * ==================================================================== */
const wild = [];
(function () {
  for (let x = 0; x < WORLD; x++) for (let y = 0; y < WORLD; y++) {
    const r = rng(x * 73 + y * 19 + 5);
    if (r() > .86) continue;
    const v = r(), o = {tx: x, ty: y, x: x + .25 + r() * .5, y: y + .25 + r() * .5, seed: Math.floor(r() * 1000), kind: pickKind(r())};
    o.type = v < .5 ? 'tree' : v < .72 ? 'bush' : v < .8 ? 'rock' : 'flower';
    o.size = .85 + r() * .5;
    wild.push(o);
  }
})();

/* ======================================================================
 * 10. Frame rendering
 * ==================================================================== */
const clouds = [{x: .1, y: .09, s: 90, v: 5}, {x: .55, y: .16, s: 120, v: 3}, {x: .85, y: .06, s: 70, v: 4}, {x: .35, y: .24, s: 80, v: 2}];
const leaves = Array.from({length: 9}, (_, i) => ({x: (i * 0.13) % 1, y: (i * 0.37) % 1, s: 4 + (i % 3) * 1.5, v: 14 + (i % 4) * 5, ph: i * 1.3}));
const sparks = [];
let dirty = true, last = 0;

function spawnSparks(x, y, n, cols) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 90; sparks.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 1, col: cols[i % cols.length], s: 3 + Math.random() * 4}); }
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg.sky, 0, 0, W, H);
  clouds.forEach(cl => { const x = ((cl.x * W + T * cl.v) % (W + cl.s * 3)) - cl.s * 1.5; drawCloud(ctx, x, cl.y * H, cl.s * (W < 500 ? .7 : 1)); });
  ctx.drawImage(bg.far, 0, 0, W, H);
  const P = curP(), tw = view.tw, uz = tw * .55;

  drawWater(P);
  drawLand(P);
  drawFences(P);
  drawOverlays(P);

  // depth-sorted entities
  const ents = [];
  const lo = view.lo, hi = view.hi;
  wild.forEach(o => {
    if (o.tx + .5 > lo && o.tx + .5 < hi && o.ty + .5 > lo && o.ty + .5 < hi) return;
    const p = P(o.x, o.y);
    if (p[0] < -tw * 2 || p[0] > W + tw * 2 || p[1] < -tw * 2 || p[1] > H + tw * 3) return;
    if (nearStream(p[0], p[1], tw * .85)) return;
    ents.push({k: o.x + o.y, f: () => {
      if (o.type === 'tree') drawTree(ctx, p[0], p[1], tw * 1.45 * o.size, o.kind, o.seed);
      else if (o.type === 'bush') drawBush(ctx, p[0], p[1], tw * .75 * o.size, o.kind, o.seed);
      else if (o.type === 'rock') drawRock(ctx, p[0], p[1], tw * .6 * o.size);
      else drawFlowerPatch(ctx, p[0], p[1], tw * .8, o.seed);
    }});
  });
  S.blds.forEach(b => {
    const it = ITEMS[b.type], moving = ui.mode === 'move' && ui.moveId === b.id;
    ents.push({k: b.x + it.w + b.y + it.h - .01, f: () => drawBuilding(ctx, P, tw, b.type, b.x, b.y, moving ? .5 : 1, T)});
  });
  ents.sort((a, b) => a.k - b.k).forEach(e => e.f());

  drawGhostAndSelection(P, uz);
  drawForeground(P);

  // sparkles
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.life -= .02; s.x += s.vx * .016; s.y += s.vy * .016; s.vy += 2;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    ctx.globalAlpha = s.life; ctx.fillStyle = s.col; star(ctx, s.x, s.y, s.s * (.6 + s.life)); ctx.globalAlpha = 1;
  }
  // drifting leaves
  if (!reduced) leaves.forEach(l => {
    const x = ((l.x * W + Math.sin(T * .8 + l.ph) * 30 + T * 6) % (W + 20)), y = (l.y * H + T * l.v) % (H + 20) - 10;
    ctx.save(); ctx.translate(x, y); ctx.rotate(T * .9 + l.ph); ctx.fillStyle = l.ph > 5 ? 'rgba(236,150,60,.8)' : 'rgba(150,205,80,.8)';
    ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * .5, 0, 0, 6.2832); ctx.fill(); ctx.restore();
  });
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .35, W / 2, H * .5, Math.max(W, H) * .75);
  vg.addColorStop(0, 'rgba(50,70,20,0)'); vg.addColorStop(1, 'rgba(50,60,20,.28)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

function drawOverlays(P) {
  const showGrid = gridA > .02;
  const lo = view.lo, hi = view.hi, tw = view.tw;
  if (showGrid) {
    const occ = occupiedMap(ui.mode === 'move' ? ui.moveId : null);
    ctx.globalAlpha = gridA;
    for (let x = Math.ceil(lo - .01); x < hi - .01; x++) for (let y = Math.ceil(lo - .01); y < hi - .01; y++) {
      const taken = occ[x + ',' + y];
      poly(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], taken ? 'rgba(255,150,70,.34)' : 'rgba(255,255,255,.2)', 'rgba(255,255,255,.7)', 1.2);
    }
    ctx.globalAlpha = 1;
  }
  if (ui.mode === 'expand' && S.n < N_MAX) {      // preview of the ring that will be added
    const n2 = S.n + 1, lo2 = loOf(n2), hi2 = lo2 + n2, pulse = .5 + .5 * Math.sin(T * 4);
    for (let x = lo2; x < hi2; x++) for (let y = lo2; y < hi2; y++) {
      if (inLand(x, y)) continue;
      poly(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], `rgba(255,215,90,${.3 + pulse * .25})`, 'rgba(255,240,170,.9)', 1.5);
    }
  }
}
function drawGhostAndSelection(P, uz) {
  const tw = view.tw;
  const fp = (x, y, w, h, fill, stroke, lw) => poly(ctx, [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], fill, stroke, lw);
  const pulse = .5 + .5 * Math.sin(T * 5);
  if (ui.mode === 'store') S.blds.forEach(b => { const it = ITEMS[b.type]; fp(b.x, b.y, it.w, it.h, `rgba(255,170,70,${.12 + pulse * .15})`, 'rgba(255,190,90,.85)', 2); });
  if (ui.mode === 'explore' && ui.sel) {
    const b = S.blds.find(q => q.id === ui.sel);
    if (b) {
      const it = ITEMS[b.type];
      fp(b.x, b.y, it.w, it.h, `rgba(255,225,110,${.25 + pulse * .2})`, '#ffd25e', 3);
      const tp = P(b.x + it.w / 2, b.y + it.h / 2, it.top * uz + 14);
      label(it.name, tp[0], tp[1]);
    }
  }
  if (ui.mode === 'move' && ui.moveId) {
    const b = S.blds.find(q => q.id === ui.moveId);
    if (b) { const it = ITEMS[b.type]; ctx.setLineDash([6, 4]); fp(b.x, b.y, it.w, it.h, null, '#ffd25e', 3); ctx.setLineDash([]); }
  }
  if (ui.ghost && ui.buildType !== undefined) {
    const type = ui.mode === 'move' ? (S.blds.find(q => q.id === ui.moveId) || {}).type : ui.buildType;
    if (type) {
      const it = ITEMS[type], g = ui.ghost;
      fp(g.x, g.y, it.w, it.h, g.ok ? `rgba(120,225,90,${.4 + pulse * .15})` : `rgba(240,80,60,${.4 + pulse * .15})`, g.ok ? '#d7ffb0' : '#ffd0c8', 2.5);
      drawBuilding(ctx, P, tw, type, g.x, g.y, g.ok ? .82 : .4, T);
    }
  }
}
function label(text, x, y) {
  ctx.font = '800 13px "Hiragino Maru Gothic ProN","Yu Gothic UI","Noto Sans JP",system-ui,sans-serif';
  const w = ctx.measureText(text).width + 18, h = 24;
  ctx.fillStyle = 'rgba(255,246,224,.95)'; ctx.strokeStyle = '#e2c88e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h, w, h, 12) : ctx.rect(x - w / 2, y - h, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a4128'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - h / 2 + 1);
}
const fg = (() => { const r = rng(2024), a = []; for (let i = 0; i < 14; i++) a.push({fx: r(), dy: r(), t: r() < .35 ? 'bush' : 'flower', seed: i * 13, k: r() < .5 ? 1 : 4}); return a; })();
function drawForeground(P) {
  const {lo, hi, tw} = view, C = P(hi, hi), bottom = C[1] + tw * .5;
  const space = H - bottom - 70;
  if (space < 10) return;
  fg.forEach(f => {
    const x = f.fx * W, y = bottom + f.dy * space + 6;
    if (nearStream(x, y, tw * .8)) return;
    if (f.t === 'bush') drawBush(ctx, x, y, tw * .55, f.k, f.seed); else drawFlowerPatch(ctx, x, y, tw * .7, f.seed);
  });
}

function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts;
  if (!reduced) T += dt;
  const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
  ['tw', 'cx', 'cy', 'c', 'lo', 'hi'].forEach(key => { view[key] += (tgt[key] - view[key]) * k; if (Math.abs(tgt[key] - view[key]) < .001) view[key] = tgt[key]; });
  const want = (ui.mode === 'build' || ui.mode === 'move') ? 1 : 0;
  gridA += (want - gridA) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
  if (!reduced || dirty || sparks.length) { draw(); dirty = false; }
  updateChips();
  requestAnimationFrame(frame);
}

/* ======================================================================
 * 11. Game rules
 * ==================================================================== */
function occupiedMap(ignoreId) {
  const m = {};
  S.blds.forEach(b => { if (b.id === ignoreId) return; const it = ITEMS[b.type]; for (let dx = 0; dx < it.w; dx++) for (let dy = 0; dy < it.h; dy++) m[(b.x + dx) + ',' + (b.y + dy)] = b.id; });
  return m;
}
function canPlace(type, x, y, ignoreId) {
  const it = ITEMS[type], occ = occupiedMap(ignoreId);
  for (let dx = 0; dx < it.w; dx++) for (let dy = 0; dy < it.h; dy++) {
    if (!inLand(x + dx, y + dy)) return {ok: false, reason: '土地の外だよ'};
    if (occ[(x + dx) + ',' + (y + dy)] !== undefined) return {ok: false, reason: '建物がじゃましてるよ'};
  }
  return {ok: true};
}
const isUnlocked = type => ITEMS[type].need.every(k => S.skills[k] >= SKILL_NEED);
const canAfford = type => Object.entries(ITEMS[type].cost).every(([k, v]) => S[k] >= v);
function costText(cost) { return Object.entries(cost).map(([k, v]) => RES_ICON[k] + v).join(' '); }

/* ======================================================================
 * 12. UI
 * ==================================================================== */
const sheet = $('sheet'), sheetBody = $('sheetBody'), actionbar = $('actionbar'), hintEl = $('hint');
let hintTimer = 0, toastTimer = 0, undoFn = null;

function setHint(t, autoClear) {
  hintEl.textContent = t || '';
  clearTimeout(hintTimer);
  if (autoClear) hintTimer = setTimeout(() => { if (hintEl.textContent === t) { hintEl.textContent = ''; layout(); } }, autoClear);
  layout();
}
function toast(msg, undo) {
  $('toastText').textContent = msg;
  const ub = $('toastUndo'); undoFn = undo || null; ub.hidden = !undo;
  $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; undoFn = null; }, undo ? 7000 : 2600);
}
$('toastUndo').addEventListener('click', () => { if (undoFn) { const f = undoFn; undoFn = null; $('toast').hidden = true; f(); } });

function updateHUD() {
  $('hudLand').textContent = `土地${S.n * S.n}マス`;
  $('hudPoints').textContent = `開拓点${S.points}`;
  $('hudWood').textContent = S.wood; $('hudBooks').textContent = S.books; $('hudGlobe').textContent = S.globe;
}
function setPressed() {
  const m = ui.mode;
  $('btnExpand').setAttribute('aria-pressed', m === 'expand');
  $('btnMove').setAttribute('aria-pressed', m === 'move');
  $('btnStore').setAttribute('aria-pressed', m === 'store');
  $('btnBuild').setAttribute('aria-pressed', m === 'build');
  $('btnStudy').setAttribute('aria-pressed', m === 'study');
  $('fabs').classList.toggle('off', m !== 'explore' && m !== 'build' && m !== 'study');
}
function openSheet(title, render) {
  $('sheetTitle').textContent = title; sheetBody.innerHTML = ''; render(sheetBody);
  sheet.classList.add('open'); layout(); setTimeout(layout, 300);
}
function closeSheet() { sheet.classList.remove('open'); layout(); }
function showAction(text, okLabel, okEnabled) {
  actionbar.hidden = false; $('actionText').textContent = text; $('actionOk').textContent = okLabel; $('actionOk').disabled = !okEnabled; layout();
}
function hideAction() { actionbar.hidden = true; layout(); }

function enterMode(mode) {
  if (ui.mode === mode && mode !== 'explore') mode = 'explore';
  ui.mode = mode; ui.sel = null; ui.ghost = null; ui.moveId = null;
  if (mode !== 'build') ui.buildType = null;
  hideAction(); $('modal').hidden = true; closeSheet();
  setPressed();
  if (mode === 'explore') setHint('');
  else if (mode === 'build') { setHint('建てたい建物をえらんでね'); openSheet('🏗 建物をえらぶ', renderBuildTray); }
  else if (mode === 'move') setHint('動かしたい建物をタップ');
  else if (mode === 'store') setHint('しまいたい建物をタップ');
  else if (mode === 'expand') { setHint('金色のマスが新しく開拓できる土地だよ'); openSheet('🌱 土地を拡張', renderExpand); }
  else if (mode === 'study') { setHint(''); openSheet('📚 学ぶ（サンプル）', renderStudy); }
  dirty = true;
}

/* ----- sheets ----- */
function renderBuildTray(body) {
  const cards = document.createElement('div'); cards.className = 'cards';
  Object.keys(ITEMS).forEach(type => {
    const it = ITEMS[type], locked = !isUnlocked(type), stock = S.stored[type] || 0;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card' + (ui.buildType === type ? ' sel' : '') + (locked ? ' locked' : '');
    const cv = document.createElement('canvas'); b.appendChild(cv);
    drawThumb(cv, type);
    const nm = document.createElement('span'); nm.textContent = it.name; b.appendChild(nm);
    const sm = document.createElement('small');
    sm.innerHTML = locked ? '🔒 ' + it.need.map(k => SKILL_NAME[k]).join('・') + 'を' + SKILL_NEED + '回' : `${it.w}×${it.h}マス<br>${stock ? 'しまってある ×' + stock : costText(it.cost)}`;
    b.appendChild(sm);
    if (stock) { const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = '×' + stock; b.appendChild(tg); }
    b.addEventListener('click', () => chooseBuild(type));
    cards.appendChild(b);
  });
  body.appendChild(cards);
  const n = document.createElement('p'); n.className = 'note';
  n.textContent = 'マスが見えるのは建てる・動かすときだけ。しまった建物は材料なしでもう一度置けるよ。';
  body.appendChild(n);
}
function chooseBuild(type) {
  if (!isUnlocked(type)) { toast('🔒 ' + ITEMS[type].need.map(k => SKILL_NAME[k]).join('・') + 'を学ぶと解放されるよ'); return; }
  ui.buildType = type; ui.ghost = null; hideAction();
  setHint(ITEMS[type].name + '：置きたい場所をタップ');
  refreshTray(); dirty = true;
}
function refreshTray() {
  const cards = sheetBody.querySelector('.cards'), sl = cards ? cards.scrollLeft : 0;
  sheetBody.innerHTML = ''; renderBuildTray(sheetBody);
  const nc = sheetBody.querySelector('.cards'); if (nc) nc.scrollLeft = sl;
}
function drawThumb(cv, type) {
  const r = Math.min(2, window.devicePixelRatio || 1), cw = window.innerWidth >= 700 ? 112 : 96, ch = window.innerWidth >= 700 ? 84 : 72;
  cv.width = cw * r; cv.height = ch * r;
  const c = cv.getContext('2d'); c.scale(r, r);
  const it = ITEMS[type], g = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#d8f0f4'); g.addColorStop(1, '#b8dc86');
  c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  const tw = Math.min(1.84 * cw / (it.w + it.h), ch * .92 / ((it.w + it.h) / 4 + .55 * it.top));
  // footprint centre (w/2, h/2) lands at the horizontal middle; front corner sits near the bottom edge
  const P = makeP(tw, cw / 2 - (it.w - it.h) / 4 * tw, ch * .93 - (it.w + it.h) * tw / 8, (it.w + it.h) / 4);
  drawBuilding(c, P, tw, type, 0, 0, 1, 0);
}
function renderExpand(body) {
  const row = document.createElement('div'); row.className = 'expand-info';
  if (S.n >= N_MAX) { row.textContent = '🎉 土地は最大まで広がったよ！'; body.appendChild(row); return; }
  const cost = EXPAND_COST[S.n + 1], enough = S.points >= cost;
  const t = document.createElement('span'); t.textContent = `${S.n}×${S.n} → ${S.n + 1}×${S.n + 1}マス（${(S.n + 1) ** 2}マス）／ 開拓点 ${cost} 必要（いま ${S.points}）`; row.appendChild(t);
  const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'ok'; ok.textContent = '拡張する'; ok.disabled = !enough;
  ok.addEventListener('click', doExpand); row.appendChild(ok); body.appendChild(row);
  const n = document.createElement('p'); n.className = 'note'; n.textContent = enough ? '建物はそのまま、まわりに土地が広がるよ。' : `あと ${cost - S.points} 点。「学ぶ」ボタンで開拓点をためよう（サンプルです）。`;
  body.appendChild(n);
}
const STUDY = {
  math:     {icon: '🧮', gain: {wood: 12}, pts: 10, label: '木材'},
  japanese: {icon: '📖', gain: {books: 3, wood: 2}, pts: 10, label: '本'},
  english:  {icon: '🔤', gain: {globe: 2, wood: 2}, pts: 10, label: '交流'},
};
function renderStudy(body) {
  const g = document.createElement('div'); g.className = 'study';
  Object.keys(STUDY).forEach(k => {
    const s = STUDY[k], b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `<span class="big">${s.icon}</span>${SKILL_NAME[k]}<small>${costText(s.gain)} ・開拓点+${s.pts}</small><small>これまで ${S.skills[k]}回</small>`;
    b.addEventListener('click', () => study(k, b)); g.appendChild(b);
  });
  body.appendChild(g);
  const n = document.createElement('p'); n.className = 'note';
  n.textContent = '※ サンプル：ボタンを押すだけで報酬がもらえます。本編の学習記録や進捗には一切つながっていません。';
  body.appendChild(n);
}

/* ----- actions ----- */
function floatText(text, el) {
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float'; f.textContent = text; f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height) + 'px';
  $('app').appendChild(f); setTimeout(() => f.remove(), 1500);
}
function study(k, btn) {
  const s = STUDY[k];
  S.skills[k]++; S.points += s.pts;
  const idMap = {wood: 'hudWood', books: 'hudBooks', globe: 'hudGlobe'};
  Object.entries(s.gain).forEach(([r, v]) => { S[r] += v; floatText('+' + v + RES_ICON[r], $(idMap[r]).parentElement); });
  floatText('+' + s.pts, $('hudPoints').parentElement);
  const r = btn.getBoundingClientRect(); spawnSparks(r.left + r.width / 2, r.top, 10, ['#ffe08a', '#fff', '#ffb3c6']);
  toast(`${SKILL_NAME[k]}がんばったね！ ${costText(s.gain)} 開拓点+${s.pts}`);
  updateHUD();
  sheetBody.innerHTML = ''; renderStudy(sheetBody); dirty = true;
  const newly = Object.keys(ITEMS).filter(t => ITEMS[t].need.length && isUnlocked(t) && ITEMS[t].need.includes(k) && ITEMS[t].need.every(q => S.skills[q] >= SKILL_NEED) && ITEMS[t].need.some(q => q === k && S.skills[q] === SKILL_NEED));
  if (newly.length) setTimeout(() => toast('✨ ' + newly.map(t => ITEMS[t].name).join('・') + ' が解放されたよ！'), 900);
}
function doExpand() {
  if (S.n >= N_MAX) return;
  const cost = EXPAND_COST[S.n + 1];
  if (S.points < cost) { toast('開拓点が足りないよ'); return; }
  S.points -= cost; S.n++;
  updateHUD(); layout(); // recompute target for the new size
  spawnSparks(view.cx, view.cy, 24, ['#ffe08a', '#fff', '#b9e48d']);
  toast(`🌱 土地が ${S.n * S.n} マスに広がったよ！`);
  sheetBody.innerHTML = ''; renderExpand(sheetBody); dirty = true;
}
function setGhost(tile) {
  const type = ui.mode === 'move' ? (S.blds.find(q => q.id === ui.moveId) || {}).type : ui.buildType;
  if (!type) return;
  const it = ITEMS[type], x = tile.x - Math.floor((it.w - 1) / 2), y = tile.y - Math.floor((it.h - 1) / 2);
  const res = canPlace(type, x, y, ui.mode === 'move' ? ui.moveId : null);
  ui.ghost = {x, y, ok: res.ok, reason: res.reason};
  if (ui.mode === 'build') {
    const free = (S.stored[type] || 0) > 0;
    if (!res.ok) showAction('ここには置けない：' + res.reason, '建てる', false);
    else if (!free && !canAfford(type)) showAction('材料が足りないよ（' + costText(it.cost) + '）', '建てる', false);
    else showAction(free ? 'しまってある' + it.name + 'を置く' : it.name + 'を建てる（' + costText(it.cost) + '）', '建てる', true);
  } else {
    const b = S.blds.find(q => q.id === ui.moveId);
    if (!res.ok) showAction('ここには動かせない：' + res.reason, '移動', false);
    else if (b.x === x && b.y === y) showAction('いまの場所だよ', '移動', false);
    else showAction(it.name + 'をここへ動かす', '移動', true);
  }
  dirty = true;
}
function confirmAction() {
  const g = ui.ghost; if (!g || !g.ok) return;
  if (ui.mode === 'build') {
    const type = ui.buildType, it = ITEMS[type], res = canPlace(type, g.x, g.y);
    if (!res.ok) return;
    const fromStore = (S.stored[type] || 0) > 0;
    if (!fromStore && !canAfford(type)) { toast('材料が足りないよ。学ぶボタンで集めよう'); return; }
    if (fromStore) S.stored[type]--; else Object.entries(it.cost).forEach(([k, v]) => S[k] -= v);
    const nb = {id: S.nextId++, type, x: g.x, y: g.y}; S.blds.push(nb);
    updateHUD(); ui.ghost = null; hideAction();
    const p = curP()(g.x + it.w / 2, g.y + it.h / 2, view.tw * .4); spawnSparks(p[0], p[1], 14, ['#ffe08a', '#fff', '#ffb3c6']);
    toast('🎉 ' + it.name + 'が建ったよ！', () => {
      S.blds = S.blds.filter(q => q.id !== nb.id);
      if (fromStore) S.stored[type] = (S.stored[type] || 0) + 1; else Object.entries(it.cost).forEach(([k, v]) => S[k] += v);
      updateHUD(); sheetBody.innerHTML = ''; if (ui.mode === 'build') renderBuildTray(sheetBody); dirty = true;
    });
    refreshTray();
  } else if (ui.mode === 'move') {
    const b = S.blds.find(q => q.id === ui.moveId); if (!b) return;
    const res = canPlace(b.type, g.x, g.y, b.id); if (!res.ok) return;
    const old = {x: b.x, y: b.y}; b.x = g.x; b.y = g.y;
    ui.ghost = null; ui.moveId = null; hideAction(); setHint('動かしたい建物をタップ');
    const it = ITEMS[b.type], p = curP()(b.x + it.w / 2, b.y + it.h / 2, view.tw * .4); spawnSparks(p[0], p[1], 10, ['#fff', '#d7ffb0']);
    toast('✨ ' + it.name + 'を動かしたよ', () => { b.x = old.x; b.y = old.y; dirty = true; });
  }
  dirty = true;
}
function askStore(b) {
  const it = ITEMS[b.type];
  $('modalTitle').textContent = it.name + 'をしまう？';
  $('modalText').textContent = '建物はなくなりません。「建てる」の中に保管されて、材料なしでまた置けます。';
  $('modal').hidden = false; $('modal').dataset.id = b.id; $('modalOk').focus();
}
function doStore(id) {
  const i = S.blds.findIndex(q => q.id === id); if (i < 0) return;
  const b = S.blds.splice(i, 1)[0];
  S.stored[b.type] = (S.stored[b.type] || 0) + 1;
  const it = ITEMS[b.type];
  toast('📦 ' + it.name + 'をしまったよ', () => {
    if (S.blds.some(q => q.id === b.id)) return;
    const res = canPlace(b.type, b.x, b.y);
    if (!res.ok) { toast('元の場所がふさがっているので、建てるメニューから置いてね'); return; }
    S.stored[b.type]--; S.blds.push(b); dirty = true;
  });
  dirty = true;
}
function select(id) { ui.sel = id; dirty = true; if (id) setHint('移動・しまうは下のボタンから', 4000); }
function startMoveFor(id) {
  enterMode('move'); const b = S.blds.find(q => q.id === id); if (!b) return;
  ui.moveId = id; const it = ITEMS[b.type]; setGhost({x: b.x + Math.floor((it.w - 1) / 2), y: b.y + Math.floor((it.h - 1) / 2)});
  setHint('行き先のマスをタップ');
}

/* ----- input ----- */
function onTap(px, py) {
  if (!$('modal').hidden) return;
  const hit = hitBuilding(px, py), tile = tileAt(px, py);
  const inGhost = () => { if (!ui.ghost) return false; const type = ui.mode === 'move' ? (S.blds.find(q => q.id === ui.moveId) || {}).type : ui.buildType; if (!type || !tile) return false; const it = ITEMS[type]; return tile.x >= ui.ghost.x && tile.x < ui.ghost.x + it.w && tile.y >= ui.ghost.y && tile.y < ui.ghost.y + it.h; };
  switch (ui.mode) {
    case 'explore':
      if (hit) select(hit.id === ui.sel ? null : hit.id); else select(null);
      break;
    case 'build':
      if (!ui.buildType) { toast('先に建物をえらんでね'); break; }
      if (!tile) { toast('土地の中をタップしてね'); break; }
      if (inGhost() && ui.ghost.ok) { confirmAction(); break; }
      setGhost(tile); break;
    case 'move':
      if (ui.moveId && inGhost() && ui.ghost.ok) { confirmAction(); break; }
      {
        // while a building is picked up, a free tile is a destination; otherwise a tap picks a building
        const occId = tile ? occupiedMap(ui.moveId)[tile.x + ',' + tile.y] : undefined;
        const pick = ui.moveId ? (occId !== undefined ? S.blds.find(q => q.id === occId) : null) : hit;
        if (pick && pick.id !== ui.moveId) {
          ui.moveId = pick.id; const it = ITEMS[pick.type]; setGhost({x: pick.x + Math.floor((it.w - 1) / 2), y: pick.y + Math.floor((it.h - 1) / 2)});
          setHint('行き先のマスをタップ');
        } else if (ui.moveId && tile) setGhost(tile);
        else if (!ui.moveId) toast('まず動かしたい建物をタップしてね');
      }
      break;
    case 'store':
      if (hit) askStore(hit); else toast('しまいたい建物をタップしてね');
      break;
  }
}
let down = null;
canvas.addEventListener('pointerdown', e => { down = {x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId}; });
canvas.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved < 12 && dt < 700) onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', () => { down = null; });
canvas.addEventListener('pointermove', e => {                   // mouse hover preview
  if (e.pointerType !== 'mouse' || e.buttons) return;
  if (ui.mode === 'build' && ui.buildType && !($('modal').hidden === false)) { const t = tileAt(e.clientX, e.clientY); if (t) setGhost(t); }
  else if (ui.mode === 'move' && ui.moveId) { const t = tileAt(e.clientX, e.clientY); if (t) setGhost(t); }
});

/* selection chips */
const chips = document.createElement('div');
chips.className = 'chips'; chips.hidden = true;
chips.innerHTML = '<button type="button" data-a="move">↔ 移動</button><button type="button" data-a="store">📦 しまう</button>';
$('app').appendChild(chips);
chips.addEventListener('click', e => {
  const a = e.target.closest('button'); if (!a || !ui.sel) return;
  const id = ui.sel;
  if (a.dataset.a === 'move') startMoveFor(id); else { const b = S.blds.find(q => q.id === id); enterMode('store'); if (b) askStore(b); }
});
function updateChips() {
  const b = ui.mode === 'explore' && ui.sel ? S.blds.find(q => q.id === ui.sel) : null;
  chips.hidden = !b;
  if (b) { const it = ITEMS[b.type], p = curP()(b.x + it.w / 2, b.y + it.h, 0); chips.style.left = clamp(p[0], 90, W - 90) + 'px'; chips.style.top = (p[1] + 10) + 'px'; }
}

/* buttons */
$('btnExpand').addEventListener('click', () => enterMode('expand'));
$('btnMove').addEventListener('click', () => enterMode('move'));
$('btnStore').addEventListener('click', () => enterMode('store'));
$('btnBuild').addEventListener('click', () => enterMode('build'));
$('btnStudy').addEventListener('click', () => enterMode('study'));
$('sheetClose').addEventListener('click', () => enterMode('explore'));
$('actionOk').addEventListener('click', confirmAction);
$('actionCancel').addEventListener('click', () => {
  ui.ghost = null; hideAction(); dirty = true;
  if (ui.mode === 'move') { ui.moveId = null; setHint('動かしたい建物をタップ'); } else setHint(ui.buildType ? ITEMS[ui.buildType].name + '：置きたい場所をタップ' : '');
});
$('modalOk').addEventListener('click', () => { const id = Number($('modal').dataset.id); $('modal').hidden = true; doStore(id); if (ui.mode !== 'store') { ui.sel = null; } });
$('modalCancel').addEventListener('click', () => { $('modal').hidden = true; });
window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('modal').hidden) $('modal').hidden = true; else enterMode('explore'); } });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ======================================================================
 * 13. Boot
 * ==================================================================== */
updateHUD(); setPressed();
resize();
setHint('建物をタップすると、動かしたりしまったりできるよ', 7000);
requestAnimationFrame(frame);

// Small read-only-ish hook so automated checks can exercise the rules (in-memory only).
window.KVDemo = {S, ui, ITEMS, canPlace, enterMode, onTap, study: k => study(k, document.body), doExpand, tileCenter: (x, y) => curP()(x + .5, y + .5), setGhost, confirmAction, doStore, snap: () => { snapView(); }};
})();
