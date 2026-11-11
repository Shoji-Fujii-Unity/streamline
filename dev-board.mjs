// 一時デバッグ：特定盤面の解析（開発用・成果物ではない）
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const mkCtx = () => new Proxy({ _p: {} }, { get(t, k) {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  if (k === 'measureText') return () => ({ width: 10 });
  if (k in t._p) return t._p[k];
  return () => undefined;
}, set(t, k, v) { t._p[k] = v; return true; } });
const mkEl = (id) => { const set = new Set(); return {
  id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, offsetWidth: 1,
  clientWidth: 280, clientHeight: 560, width: 280, height: 560,
  classList: { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), toggle: () => {}, contains: () => false },
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
;(function(){ __setG({ COLS, ROWS, CELL, LW, TYPES, makePanel, nodeKey, endpoints,
  getGrid:()=>grid, seed:(g)=>{grid=g;invalidate();}, invalidate, buildAdj, cellEP, coreNodes,
  qualifying:()=>Array.from(qualifyingCells()).sort(), chains:(set)=>chainsOf(set).map(ch=>ch.map(x=>x[0]+','+x[1])),
  sides:()=>{const s=sideSets();return {L:Array.from(s.L),R:Array.from(s.R),core:Array.from(s.core)};} }); })();`;
sandbox.__setG = g => { G = g; };
vm.runInNewContext(code + hook, sandbox, { filename: 'game.script.js' });

const SH = { '/': 'slash', '\\': 'backslash', '^': 'caret', v: 'vee' };
const src = process.argv[2] || '..v.v|./...|.\\..v|.....|..\\\\\\|^/\\\\v|\\v\\/\\|/^//v|//\\\\\\|v\\vv/';
const rows = src.split('|');
const g = rows.map(line => [...line].map(ch => ch === '.' ? null : G.makePanel(SH[ch])));
G.seed(g);
const core = new Set(G.coreNodes ? G.coreNodes() : G.sides().core);
const qual = G.qualifying();
console.log('--- 盤面 ---');
rows.forEach((l, r) => console.log(String(r).padStart(2) + ' ' + l));
console.log('qualifying cells:', qual.join(' '));
console.log('core nodes:', Array.from(core).sort().join(' '));
// qualifying 部分グラフで x=0 → x=LW が辿れるか
const adj = new Map(), edgeCells = new Map();
const link = (a, b, k) => { if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a).add(b); adj.get(b).add(a);
  const ek = a < b ? a + '|' + b : b + '|' + a; if (!edgeCells.has(ek)) edgeCells.set(ek, []); edgeCells.get(ek).push(k); };
for (const k of qual) { const [r, c] = k.split(',').map(Number); const e = G.cellEP(r, c); if (!e || e.length !== 2) { console.log('cell', k, '辺なし'); continue; }
  link(G.nodeKey(e[0][0], e[0][1]), G.nodeKey(e[1][0], e[1][1]), k); }
const L = [], R = new Set();
for (const n of adj.keys()) { const x = +n.slice(0, n.indexOf(',')); if (x === 0) L.push(n); else if (x === G.LW) R.add(n); }
console.log('qual部分グラフ: 頂点=' + adj.size + ' 辺=' + edgeCells.size + ' 左端ノード=' + L.length + ' 右端ノード=' + R.size);
const seen = new Set(L), st = L.slice();
while (st.length) { const n = st.pop(); for (const m of (adj.get(n) || [])) if (!seen.has(m)) { seen.add(m); st.push(m); } }
const reachR = [...R].filter(n => seen.has(n));
console.log('左端から辿れる右端ノード:', reachR.length ? reachR.join(' ') : 'なし');
console.log('chainsOf():', JSON.stringify(G.chains(new Set(qual))));
// 各qualifyingセルについて、辺が単一L-R経路上にあるか（全単純経路列挙で確認）
const full = new Map(), fc = new Map();
const addF = (a, b, k) => { if (!full.has(a)) full.set(a, new Set()); if (!full.has(b)) full.set(b, new Set()); full.get(a).add(b); full.get(b).add(a);
  const ek = a < b ? a + '|' + b : b + '|' + a; if (!fc.has(ek)) fc.set(ek, []); fc.get(ek).push(k); };
for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) { const e = G.cellEP(r, c); if (!e || e.length !== 2) continue;
  addF(G.nodeKey(e[0][0], e[0][1]), G.nodeKey(e[1][0], e[1][1]), r + ',' + c); }
const FL = [], FR = new Set();
for (const n of full.keys()) { const x = +n.slice(0, n.indexOf(',')); if (x === 0) FL.push(n); else if (x === G.LW) FR.add(n); }
const okEdge = new Set(), path = [], onPath = new Set(), onEver = new Set(), onSome = new Set(), witnesses = [];
let steps = 0;
const walk = n => {
  steps++; path.push(n); onPath.add(n); onEver.add(n);
  if (FR.has(n)) {
    if (witnesses.length < 4) witnesses.push(path.slice());
    for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i]; okEdge.add(a < b ? a + '|' + b : b + '|' + a); }
    for (const p of path) onSome.add(p);          // 本物の「単純L→R経路上の角」＝完全経路の出典のみ
  }
  const nb = full.get(n); if (nb) for (const m of nb) if (!onPath.has(m)) walk(m);
  path.pop(); onPath.delete(n);
};
for (const s of FL) walk(s);
const nodeDiff = [...onSome].filter(n => !core.has(n)).concat([...core].filter(n => !onSome.has(n))).sort();
console.log('（参考）左壁から到達可能な角=', onEver.size, ' 単純L→R経路上の角=', onSome.size);
console.log('列挙core vs 実装core の差分ノード:', nodeDiff.length ? nodeDiff.join(' ') : 'なし');
const edgeOnly = [...okEdge].filter(e => { const [a, b] = e.split('|'); return !core.has(a) || !core.has(b); });
console.log('経路上の辺なのに端点がcoreで無い:', edgeOnly.length ? edgeOnly.join(' ') : 'なし');
const edgeSet = new Set(okEdge);
console.log('全単純経路列挙 steps=' + steps + ' okEdge=' + edgeSet.size);
const bad = [];
for (const k of qual) { const [r, c] = k.split(',').map(Number); const e = G.cellEP(r, c);
  const a = G.nodeKey(e[0][0], e[0][1]), b = G.nodeKey(e[1][0], e[1][1]);
  const ek = a < b ? a + '|' + b : b + '|' + a; if (!edgeSet.has(ek)) bad.push(k); }
console.log('経路上に無い辺を持つセル:', bad.length ? bad.join(' ') : 'なし');
for (const k of bad) { const [r, c] = k.split(',').map(Number); const e = G.cellEP(r, c);
  const a = G.nodeKey(e[0][0], e[0][1]), b = G.nodeKey(e[1][0], e[1][1]);
  const nbA = Array.from(full.get(a) || []), nbB = Array.from(full.get(b) || []);
  console.log('  ' + k + ' 辺 ' + ek2(a, b) + ' a隣=' + nbA.join(',') + ' b隣=' + nbB.join(',')); }
function ek2(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
