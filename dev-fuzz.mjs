// dev-fuzz.mjs — 消去判定の正当性チェック（開発用・成果物ではない）
// A) 薄い盤面：全単純経路を列挙する厳密実装と本体の判定を丸ごと比較
// B) 実戦的なdense盤面：「行き止まりの枝（壁でない次数1ノードを持つパネル）は絶対に消えない」不変条件
// C) dense盤面で本体の探索ステップ数（＝budget 420000 を超えると近似フォールバックに落ちる）
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

const mkCtx = () => new Proxy({ _p: {} }, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t._p) return t._p[k];
    return () => undefined;
  },
  set(t, k, v) { t._p[k] = v; return true; }
});
const mkEl = (id) => { const set = new Set(); return {
  id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, offsetWidth: 1,
  clientWidth: 280, clientHeight: 560, width: 280, height: 560,
  classList: { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)),
    toggle: (c, f) => { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (f) set.add(c); else set.delete(c); },
    contains: (c) => set.has(c) },
  addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; },
  getBoundingClientRect() { return { left: 0, top: 0, width: 280, height: 560 }; },
  setPointerCapture() {}, getContext() { return mkCtx(); } }; };
const elems = new Map();
const documentStub = { hidden: false, getElementById: id => (elems.has(id) || elems.set(id, mkEl(id)), elems.get(id)),
  createElement: t => mkEl(t), addEventListener() {}, fonts: { ready: Promise.resolve() } };
const ls = new Map();
const windowStub = { devicePixelRatio: 1, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
  AudioContext: undefined, webkitAudioContext: undefined, gsap: undefined, confetti: undefined, ResizeObserver: undefined };
const sandbox = { window: windowStub, document: documentStub, Math, JSON, Object, Array, Set, Map, Promise, Date, String, Number, parseInt, isNaN, Error,
  performance, setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, matchMedia: windowStub.matchMedia,
  localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) }, console, __setG: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let G;
const hook = `
;(function(){ __setG({ COLS, ROWS, CELL, LW, TYPES, makePanel, nodeKey,
  getGrid:()=>grid, seed:(g)=>{grid=g;invalidate();}, invalidate, buildAdj, cellEP, endpoints, endpointCounts,
  qualifying:()=>Array.from(qualifyingCells()).sort(), chainsOf, startGame, trySwap, startFlash, lockToClear, finishClear,
  riseNow, collapse, setPhase:(v)=>{phase=v;}, getPhase:()=>phase, setOver:(v)=>{over=v;},
  setRunning:(v)=>{running=v;}, setPaused:(v)=>{paused=v;} }); })();`;
sandbox.__setG = g => { G = g; };
vm.runInNewContext(code + hook, sandbox, { filename: 'game.script.js' });

const rnd = n => (Math.random() * n) | 0;
const edgeOf = (r, c) => { const e = G.cellEP(r, c); if (!e || e.length !== 2) return null;
  const a = G.nodeKey(e[0][0], e[0][1]), b = G.nodeKey(e[1][0], e[1][1]); return a < b ? a + '|' + b : b + '|' + a; };

/* 盤面生成：fullRows 行をびっしり＋おまけの単発パネル */
function mkBoard(fullRows, extras) {
  const g = Array.from({ length: G.ROWS }, () => Array(G.COLS).fill(null));
  for (let r = G.ROWS - fullRows; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) g[r][c] = G.makePanel(G.TYPES[rnd(4)]);
  const slots = [];
  for (let r = 0; r < G.ROWS - fullRows; r++) for (let c = 0; c < G.COLS; c++) slots.push([r, c]);
  for (let i = slots.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
  for (let i = 0; i < Math.min(extras, slots.length); i++) { const [r, c] = slots[i]; g[r][c] = G.makePanel(G.TYPES[rnd(4)]); }
  return g;
}

/* ── A) 盤面をランダム生成し、全単純経路列挙（厳密定義）と照合 ── */
const A_ROWS = +(process.env.A_ROWS || 0), A_TRIES = +(process.env.A_TRIES || 4000), STRICT_CAP = +(process.env.A_CAP || 3e6);
const A_EXTRA = +(process.env.A_EXTRA || 6), A_SPREAD = +(process.env.A_SPREAD || 12);
function strictQual(g) {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a).add(b); adj.get(b).add(a); };
  const cellEdge = new Map();
  for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) if (g[r][c]) { const e = edgeOf(r, c); if (e) { const [a, b] = e.split('|'); add(a, b); cellEdge.set(r + ',' + c, e); } }
  const L = [], R = new Set();
  for (const n of adj.keys()) { const i = n.indexOf(','), x = +n.slice(0, i); if (x === 0) L.push(n); else if (x === G.LW) R.add(n); }
  const okEdge = new Set(), path = [], onPath = new Set();
  let steps = 0, capped = false;
  const walk = n => {
    if (++steps > STRICT_CAP) { capped = true; return; }
    path.push(n); onPath.add(n);
    if (R.has(n)) for (let i = 1; i < path.length; i++) okEdge.add(path[i - 1] < path[i] ? path[i - 1] + '|' + path[i] : path[i] + '|' + path[i - 1]);
    const nb = adj.get(n); if (nb) for (const m of nb) if (!onPath.has(m)) walk(m);
    path.pop(); onPath.delete(n);
  };
  for (const s of L) { walk(s); if (capped) break; }
  if (capped) return null;
  const out = [];
  for (const [k, e] of cellEdge) if (okEdge.has(e)) out.push(k);
  return out.sort();
}
let aChecked = 0, aMismatch = 0, aCapped = 0, aSample = null;
for (let i = 0; i < A_TRIES; i++) {
  const g = mkBoard(A_ROWS, A_EXTRA + rnd(A_SPREAD)); G.seed(g);
  const mine = G.qualifying(), ref = strictQual(g);
  if (!ref) { aCapped++; continue; }
  aChecked++;
  if (mine.join(' ') !== ref.join(' ')) { aMismatch++; if (!aSample) aSample = { g, mine, ref }; }
}
console.log(`A) ランダム盤面 vs 全単純経路列挙(rows=${A_ROWS}): checked=${aChecked} mismatch=${aMismatch} 列挙上限到達=${aCapped}`);

/* ── B) dense盤面：行き止まりの枝が消えないか ─────────────── */
let bChecked = 0, bViolation = 0, bSample = null, overflowBoards = 0, maxSteps = 0;
for (let i = 0; i < 1500; i++) {
  const g = mkBoard(2 + rnd(8), rnd(10)); G.seed(g);
  const adj = G.buildAdj();
  // 本体と同じ単純経路探索のステップ数を実測（＝overflow するか）
  const L = [], R = new Set();
  for (const n of adj.keys()) { const k = n.indexOf(','), x = +n.slice(0, k); if (x === 0) L.push(n); else if (x === G.LW) R.add(n); }
  let steps = 0, over = false; const path = [], onPath = new Set(), hit = new Set();
  const walk = n => {
    if (over) return;
    if (++steps > 420000) { over = true; return; }
    path.push(n); onPath.add(n);
    if (R.has(n)) for (const p of path) hit.add(p);
    const nb = adj.get(n); if (nb) for (const m of nb) if (!onPath.has(m)) walk(m);
    path.pop(); onPath.delete(n);
  };
  for (const s of L) { walk(s); if (over) break; }
  maxSteps = Math.max(maxSteps, steps); if (over) overflowBoards++;

  const mine = G.qualifying();
  if (!mine.length) continue;
  bChecked++;
  const deg = n => (adj.get(n) || new Set()).size;
  const badCells = mine.filter(k => { const p = k.split(','), e = G.cellEP(+p[0], +p[1]); if (!e) return false;
    const a = G.nodeKey(e[0][0], e[0][1]), b = G.nodeKey(e[1][0], e[1][1]);
    const dead = (n) => deg(n) === 1 && +n.slice(0, n.indexOf(',')) !== 0 && +n.slice(0, n.indexOf(',')) !== G.LW;
    return dead(a) || dead(b); });
  if (badCells.length) { bViolation++; if (!bSample) bSample = { g, mine, badCells, over, steps }; }
}
console.log(`B) dense盤面: 消去発生=${bChecked}/1500  探索溢れ盤面=${overflowBoards}  最大step=${maxSteps}  行き止まりが消えた=${bViolation}`);
if (bSample) {
  console.log('--- 再現盤面（/ \\ ^ v ／ 行0が上端） ---');
  console.log(bSample.g.map(row => row.map(p => p ? { slash: '/', backslash: '\\', caret: '^', vee: 'v' }[p.type] : '.').join('')).join('\n'));
  console.log('game clears      :', bSample.mine.join(' '));
  console.log('DEAD-END cleared :', bSample.badCells.join(' '), '   (walk steps=' + bSample.steps + ', overflow=' + bSample.over + ')');
}

/* ── C) 「消えた線は本当に左端→右端か」：画面に描く本線の実在検査 ── */
// C1. すべてのパネルの辺は角をちょうど1列ぶん右へ進める（＝経路は必ず左→右の単調な鎖になる）
let dagBad = 0;
for (const ty of G.TYPES) for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) {
  const e = G.endpoints(ty, c * G.CELL, r * G.CELL, G.CELL);
  const x1 = Math.min(e[0][0], e[1][0]), x2 = Math.max(e[0][0], e[1][0]);
  if (x2 - x1 !== G.CELL || x1 !== c * G.CELL) dagBad++;
}
console.log(`C1) 全パネルが「1列ぶん右へ進む辺」: 違反=${dagBad}`);

// C2. 消滅対象には必ず「左壁→右壁の角続きチェーン」が見つかり、その全パネルが消滅対象である
//     ※経路は角を伝って左隣のパネルへも進みうるので、列の単調増加ではなくノード列で検証する
let cChecked = 0, cBad = 0, cSample = null;
const kx = n => +n.slice(0, n.indexOf(','));
const nOf = (r, c) => { const e = G.cellEP(r, c); return [G.nodeKey(e[0][0], e[0][1]), G.nodeKey(e[1][0], e[1][1])]; };
// パネル列から実際のノード列を組み立て、左壁開始・右壁終了・角共有・重複なしを確認する
const realPath = (path, q) => {
  const N = path.map(rc => nOf(rc[0], rc[1]));
  if (path.some(rc => q.indexOf(rc[0] + ',' + rc[1]) < 0)) return '本線が消滅対象外を通る';
  let cur = N[0].find(k => kx(k) === 0);
  if (!cur) return '始点が左壁にいない';
  const used = new Set([cur]);
  for (let i = 0; i < path.length; i++) {
    if (i && N[i].indexOf(cur) < 0) return '隣のパネルと角を共有していない ' + path[i][0] + ',' + path[i][1];
    const nxt = N[i].find(k => k !== cur);
    if (!nxt || used.has(nxt)) return 'ノードが重複（単純経路でない）';
    used.add(nxt); cur = nxt;
  }
  return kx(cur) === G.LW ? null : '終点が右壁にいない';
};
for (let i = 0; i < 1200; i++) {
  const g = mkBoard(2 + rnd(8), rnd(12)); G.seed(g);
  const q = G.qualifying(); if (!q.length) continue;
  const ch = G.chainsOf(new Set(q)); cChecked++;
  let bad = ch.length ? null : '本線が1本も見つからない';
  for (const path of ch) { bad = realPath(path, q); if (bad) break; }
  if (bad) { cBad++; if (!cSample) cSample = { g, q, ch, bad }; }
}
console.log(`C2) 本線の実在（左壁開始・右壁終了・角共有・単純経路）: 検査=${cChecked} 不備=${cBad}`);
if (cSample) {
  console.log('--- 不備の盤面 ---');
  console.log(cSample.g.map(row => row.map(p => p ? { slash: '/', backslash: '\\', caret: '^', vee: 'v' }[p.type] : '.').join('')).join('\n'));
  console.log(cSample.bad, '| qual=', cSample.q.join(' '), '| chains=', JSON.stringify(cSample.ch));
}

// C3. 消えるパネルはどれも「左壁から届く端点」と「右壁へ届く端点」を1つずつ持つ（必要条件）
let dChecked = 0, dBad = 0, dSample = null;
for (let i = 0; i < 1200; i++) {
  const g = mkBoard(2 + rnd(8), rnd(12)); G.seed(g);
  const q = G.qualifying(); if (!q.length) continue;
  const adj = G.buildAdj();
  const reach = (seeds) => { const seen = new Set(seeds), st = [...seeds];
    while (st.length) { const n = st.pop(); const nb = adj.get(n); if (nb) for (const m of nb) if (!seen.has(m)) { seen.add(m); st.push(m); } } return seen; };
  const L = [], R = [];
  for (const n of adj.keys()) { const x = kx(n); if (x === 0) L.push(n); else if (x === G.LW) R.push(n); }
  const fromL = reach(L), fromR = reach(R);
  dChecked++;
  const bad = q.filter(k => { const p = k.split(','), nn = nOf(+p[0], +p[1]);
    return !((fromL.has(nn[0]) && fromR.has(nn[1])) || (fromL.has(nn[1]) && fromR.has(nn[0]))); });
  if (bad.length) { dBad++; if (!dSample) dSample = { g, q, bad }; }
}
console.log(`C3) 消える各パネルが左右の壁に片手間ずつ接続: 検査=${dChecked} 不備=${dBad}`);
if (dSample) {
  console.log('--- 不備の盤面 ---');
  console.log(dSample.g.map(row => row.map(p => p ? { slash: '/', backslash: '\\', caret: '^', vee: 'v' }[p.type] : '.').join('')).join('\n'));
  console.log('bad=', dSample.bad.join(' '), '| qual=', dSample.q.join(' '));
}

const bad = aMismatch || bViolation || dagBad || cBad || dBad;
console.log('RESULT: ' + (bad ? '✗ 繋いでいないのに消えるケースあり' : '✓ 消える線はすべて左壁→右壁に実在（誤消去なし）'));
process.exit(bad ? 1 : 0);
