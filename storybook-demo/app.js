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
const ui = {mode: 'explore', sel: null, buildType: null, ghost: null, moveId: null, lifted: false, hold: null, badAt: 0};
const M = .12, OV = .08;            // wall inset from the tile edge / roof overhang: roofs stay inside their own footprint
const LONG_PRESS_MS = 500, HOLD_SLOP = 10;

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
const mainCtx = canvas.getContext('2d');
let ctx = mainCtx;                    // drawing helpers use `ctx`; it is pointed at the cached static layer while that is rebuilt
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let W = 0, H = 0, dpr = 1, bg = null, bgPrev = null, bgFade = 0, T = 0;
const stageOf = n => n - N_MIN;      // 0..4 : 16 / 25 / 36 / 49 / 64 tiles
const sprites = new Map();            // cached tree / bush bitmaps (static art, drawn many times per frame)
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
  // The camera is sized so the *clearing* (plot + meadow pad) fills a fixed share of the width. That share grows with
  // the land, so early on a ring of forest stays visible beside the plot and later the meadow runs off the screen.
  const st = n - N_MIN, half = n / 2 + clearPad(st) * .8;
  const twW = W * lerp(.34, .62, st / 4) / half;
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
  // the toast always sits above the placement bar, so the two never stack on top of each other
  const ab = $('actionbar'), abH = ab.hidden ? 0 : ab.offsetHeight + 8;
  root.setProperty('--toast-b', (barH + sheetH + abH + 14) + 'px');
  const hud = document.querySelector('.hud');
  const hudB = hud.getBoundingClientRect().bottom;
  root.setProperty('--hud-h', hudB + 'px');
  // reserve hint/action-bar space up front so the map never shifts under a tapping finger
  const placing = ui.mode === 'build' || ui.mode === 'move';
  area.top = hudB + 44;
  area.bottom = window.innerHeight - barH - sheetH - (placing ? 78 : 0) - 6;
  computeTarget();
  wake();                                // the camera target may have changed: let the loop ease toward it
}
/* Render resolution: phones are capped at 1.25x, larger screens at 1.5x, and a pixel budget keeps the backing store
 * (and the three full-screen cached layers) small. Text is DOM, so the lower canvas scale does not blur it. */
function pickDpr(w, h) {
  const phone = Math.min(w, h) < 700 || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  const cap = phone ? 1.25 : 1.5, budget = 1.5e6;
  return Math.max(1, Math.min(window.devicePixelRatio || 1, cap, Math.sqrt(budget / Math.max(1, w * h))));
}
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = pickDpr(W, H);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  stat = null; vgGrad = null;
  sprites.clear();
  bg = buildBackdrop(W, H, dpr, stageOf(S.n)); bgPrev = null; bgFade = 0;
  layout(); snapView(); markDirty();
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
  const col = TREE_COL[kind], r = rng(seed * 7 + 3);
  c.save();
  // soft contact shadow + cast shadow toward upper-left
  c.fillStyle = 'rgba(30,70,30,.12)';
  c.beginPath(); c.ellipse(x - s * 0.2, y - s * 0.01, s * 0.46, s * 0.12, 0, 0, 6.2832); c.fill();
  c.fillStyle = 'rgba(30,70,30,.24)';
  c.beginPath(); c.ellipse(x - s * 0.14, y - s * 0.01, s * 0.3, s * 0.085, 0, 0, 6.2832); c.fill();
  if (kind === 2) {                                   // conifer
    c.fillStyle = '#6e4a2b'; c.fillRect(x - s * 0.035, y - s * 0.2, s * 0.07, s * 0.2);
    for (let i = 0; i < 4; i++) {
      const by = y - s * (0.12 + 0.2 * i), ty = by - s * 0.38, hw = s * (0.29 - 0.045 * i);
      poly(c, [[x, ty], [x + hw, by], [x - hw, by]], col[0]);
      poly(c, [[x, ty], [x, by], [x - hw, by]], col[1]);
      poly(c, [[x, ty + s * 0.05], [x - hw * 0.45, by - s * 0.06], [x - hw * 0.8, by]], col[2]);
      poly(c, [[x - hw, by], [x + hw, by], [x + hw * .72, by + s * .028], [x - hw * .72, by + s * .028]], shade(col[0], -.3));
      for (let k = 0; k < 3; k++) circle(c, x + (r() - .7) * hw, by - r() * s * .22, s * .012, col[3]);
    }
    c.restore(); return;
  }
  // trunk: root flare, two-tone bark, grain
  poly(c, [[x - s * .045, y - s * .34], [x + s * .045, y - s * .34], [x + s * .075, y], [x - s * .095, y]], '#7a5230');
  poly(c, [[x - s * .045, y - s * .34], [x - s * .005, y - s * .34], [x - s * .02, y], [x - s * .095, y]], '#9a6c3f');
  c.strokeStyle = 'rgba(60,35,15,.35)'; c.lineWidth = Math.max(1, s * .008);
  c.beginPath(); c.moveTo(x + s * .02, y - s * .3); c.lineTo(x + s * .03, y - s * .06); c.moveTo(x - s * .02, y - s * .22); c.lineTo(x - s * .04, y - s * .04); c.stroke();
  const R = s * 0.34, cy = y - s * 0.6;
  BLOBS.forEach(b => circle(c, x + b[0] * R + R * .05, cy + b[1] * R + R * .18, b[2] * R * 1.02, shade(col[0], -.22)));   // shaded underside
  const passes = [[0, 0, 1, col[0]], [-.08, -.1, .88, col[1]], [-.2, -.26, .56, col[2]]];
  passes.forEach(([ox, oy, k, color], pi) => {
    BLOBS.forEach((b, bi) => {
      if (pi === 2 && bi > 4) return;
      circle(c, x + (b[0] + ox) * R, cy + (b[1] + oy) * R, b[2] * R * k, color);
    });
  });
  circle(c, x - R * .5, cy - R * .6, R * .38, 'rgba(255,255,215,.16)');                      // sun glow on the crown
  for (let i = 0; i < 8; i++) circle(c, x + (r() - .62) * R * 1.3, cy + (r() - .75) * R * 1.2, R * 0.09, col[3]);
  for (let i = 0; i < 7; i++) circle(c, x + (r() - .3) * R * 1.4, cy + (r() - .1) * R * 1.0, R * 0.07, col[0]);
  if (kind === 1) for (let i = 0; i < 12; i++) circle(c, x + (r() - .5) * R * 2, cy + (r() - .55) * R * 1.6, R * .06, i % 2 ? '#ffffff' : '#ffd0de');
  if (kind === 0) for (let i = 0; i < 3; i++) circle(c, x + (r() - .5) * R * 1.4, cy + (r() - .2) * R, R * .06, '#e8503a');
  if (kind === 3) for (let i = 0; i < 6; i++) circle(c, x + (r() - .5) * R * 1.8, cy + (r() - .5) * R * 1.4, R * .06, '#f8cf74');
  c.restore();
}
function drawBush(c, x, y, s, kind, seed) {
  const col = TREE_COL[kind === 1 ? 1 : 4], r = rng(seed * 5 + 1);
  c.fillStyle = 'rgba(30,70,30,.2)';
  c.beginPath(); c.ellipse(x - s * 0.1, y, s * 0.34, s * 0.09, 0, 0, 6.2832); c.fill();
  const bl = [[-.5, -.22, .34], [.5, -.2, .32], [0, -.34, .4], [-.16, -.14, .36], [.2, -.12, .34]];
  bl.forEach(b => circle(c, x + b[0] * s + s * .03, y + b[1] * s + s * .06, b[2] * s, shade(col[0], -.2)));
  bl.forEach(b => circle(c, x + b[0] * s, y + b[1] * s, b[2] * s, col[0]));
  bl.forEach(b => circle(c, x + (b[0] - .05) * s, y + (b[1] - .06) * s, b[2] * s * .82, col[1]));
  bl.slice(2).forEach(b => circle(c, x + (b[0] - .12) * s, y + (b[1] - .13) * s, b[2] * s * .45, col[2]));
  for (let i = 0; i < 6; i++) {
    const fx = x + (r() - .5) * s * .85, fy = y - s * (.12 + r() * .32), pc = ['#fff3a8', '#ffffff', '#ffc2d4', '#ff9a62'][i % 4];
    circle(c, fx, fy, s * .042, pc); circle(c, fx, fy, s * .015, '#e8a23a');
  }
}
function drawRock(c, x, y, s) {
  c.fillStyle = 'rgba(30,60,30,.2)';
  c.beginPath(); c.ellipse(x - s * .08, y, s * .36, s * .09, 0, 0, 6.2832); c.fill();
  poly(c, [[x - s * .34, y], [x - s * .26, y - s * .26], [x + s * .02, y - s * .36], [x + s * .3, y - s * .2], [x + s * .36, y]], '#8d8b82');
  poly(c, [[x + s * .02, y - s * .36], [x + s * .3, y - s * .2], [x + s * .36, y], [x + s * .1, y]], '#77756d');
  poly(c, [[x - s * .26, y - s * .26], [x + s * .02, y - s * .36], [x + s * .12, y - s * .2], [x - s * .12, y - s * .1]], '#b4b1a4');
  c.strokeStyle = 'rgba(60,58,50,.4)'; c.lineWidth = Math.max(1, s * .015);
  c.beginPath(); c.moveTo(x - s * .1, y - s * .1); c.lineTo(x - s * .04, y - s * .02); c.moveTo(x + s * .14, y - s * .16); c.lineTo(x + s * .2, y - s * .06); c.stroke();
  circle(c, x - s * .1, y - s * .3, s * .07, '#7fb85a'); circle(c, x - s * .2, y - s * .24, s * .045, '#93c96a'); circle(c, x + s * .22, y - s * .03, s * .04, '#7fb85a');
}
function drawFlowerPatch(c, x, y, s, seed) {
  const r = rng(seed * 11 + 5), cols = ['#fff6b0', '#ffb3c6', '#ffffff', '#ffd27a', '#c9b6ff', '#ff9a62', '#f4707e'];
  c.strokeStyle = '#4f9a3f'; c.lineWidth = Math.max(1, s * .02);
  for (let i = 0; i < 6; i++) { const lx = x + (r() - .5) * s * .9, ly = y + (r() - .5) * s * .25; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + (r() - .5) * s * .12, ly - s * .13); c.stroke(); }
  for (let i = 0; i < 8; i++) {
    const fx = x + (r() - .5) * s * .9, fy = y + (r() - .5) * s * .3, pr = s * .035;
    c.strokeStyle = '#4f9a3f'; c.lineWidth = Math.max(1, s * .03);
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - s * .1); c.stroke();
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; circle(c, fx + Math.cos(a) * pr * 1.1, fy - s * .12 + Math.sin(a) * pr * 1.1, pr, cols[(i + (i > 4 ? 2 : 0)) % 7]); }
    circle(c, fx, fy - s * .12, pr * .7, '#e8a23a');
  }
}
function drawCloud(c, x, y, s) {
  c.fillStyle = 'rgba(255,255,255,.92)';
  [[0, 0, .5], [.5, -.12, .6], [1.05, 0, .5], [.55, .1, .5], [.15, .12, .4], [.95, .12, .4]].forEach(b => { c.beginPath(); c.arc(x + b[0] * s, y + b[1] * s, b[2] * s * .6, 0, 6.2832); c.fill(); });
  c.fillStyle = 'rgba(214,232,240,.55)';
  c.beginPath(); c.ellipse(x + .55 * s, y + .22 * s, .75 * s, .12 * s, 0, 0, 6.2832); c.fill();
}

/* Trees and bushes are static, so they are rendered once into small bitmaps (size bucketed so the zoom animation
 * does not create a new bitmap every frame) and blitted. This keeps a dense forest affordable on phones. */
function drawSprite(c, type, kind, seed, x, y, s, alpha) {
  const q = Math.max(12, Math.round(s / 6) * 6), key = type + kind + '|' + seed + '|' + q + '|' + dpr;
  let e = sprites.get(key);
  if (!e) {
    if (sprites.size > 320) sprites.clear();
    const w = Math.ceil(type === 'tree' ? q * 1.15 : q * 1.8), h = Math.ceil(type === 'tree' ? q * 1.25 : q * .95);
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const ax = w / 2, ay = h - q * .1;
    if (type === 'tree') drawTree(g, ax, ay, q, kind, seed); else drawBush(g, ax, ay, q, kind, seed);
    e = {cv, w, h, ax, ay, q}; sprites.set(key, e);
  }
  const k = s / e.q;
  if (alpha != null && alpha < 1) { const pa = c.globalAlpha; c.globalAlpha = pa * Math.max(0, alpha); c.drawImage(e.cv, x - e.ax * k, y - e.ay * k, e.w * k, e.h * k); c.globalAlpha = pa; }
  else c.drawImage(e.cv, x - e.ax * k, y - e.ay * k, e.w * k, e.h * k);
}

/* ======================================================================
 * 5. Backdrop (cached): sky, hills, meadow, layered forest
 * ==================================================================== */
function buildBackdrop(w, h, ratio, stage) {
  const st = stage || 0;              // 0..4: the painted forest thins out and withdraws as the village grows
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
    return x => base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f1 * 2.3 + ph * 1.7) * amp * .4;
  };
  ridge(hy - h * .1, h * .035, .006, 1.2, ['#a5cfc0', '#b9dcc4'], '#8dbfa7', 26);
  const ridgeY = ridge(hy - h * .045, h * .03, .009, 4.1, ['#86c19a', '#a2d29a'], '#6fae88', 34);
  // tiny hazy cottages on the far hill (pure depth cue, far from the playable area)
  farCottage(fr, w * .14, ridgeY(w * .14) + 2, h * .05);
  farCottage(fr, w * .88, ridgeY(w * .88) + 2, h * .042);

  // meadow
  g = fr.createLinearGradient(0, hy - h * .03, 0, h);
  // forest floor: deeper and cooler than the sunlit clearing painted on top of it, so the clearing reads as an opening in the woods
  g.addColorStop(0, '#86b95c'); g.addColorStop(.5, '#6ba44d'); g.addColorStop(1, '#558f3f');
  fr.fillStyle = g;
  fr.beginPath(); fr.moveTo(0, h); fr.lineTo(0, hy);
  for (let x = 0; x <= w + 10; x += 10) fr.lineTo(x, hy - Math.sin(x * .012) * h * .012 - Math.sin(x * .031) * h * .006);
  fr.lineTo(w, h); fr.closePath(); fr.fill();
  const r = rng(42);
  for (let i = 0; i < 8; i++) {       // soft, luminous light patches
    const x = r() * w, y = hy + r() * (h - hy), rad = w * (.12 + r() * .18);
    const gg = fr.createRadialGradient(x, y, 0, x, y, rad); gg.addColorStop(0, 'rgba(235,248,150,.34)'); gg.addColorStop(1, 'rgba(235,248,150,0)');
    fr.fillStyle = gg; fr.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 16; i++) {      // warm bokeh motes drifting over the meadow
    const x = r() * w, y = hy + r() * (h - hy) * .8, rad = 5 + r() * 16;
    const gg = fr.createRadialGradient(x, y, 0, x, y, rad); gg.addColorStop(0, 'rgba(255,250,190,.28)'); gg.addColorStop(1, 'rgba(255,250,190,0)');
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
    circle(fr, x, y, s, ['#fff7b8', '#ffffff', '#ffc4d6', '#ffe08a', '#ff9a62', '#f4707e'][i % 6]); circle(fr, x, y, s * .4, '#e6a53c');
  }

  // layered forest rows, back to front
  // the rows nearest the village are dropped first (4 -> 3 -> 3 -> 2 -> 2) and the rest climb toward the horizon
  const rows = 4 - Math.floor((st + 1) / 2);
  for (let k = 0; k < rows; k++) {
    const rr = rng(100 + k), base = hy + h * (.012 + k * .042) - st * h * .007, sz = Math.min(w * .5, h * (.15 + k * .03)) * (1 - st * .035);
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
  // side trees frame the scene; sized from the width too so they never climb onto the plot on a phone
  const side = rng(777), ss = Math.min(h * .24, w * .24);
  for (let i = 0; i < 6; i++) {
    const sz = ss * (.78 + side() * .3), y = h * (.5 + i * .075);
    const xl = -sz * .1 + side() * sz * .2 - st * sz * .14, kl = pickKind(side());
    const xr = w + sz * .1 - side() * sz * .2 + st * sz * .14, kr = pickKind(side());
    if (i >= 6 - st) continue;        // random draws above stay in sequence, so the surviving trees never change
    drawTree(fr, xl, y, sz, kl, 900 + i);
    drawTree(fr, xr, y + h * .03, sz, kr, 950 + i);
  }
  return {sky: skyC, far: farC};
}
function farCottage(c, x, y, s) {
  c.save(); c.globalAlpha = .85;
  c.fillStyle = 'rgba(60,100,70,.18)'; c.beginPath(); c.ellipse(x - s * .1, y, s * .7, s * .12, 0, 0, 6.2832); c.fill();
  poly(c, [[x - s * .45, y], [x + s * .45, y], [x + s * .45, y - s * .45], [x - s * .45, y - s * .45]], '#f1e3c4');
  poly(c, [[x + s * .1, y], [x + s * .45, y], [x + s * .45, y - s * .45], [x + s * .1, y - s * .45]], '#d9c8a4');
  poly(c, [[x - s * .6, y - s * .4], [x, y - s * .95], [x + s * .6, y - s * .4]], '#c9705a');
  poly(c, [[x, y - s * .95], [x + s * .6, y - s * .4], [x + s * .1, y - s * .4]], '#b05a48');
  c.fillStyle = '#c9a98a'; c.fillRect(x + s * .22, y - s * 1.0, s * .12, s * .3);
  c.fillStyle = '#ffe9a8'; c.fillRect(x - s * .3, y - s * .32, s * .16, s * .16); c.fillRect(x - s * .02, y - s * .32, s * .16, s * .16);
  c.fillStyle = '#8a5e36'; c.fillRect(x - s * .3, y - s * .32 + s * .07, s * .16, s * .015);
  circle(c, x + s * .75, y - s * .35, s * .3, '#7fb98a'); circle(c, x + s * .7, y - s * .45, s * .22, '#98cd8a');
  c.restore();
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
  // lily pads, cattails and twinkling highlights on the water
  streamPts.forEach((p, i) => {
    if (i % 5 === 2) {
      const lx = p[0] + wdt * .12, ly = p[1] + wdt * .05, lr = wdt * .2;
      ctx.fillStyle = '#4f9d49'; ctx.beginPath(); ctx.ellipse(lx, ly, lr, lr * .5, 0, .25, 6.0); ctx.lineTo(lx, ly); ctx.fill();
      ctx.fillStyle = '#74c35e'; ctx.beginPath(); ctx.ellipse(lx - lr * .15, ly - lr * .08, lr * .6, lr * .28, 0, 0, 6.2832); ctx.fill();
      if (i % 10 === 2) circle(ctx, lx + lr * .2, ly - lr * .3, lr * .22, '#ffc2d4');
    }
    if (i % 7 === 3) {
      const bx = p[0] + wdt * .62, by = p[1] + 2;
      ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = Math.max(1, tw * .014);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 2, by - tw * .3); ctx.moveTo(bx + 4, by); ctx.lineTo(bx + 7, by - tw * .24); ctx.stroke();
      ctx.fillStyle = '#7a4e2a'; ctx.beginPath(); ctx.ellipse(bx - 2, by - tw * .3, tw * .012, tw * .04, 0, 0, 6.2832); ctx.fill();
    }
    const tws = Math.sin(T * 3 + i * 1.9);
    if (tws > .35) { ctx.fillStyle = `rgba(255,255,255,${(tws - .35) * 1.2})`; star(ctx, p[0] + Math.sin(i * 7) * wdt * .25, p[1] + Math.cos(i * 5) * wdt * .1, 2 + tws * 2.5); }
  });
  // faint rainbow in the mist
  const rb = ['rgba(255,120,120,.16)', 'rgba(255,210,110,.16)', 'rgba(130,220,140,.16)', 'rgba(120,180,255,.16)'];
  rb.forEach((col, i) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, tw * .05); ctx.beginPath(); ctx.arc(p0[0] + cw * .02, p0[1] - cw * .1, cw * (.62 + i * .05), Math.PI * 1.08, Math.PI * 1.92); ctx.stroke(); });
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
  const cols = ['#fff6b0', '#ffb3c6', '#ffffff', '#ffd27a', '#c9b6ff', '#ff9a62', '#f4707e'];
  for (let x = -7; x < WORLD + 7; x++) for (let y = -7; y < WORLD + 7; y++) {   // covers the widest clearing, not just the plot
    const r = rng((x + 8) * 131 + (y + 8) * 17 + 9), list = [];
    for (let i = 0; i < 4; i++) list.push({dx: .12 + r() * .76, dy: .12 + r() * .76, f: r() < .3 ? cols[Math.floor(r() * 7)] : null});
    tufts.push({x, y, list});
  }
})();

/* A dirt road leaves the front-right edge of the plot toward the viewer; it gets wider as the village grows.
 * It starts at the plot edge and is painted on the meadow, so it never covers editable land. */
function drawPath(P) {
  const {lo, hi, tw} = view, grow = clamp(hi - lo - N_MIN, 0, 4), mid = (lo + hi) / 2;
  const a = P(hi + .05, mid + .4), e = [W + tw * 1.2, Math.min(H * .86, a[1] + tw * (2.6 + grow * .3))];
  const c1 = [lerp(a[0], e[0], .35), a[1] + tw * (.35 + grow * .08)];
  const path = new Path2D(); path.moveTo(a[0], a[1]); path.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
  const wd = tw * (.36 + grow * .05);
  ctx.save(); ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(110,150,60,.55)'; ctx.lineWidth = wd + 10; ctx.stroke(path);
  ctx.strokeStyle = '#b99560'; ctx.lineWidth = wd + 3; ctx.stroke(path);
  ctx.strokeStyle = '#e6cc98'; ctx.lineWidth = wd; ctx.stroke(path);
  ctx.strokeStyle = 'rgba(255,240,200,.55)'; ctx.lineWidth = wd * .35; ctx.setLineDash([tw * .12, tw * .28]); ctx.stroke(path);
  ctx.restore();
}
/* ---- The clearing -------------------------------------------------------------------------------------------
 * The ground is one continuous, soft-edged meadow with an organic outline, not a tile slab. The outline is derived
 * from the unlocked land size n: a rounded square that hugs the plot corners plus a margin ("pad") that grows with
 * every expansion, with a gentle wobble so it never reads as a square. The tile grid stays logical (tap mapping,
 * collisions, the build grid overlay); the same outline decides which trees, bushes and rocks may stand. */
const CLEAR_P = 6;                                        // super-ellipse exponent: a rounded square, like the plot itself
const CLEAR_PADS = [.8, 1.4, 2.1, 2.9, 3.8];               // meadow margin beyond the plot, in tiles, for 16 / 25 / 36 / 49 / 64
function clearPad(st) { st = clamp(st, 0, 4); const i = Math.min(3, Math.floor(st)); return lerp(CLEAR_PADS[i], CLEAR_PADS[i + 1], st - i); }
const clearNorm = (dx, dy) => Math.pow(Math.pow(Math.abs(dx), CLEAR_P) + Math.pow(Math.abs(dy), CLEAR_P), 1 / CLEAR_P);
function clearWob(a) { return .5 * Math.sin(3 * a + 1.3) + .3 * Math.sin(5 * a + .4) + .2 * Math.sin(8 * a + 2.1); }     // -1..1
// radius of the clearing along angle a, in the same norm; the plot corner sits at nf/2*1.1225 so the margin is never < .55*pad
function clearRadius(a, nf) { return nf / 2 * 1.1225 + clearPad(nf - N_MIN) * (1 + .45 * clearWob(a)); }
// signed distance (norm units ~ tiles) of a grid point outside (+) / inside (-) the clearing for land size nf centred on c
function clearDist(x, y, nf, c) { const dx = x - c, dy = y - c; return clearNorm(dx, dy) - clearRadius(Math.atan2(dy, dx), nf); }
const CLEAR_N = 96;
function clearOutline(P, nf, c, off) {
  const pts = [];
  for (let i = 0; i < CLEAR_N; i++) {
    const a = i / CLEAR_N * 6.2832, k = clearNorm(Math.cos(a), Math.sin(a)), r = (clearRadius(a, nf) + (off || 0)) / k;
    pts.push(P(c + Math.cos(a) * r, c + Math.sin(a) * r));
  }
  return pts;
}
function tracePts(pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }

function drawLand(P) {
  const tw = view.tw, nf = view.hi - view.lo, c = view.c;
  // soft shade where the canopy overhangs the opening, then feathered grass so the edge melts into the forest floor
  [[.95, .08], [.6, .09], [.3, .1]].forEach(([off, a]) => { tracePts(clearOutline(P, nf, c, off)); ctx.fillStyle = `rgba(32,82,36,${a})`; ctx.fill(); });
  [[.34, .2], [.24, .2], [.15, .22], [.07, .25]].forEach(([off, a]) => { tracePts(clearOutline(P, nf, c, off)); ctx.fillStyle = `rgba(150,206,96,${a})`; ctx.fill(); });
  const ring = clearOutline(P, nf, c, 0);
  let y0 = 1e9, y1 = -1e9; ring.forEach(p => { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#a6da6a'); g.addColorStop(.5, '#9bd366'); g.addColorStop(1, '#88c65a');
  tracePts(ring); ctx.fillStyle = g; ctx.fill();
  ctx.save(); tracePts(ring); ctx.clip();
  // warm sunlight pooling in the middle, dappled light and cool soft shade (organic variation, deliberately not a grid)
  const span = nf / 2 + clearPad(nf - N_MIN), mc = P(c, c), rad = tw * span * .75;
  ctx.save(); ctx.translate(mc[0], mc[1]); ctx.scale(1, .5);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, rad); sg.addColorStop(0, 'rgba(246,255,184,.42)'); sg.addColorStop(1, 'rgba(246,255,184,0)');
  ctx.fillStyle = sg; ctx.fillRect(-rad, -rad, rad * 2, rad * 2); ctx.restore();
  const dr = rng(14);
  for (let i = 0; i < 16; i++) {
    const a = dr() * 6.2832, d = Math.sqrt(dr()) * span * .9, p = P(c + Math.cos(a) * d, c + Math.sin(a) * d), r2 = tw * (.7 + dr() * 1.1), warm = i % 3 !== 2;
    ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, .5);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r2);
    rg.addColorStop(0, warm ? 'rgba(240,252,170,.26)' : 'rgba(70,140,90,.13)'); rg.addColorStop(1, 'rgba(240,252,170,0)');
    ctx.fillStyle = rg; ctx.fillRect(-r2, -r2, r2 * 2, r2 * 2); ctx.restore();
  }
  // grass tufts and flowers across the whole meadow
  ctx.lineWidth = Math.max(1, tw * .014); ctx.strokeStyle = '#5f9d3d';
  tufts.forEach(t => {
    if (clearDist(t.x + .5, t.y + .5, nf, c) > -.25) return;
    t.list.forEach(o => {
      const p = P(t.x + o.dx, t.y + o.dy), s = tw * .07;
      if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) return;
      if (o.f) { circle(ctx, p[0], p[1] - s, s * .55, o.f); circle(ctx, p[0], p[1] - s, s * .2, '#e6a53c'); }
      ctx.beginPath(); ctx.moveTo(p[0] - s * .6, p[1]); ctx.lineTo(p[0] - s * .9, p[1] - s * 1.3); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - s * 1.6); ctx.moveTo(p[0] + s * .6, p[1]); ctx.lineTo(p[0] + s * 1.0, p[1] - s * 1.2); ctx.stroke();
    });
  });
  ctx.restore();
  // leafy, scalloped lip along the outline with a few blades and tiny flowers reaching over the forest floor
  const lr = rng(21);
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length], r2 = tw * (.05 + lr() * .035);
    circle(ctx, p[0], p[1] + tw * .012, r2, lr() < .5 ? '#79b84f' : '#8fcc5e');
    if (i % 3 === 0) {
      ctx.strokeStyle = '#68ab43'; ctx.lineWidth = Math.max(1, tw * .016);
      const nx = p[1] - q[1], ny = q[0] - p[0], nl = Math.hypot(nx, ny) || 1, sx = nx / nl * tw * .09, sy = ny / nl * tw * .06;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + sx * .6 - 2, p[1] + sy - tw * .06); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + sx + 2, p[1] + sy - tw * .04); ctx.stroke();
    }
    if (i % 11 === 5) { circle(ctx, p[0], p[1] - tw * .03, tw * .028, ['#fff6b0', '#ffc2d4', '#ffffff'][i % 3]); circle(ctx, p[0], p[1] - tw * .03, tw * .01, '#e6a53c'); }
  });
}
function drawStump(c, x, y, s) {
  c.fillStyle = 'rgba(30,70,30,.22)'; c.beginPath(); c.ellipse(x - s * .06, y + s * .02, s * .4, s * .12, 0, 0, 6.2832); c.fill();
  poly(c, [[x - s * .26, y], [x - s * .22, y - s * .26], [x + s * .22, y - s * .26], [x + s * .28, y]], '#8a5a33');
  poly(c, [[x + s * .02, y - s * .26], [x + s * .22, y - s * .26], [x + s * .28, y], [x + s * .06, y]], '#6e4727');
  c.fillStyle = '#e2b77e'; c.beginPath(); c.ellipse(x, y - s * .26, s * .22, s * .08, 0, 0, 6.2832); c.fill();
  c.strokeStyle = 'rgba(140,90,45,.7)'; c.lineWidth = Math.max(1, s * .02);
  c.beginPath(); c.ellipse(x, y - s * .26, s * .14, s * .05, 0, 0, 6.2832); c.ellipse(x, y - s * .26, s * .06, s * .022, 0, 0, 6.2832); c.stroke();
  circle(c, x - s * .2, y - s * .04, s * .06, '#7fb85a'); circle(c, x + s * .26, y - s * .02, s * .045, '#93c96a');
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
  const s = SPEC[type], it = ITEMS[type], uz = tw * .55, m = M;
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
  // clapboard courses, stone joints and timber corner posts that follow each wall plane
  ['L', 'R'].forEach(f => {
    c.lineWidth = 1;
    c.strokeStyle = f === 'L' ? 'rgba(90,60,35,.16)' : 'rgba(255,255,255,.3)';
    for (let k = 1; k < 6; k++) { const z = fz + (wh - fz) * k / 6, a = FP(f, 0, z), b = FP(f, 1, z); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    c.strokeStyle = 'rgba(70,60,45,.38)';
    const ns = Math.max(2, Math.round(flen(f) * 5));
    for (let k = 1; k < ns; k++) { const t = k / ns, a = FP(f, t, 0), b = FP(f, t, fz); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    [0, .96].forEach(t0 => poly(c, quad(f, t0, t0 + .04, fz, wh), 'rgba(110,70,40,.5)'));
    poly(c, quad(f, 0, 1, wh - uz * .07, wh), 'rgba(110,70,40,.55)');
  });
  const win = (w) => {
    const hw = (w.big ? .17 : .1) * (w.s || 1) / Math.max(.6, flen(w.f) / 1.0) * (flen(w.f) > 1.5 ? 1.3 : 1);
    const za = wh * .4, zb = wh * (w.big ? .82 : .78);
    poly(c, quad(w.f, w.t - hw - .02, w.t + hw + .02, za - uz * .04, zb + uz * .04), '#fff2d6', '#8a5e36', 1.2);
    const gl = c.createLinearGradient(...FP(w.f, w.t - hw, zb), ...FP(w.f, w.t + hw, za));
    gl.addColorStop(0, '#bfe9f6'); gl.addColorStop(1, '#6fb4d4');
    poly(c, quad(w.f, w.t - hw, w.t + hw, za, zb), gl);
    poly(c, quad(w.f, w.t - hw, w.t + hw, za, za + (zb - za) * .3), 'rgba(255,226,150,.5)');    // warm lamp glow inside
    poly(c, quad(w.f, w.t - hw, w.t - hw * .2, zb - (zb - za) * .3, zb), 'rgba(255,214,200,.55)');   // curtain
    const sw = hw * .55;                                                                         // painted shutters
    [[w.t - hw - .02 - sw, w.t - hw - .02], [w.t + hw + .02, w.t + hw + .02 + sw]].forEach(([ta, tb]) => {
      if (ta > 0.01 && tb < .99) poly(c, quad(w.f, ta, tb, za - uz * .03, zb + uz * .03), shade(s.roof, .12), 'rgba(90,50,30,.5)', .8);
    });
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
  poly(c, quad(s.door.f, s.door.t - dw * .6, s.door.t + dw * .6, wh * .4, wh * .56), '#bfe9f6');                  // door glass
  const stp = s.door.f === 'L' ? [P(lerp(x0, x1, s.door.t - dw - .05), y1 + .04), P(lerp(x0, x1, s.door.t + dw + .05), y1 + .04)] : null;
  if (stp) poly(c, [stp[0], stp[1], FP('L', s.door.t + dw + .05, 0), FP('L', s.door.t - dw - .05, 0)], '#d7ccb4', 'rgba(90,70,40,.4)', .8);   // stone doorstep
  const wr = FP(s.door.f, s.door.t, wh * .58); circle(c, wr[0], wr[1], tw * .028, '#4f9a3f'); circle(c, wr[0], wr[1], tw * .014, '#fff2d6');   // wreath
  const kn = FP(s.door.f, s.door.t + dw * .6, wh * .3); circle(c, kn[0], kn[1], tw * .018, '#ffd86a');

  // roof
  const ax = (it.w > it.h) ? 'x' : (it.w < it.h ? 'y' : 'x');
  const Q = (u, v, z) => ax === 'x' ? P(u, v, z) : P(v, u, z);
  const [u0, u1, v0, v1] = ax === 'x' ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  const ov = OV, vm = (v0 + v1) / 2, ez = wh - uz * .06;
  const slopeCol = ax === 'x' ? shade(roof, -.1) : shade(roof, .08);
  const gableWall = ax === 'x' ? wallR : wallL;
  poly(c, [P(x0, y1, wh), P(x1, y1, wh), P(x1, y1, wh - uz * .13), P(x0, y1, wh - uz * .13)], 'rgba(60,35,20,.2)');   // shade under the eaves
  poly(c, [Q(u1, v1, wh), Q(u1, v0, wh), Q(u1, vm, zt)], gableWall);
  c.strokeStyle = 'rgba(110,70,40,.6)'; c.lineWidth = Math.max(1.2, tw * .02);                                         // gable timber
  { const g0 = Q(u1, vm, wh), g1 = Q(u1, vm, zt), g2 = Q(u1, lerp(vm, v1, .5), wh + rh * .3), g3 = Q(u1, lerp(vm, v0, .5), wh + rh * .3);
    c.beginPath(); c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g1[1]); c.moveTo(g2[0], g2[1]); c.lineTo(g3[0], g3[1]); c.stroke(); }
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
  // individual shingles: short alternating ticks in every course, plus a sun-bleached band near the ridge
  c.strokeStyle = shade(roof, -.25); c.lineWidth = 1; c.globalAlpha *= .4;
  const nsh = Math.max(4, Math.round((u1 - u0) * 6));
  for (let k = 0; k < 5; k++) for (let j = 0; j <= nsh; j++) {
    const u = lerp(u0 - ov, u1 + ov, (j + (k % 2 ? .5 : 0)) / nsh);
    if (u > u1 + ov) continue;
    const a = Q(u, lerp(v1 + ov, vm, k / 5), lerp(ez, zt, k / 5)), b = Q(u, lerp(v1 + ov, vm, (k + 1) / 5), lerp(ez, zt, (k + 1) / 5));
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  c.globalAlpha /= .4;
  poly(c, [Q(u0 - ov, lerp(v1 + ov, vm, .78), lerp(ez, zt, .78)), Q(u1 + ov, lerp(v1 + ov, vm, .78), lerp(ez, zt, .78)), Q(u1 + ov, vm, zt), Q(u0 - ov, vm, zt)], 'rgba(255,255,230,.12)');
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
      const ta = .06 + i * (.88 / n), tb = ta + .88 / n, z0 = wh * .78, z1 = wh * .62, off = .1;
      const pa = FP('L', ta, z0), pb = FP('L', tb, z0);
      poly(c, [pa, pb, [pb[0] - off * tw * .5, pb[1] + off * tw * .25 + (z0 - z1)], [pa[0] - off * tw * .5, pa[1] + off * tw * .25 + (z0 - z1)]], i % 2 ? '#ffffff' : '#d9432f', 'rgba(90,50,30,.25)', .8);
    }
    for (let i = 0; i < 2; i++) { const p = P(x0 + .18 + i * .35, y1 + .04); poly(c, [[p[0] - tw * .06, p[1] - tw * .05], [p[0] + tw * .06, p[1] - tw * .07], [p[0] + tw * .05, p[1] + tw * .03], [p[0] - tw * .07, p[1] + tw * .04]], '#b98052', '#7a5230', 1); circle(c, p[0], p[1] - tw * .09, tw * .035, i ? '#ff9a6a' : '#9bd35f'); }
  }
  if (s.parasol) {
    const p = P(x0 + .3, y1 + .03);
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
      const p = P(x1 - .2 - i * .28, y1 - .02 + i * .03), s2 = tw * .08;
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
  // wooden bed edge + two fluttering butterflies
  [[[x0, y1], [x1, y1]], [[x1, y1], [x1, y0]]].forEach(([a, b]) => { const pa = P(a[0], a[1]), pb = P(b[0], b[1]); c.strokeStyle = '#b98052'; c.lineWidth = Math.max(2, tw * .035); c.lineCap = 'round'; c.beginPath(); c.moveTo(pa[0], pa[1]); c.lineTo(pb[0], pb[1]); c.stroke(); });
  for (let i = 0; i < 2; i++) {
    const bp = P(bx + .35 + i * .3, by + .5), fl = Math.sin(time * 9 + i * 2) * .5 + .5, bxp = bp[0] + Math.sin(time * 1.2 + i * 3) * tw * .08, byp = bp[1] - tw * (.3 + i * .07) + Math.cos(time * 1.7 + i) * tw * .03;
    c.fillStyle = i ? '#ffd45e' : '#ff8fae';
    c.beginPath(); c.ellipse(bxp - tw * .018, byp, tw * .02 * (.4 + fl), tw * .028, -.4, 0, 6.2832); c.ellipse(bxp + tw * .018, byp, tw * .02 * (.4 + fl), tw * .028, .4, 0, 6.2832); c.fill();
  }
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
  [[-.5, -.15], [-.2, -.4], [.3, -.3], [.55, -.05], [-.62, .1]].forEach(([dx, dy], i) => circle(c, B[0] + dx * rd, top + dy * rd, tw * (.008 + (i % 2) * .005), '#fff2b8'));   // painted stars
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

/* Visual silhouette of a building: convex hull of everything the drawing can paint (walls, roof overhang,
 * ridge, chimney / cupola / mast / flags, doorstep and props). It is used for tap hit-testing AND for the
 * placement rule, so two buildings can only coexist when their painted shapes do not touch. */
const SPIKES = {      // rooftop extras: u along the ridge (0..1), v offset across it, h in uz above the ridge, rl/rr half-width in tw
  house:   [{u: .2, v: .12, h: .3, rl: .06, rr: .06}],
  library: [{u: .5, v: 0, h: .8, rl: .1, rr: .1}],
  trading: [{u: .5, v: 0, h: 1.1, rl: .02, rr: .27}],
  hall:    [{u: .06, v: 0, h: .9, rl: .02, rr: .21}, {u: .94, v: 0, h: .9, rl: .02, rr: .21}],
};
function silhouette(type, bx, by, P, tw) {
  const it = ITEMS[type], sp = SPEC[type], uz = tw * .55, pad = .05, pts = [];
  const add = (x, y, z) => pts.push(P(x, y, z || 0));
  if (type === 'observatory') {
    const B = P(bx + 1, by + 1), rx = .78 * tw * .7071, ry = rx / 2, hp = uz * 1.35, rd = rx * .94;
    return hull([[B[0] - rx, B[1]], [B[0] + rx, B[1]], [B[0], B[1] + ry], [B[0] - rx, B[1] - hp], [B[0] + rx, B[1] - hp],
      [B[0] - rd, B[1] - hp], [B[0] + rd, B[1] - hp], [B[0], B[1] - hp - rd - tw * .1], [B[0] + rd * .75 + tw * .08, B[1] - hp - rd - tw * .08]]);
  }
  const gx0 = bx + M - pad, gx1 = bx + it.w - M + pad, gy0 = by + M - pad, gy1 = by + it.h - M + pad;
  [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]].forEach(([x, y]) => add(x, y, 0));
  if (type === 'garden') { [[gx0, gy0], [gx1, gy0], [gx1, gy1], [gx0, gy1]].forEach(([x, y]) => add(x, y, tw * .3)); return hull(pts); }
  const wh = sp.wh * uz, zt = wh + sp.rh * uz, ez = wh - uz * .06;
  const rx0 = bx + M - OV, rx1 = bx + it.w - M + OV, ry0 = by + M - OV, ry1 = by + it.h - M + OV;
  [[rx0, ry0], [rx1, ry0], [rx1, ry1], [rx0, ry1]].forEach(([x, y]) => add(x, y, ez));
  const alongX = it.w >= it.h, xm = (rx0 + rx1) / 2, ym = (ry0 + ry1) / 2;
  if (alongX) { add(rx0, ym, zt); add(rx1, ym, zt); } else { add(xm, ry0, zt); add(xm, ry1, zt); }
  (SPIKES[type] || []).forEach(k => {
    const z = zt + k.h * uz, p = alongX ? P(lerp(bx + M, bx + it.w - M, k.u), ym + k.v, z) : P(xm + k.v, lerp(by + M, by + it.h - M, k.u), z);
    pts.push(p, [p[0] - k.rl * tw, p[1]], [p[0] + k.rr * tw, p[1]]);
  });
  return hull(pts);
}
const REF_P = makeP(1, 0, 0, 0);       // scale-free projection (tile width = 1) used for placement tests
function polysOverlap(a, b, tol) {      // separating-axis test for convex polygons; overlaps thinner than tol count as touching
  for (const pg of [a, b]) for (let i = 0; i < pg.length; i++) {
    const p = pg[i], q = pg[(i + 1) % pg.length];
    let nx = q[1] - p[1], ny = p[0] - q[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    a.forEach(v => { const d = v[0] * nx + v[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; });
    b.forEach(v => { const d = v[0] * nx + v[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; });
    if (a1 <= b0 + tol || b1 <= a0 + tol) return false;
  }
  return true;
}
const bboxOf = pg => pg.reduce((r, p) => ({x0: Math.min(r.x0, p[0]), y0: Math.min(r.y0, p[1]), x1: Math.max(r.x1, p[0]), y1: Math.max(r.y1, p[1])}), {x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9});
const boxesTouch = (a, b, tol) => !(a.x1 <= b.x0 + tol || b.x1 <= a.x0 + tol || a.y1 <= b.y0 + tol || b.y1 <= a.y0 + tol);
const footprintPoly = (type, x, y) => { const it = ITEMS[type]; return [REF_P(x, y), REF_P(x + it.w, y), REF_P(x + it.w, y + it.h), REF_P(x, y + it.h)]; };
/* Three layers, cheapest first, all in a scale-free projection so the answer never depends on zoom:
 *  1. projected tile footprints (diamonds) may not intersect,
 *  2. painted bounding boxes (walls + roof + chimney/flags/props) must intersect before the exact test runs,
 *  3. the exact painted silhouettes (convex hulls) may not overlap (SAT).
 * Anything that fails 1 or 3 is refused, so two buildings can never draw over each other, whichever is in front. */
function visualConflict(type, x, y, ignoreId) {
  const mine = silhouette(type, x, y, REF_P, 1), mb = bboxOf(mine), mf = footprintPoly(type, x, y);
  return S.blds.find(b => {
    if (b.id === ignoreId) return false;
    if (polysOverlap(mf, footprintPoly(b.type, b.x, b.y), .004)) return true;
    const theirs = silhouette(b.type, b.x, b.y, REF_P, 1);
    return boxesTouch(mb, bboxOf(theirs), .004) && polysOverlap(mine, theirs, .004);
  }) || null;
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
  const P = curP(), tw = view.tw;
  const order = S.blds.slice().sort((a, b) => (b.x + ITEMS[b.type].w + b.y + ITEMS[b.type].h) - (a.x + ITEMS[a.type].w + a.y + ITEMS[a.type].h));
  return order.find(b => inHull(silhouette(b.type, b.x, b.y, P, tw), px, py)) || null;
}

/* ======================================================================
 * 9. Scenery objects on unexplored tiles
 * ==================================================================== */
/* The forest is a fixed set of world-space objects covering WR0..WR1 (well past the 8x8 maximum plot). What is
 * *visible* depends on the land size: every object has a clearing distance (in tiles from the plot edge), and
 * that distance grows with each expansion, so trees, bushes and rocks disappear ring by ring and the forest
 * edge withdraws outward: 16 -> 25 -> 36 -> 49 -> 64 tiles. */
const WR0 = -9, WR1 = WORLD + 9;      // reaches past the widest clearing (64 tiles: ~10 tiles beyond the centre) so a forest edge always exists
const wild = [];
(function () {
  for (let x = WR0; x < WR1; x++) for (let y = WR0; y < WR1; y++) for (let k = 0; k < 3; k++) {
    const r = rng((x + 20) * 73 + (y + 20) * 19 + 5 + k * 911);
    if (r() > [.95, .75, .5][k]) continue;
    const o = {tx: x, ty: y, x: x + .12 + r() * .76, y: y + .12 + r() * .76, seed: Math.floor(r() * 1000), kind: pickKind(r())};
    const v = r();
    o.type = v < .46 ? 'tree' : v < .72 ? 'bush' : v < .84 ? 'rock' : 'flower';
    o.size = .8 + r() * .45;
    o.jit = r();
    wild.push(o);
  }
  wild.sort((a, b) => (a.x + a.y) - (b.x + b.y));       // painter order for point objects, sorted once
})();
/* Visibility is decided by the clearing outline (clearDist): trees stand only beyond it, so the tree line IS the
 * boundary of the meadow and moves outward with every expansion. Bushes and rocks may hug the edge; flowers live
 * inside the meadow. Trees that the outline has swallowed leave a stump behind. */
const WILD_EDGE = {tree: .15, bush: .02, rock: .02}, WILD_JIT = {tree: .55, bush: .4, rock: .4};
function wildDist(o, n) { return clearDist(o.x, o.y, n, loOf(n) + n / 2); }
function wildVisible(o, n) {
  const d = wildDist(o, n);
  return o.type === 'flower' ? d <= -.15 : d >= WILD_EDGE[o.type] + o.jit * WILD_JIT[o.type];
}
const isStump = (o, n) => { const d = wildDist(o, n); return o.type === 'tree' && o.jit < .45 && d <= -.3 && d >= -1.7 && wildType(o) === 'tree'; };
/* Tall trees never stand in front of the plot (they would hide the build area); the front keeps low plants.
 * Decided in world space (against the target view) so objects do not pop while the camera is zooming. */
function wildType(o) { return o.type === 'tree' && o.x + o.y > 2 * tgt.c + 1.4 ? (o.seed % 2 ? 'bush' : 'flower') : o.type; }
function wildSize(type, o, tw) { return type === 'tree' ? tw * 1.05 * o.size : type === 'bush' ? tw * .7 * o.size : type === 'rock' ? tw * .55 * o.size : type === 'stump' ? tw * .5 * o.size : tw * .8; }
function wildBox(type, p, s) {
  return type === 'tree' ? rectPts(p[0], p[1], s * .46, s * .98, s * .04) : type === 'bush' ? rectPts(p[0], p[1], s * .5, s * .72, s * .02)
    : type === 'rock' ? rectPts(p[0], p[1], s * .38, s * .4, s * .02) : type === 'stump' ? rectPts(p[0], p[1], s * .32, s * .4, s * .04) : rectPts(p[0], p[1], s * .45, s * .28, s * .05);
}
/* Everything that decides whether a scenery object is actually painted for land size n in the given view. */
function wildInfo(o, P, tw, lp, n) {
  const stump = !wildVisible(o, n) && isStump(o, n);
  if (!stump && !wildVisible(o, n)) return null;
  const p = P(o.x, o.y);
  if (p[0] < -tw * 2 || p[0] > W + tw * 2 || p[1] < -tw * 2.5 || p[1] > H + tw * 3) return null;
  if (nearStream(p[0], p[1], tw * .85)) return null;
  const type = stump ? 'stump' : wildType(o), s = wildSize(type, o, tw);
  if (polysOverlap(wildBox(type, p, s), lp, 0)) return null;      // its painted box may never touch the plot outline
  return {type, p, s};
}
function drawWildObj(c, type, o, x, y, s, alpha) {
  if (type === 'tree' || type === 'bush') drawSprite(c, type, o.kind, o.seed, x, y, s, alpha);
  else { const pa = c.globalAlpha; c.globalAlpha = pa * (alpha == null ? 1 : alpha); if (type === 'rock') drawRock(c, x, y, s); else if (type === 'stump') drawStump(c, x, y, s); else drawFlowerPatch(c, x, y, s, o.seed); c.globalAlpha = pa; }
}
/* Painter's order by footprint rectangles: A is behind B when A lies wholly to the left of B or wholly behind it.
 * A plain "x+y" sort is wrong for big buildings next to small ones; this one is a topological sort with the
 * x+y key only as the tie-break for pairs that have no strict relation. */
function depthSort(list) {
  const n = list.length, adj = list.map(() => []), indeg = new Array(n).fill(0), done = new Array(n).fill(false), out = [];
  const behind = (a, b) => a.x1 <= b.x0 + 1e-6 || a.y1 <= b.y0 + 1e-6;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = list[i], b = list[j], ab = behind(a, b), ba = behind(b, a);
    const r = ab && !ba ? -1 : ba && !ab ? 1 : Math.sign(a.k - b.k);
    if (r < 0) { adj[i].push(j); indeg[j]++; } else if (r > 0) { adj[j].push(i); indeg[i]++; }
  }
  for (let c = 0; c < n; c++) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] <= 0 && (pick < 0 || list[i].k < list[pick].k)) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || list[i].k < list[pick].k)) pick = i;      // cycle: fall back to x+y
    done[pick] = true; out.push(list[pick]); adj[pick].forEach(j => indeg[j]--);
  }
  return out;
}
/* Convex outline of the plot on screen (lawn + earth bank), grown by ex tiles. Scenery whose painted
 * bounding box touches it is not drawn, so trees and bushes can never hide editable land. */
function landPoly(P, tw, ex) {
  const {lo, hi} = view, dz = 4;      // the ground has no earth bank any more: the outline is just the logical plot
  const A = P(lo - ex, lo - ex), B = P(hi + ex, lo - ex), C = P(hi + ex, hi + ex), D = P(lo - ex, hi + ex);
  return [A, B, [B[0], B[1] + dz], [C[0], C[1] + dz], [D[0], D[1] + dz], D];
}
const rectPts = (x, y, hw, up, down) => [[x - hw, y - up], [x + hw, y - up], [x + hw, y + down], [x - hw, y + down]];

/* ======================================================================
 * 10. Frame rendering
 * ==================================================================== */
const clouds = [{x: .1, y: .09, s: 90, v: 5}, {x: .55, y: .16, s: 120, v: 3}, {x: .85, y: .06, s: 70, v: 4}, {x: .35, y: .24, s: 80, v: 2}];
const leaves = Array.from({length: 9}, (_, i) => ({x: (i * 0.13) % 1, y: (i * 0.37) % 1, s: 4 + (i % 3) * 1.5, v: 14 + (i % 4) * 5, ph: i * 1.3}));
const sparks = [];
let dirty = 1, last = 0, rafId = 0, lastDrawAt = 0, lastActive = 0;
/* Event-driven loop: a frame is requested only while something is animating, being touched, or marked dirty.
 * Ambient motion (clouds, leaves) is throttled and stops after AMBIENT_IDLE_MS without interaction. */
const AMBIENT_IDLE_MS = 8000, AMBIENT_STEP_MS = 66;
function wake() { lastActive = performance.now(); if (!rafId && !document.hidden) rafId = requestAnimationFrame(frame); }
function markDirty() { dirty = 1; wake(); }

function spawnSparks(x, y, n, cols) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = 40 + Math.random() * 90; sparks.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 1, col: cols[i % cols.length], s: 3 + Math.random() * 4}); }
}

/* ---- cached static layer ----
 * Ground (meadow, stream, road) and all forest scenery that no building can overlap are painted ONCE into an offscreen
 * canvas and only blitted afterwards. It is rebuilt when the signature below changes: viewport/DPR, camera
 * (zoom/pan), land size, building set/positions, or the expand-preview marking. Animation ticks never touch it.
 * While the camera is still easing (or the expand effect runs) the same code paints live, in the original order. */
let stat = null, vgGrad = null;
const perf = {on: /[?&]perf=1(&|$)/.test(location.search), builds: 0, fps: 0, ms: 0, frames: 0, t0: 0, el: null};
const VIEW_KEYS = ['tw', 'cx', 'cy', 'c', 'lo', 'hi'];
const viewSettled = () => VIEW_KEYS.every(k => view[k] === tgt[k]);
function staticSig() {
  return [W, H, dpr, Math.round(area.bottom), S.n, ui.mode === 'expand' && S.n < N_MAX ? 1 : 0, view.tw, view.cx, view.cy, view.c, view.lo, view.hi,
    S.blds.map(b => b.id + b.type + b.x + ',' + b.y).join(';')].join('|');
}
const bboxHit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const bldEnt = (b, P, tw) => { const it = ITEMS[b.type]; return {k: b.x + it.w + b.y + it.h - .01 + b.x * 1e-4, x0: b.x, x1: b.x + it.w, y0: b.y, y1: b.y + it.h,
  f: () => drawBuilding(ctx, P, tw, b.type, b.x, b.y, ui.mode === 'move' && ui.moveId === b.id ? .5 : 1, T)}; };

/* Splits scenery into `free` (cannot overlap any building: painted first, in simple k order) and `dyn` (touches a
 * building's painted box, or is highlighted for the next expansion: depth-sorted exactly together with the buildings). */
function collectWild(P, tw, extraGhosts) {
  const lp = landPoly(P, tw, .25), clearing = ui.mode === 'expand' && S.n < N_MAX, nowMs = performance.now();
  const boxes = S.blds.map(b => bboxOf(silhouette(b.type, b.x, b.y, P, tw)));
  boxes.forEach(q => { q.x0 -= 4; q.y0 -= 4; q.x1 += 4; q.y1 += 4; });
  const free = [], dyn = [];
  const place = (o, type, p, s, mark, alpha, ghostK) => {
    const bx = bboxOf(wildBox(type, p, s)), k = o.x + o.y;
    const ent = {k, x0: o.x, x1: o.x, y0: o.y, y1: o.y, f: () => {
      if (mark) {
        const pu = .5 + .5 * Math.sin(T * 4);
        ctx.fillStyle = `rgba(255,215,90,${.28 + pu * .25})`; ctx.strokeStyle = 'rgba(255,240,170,.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(p[0], p[1], s * .42, s * .13, 0, 0, 6.2832); ctx.fill(); ctx.stroke();
      }
      if (ghostK) {
        const k2 = clamp((performance.now() - ghostK.t0) / (reduced ? 1 : 900), 0, 1);
        if (k2 >= 1) return;
        ctx.save(); ctx.translate(p[0], p[1]);
        if (!reduced) ctx.rotate(Math.sin(k2 * 11 + o.seed) * .14 * (1 - k2));       // sways, then shrinks and dissolves
        drawWildObj(ctx, type, o, 0, k2 * s * .06, s * (1 - k2 * .55), (1 - k2) * (1 - k2));
        ctx.restore();
        circle(ctx, p[0] - s * .2 * k2, p[1] - s * .2 - k2 * s * .3, s * (.14 + k2 * .2), `rgba(255,252,225,${.5 * (1 - k2)})`);
        circle(ctx, p[0] + s * .22 * k2, p[1] - s * .12 - k2 * s * .2, s * (.1 + k2 * .18), `rgba(235,248,190,${.45 * (1 - k2)})`);
      } else drawWildObj(ctx, type, o, p[0], p[1], s, alpha);
    }};
    (mark || boxes.some(q => boxesTouch(bx, q, 0)) ? dyn : free).push(ent);
  };
  for (let i = 0; i < wild.length; i++) {          // `wild` is pre-sorted by k, so `free` needs no further sort
    const o = wild[i], info = wildInfo(o, P, tw, lp, S.n);
    if (!info) continue;
    place(o, info.type, info.p, info.s, clearing && info.type !== 'stump' && !wildVisible(o, S.n + 1), 1, null);
  }
  if (extraGhosts) fxGhosts.forEach(g => {
    if (nowMs - g.t0 >= (reduced ? 1 : 900)) return;
    place(g.o, g.type, P(g.o.x, g.o.y), wildSize(g.type, g.o, tw), false, 1, g);
  });
  return {free, dyn};
}
function renderGround(P) {
  drawLand(P);                         // the meadow first, so the stream and road cross it instead of being painted over
  drawWater(P);
  drawPath(P);
}
function buildStatic(sig, P, tw) {
  perf.builds++;
  if (!stat) { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; stat = {cv: c, g: c.getContext('2d')}; }
  const keepT = T; T = 0;                                  // the cached picture is the calm, frozen water state
  ctx = stat.g; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  renderGround(P);
  const {free, dyn} = collectWild(P, tw, false);
  free.forEach(e => e.f());
  ctx = mainCtx; T = keepT;
  stat.sig = sig;
  stat.sorted = depthSort(dyn.concat(S.blds.map(b => bldEnt(b, P, tw))));
  stat.fg = foregroundList(P);
}

function draw() {
  const t0 = perf.on ? performance.now() : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg.sky, 0, 0, W, H);
  clouds.forEach(cl => { const x = ((cl.x * W + T * cl.v) % (W + cl.s * 3)) - cl.s * 1.5; drawCloud(ctx, x, cl.y * H, cl.s * (W < 500 ? .7 : 1)); });
  if (bgPrev && bgFade > 0) {          // forest withdrawing: cross-fade from the previous stage's painted forest
    ctx.drawImage(bgPrev.far, 0, 0, W, H);
    ctx.globalAlpha = 1 - bgFade; ctx.drawImage(bg.far, 0, 0, W, H); ctx.globalAlpha = 1;
  } else ctx.drawImage(bg.far, 0, 0, W, H);
  const P = curP(), tw = view.tw, uz = tw * .55;

  const live = !viewSettled() || fx || fxGhosts.length > 0;
  let fgList;
  if (!live) {
    const sig = staticSig();
    if (!stat || stat.sig !== sig) buildStatic(sig, P, tw);
    ctx.drawImage(stat.cv, 0, 0, W, H);
    drawOverlays(P);
    stat.sorted.forEach(e => e.f());
    fgList = stat.fg;
  } else {                              // camera easing / expand effect: paint live, original layer order
    renderGround(P);
    drawExpandGlow(P);
    drawOverlays(P);
    const {free, dyn} = collectWild(P, tw, true);
    free.sort((a, b) => a.k - b.k).forEach(e => e.f());
    depthSort(dyn.concat(S.blds.map(b => bldEnt(b, P, tw)))).forEach(e => e.f());
    fgList = foregroundList(P);
  }

  drawGhostAndSelection(P, uz);
  drawForegroundList(fgList);

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
  if (!vgGrad) {
    vgGrad = ctx.createRadialGradient(W / 2, H * .5, Math.min(W, H) * .35, W / 2, H * .5, Math.max(W, H) * .75);
    vgGrad.addColorStop(0, 'rgba(50,70,20,0)'); vgGrad.addColorStop(1, 'rgba(50,60,20,.28)');
  }
  ctx.fillStyle = vgGrad; ctx.fillRect(0, 0, W, H);
  if (perf.on) perf.ms += (performance.now() - t0 - perf.ms) * .1;
}

/* "It opened up!": freshly cleared tiles flash warm and fade outward from the village centre, with twinkles
 * and a soft light bloom. Short, cheap, and shortened to a quick fade under prefers-reduced-motion. */
let fx = null;
const fxGhosts = [];
function drawExpandGlow(P) {
  if (!fx) return;
  const el = (performance.now() - fx.t0) / 1000, dur = reduced ? .6 : 1.2;
  if (el > fx.span + dur) { fx = null; return; }
  {   // a soft wave of light runs outward through the new meadow (no tile squares are flashed)
    const k = clamp(el / (dur + fx.span), 0, 1), a = 1 - k, nf = view.hi - view.lo, c = view.c;
    const r0 = fx.r0 * view.tw, r1 = Math.max(r0 + 1, (nf / 2 + clearPad(nf - N_MIN)) * view.tw), R = lerp(r0, r1, 1 - (1 - k) * (1 - k)), mc = P(c, c);
    if (a > 0) {
      ctx.save(); tracePts(clearOutline(P, nf, c, 0)); ctx.clip();
      ctx.translate(mc[0], mc[1]); ctx.scale(1, .5);
      const rr = R * .75, wg = ctx.createRadialGradient(0, 0, Math.max(0, rr - view.tw * 2.2), 0, 0, rr + view.tw * .6);
      wg.addColorStop(0, 'rgba(255,250,190,0)'); wg.addColorStop(.7, `rgba(255,250,190,${.5 * a})`); wg.addColorStop(1, 'rgba(255,250,190,0)');
      ctx.fillStyle = wg; ctx.fillRect(-rr * 2, -rr * 2, rr * 4, rr * 4); ctx.restore();
    }
  }
  fx.tiles.forEach(t => {
    const k = clamp((el - (reduced ? 0 : t.delay)) / dur, 0, 1), a = 1 - k;
    if (a <= 0) return;
    if (!reduced && k > 0 && k < .95) {
      const c = P(t.x + t.sx, t.y + t.sy), r = view.tw * (.05 + .06 * Math.sin(k * 3.1416));
      ctx.fillStyle = `rgba(255,255,235,${.9 * a})`; star(ctx, c[0], c[1] - view.tw * .05, r * 1.6);
    }
  });
  const bl = Math.max(0, 1 - el / (dur + .6));
  if (bl > 0) {
    const c = P(view.c, view.c), g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], view.tw * view.hi * .9);
    g.addColorStop(0, `rgba(255,250,200,${.28 * bl})`); g.addColorStop(1, 'rgba(255,250,200,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
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
  if (ui.hold) {                                   // long-press progress ring on the pressed building
    const b = S.blds.find(q => q.id === ui.hold.id);
    if (b) {
      const it = ITEMS[b.type], k = clamp((performance.now() - ui.hold.t0) / LONG_PRESS_MS, 0, 1), tp = P(b.x + it.w / 2, b.y + it.h / 2, it.top * uz * .5);
      fp(b.x, b.y, it.w, it.h, `rgba(255,225,110,${.12 + k * .3})`, 'rgba(255,210,90,.9)', 2.5);
      ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(90,60,25,.35)'; ctx.beginPath(); ctx.arc(tp[0], tp[1], 22, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = '#ffd25e'; ctx.beginPath(); ctx.arc(tp[0], tp[1], 22, -1.5708, -1.5708 + 6.2832 * k); ctx.stroke();
    }
  }
  if (ui.mode === 'explore' && ui.sel) {
    const b = S.blds.find(q => q.id === ui.sel);
    if (b) {
      const it = ITEMS[b.type];
      fp(b.x, b.y, it.w, it.h, `rgba(255,225,110,${.25 + pulse * .2})`, '#ffd25e', 3);
      poly(ctx, silhouette(b.type, b.x, b.y, P, tw), null, 'rgba(255,210,90,.75)', 2);
      const tp = P(b.x + it.w / 2, b.y + it.h / 2, it.top * uz + 14);
      label(it.name, tp[0], tp[1]);
    }
  }
  if (ui.mode === 'move' && ui.moveId) {
    const b = S.blds.find(q => q.id === ui.moveId);
    if (b) {
      const it = ITEMS[b.type];
      ctx.setLineDash([6, 4]); fp(b.x, b.y, it.w, it.h, ui.lifted ? `rgba(255,225,110,${.2 + pulse * .2})` : null, '#ffd25e', 3); ctx.setLineDash([]);
      if (ui.lifted) { poly(ctx, silhouette(b.type, b.x, b.y, P, tw), null, 'rgba(255,210,90,.9)', 2.5); const tp = P(b.x + it.w / 2, b.y + it.h / 2, it.top * uz + 14); label('もちあげ中：' + it.name, tp[0], tp[1]); }
    }
  }
  if (ui.ghost && ui.buildType !== undefined) {
    const type = ui.mode === 'move' ? (S.blds.find(q => q.id === ui.moveId) || {}).type : ui.buildType;
    if (type) {
      const it = ITEMS[type], g = ui.ghost, age = performance.now() - ui.badAt;
      const shake = !g.ok && !reduced && age < 400 ? Math.sin(age / 25) * 5 * (1 - age / 400) : 0;
      if (!g.ok && g.with) { const ob = S.blds.find(q => q.id === g.with); if (ob) poly(ctx, silhouette(ob.type, ob.x, ob.y, P, tw), `rgba(240,60,40,${.2 + pulse * .15})`, '#ff5a46', 2.5); }
      ctx.save(); ctx.translate(shake, 0);
      fp(g.x, g.y, it.w, it.h, g.ok ? `rgba(120,225,90,${.4 + pulse * .15})` : `rgba(240,80,60,${.5 + pulse * .15})`, g.ok ? '#d7ffb0' : '#ffd0c8', 2.5);
      drawBuilding(ctx, P, tw, type, g.x, g.y, g.ok ? .82 : .4, T);
      ctx.setLineDash(g.ok ? [] : [7, 4]);
      poly(ctx, silhouette(type, g.x, g.y, P, tw), g.ok ? null : `rgba(240,60,40,${.16 + pulse * .1})`, g.ok ? 'rgba(215,255,176,.9)' : '#ff4a3a', 2.5);
      ctx.setLineDash([]); ctx.restore();
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
/* Foreground dressing lives only in the two bottom corners, outside the plot outline and low to the ground,
 * so the centre and front of the editable land (and every tap target) stays completely clear. */
const fg = (() => { const r = rng(2024), a = []; for (let i = 0; i < 14; i++) a.push({fx: r(), dy: r(), t: r() < .35 ? 'bush' : 'flower', seed: i * 13, k: r() < .5 ? 1 : 4}); return a; })();
/* The foreground only frames the picture: low plants in thin side strips that narrow and thin out as the meadow opens
 * up. The whole centre (the interaction zone) and everything inside the plot outline stay free, and nothing here is
 * tall enough to read as a wall of trees. */
function foregroundList(P) {
  const out = [], tw = view.tw, grow = clamp(view.hi - view.lo - N_MIN, 0, 4), lp = landPoly(P, tw, .5);
  const top = view.cy + tw * .6, span = area.bottom - 12 - top;
  if (span < 10) return out;
  const strip = .15 - grow * .025;               // 15% of each side at 16 tiles, 5% at 64
  const keep = Math.round(12 - grow * 2.5);      // fewer foreground plants as the land opens up
  fg.forEach((f, i) => {
    if (i >= keep) return;
    const left = f.fx < .5, u = (left ? f.fx : f.fx - .5) * 2;
    const x = left ? u * W * strip : W - u * W * strip, y = top + f.dy * span;
    const s = f.t === 'bush' ? Math.min(tw * .5, 34) : Math.min(tw * .7, 44);
    // the centre interaction zone (everything between the two side strips) and the plot outline stay free
    if (x > W * strip && x < W * (1 - strip)) return;
    if (nearStream(x, y, tw * .8) || polysOverlap(rectPts(x, y, s * .9, s * .8, s * .05), lp, 0)) return;
    out.push({f, x, y, s});
  });
  return out;
}
function drawForegroundList(list) {
  list.forEach(({f, x, y, s}) => { if (f.t === 'bush') drawSprite(ctx, 'bush', f.k, f.seed, x, y, s, .92); else drawFlowerPatch(ctx, x, y, s, f.seed); });
}

/* full-rate animation (camera, grid fade, effects, long-press ring) vs. gentle pulsing highlights (~30 fps) */
const isBusy = want => !viewSettled() || gridA !== want || bgFade > 0 || sparks.length > 0 || ui.hold || fx || fxGhosts.length > 0;
const isPulsing = () => !reduced && (ui.mode === 'expand' || ui.mode === 'store' || ui.ghost || ui.sel || ui.lifted);
function frame(ts) {
  rafId = 0;
  if (document.hidden) return;                         // no CPU while the tab is hidden; visibilitychange wakes us
  const now = performance.now();
  const dt = Math.min(.05, (ts - last) / 1000 || .016);
  const want = (ui.mode === 'build' || ui.mode === 'move') ? 1 : 0;
  // pure ambient motion is throttled; interaction/animation frames run at full rate
  if (!dirty && !isBusy(want) && now - lastDrawAt < (isPulsing() ? 33 : AMBIENT_STEP_MS)) { rafId = requestAnimationFrame(frame); return; }
  last = ts;
  if (!reduced) T += dt;
  const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
  VIEW_KEYS.forEach(key => { view[key] += (tgt[key] - view[key]) * k; if (Math.abs(tgt[key] - view[key]) < .001) view[key] = tgt[key]; });
  gridA += (want - gridA) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
  if (Math.abs(want - gridA) < .01) gridA = want;
  if (bgFade > 0) { bgFade = reduced ? 0 : Math.max(0, bgFade - dt / 1.4); if (bgFade === 0) bgPrev = null; }
  for (let i = fxGhosts.length - 1; i >= 0; i--) if (now - fxGhosts[i].t0 > (reduced ? 1 : 900)) fxGhosts.splice(i, 1);
  dirty = 0; draw(); lastDrawAt = now;
  updateChips();
  if (perf.on) updatePerf(now);
  // keep going only while something moves or ambient motion is still allowed; otherwise sleep until wake()
  const ambient = !reduced && now - lastActive < AMBIENT_IDLE_MS;
  if (dirty || isBusy(want) || isPulsing() || ambient) rafId = requestAnimationFrame(frame);
}
function updatePerf(now) {
  perf.frames++;
  if (!perf.t0) perf.t0 = now;
  if (now - perf.t0 >= 500) {
    perf.fps = perf.frames * 1000 / (now - perf.t0); perf.frames = 0; perf.t0 = now;
    if (!perf.el) { perf.el = document.createElement('div'); perf.el.className = 'perf'; perf.el.setAttribute('aria-hidden', 'true'); $('app').appendChild(perf.el); }
    perf.el.textContent = `fps ${perf.fps.toFixed(0)} | draw ${perf.ms.toFixed(1)}ms | canvas ${canvas.width}x${canvas.height} @${dpr.toFixed(2)} | cache x${perf.builds}`;
  }
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
    if (occ[(x + dx) + ',' + (y + dy)] !== undefined) return {ok: false, reason: '建物がじゃましてるよ', with: occ[(x + dx) + ',' + (y + dy)]};
  }
  // painted shapes (roofs, chimneys, flags, props) must not touch either, even on separate tiles
  const vc = visualConflict(type, x, y, ignoreId);
  if (vc) return {ok: false, reason: '屋根や建物がかさなって見えるよ', with: vc.id};
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
  if (!$('modal').hidden) return;                    // a dialog is open: no second message on top of it
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
  $('btnMove').setAttribute('aria-pressed', m === 'move' && !ui.lifted);
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
  $('toast').hidden = true;                          // the placement bar (valid or invalid explanation) is the one active message
  actionbar.hidden = false; $('actionText').textContent = text; $('actionOk').textContent = okLabel; $('actionOk').disabled = !okEnabled; layout();
}
function hideAction() { actionbar.hidden = true; actionbar.classList.remove('lifted'); layout(); }

function enterMode(mode) {
  if (ui.mode === mode && mode !== 'explore') mode = 'explore';
  clearHold();
  ui.mode = mode; ui.sel = null; ui.ghost = null; ui.moveId = null; ui.lifted = false;
  if (mode !== 'build') ui.buildType = null;
  hideAction(); $('modal').hidden = true; closeSheet();
  setPressed();
  if (mode === 'explore') setHint('');
  else if (mode === 'build') { setHint('建てたい建物をえらんでね'); openSheet('🏗 建物をえらぶ', renderBuildTray); }
  else if (mode === 'move') setHint('動かしたい建物をタップ');
  else if (mode === 'store') setHint('しまいたい建物をタップ');
  else if (mode === 'expand') { setHint('金色のマスが新しく開拓できる土地だよ'); openSheet('🌱 土地を拡張', renderExpand); }
  else if (mode === 'study') { setHint(''); openSheet('📚 学ぶ（サンプル）', renderStudy); }
  markDirty();
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
  refreshTray(); markDirty();
}
function refreshTray() {
  const cards = sheetBody.querySelector('.cards'), sl = cards ? cards.scrollLeft : 0;
  sheetBody.innerHTML = ''; renderBuildTray(sheetBody);
  const nc = sheetBody.querySelector('.cards'); if (nc) nc.scrollLeft = sl;
}
function drawThumb(cv, type) {
  const r = Math.min(1.5, window.devicePixelRatio || 1), cw = window.innerWidth >= 700 ? 112 : 96, ch = window.innerWidth >= 700 ? 84 : 72;
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
  const n = document.createElement('p'); n.className = 'note'; n.textContent = enough ? '建物はそのまま。金色の木や茂みが切り開かれて、森がひとつ後ろへ下がるよ。' : `あと ${cost - S.points} 点。「学ぶ」ボタンで開拓点をためよう（サンプルです）。`;
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
  sheetBody.innerHTML = ''; renderStudy(sheetBody); markDirty();
  const newly = Object.keys(ITEMS).filter(t => ITEMS[t].need.length && isUnlocked(t) && ITEMS[t].need.includes(k) && ITEMS[t].need.every(q => S.skills[q] >= SKILL_NEED) && ITEMS[t].need.some(q => q === k && S.skills[q] === SKILL_NEED));
  if (newly.length) setTimeout(() => toast('✨ ' + newly.map(t => ITEMS[t].name).join('・') + ' が解放されたよ！'), 900);
}
function doExpand() {
  if (S.n >= N_MAX) return;
  const cost = EXPAND_COST[S.n + 1];
  if (S.points < cost) { toast('開拓点が足りないよ'); return; }
  // 1) what is painted right now and will be cleared by the new size (measured in the current view)
  const oldN = S.n, newN = oldN + 1, P0 = curP(), tw0 = view.tw, lp0 = landPoly(P0, tw0, .25), now = performance.now();
  const cleared = wild.map(o => ({o, info: wildInfo(o, P0, tw0, lp0, oldN)})).filter(q => q.info && q.info.type !== 'stump' && !wildVisible(q.o, newN));
  // 2) the land itself grows; the camera eases out to fit it
  S.points -= cost; S.n = newN;
  updateHUD(); layout();
  // 3) feedback: new tiles flash outward from the centre, trees shrink away with leaf puffs, the painted forest recedes
  const lo = loOf(newN), c = oldN / 2 + loOf(oldN), tiles = [];
  for (let x = lo; x < lo + newN; x++) for (let y = lo; y < lo + newN; y++) {
    if (x >= loOf(oldN) && x < loOf(oldN) + oldN && y >= loOf(oldN) && y < loOf(oldN) + oldN) continue;
    tiles.push({x, y, delay: Math.hypot(x + .5 - c, y + .5 - c) * .09, sx: .3 + ((x * 7 + y * 3) % 5) * .1, sy: .3 + ((x * 3 + y * 7) % 5) * .1});
  }
  fx = {t0: now, tiles, span: tiles.reduce((m, t) => Math.max(m, t.delay), 0), r0: oldN / 2 + clearPad(oldN - N_MIN) * .6};
  fxGhosts.length = 0;
  cleared.forEach(q => fxGhosts.push({o: q.o, type: q.info.type, t0: now}));
  if (!reduced) cleared.slice(0, 40).forEach(q => spawnSparks(q.info.p[0], q.info.p[1] - q.info.s * .35, 2, ['#bfe58a', '#fffbd0', '#8fc96a']));
  spawnSparks(view.cx, view.cy, 24, ['#ffe08a', '#fff', '#b9e48d']);
  bgPrev = bg; bgFade = reduced ? 0 : 1; bg = buildBackdrop(W, H, dpr, stageOf(newN)); if (reduced) bgPrev = null;
  toast(`🌱 森を切り開いて、土地が ${S.n * S.n} マスに広がったよ！`);
  sheetBody.innerHTML = ''; renderExpand(sheetBody); markDirty();
}
function setGhost(tile) {
  const type = ui.mode === 'move' ? (S.blds.find(q => q.id === ui.moveId) || {}).type : ui.buildType;
  if (!type) return;
  const it = ITEMS[type], x = tile.x - Math.floor((it.w - 1) / 2), y = tile.y - Math.floor((it.h - 1) / 2);
  const res = canPlace(type, x, y, ui.mode === 'move' ? ui.moveId : null);
  ui.ghost = {x, y, ok: res.ok, reason: res.reason, with: res.with};
  if (ui.lifted) {                      // long-press move: a single tap on a valid spot commits
    const b = S.blds.find(q => q.id === ui.moveId);
    if (res.ok && b.x === x && b.y === y) { ui.ghost.ok = false; ui.ghost.reason = 'いまの場所だよ'; ui.ghost.same = true; }
    showAction(ui.ghost.ok ? it.name + 'をここへ（タップで決定）' : 'ここには動かせない：' + ui.ghost.reason, '', false);
    actionbar.classList.add('lifted');
  } else if (ui.mode === 'build') {
    const free = (S.stored[type] || 0) > 0;
    if (!res.ok) showAction('置けない：' + res.reason, '建てる', false);
    else if (!free && !canAfford(type)) showAction('材料が足りないよ（' + costText(it.cost) + '）', '建てる', false);
    else showAction(free ? 'しまってある' + it.name + 'を置く' : it.name + 'を建てる（' + costText(it.cost) + '）', '建てる', true);
  } else {
    const b = S.blds.find(q => q.id === ui.moveId);
    if (!res.ok) showAction('ここには動かせない：' + res.reason, '移動', false);
    else if (b.x === x && b.y === y) showAction('いまの場所だよ', '移動', false);
    else showAction(it.name + 'をここへ動かす', '移動', true);
  }
  markDirty();
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
      updateHUD(); sheetBody.innerHTML = ''; if (ui.mode === 'build') renderBuildTray(sheetBody); markDirty();
    });
    refreshTray();
  } else if (ui.mode === 'move') {
    const b = S.blds.find(q => q.id === ui.moveId); if (!b) return;
    const res = canPlace(b.type, g.x, g.y, b.id); if (!res.ok) return;
    const old = {x: b.x, y: b.y}; b.x = g.x; b.y = g.y;
    ui.ghost = null; ui.moveId = null; hideAction(); setHint('動かしたい建物をタップ');
    const it = ITEMS[b.type], p = curP()(b.x + it.w / 2, b.y + it.h / 2, view.tw * .4); spawnSparks(p[0], p[1], 10, ['#fff', '#d7ffb0']);
    toast('✨ ' + it.name + 'を動かしたよ', () => {
      if (canPlace(b.type, old.x, old.y, b.id).ok) { b.x = old.x; b.y = old.y; } else toast('元の場所はふさがっているよ');
      markDirty();
    });
    if (ui.lifted) enterMode('explore');            // long-press move ends back in browse mode
  }
  markDirty();
}
function askStore(b) {
  const it = ITEMS[b.type];
  $('modalTitle').textContent = it.name + 'をしまう？';
  $('modalText').textContent = '建物はなくなりません。「建てる」の中に保管されて、材料なしでまた置けます。';
  // exactly ONE dialog at a time: the build shop, placement bar, toast, hint and selection chips all step aside
  closeSheet(); hideAction(); setHint(''); $('toast').hidden = true; chips.hidden = true;
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
    S.stored[b.type]--; S.blds.push(b); markDirty();
  });
  markDirty();
}
function select(id) { ui.sel = id; markDirty(); if (id) setHint('選んだよ。動かすなら長押し、または下のボタン', 4000); }
function beginLift(id) {
  const b = S.blds.find(q => q.id === id); if (!b) return;
  enterMode('move');
  ui.moveId = id; ui.lifted = true; ui.ghost = null;
  setPressed();
  setHint('行き先をタップ。やめるときは「やめる」');
  showAction(ITEMS[b.type].name + 'をもちあげたよ。行き先のマスをタップ', '', false);
  actionbar.classList.add('lifted');
  if (navigator.vibrate) navigator.vibrate(25);
  markDirty();
}
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
      if (ui.lifted && ui.moveId) {
        if (!tile) { ui.badAt = performance.now(); toast('土地の中をタップしてね'); markDirty(); break; }
        setGhost(tile);
        if (ui.ghost.same) { enterMode('explore'); setHint('もとの場所にもどしたよ', 2200); break; }     // tapping where it already stands cancels
        if (ui.ghost.ok) confirmAction();
        else { ui.badAt = performance.now(); if (navigator.vibrate) navigator.vibrate([20, 40, 20]); }
        break;
      }
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
/* Press handling. In browse mode a press that stays on a building for LONG_PRESS_MS lifts it (then a tap on a
 * destination moves it); a short tap only selects. Moving past HOLD_SLOP, lifting early, a second finger,
 * pointercancel (the browser took over for scrolling/gestures), blur and scroll all cancel the pending lift. */
let down = null;
function clearHold() { if (down && down.timer) { clearTimeout(down.timer); down.timer = 0; } if (ui.hold) { ui.hold = null; markDirty(); } }
canvas.addEventListener('pointerdown', e => {
  if (down && down.id !== e.pointerId) { clearHold(); down = null; return; }           // second finger: abandon
  down = {x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, fired: false, timer: 0};
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* capture keeps pointerup coming to us after a long press */ }
  if (ui.mode === 'explore' && !ui.lifted && $('modal').hidden) {
    const hit = hitBuilding(e.clientX, e.clientY);
    if (hit) {
      ui.hold = {id: hit.id, t0: performance.now()}; markDirty();
      const d = down;
      d.timer = setTimeout(() => { d.timer = 0; if (down === d) { d.fired = true; ui.hold = null; beginLift(hit.id); } }, LONG_PRESS_MS);
    }
  }
});
canvas.addEventListener('pointerup', e => {
  if (!down || down.id !== e.pointerId) return;
  const d = down, moved = Math.hypot(e.clientX - d.x, e.clientY - d.y), dt = performance.now() - d.t;
  clearHold(); down = null;
  if (d.fired) return;                                                // the long press already lifted it: no extra tap
  if (moved < 12 && dt < 700) onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', () => { clearHold(); down = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
['blur', 'scroll'].forEach(n => window.addEventListener(n, () => { clearHold(); down = null; }, true));
document.addEventListener('visibilitychange', () => {
  clearHold(); down = null;
  if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } if (ui.lifted) enterMode('explore'); }
  else { last = 0; lastDrawAt = 0; markDirty(); }
});
['pointerdown', 'pointermove', 'keydown'].forEach(n => window.addEventListener(n, wake, {passive: true, capture: true}));
canvas.addEventListener('pointermove', e => {
  if (down && down.id === e.pointerId && !down.fired && Math.hypot(e.clientX - down.x, e.clientY - down.y) > HOLD_SLOP) clearHold();   // finger drifted: not a long press
  if (e.pointerType !== 'mouse' || e.buttons) return;               // mouse hover preview
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
  chips.hidden = !b || !$('modal').hidden;
  if (b) {
    // keep the chips clear of the bottom bar / open sheet, and never under the HUD
    const it = ITEMS[b.type], p = curP()(b.x + it.w / 2, b.y + it.h, 0), lim = area.bottom - 50;
    chips.style.left = clamp(p[0], 100, W - 100) + 'px'; chips.style.top = clamp(p[1] + 10, area.top, Math.max(area.top, lim)) + 'px';
  }
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
  if (ui.lifted) { enterMode('explore'); setHint('もとに戻したよ', 2200); return; }       // cancel a long-press move: nothing changed
  ui.ghost = null; hideAction(); markDirty();
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
setHint('建物を長押しすると、もちあげて動かせるよ', 7000);
wake();

// Small read-only-ish hook so automated checks can exercise the rules (in-memory only).
window.KVDemo = {S, ui, ITEMS, canPlace, visualConflict, silhouette, beginLift, enterMode, onTap, study: k => study(k, document.body), doExpand, tileCenter: (x, y) => curP()(x + .5, y + .5), setGhost, confirmAction, doStore, askStore, wild, wildVisible, clearDist, snap: () => { snapView(); }};
})();
