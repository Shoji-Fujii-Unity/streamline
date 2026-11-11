// dev-stress.mjs — 「繋がっていないのに光る」を検出すランダム長時間テスト（開発用・ブラウザ不要）
// 使い方:  node dev-stress.mjs
// 実ゲームループを fake clock で速く回し、毎フレーム次の不変条件を検める。
//   INV1  光っている（flash / clearing）パネルは、その瞬間の盤面グラフで本当に左壁⇔右壁の経路上にある
//   INV2  光っているパネルが1枚でもあるなら、画面上の本線（beam）は空ではなく、必ず左壁から右壁へ届いている
//   INV3  flashCells とパネルの state は一致している（取りこぼし／取り残しなし）
//   INV4  フラッシュは必ず終わる（liveness）
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

const mkCtx = () => new Proxy({ _p: {} }, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t._p) return t._p[k];
    return () => undefined;
  },
  set(t, k, v) { t._p[k] = v; return true; }
});
const mkEl = (id) => {
  const set = new Set();
  return {
    id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', style: {}, dataset: {}, offsetWidth: 1,
    clientWidth: 280, clientHeight: 560, width: 280, height: 560,
    classList: {
      add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)),
      toggle: (c, f) => { if (f === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (f) set.add(c); else set.delete(c); },
      contains: (c) => set.has(c)
    },
    addEventListener() {}, removeEventListener() {}, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 280, height: 560 }; },
    setPointerCapture() {}, getContext() { return mkCtx(); }
  };
};
const elems = new Map();
const documentStub = {
  hidden: false,
  getElementById: (id) => { if (!elems.has(id)) elems.set(id, mkEl(id)); return elems.get(id); },
  createElement: (t) => mkEl(t), addEventListener() {}, fonts: { ready: Promise.resolve() }
};
const ls = new Map();
const windowStub = {
  devicePixelRatio: 2, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  AudioContext: undefined, webkitAudioContext: undefined, gsap: undefined, confetti: undefined, ResizeObserver: undefined
};
let T = 1000;                                   // ← fake clock
const sandbox = {
  window: windowStub, document: documentStub, Math, JSON, Object, Array, Set, Map, Promise, Date, String, Number, parseInt, isNaN, Error,
  performance: { now: () => T },
  setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  matchMedia: windowStub.matchMedia,
  localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
  console, __setG: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const hook = `
;(function(){
  __setG({
    COLS, ROWS, CELL, LW, TYPES,
    getGrid:()=>grid, cellEP, nodeKey, endpoints, invalidate,
    epRaw:(r,c)=>{ const p=grid[r][c]; if(!p) return null; return endpoints(p.type, c*CELL, r*CELL, CELL); },
    qual:()=>new Set(qualifyingCells()), sides:()=>sideSets(),
    flashList:()=>Array.from(flashCells), render:()=>renderField(),
    beam:()=>beam.map(ch=>ch.map(rc=>rc.slice())),
    stateOf:(r,c)=>{ const p=grid[r][c]; return p?p.state:null; },
    startGame, trySwap, update, riseNow, endGame, toTitle, setDifficulty,
    seedTypes:(fn)=>{ for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const p=grid[r][c]; if(p) p.type=fn(r,c); } invalidate(); },
    fillAll:()=>{ for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(!grid[r][c]) grid[r][c]=makePanel(TYPES[(Math.random()*TYPES.length)|0]); invalidate(); },
    get:(k)=>({ phase, running, over, paused, score, chainDepth, settleUntil })[k],
    set:(k,v)=>{ switch(k){ case 'running': running=v; break; case 'over': over=v; break;
      case 'paused': paused=v; break; case 'settleUntil': settleUntil=v; break; case 'phase': phase=v; break;
      default: throw new Error('no field '+k); } }
  });
})();`;
let G;
sandbox.__setG = (g) => { G = g; };
vm.runInContext(code + hook, sandbox, { filename: 'game.script.js' });

/* ── independent reference: current-graph facts ────────────── */
function reference() {
  const adj = new Map();
  const up = new Map(), down = new Map();   // x 単調な辺（必ず +CELL だけ x が増える）を向き付きで持ち直す
  const add = (a, b) => { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a);
    const lo = (+a.slice(0, a.indexOf(',')) < +b.slice(0, b.indexOf(','))) ? a : b, hi = (lo === a) ? b : a;
    (up.get(hi) || up.set(hi, new Set()).get(hi)).add(lo); (down.get(lo) || down.set(lo, new Set()).get(lo)).add(hi);
  };
  for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) {
    const e = G.epRaw(r, c); if (!e || e.length !== 2) continue;
    add(G.nodeKey(e[0][0], e[0][1]), G.nodeKey(e[1][0], e[1][1]));
  }
  const reach = (seeds) => {
    const seen = new Set(seeds), st = seeds.slice();
    while (st.length) { const n = st.pop(); const nb = adj.get(n); if (nb) for (const m of nb) if (!seen.has(m)) { seen.add(m); st.push(m); } }
    return seen;
  };
  const L = [], R = [];
  for (const n of adj.keys()) { const i = n.indexOf(','), x = +n.slice(0, i); if (x === 0) L.push(n); else if (x === G.LW) R.push(n); }
  // 独立導出（ゲーム本体とは別のアルゴリズム）：辺は必ず x を +CELL だけ増す有向辺なので、
  //   「左壁から増方向で到達」∩「右壁から減方向で到達」＝ 左壁→右壁の単一行路の上のノード
  const dir = (seeds, nb) => { const seen = new Set(seeds), st = seeds.slice();
    while (st.length) { const n = st.pop(); const m2 = nb.get(n); if (m2) for(const m of m2) if (!seen.has(m)) { seen.add(m); st.push(m); } } return seen; };
  const fromL = dir(L, down), toR = dir(R, up);
  const core = new Set(); for (const n of fromL) if (toR.has(n)) core.add(n);
  return { inL: reach(L), inR: reach(R), core };
}
const epOf = (key) => { const p = key.split(','), e = G.epRaw(+p[0], +p[1]); return e ? [G.nodeKey(e[0][0], e[0][1]), G.nodeKey(e[1][0], e[1][1])] : null; };

function dumpBoard(tag) {
  const g = G.getGrid(), lines = [tag];
  for (let r = 0; r < G.ROWS; r++) {
    let s = 'r' + r + ' ';
    for (let c = 0; c < G.COLS; c++) {
      const p = g[r][c];
      s += p ? ({ slash: '/', backslash: '\\', caret: '^', vee: 'v' })[p.type] + (p.state === 'idle' ? '.' : p.state === 'flash' ? '!' : 'x') : ' .';
    }
    lines.push(s);
  }
  return lines.join('\n');
}

/* ── play loop with per-frame checks ───────────────────────── */
G.setDifficulty('normal');
let seed = 12345;
const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
const hist = [0, 0, 0, 0], act = { move: 0, flashMove: 0, undo: 0, rand: 0 };

let frames = 0, checks = 0, beamsOk = 0, bad = [], flashFrames = 0, lastFlashStart = 0, running = true, spite = 0, ghosts = 0, lastMove = null;
const report = (msg, extra) => { if (bad.length < 3) bad.push(msg + '\n' + dumpBoard('盤面（!/x=点滅中）') + '\n' + extra); };

// 効く手を最大 sample 件だけ先読みして拾う（全探索は重い）
function findMove(base) {
  const cands = [], g = G.getGrid();
  const ph = G.get('phase'), settle = G.get('settleUntil'); G.set('phase', 9); // 先読み中はフラッシュ起動を止める
  if (base === undefined) base = G.qual().size;
  for (let k = 0; k < 14; k++) {
    const r = (rand() * G.ROWS) | 0, c = (rand() * G.COLS) | 0, dr = rand() < .5 ? -1 : 1, nr = r + dr;
    if (nr < 0 || nr >= G.ROWS) continue;
    const a = g[r][c], b = g[nr][c];
    if (!a || !b || a.state !== 'idle' || b.state !== 'idle') continue;
    if (!G.trySwap(r, c, dr)) continue;
    const gain = G.qual().size > base;                             // 消滅対象が「増える」手だけ拾う
    G.trySwap(nr, c, -dr);
    if (gain) cands.push([r, c, dr]);
  }
  G.set('phase', ph); G.set('settleUntil', settle);
  return cands.length ? cands[(rand() * cands.length) | 0] : null;
}

// 猶予中に「確定した線を壊す手」をあえて探す（スクショで起きた状況の再現）
function findSpite(cur) {
  const cands = [], g = G.getGrid(), ph = G.get('phase'), settle = G.get('settleUntil'); G.set('phase', 9);
  for (let k = 0; k < 24; k++) {
    const r = (rand() * G.ROWS) | 0, c = (rand() * G.COLS) | 0, dr = rand() < .5 ? -1 : 1, nr = r + dr;
    if (nr < 0 || nr >= G.ROWS) continue;
    const a = g[r][c], b = g[nr][c];
    if (!a || !b || a.state !== 'idle' || b.state !== 'idle') continue;
    if (!G.trySwap(r, c, dr)) continue;
    const sz = G.qual().size;
    G.trySwap(nr, c, -dr);
    if (sz < cur) cands.push([r, c, dr, sz]);
  }
  G.set('phase', ph); G.set('settleUntil', settle);
  return cands.length ? cands[(rand() * cands.length) | 0] : null;
}

for (let round = 0; round < 12 && running; round++) {
  G.startGame();
  T += 100;
  for (let step = 0; step < 900; step++) {
    // プレイヤーの手：猶予中（FLASH）でも打てる／あえて確定線を壊すこともある
    if (!G.get('over')) {
      const ph0 = G.get('phase');
      let m = null;
      if (ph0 === 1 && lastMove && rand() < 0.5) {                 // 直前の手をなかったことにする（＝猶予中に線を壊す）
        if (G.trySwap(lastMove[3], lastMove[1], -lastMove[0])) { spite++; act.undo++; }
      } else {
        if (ph0 === 1 && rand() < 0.45) { m = findSpite(G.qual().size); if (m) spite++; }
        if (!m) m = findMove(ph0 === 1 ? G.qual().size : 0);
        if (m) {
          lastMove = [m[0], m[1], m[2], m[0] + m[2]];
          if (G.trySwap(m[0], m[1], m[2])) { act.move++; if (ph0 === 1) act.flashMove++; }
        }
        else if (rand() < 0.3) { G.trySwap((rand() * G.ROWS) | 0, (rand() * G.COLS) | 0, rand() < .5 ? -1 : 1); act.rand++; }
      }
    }
    T += 10 + (rand() * 20 | 0);
    G.update(T);
    frames++;
    const ph = G.get('phase'); if (hist[ph] !== undefined) hist[ph]++;
    // INV0: ゲームの判定（＝金色アシストと同じ集合）を、別アルゴリズムの独立導出と毎フレーム照合
    if (ph === 0 || ph === 1) {
      const ref0 = reference(), q = G.qual(), want = new Set();
      for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) {
        const e = G.epRaw(r, c); if (!e || e.length !== 2) continue;
        if (ref0.core.has(G.nodeKey(e[0][0], e[0][1])) && ref0.core.has(G.nodeKey(e[1][0], e[1][1]))) want.add(r + ',' + c);
      }
      const diff = [];
      for (const k of want) if (!q.has(k)) diff.push('判定漏れ ' + k);
      for (const k of q) if (!want.has(k)) diff.push('過剰判定 ' + k);
      if (diff.length) report('INV0 判定が独立導出と不一致（金色アシスト＝この集合）\n' + diff.join('\n'), 'phase=' + ph);
    }
    if (G.get('over')) { let any = false; for (let r = 0; r < G.ROWS && !any; r++) for (let c = 0; c < G.COLS && !any; c++) if (G.stateOf(r, c) === 'flash') any = true; if (!any) break; }

    // 描画して「画面に映る本線」を取り出す
    G.render();
    // INV6: 待機中に点滅／消滅のまま残っているパネル（ゴースト）は存在してはならない
    if (G.get('phase') === 0) {
      for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) {
        const s = G.stateOf(r, c);
        if (s && s !== 'idle') {
          ghosts++;
          if (bad.length < 3) bad.push('INV6 待機状態なのに ' + s + ' のまま残ったパネル（消えない金色のゴースト）\n' + dumpBoard('盤面（!/x=点滅中）') + '\ncell ' + r + ',' + c);
        }
      }
    }
    const lit = [];
    for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) { const s = G.stateOf(r, c); if (s === 'flash' || s === 'clearing') lit.push(r + ',' + c); }
    if (!lit.length) continue;
    flashFrames++;
    const ref = reference(); checks++;

    // INV1: 光っているパネルは、両端が「左壁→右壁の単一行路」の上に載っていなければならない
    for (const key of lit) {
      const e = epOf(key);
      if (!e) { report('INV1 光るパネルの線が存在しない', 'cell ' + key); continue; }
      if (!(ref.core.has(e[0]) && ref.core.has(e[1])))
        report('INV1 光るパネルが左右両壁の経路上に無い（繋がっていないのに光った）', 'cell ' + key + ' eps ' + JSON.stringify(e));
    }
    // INV3: flashCells と state の一致（clearing への移行中は flashCells 側が先行してよい）
    if (G.get('phase') === 1) {
      const fl = new Set(G.flashList());
      for (const key of lit) if (!fl.has(key)) report('INV3 点滅中パネルが flashCells に無い', 'cell ' + key);
      for (const key of fl) if (G.stateOf(+key.split(',')[0], +key.split(',')[1]) !== 'flash') report('INV3 flashCells のセルが点滅していない', 'cell ' + key);
    }
    // INV2: 画面の本線は空ではなく、左壁→右壁へ届いている
    const bm = G.beam();
    if (G.get('phase') === 1 || lit.some(k => G.stateOf(+k.split(',')[0], +k.split(',')[1]) === 'flash')) {
      if (!bm.length) report('INV2 点滅しているのに本線が1本も描画されない（エフェクトのみ発生）', 'lit=' + JSON.stringify(lit));
      else {
        let wall = 0;
        for (const ch of bm) {
          for (const [r, c] of ch) { const e = G.epRaw(r, c); if (!e) { report('INV2 本線が消滅済みパネルを指す', r + ',' + c); continue; } for (const pt of e) { if (pt[0] === 0) wall |= 1; if (pt[0] === G.LW) wall |= 2; } }
        }
        if (wall !== 3) report('INV2 本線が壁から壁へ届いていない', 'wall=' + wall + ' lit=' + JSON.stringify(lit));
        else beamsOk++;
      }
    }
    // INV4: フラッシュ開始から 1.6s 以上点滅が続いたら滞留
    if (G.get('phase') === 1) { if (!lastFlashStart) lastFlashStart = T; else if (T - lastFlashStart > 1600) { report('INV4 フラッシュが 1600ms 以上終わらない', 'T=' + T); lastFlashStart = T; } }
    else lastFlashStart = 0;
  }
  if (bad.length >= 3) break;
  if (G.get('over')) running = G.get('over') && round < 40;
}

console.log('frames=' + frames + '  phase[idle,flash,clear]=[' + hist.slice(0, 3) + ']  手=' + JSON.stringify(act) +
  '  点滅フレーム=' + flashFrames + '  検証=' + checks + '  beam OK=' + beamsOk + '  壊す手=' + spite + '  ゴースト=' + ghosts + '  score=' + G.get('score'));
if (bad.length) { console.log('\n✗ 不変条件の違反 ' + bad.length + ' 件（先頭）:\n' + bad[0]); process.exit(1); }
console.log('✓ 不変条件すべての違反なし（光った線は毎回、左壁→右壁の実経路で、本線も描画されていた）');
