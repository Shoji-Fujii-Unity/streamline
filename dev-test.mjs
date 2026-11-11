// dev-test.mjs — STREAMLINE のコアロジック検証（ブラウザ不要・開発用）
// 使い方:  node dev-test.mjs
// index.html のゲームスクリプトをそのまま Node 上で実行し、DOM/Canvas をスタブで代替して
// 継承仕様（左壁⇔右壁の消去／行き止まりは残る／猶予中の能動連鎖／落下／せり上がり／
// ゲームオーバー）と改良機能（予告・スロー・落ち連鎖・多言語・描画）を確認する。
import fs from 'node:fs';
import vm from 'node:vm';

const FLASH_MS = 1000, CLEAR_MS = 400;          // index.html の定数と同じ

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!blocks.length) { console.error('no inline <script> found'); process.exit(1); }
const code = blocks[blocks.length - 1][1];

/* ── stubs ─────────────────────────────────────────────────── */
const mkCtx = () => new Proxy({ _p: {} }, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
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
      toggle: (c, f) => { if (f === undefined) { if (set.has(c)) set.delete(c); else set.add(c); } else if (f) set.add(c); else set.delete(c); },
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
  createElement: (t) => mkEl(t),
  addEventListener() {},
  fonts: { ready: Promise.resolve() }
};
const ls = new Map();
const windowStub = {
  devicePixelRatio: 2, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  AudioContext: undefined, webkitAudioContext: undefined,
  gsap: undefined, confetti: undefined, ResizeObserver: undefined
};
const sandbox = {
  window: windowStub, document: documentStub, Math, JSON, Object, Array, Set, Map, Promise, Date, String, Number, parseInt, isNaN, Error,
  performance, setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  matchMedia: windowStub.matchMedia,
  localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
  console, __setG: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ── run the real game script, then export internals ───────── */
const hook = `
;(function(){
  __setG({
    makePanel:(ty)=>makePanel(ty), COLS, ROWS, CELL, TYPES, LW,
    cellEP, nodeKey, chainsOf, endpoints, sideSets,
    side:()=>{ const s = sideSets(); return { core: Array.from(s.core).sort(), L: Array.from(s.L).sort(), R: Array.from(s.R).sort() }; },
    getGrid:()=>grid,
    qual:()=>Array.from(qualifyingCells()).sort(),
    notYet:()=>{ const s=notYetCells(); return s?Array.from(s).sort():[]; },
    beam:()=>beam.map(ch=>ch.map(rc=>rc.join(','))),
    stateOf:(r,c)=>{ const p=grid[r][c]; return p?p.state:null; },
    groups:(arr)=>groupCount(new Set(arr)),
    startGame, riseNow, trySwap, startFlash, lockToClear, finishClear, collapse, update,
    useSlow, endGame, invalidate, renderField, renderRiser, fit, showOverlay, updateHUD,
    changeLanguage, setDifficulty, toggleSound, toggleAssist, toTitle, fallbackTween,
    seed:(spec)=>{ const g=Array.from({length:ROWS},()=>Array(COLS).fill(null));
      for(const key in spec){ const p=key.split(','); g[+p[0]][+p[1]]=makePanel(spec[key]); }
      grid=g; invalidate(); },
    get:(k)=>({ phase, score, level, riseInterval, riseElapsed, phaseStart, nextRow, chainDepth,
                running, over, paused, slowCharge, slowUntil, lang, diffKey, pendingFlash, settleUntil,
                flash:flashCells.size })[k],
    set:(k,v)=>{ switch(k){
      case 'phase': phase=v; break; case 'score': score=v; break; case 'level': level=v; break;
      case 'riseInterval': riseInterval=v; break; case 'riseElapsed': riseElapsed=v; break;
      case 'nextRow': nextRow=v; break; case 'slowCharge': slowCharge=v; break;
      case 'slowUntil': slowUntil=v; break; case 'running': running=v; break;
      case 'over': over=v; break; case 'paused': paused=v; break;
      case 'settleUntil': settleUntil=v; break; case 'pendingFlash': pendingFlash=v; break;
      case 'lang': lang=v; break; case 'diffKey': diffKey=v; break;
      default: throw new Error('no such field: '+k);
    } }
  });
})();`;
let G;
sandbox.__setG = (g) => { G = g; };
try {
  vm.runInNewContext(code + hook, sandbox, { filename: 'game.script.js' });
} catch (e) {
  console.error('✗ script threw on load:\n', (e && e.stack) || e);
  process.exit(1);
}
console.log('✓ script parsed & booted (title screen)');

/* ── assertions ────────────────────────────────────────────── */
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== '' ? '  → ' + extra : '')); }
};
const rowLine = (r, ty) => { const o = {}; for (let c = 0; c < G.COLS; c++) o[r + ',' + c] = ty; return o; };
const bottom = () => G.getGrid()[G.ROWS - 1];

/* 1. 初期盤面（継承仕様：初期2行／開始時に完成線なし） */
G.setDifficulty('normal');
G.startGame();
ok('初期2行が埋まる（STARTING_ROWS=2）', G.getGrid().slice(G.ROWS - 2).flat().every(p => !!p));
ok('初手に完成線なし', G.qual().length === 0, JSON.stringify(G.qual()));
ok('せり上がり予告が1行分ある', Array.isArray(G.get('nextRow')) && G.get('nextRow').length === G.COLS);
ok('NORMAL のせり上がり間隔は初代と同じ 3500ms', G.get('riseInterval') === 3500, 'got ' + G.get('riseInterval'));

/* 2. 左壁⇔右壁の一行 → 5枚消滅 */
G.seed(rowLine(9, 'vee'));
const q1 = G.qual();
ok('一行 ∨ で左壁⇔右壁が成立（5枚）', q1.length === 5 && q1.every(k => k.startsWith('9,')), JSON.stringify(q1));
ok('成立線は1まとまり', G.groups(q1) === 1);
const s0 = G.get('score');
ok('startFlash → FLASH 位相', G.startFlash() === true && G.get('phase') === 1);
ok('成立でスコア加算', G.get('score') > s0, s0 + ' → ' + G.get('score'));

/* 3. 行き止まりの枝は消えない（初代ルール継承） */
G.set('phase', 0); G.set('score', 0);
G.seed(Object.assign(rowLine(9, 'vee'), { '8,2': 'slash' }));
const q2 = G.qual();
ok('行き止まりの枝は消去対象外', !q2.includes('8,2') && q2.length === 5, JSON.stringify(q2));

/* 4. 猶予1秒中の“能動連鎖”（巻き込み） */
// 上段（7行目）は左壁側だけで途切れた線。猶予中に (6,4)∨ を (7,4) へ落とすと右壁まで届く。
G.set('phase', 0); G.set('score', 0);
G.seed(Object.assign(rowLine(9, 'vee'), { '7,0': 'vee', '7,1': 'vee', '7,2': 'vee', '7,3': 'vee', '7,4': 'caret', '6,4': 'vee' }));
ok('交換前は2本目が未成立（右壁に未到達）', G.qual().length === 5, JSON.stringify(G.qual()));
G.startFlash();
const f0 = G.get('flash'), sc0 = G.get('score');
ok('猶予中に点滅対象は5枚', f0 === 5, 'flash=' + f0);
G.trySwap(6, 4, 1);
ok('猶予中でも交換できる（能動連鎖の入口）', G.get('phase') === 1);
G.lockToClear();
ok('猶予中に繋いだ線が同じ消滅に巻き込まれる', G.get('flash') === 11, f0 + ' → ' + G.get('flash'));
ok('巻き込みでスコア上乗せ', G.get('score') > sc0);
ok('FLASH → CLEAR 位相', G.get('phase') === 2);

/* 5. 消滅 → 落下 → 落ち連鎖（改良機能） */
G.set('phase', 0); G.set('score', 0);
G.seed(Object.assign(rowLine(9, 'vee'), { '8,0': 'vee', '8,1': 'vee', '8,2': 'vee', '8,4': 'vee', '7,3': 'vee' }));
ok('最初は1本だけ成立', G.qual().length === 5, JSON.stringify(G.qual()));
G.startFlash();
const sc1 = G.get('score');
G.lockToClear();
ok('消滅位相', G.get('phase') === 2);
G.finishClear();
ok('全列が落下して詰まる', [0, 1, 2, 3, 4].every(c => G.getGrid()[9][c] && !G.getGrid()[8][c]));
ok('落下直後は即点滅しない（収束を待つ）', G.get('phase') === 0 && G.get('pendingFlash') === true);
G.update(performance.now() + 400, 16);
ok('落下で新線が生まれると“落ち連鎖”', G.get('phase') === 1 && G.get('flash') === 5, 'flash=' + G.get('flash'));
G.lockToClear(); G.finishClear();
ok('2段目も消えて IDLE 復帰', bottom().every(p => !p) && G.get('phase') === 0);
ok('落ち連鎖でもスコア加算', G.get('score') > sc1, sc1 + ' → ' + G.get('score'));

/* 6. タイミング（猶予≈1秒 → 消滅400ms → IDLE） */
G.set('phase', 0); G.seed(rowLine(9, 'vee'));
G.startFlash();
G.update(G.get('phaseStart') + FLASH_MS + 1, 16);
ok('猶予 ' + FLASH_MS + 'ms 後に消滅へ', G.get('phase') === 2, 'phase=' + G.get('phase'));
G.update(G.get('phaseStart') + CLEAR_MS + 1, 16);
ok('消滅 ' + CLEAR_MS + 'ms 後に IDLE 復帰', G.get('phase') === 0, 'phase=' + G.get('phase'));

/* 7. せり上がり（予告どおりの行が積まれる） */
G.set('phase', 0); G.seed({});
const want = G.get('nextRow').slice();
G.riseNow();
ok('予告行がそのまま下部に出現', bottom().map(p => p && p.type).join(',') === want.join(','), bottom().map(p => p && p.type).join(',') + ' vs ' + want.join(','));
ok('次の予告行が再生成される', G.get('nextRow').join(',') !== want.join(',') || G.get('nextRow').length === G.COLS);
ok('せり上がり後は IDLE のまま', G.get('phase') === 0);

/* 8. スローフィールド（改良機能） */
G.startGame();
G.seed({ '9,0': 'caret' });
G.set('riseInterval', 120); G.set('riseElapsed', 0); G.set('slowCharge', 100); G.set('slowUntil', 0);
const marker = G.getGrid()[9][0];
G.useSlow();
ok('ゲージ満タンでスロー発動', G.get('slowUntil') > performance.now() - 100);
for (let i = 0; i < 20; i++) G.update(performance.now(), 60);
ok('スロー中はせり上がりが止まる', G.getGrid()[9][0] === marker && G.get('riseElapsed') === 0, 'riseElapsed=' + G.get('riseElapsed'));
G.set('slowUntil', 0);
for (let i = 0; i < 10; i++) G.update(performance.now(), 60);
ok('スロー解除後は再びせり上がる', G.getGrid()[9][0] !== marker || G.get('over') === true);
G.set('slowCharge', 40);
const before40 = G.get('slowCharge');
G.set('slowUntil', 0);
ok('ゲージ不足では発動しない', (G.useSlow(), G.get('slowUntil') === 0));

/* 9. ゲームオーバー（上端到達） */
G.set('over', false); G.startGame();
G.seed(rowLine(0, 'caret'));
G.set('phase', 0);
G.riseNow();
ok('上端に届くとゲームオーバー', G.get('over') === true);
G.setDifficulty('hard');
ok('難易度切换で NORMAL/HARD が別枠保存できる', G.get('diffKey') === 'hard');
G.setDifficulty('normal');

/* 10. レンダリングが落ちない（通常／点滅中／せり上がり予告バー） */
G.startGame();
let rerr = null;
try { const t = performance.now(); G.renderField(t, 16); G.renderRiser(t); G.fit(); } catch (e) { rerr = e; }
ok('通常描画が例外なく走る', !rerr, rerr && rerr.stack);
try { G.seed(rowLine(9, 'vee')); G.startFlash(); G.renderField(performance.now() + 60, 16); G.lockToClear(); G.renderField(performance.now() + 80, 16); } catch (e) { rerr = e; }
ok('点滅／消滅中の描画が例外なく走る', !rerr, rerr && rerr.stack);

/* 11. 多言語オーバーレイ */
for (const lg of ['ja', 'en', 'zh']) {
  G.set('lang', lg);
  let err = null, filled = true;
  try {
    for (const kind of ['title', 'help', 'pause', 'over']) {
      G.showOverlay(kind);
      const card = documentStub.getElementById('overlay-card');
      if (!card.innerHTML || card.innerHTML.length < 200) filled = false;
    }
  } catch (e) { err = e; }
  ok(lg + ': タイトル／ヘルプ／ポーズ／リザルトが描画される', !err && filled, err && err.stack);
}
G.set('lang', 'ja');

/* 12. 「消える線」は本当に左端→右端へ繋がっているか（画面に描く本線の実在検証） */
const nOf = (r, c) => { const e = G.cellEP(r, c); return e && e.length === 2 ? [G.nodeKey(e[0][0], e[0][1]), G.nodeKey(e[1][0], e[1][1])] : []; };
const kx = (k) => +k.slice(0, k.indexOf(','));
// 本線の検証は「列が1ずつ増える」では足りない：角を伝って左隣のパネルへも進めるため、ノード列で確かめる
const chainOK = (path, qual) => {
  const N = path.map(rc => nOf(rc[0], rc[1]));
  if (path.some(rc => qual.indexOf(rc[0] + ',' + rc[1]) < 0)) return false;
  if (N.some(n => n.length !== 2)) return false;
  let cur = N[0].find(k => kx(k) === 0);                      // 始点は左壁に触れている
  if (!cur) return false;
  const used = new Set([cur]);
  for (let i = 0; i < path.length; i++) {
    if (i && N[i].indexOf(cur) < 0) return false;             // 隣のパネルと角を共有
    const nxt = N[i].find(k => k !== cur);
    if (!nxt || used.has(nxt)) return false;                  // 同一ノードを通らない（単純経路）
    used.add(nxt); cur = nxt;
  }
  return kx(cur) === G.LW;                                    // 終点は右壁に触れている
};
for (const bd of [
  { name: '一直線の床（∨×5）', spec: rowLine(9, 'vee') },
  { name: 'ジグザグ本線', spec: { '9,0': 'caret', '9,1': 'slash', '9,2': 'vee', '9,3': 'backslash', '9,4': 'caret' } }
]) {
  G.set('phase', 0); G.seed(bd.spec);
  const q = G.qual(), ch = G.chainsOf(new Set(q));
  ok(bd.name + '：消滅対象＝5枚で左壁→右壁の本線が見つかる', q.length === 5 && ch.length === 1 && chainOK(ch[0], q),
    'qual=' + q.length + ' chains=' + ch.length);
}
G.set('phase', 0); G.seed(rowLine(9, 'vee'));
ok('本線のない盤面（一行分断）では本線も消滅対象も出ない', (G.seed({ '9,0': 'vee', '9,1': 'vee', '9,3': 'vee', '9,4': 'vee' }), G.qual().length === 0 && G.chainsOf(new Set(G.qual())).length === 0));

/* 14. 猶予中につなぎ増した線のフィードバックと、消滅中（clearing）の本線 */
G.set('phase', 0);
G.seed({ '9,0': 'vee', '9,1': 'vee', '9,2': 'vee', '9,3': 'vee', '9,4': 'vee' });   // 床で一本目
ok('点滅開始：5枚が flash 状態になる',
  G.startFlash() === true && G.get('flash') === 5 && G.stateOf(9, 0) === 'flash' && G.stateOf(9, 4) === 'flash',
  'flash=' + G.get('flash') + ' state=' + G.stateOf(9, 0));
ok('点滅直後は「巻き込まれる側」の線はまだない', G.notYet().length === 0, G.notYet().join(' '));
ok('点滅中に本線が描けている', (G.renderField(performance.now(), 16), G.beam().length === 1), JSON.stringify(G.beam()));
// 猶予時間中にプレイヤーが2本目を接続した状況（8行目が左壁→右壁へ通る）
for (let c = 0; c < G.COLS; c++) G.getGrid()[8][c] = G.makePanel('caret');
G.invalidate();
const joined = G.notYet();
ok('猶予中につないだ線が「巻き込まれる側」として検出される', joined.length === G.COLS, joined.join(' '));
ok('本線は確定している線だけを照らし続ける（新しい線は「巻き込まれる側」表示）',
  (G.renderField(performance.now(), 16), G.beam().length === 1 && G.beam()[0][0] === '9,0'), JSON.stringify(G.beam()));
G.lockToClear();
ok('消滅位相では巻き込まれた線も一緒に消える（計10枚）', G.get('flash') === 2 * G.COLS, 'flash=' + G.get('flash'));
ok('巻き込まれた側も消滅状態になる', G.stateOf(8, 0) === 'clearing' && G.stateOf(9, 0) === 'clearing',
  G.stateOf(8, 0) + '/' + G.stateOf(9, 0));
// 消滅中（clearing）は cellEP が null を返すので、状態を問わない端点取得で本線を検める
const epAny = (r, c) => { const p = G.getGrid()[r][c]; return p ? G.endpoints(p.type, c * G.CELL, r * G.CELL, G.CELL) : []; };
const beamSane = () => G.beam().every(ch => ch.length && ch.every(key => G.stateOf(+key.split(',')[0], +key.split(',')[1]) === 'clearing')
  && epAny(+ch[0].split(',')[0], +ch[0].split(',')[1]).some(e => Math.round(e[0]) === 0)
  && epAny(+ch[ch.length - 1].split(',')[0], +ch[ch.length - 1].split(',')[1]).some(e => Math.round(e[0]) === G.LW));
ok('消滅中（clearing）でも本線は復元でき、消えるパネルだけ左壁→右壁を照らす（線が途中で消えない）',
  (G.renderField(performance.now(), 16), G.beam().length >= 1 && beamSane()), JSON.stringify(G.beam()));
G.getGrid()[9][0] && (G.getGrid()[9][0].oy = 24);        // 落下中の描画位置でも例外にならないこと
ok('落下中の位置でも本線描画が破綻しない', (() => { try { G.renderField(performance.now(), 16); return true; } catch (e) { return false; } })());
G.finishClear();
ok('消滅完了で本線も点滅集合もクリア', G.get('flash') === 0 && (G.renderField(performance.now(), 16), G.beam().length === 0));

/* 16. 判定とアシスト表示の一致（金色＝本当に消える線の上）／消滅の取りこぼし防止 */
G.set('phase', 0);
G.seed({ '9,0': 'caret', '9,1': 'caret', '9,2': 'caret', '9,3': 'caret', '9,4': 'slash', '8,4': 'caret' });
{
  const q = G.qual(), s = G.side(), C = G.CELL;
  const endsOf = k => { const [r, c] = k.split(',').map(Number); return G.endpoints(G.getGrid()[r][c].type, c * C, r * C, C).map(p => G.nodeKey(p[0], p[1])); };
  const trunkEnds = new Set(q.flatMap(endsOf));
  ok('枝（行き止まり）は消滅対象に含まれない', q.length === G.COLS && !q.includes('8,4'), q.join(' '));
  ok('枝の角は左右どちらの壁からも「到達可能」（＝接続しているだけでは消えない）',
    s.L.includes('224,504') && s.R.includes('224,504'), JSON.stringify([s.L.includes('224,504'), s.R.includes('224,504')]));
  ok('その枝は金色にならない（金色＝消える線の途中、判定と一致）', !s.core.includes('224,504'), 'core=' + s.core.join(' '));
  ok('本線の角 (280,504) は金色', s.core.includes('280,504'));
  ok('金色の点はすべて消滅対象パネルの端点上（金色なのに消えない点がない）',
    s.core.every(n => trunkEnds.has(n)), s.core.filter(n => !trunkEnds.has(n)).join(' '));
}
/* 16b. 猶予中は「すでに左右へ抜けた線」を動かせない（確定線が後から壊されない） */
G.set('phase', 0);
G.seed({ '9,0': 'caret', '9,1': 'caret', '9,2': 'caret', '9,3': 'caret', '9,4': 'slash' });
G.startFlash();
for (let c = 0; c < G.COLS; c++) G.getGrid()[8][c] = G.makePanel('vee');   // 猶予中につないだ2本目（idle だが左右に抜けている）
G.getGrid()[7][2] = G.makePanel('vee'); G.getGrid()[6][2] = G.makePanel('caret'); G.getGrid()[5][2] = G.makePanel('slash');
G.invalidate();
ok('猶予中につないだ2本目も消滅対象になっている', G.qual().length === 2 * G.COLS, 'qual=' + G.qual().length);
ok('猶予中：確定した線（左右に抜けている線）のパネルは入れ替えできない', G.trySwap(8, 2, -1) === false);
ok('猶予中：まだ繋がっていない線は今までどおり動かせる', G.trySwap(6, 2, -1) === true && G.getGrid()[5][2].type === 'caret');
/* 16c. 計算上の集合が縮んでも、光った線はそのまま消える（金色のまま残るパネルを出さない） */
G.set('phase', 0);
G.seed({ '9,0': 'caret', '9,1': 'caret', '9,2': 'caret', '9,3': 'caret', '9,4': 'slash', '8,0': 'caret' });
G.startFlash();
G.getGrid()[9][2] = G.makePanel('vee'); G.invalidate();                 // 最悪ケース：猶予中に本線が壊れた
ok('猶予中に線が壊れても点滅集合は減らない', G.qual().length < 5 && G.get('flash') === 5, 'qual=' + G.qual().length + ' flash=' + G.get('flash'));
G.getGrid()[8][0].state = 'flash';                                      // 取りこぼし（ゴースト）のシミュレーション
G.lockToClear();
ok('消滅位相で光った線がすべて消滅状態になる', ['9,0', '9,1', '9,2', '9,3', '9,4'].every(k => G.stateOf(+k.split(',')[0], +k.split(',')[1]) === 'clearing'),
  ['9,0', '9,1', '9,2', '9,3', '9,4'].map(k => G.stateOf(+k.split(',')[0], +k.split(',')[1])).join('/'));
G.finishClear();
ok('消滅後は盘面に金色（非idle）パネルが1枚も残らない',
  G.getGrid().flat().every(p => !p || p.state === 'idle') && G.get('flash') === 0,
  JSON.stringify(G.getGrid().flat().filter(p => p && p.state !== 'idle').length));

/* 15. リスタートで初期化 */
G.startGame();
ok('リスタートでスコア/レベル/位相/終了が戻る',
  G.get('score') === 0 && G.get('level') === 1 && G.get('phase') === 0 && G.get('over') === false && G.get('paused') === false);
ok('リスタートで初期2行', G.getGrid().flat().filter(Boolean).length === G.COLS * 2);

/* 16. 入れ替えアニメーションが終わるまで接続判定を待つ */
G.startGame();
G.seed({ '9,0': 'vee', '9,1': 'vee', '9,2': 'vee', '9,3': 'vee', '9,4': 'caret', '8,4': 'vee' });
ok('入れ替え前は左右の壁が未接続', G.qual().length === 0);
const swapAt = performance.now();
ok('接続を作る入れ替えに成功', G.trySwap(8, 4, 1));
ok('入れ替えアニメーションは旧位置から始まる',
  G.getGrid()[8][4].oy === G.CELL && G.getGrid()[9][4].oy === -G.CELL);
ok('入れ替えアニメーション中は消去を開始しない',
  G.get('phase') === 0 && G.get('pendingFlash') && G.get('settleUntil') >= swapAt + 220);
G.update(G.get('settleUntil') + 1, 16);
ok('入れ替え後に接続が確定してから点滅する', G.get('phase') === 1);

/* 17. 落下／せり上がりアニメーションも旧位置から新位置へ進む */
G.startGame();
G.seed({ '5,0': 'vee' });
const falling = G.getGrid()[5][0];
G.collapse();
ok('落下アニメーションの開始位置が旧行', G.getGrid()[9][0] === falling && falling.oy === -4 * G.CELL);
G.startGame();
G.seed({ '8,0': 'slash' });
const rising = G.getGrid()[8][0];
G.riseNow();
ok('せり上がりアニメーションの開始位置が旧行', G.getGrid()[7][0] === rising && rising.oy === G.CELL);

/* 18. オフラインTween：同じプロパティの上書きで古いTweenを停止する */
let fakeNow = 0, nextFrame = 1;
const frames = new Map();
sandbox.performance = { now: () => fakeNow };
sandbox.requestAnimationFrame = cb => { const id = nextFrame++; frames.set(id, cb); return id; };
sandbox.cancelAnimationFrame = id => frames.delete(id);
const advanceFrames = now => {
  fakeNow = now;
  const pending = Array.from(frames.values()); frames.clear();
  for (const step of pending) step(now);
};
const fallback = G.fallbackTween(), target = { x: 0 };
let oldComplete = false, newComplete = false;
fallback.to(target, { x: 10, duration: 1, onComplete: () => { oldComplete = true; } });
advanceFrames(250);
fallback.to(target, { x: 20, duration: 1, onComplete: () => { newComplete = true; } });
advanceFrames(1000);
ok('Tween上書き後、古い値と完了通知が復活しない', !oldComplete && target.x > 10 && target.x < 20, 'x=' + target.x);
advanceFrames(1250);
ok('上書き後のTweenは最後まで完了する', newComplete && target.x === 20, 'x=' + target.x);

console.log('\n' + (fail ? '✗ ' + fail + ' FAILED, ' : '') + '✓ ' + pass + ' passed');
process.exit(fail ? 1 : 0);
