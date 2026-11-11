/* dev-browser-harness.js — ページ側検査ハーネス（dev-browser.mjs が CDP で eval する）
 * 目的：「論理の判定」と「実際にブラウザのキャンバスへ描画された絵」を毎フレーム突き合わせ、
 *       繋がっていないのに金色（＝消える判定）に見えるパネルを検出する。
 * ゲーム本体の top-level 変数（grid / phase / coreNodes() …）はそのまま参照できる。
 */
(function () {
  if (window.__SLT) return 'already-installed';
  if (typeof grid === 'undefined' || typeof startGame !== 'function') return 'game-not-ready';

  const T = window.__SLT = {
    frames: 0, idleFrames: 0, flashFrames: 0, clearFrames: 0,
    logicChecks: 0, pixelFrames: 0, panelsProbed: 0, goldPanels: 0,
    moves: 0, randMoves: 0, restarts: 0, flashEvents: 0, beamChains: 0, noBeam: 0,
    maxFlashMs: 0, maxClearMs: 0, score: 0,
    lagHits: 0, lagMax: 0, noBeamFrames: 0, noBeamEvents: 0, skipSel: 0, beamSkip: 0, nodeSkip: 0,
    startedAt: Math.round(performance.now()), viol: [], shotWanted: false, nextDrive: 0, restartAt: 0,
    deadline: 0, done: false, note: '', beamDiag: []
  };

  const key = (x, y) => Math.round(x) + ',' + Math.round(y);
  const kx = (n) => +n.slice(0, n.indexOf(','));
  const cellKey = (r, c) => r + ',' + c;

  const seenViol = new Set();
  let dupeHits = 0;
  function push(kind, info) {
    // 連続フレームでの同じ原因の複製は畳み込むが、時間を置いた再発は別件として報告する
    const sig = kind + '|' + Math.floor(T.frames / 240) + '|' + ((info && (info.cell || info.cells || info.chain || info.msg)) || '');
    if (seenViol.has(sig)) { dupeHits++; return; }
    seenViol.add(sig);
    if (T.viol.length >= 24) return;
    const rec = { kind: kind, frame: T.frames, phase: phase, at: Math.round(performance.now() - T.startedAt) };
    if (info) for (const k in info) rec[k] = info[k];
    T.viol.push(rec);
    T.shotWanted = true;
  }

  // 論理座標（＝判定に使われる座標）でのパネルの両端
  function epLogical(r, c) {
    const p = grid[r][c]; if (!p) return null;
    const e = endpoints(p.type, c * CELL, r * CELL, CELL);
    if (!e || e.length !== 2) return null;
    return [key(e[0][0], e[0][1]), key(e[1][0], e[1][1])];
  }
  // 描画位置（落下・せり上がり中は論理位置からズレる）上の折れ線
  function polyOf(r, c) {
    const p = grid[r][c]; if (!p) return null;
    const s = CELL, x = c * CELL + (p.ox || 0), y = r * CELL + (p.oy || 0);
    const e = endpoints(p.type, x, y, s);
    if (p.type === 'caret') return [[e[0][0], e[0][1]], [x + s / 2, y], [e[1][0], e[1][1]]];
    if (p.type === 'vee') return [[e[0][0], e[0][1]], [x + s / 2, y + s], [e[1][0], e[1][1]]];
    return [[e[0][0], e[0][1]], [e[1][0], e[1][1]]];
  }
  function polyAt(pts, t) {
    const seg = []; let L = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    let d = t * L;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i]) {
        const u = seg[i] ? d / seg[i] : 0;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u,
          pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
      }
      d -= seg[i];
    }
    const n = seg.length - 1;
    return [pts[n + 1][0], pts[n + 1][1], pts[n + 1][0] - pts[n][0], pts[n + 1][1] - pts[n][1]];
  }

  // パネル列が「左壁開始・右壁終了・角共有・重複なし」の実経路か
  function realPath(chain, qual) {
    const N = chain.map(rc => epLogical(rc[0], rc[1]));
    for (let i = 0; i < chain.length; i++) if (!N[i]) return 'パネルが無い ' + chain[i].join(',');
    if (chain.some(rc => !qual.has(cellKey(rc[0], rc[1])))) return '本線が消滅対象外を通る';
    let cur = N[0].find(k => kx(k) === 0);
    if (!cur) return '始点が左壁にいない';
    const used = new Set([cur]);
    for (let i = 0; i < chain.length; i++) {
      if (i && N[i].indexOf(cur) < 0) return '隣のパネルと角を共有していない ' + chain[i].join(',');
      const nxt = N[i].find(k => k !== cur);
      if (!nxt || used.has(nxt)) return 'ノードが重複（単純経路でない）';
      used.add(nxt); cur = nxt;
    }
    return kx(cur) === LW ? null : '終点が右壁にいない';
  }

  /* ── 論理検査（毎フレーム） ─────────────────────────────── */
  function checkLogic() {
    if (phase === PH.IDLE && !flashCells.size) return;
    const core = coreNodes();
    const qual = qualifyingCells();
    T.logicChecks++;
    if (phase === PH.FLASH) T.maxFlashMs = Math.max(T.maxFlashMs, performance.now() - phaseStart);
    if (phase === PH.CLEAR) T.maxClearMs = Math.max(T.maxClearMs, performance.now() - phaseStart);

    const gold = [];                       // 金色に描画されるパネル（renderField と同じ条件）
    const soon = (phase === PH.FLASH && running && !over) ? notYetCells() : null;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const p = grid[r][c]; if (!p) continue;
      const isFlash = p.state === 'flash' || p.state === 'clearing';
      const isSoon = !!soon && soon.has(cellKey(r, c));
      if (isFlash || isSoon) gold.push([r, c, isFlash]);
    }
    T.goldPanels += gold.length;

    for (let i = 0; i < gold.length; i++) {
      const r = gold[i][0], c = gold[i][1], k = cellKey(r, c);
      // 金色で光っているのに点滅集合に入っていないパネル（＝判定外のゴースト点滅）
      if (gold[i][2] && !flashCells.has(k)) {
        push('state-set-mismatch', { cell: k, note: 'panel.state は点滅中なのに flashCells に無い' });
      }
      // I1 ゴースト金色：光ったパネルの両端が、判定(core)の上に居ない
      //    ※判定は FLASH 中に確定する。消滅アニメ中は消えつつパネルがグラフから抜けるので
      //     この検査は FLASH 中だけ行う（CLEAR 中は「消滅対象＝確定集合」の方を見る）。
      if (gold[i][2] && phase === PH.FLASH) {
        const e = epLogical(r, c);
        if (e && (!core.has(e[0]) || !core.has(e[1]))) {
          push('ghost-gold', { cell: k, nodes: e, note: '金色に光ったパネルの両端が判定(core)上にない' });
        }
      }
    }
    if (phase === PH.CLEAR) {
      // 消滅するのは「点滅開始時に確定した線」だけ。範囲が広がっていたら異常。
      const grew = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = grid[r][c];
        if (p && p.state === 'clearing' && !flashCells.has(cellKey(r, c))) grew.push(cellKey(r, c));
      }
      if (grew.length) push('clear-scope-grew', { cells: grew.slice(0, 10), note: '点滅集合に無かったパネルが消滅している' });
    } else if (phase === PH.FLASH) {
      // I3 取りこぼし：判定集合が点滅集合を包含していない（消えるはずのパネルがこぼれる）
      const dropped = [];
      for (const k of flashCells) if (!qual.has(k)) dropped.push(k);
      if (dropped.length) push('cell-dropped', { cells: dropped.slice(0, 10), note: 'flashCells ⊄ qualifyingCells' });
    }

    // I2 本線の実在：点滅中は必ず左壁→右壁の単純経路がビームとして存在する
    if (phase === PH.FLASH) {
      T.beamChains += beam.length;
      // ビームの生成は renderField 内の遅延計算なので、開始直後の 1 フレーム空でも即時違反にしない。
      // 2 フレーム以上（約 30ms 超）続くなら、ユーザーに見える「本線が無い点滅」＝本物の違反。
      if (!beam.length) {
        T.noBeam++; T.noBeamFrames++;
        if (T.beamDiag.length < 12) {   // 「本線が無い点滅」が出た瞬間の内部状態を記録して原因を特定できるようにする
          const stt = [];
          for (const k of Array.from(flashCells).slice(0, 8)) {
            const i = k.indexOf(','), pp = grid[+k.slice(0, i)] ? grid[+k.slice(0, i)][+k.slice(i + 1)] : null;
            stt.push(k + ':' + (pp ? pp.type + '/' + pp.state : 'null'));
          }
          let qs = -1; try { qs = (qualifyingCells() || new Set()).size; } catch (e) { qs = 'throw'; }
          T.beamDiag.push({
            f: T.frames, ms: Math.round(performance.now() - (phaseStart || 0)), n: flashCells.size,
            same: beamFor === flashCells, beamRev, graphRev, pend: !!pendingFlash,
            settle: Math.round(settleUntil - performance.now()), qual: qs, cells: stt
          });
        }
        if (T.noBeamFrames >= 2) { T.noBeamEvents++; push('no-beam', { cells: Array.from(flashCells).slice(0, 10), ms: Math.round(performance.now() - (phaseStart || 0)), note: '点滅が続いているのに本線ビームが 0 本のまま' }); }
      } else T.noBeamFrames = 0;
      for (const ch of beam) {
        const bad = realPath(ch, qual);
        if (bad) push('bad-beam', { chain: ch.map(rc => rc.join(',')).slice(0, 12), reason: bad, note: '本線が左壁→右壁の単純経路になっていない' });
      }
    } else T.noBeamFrames = 0;
    if (T.maxFlashMs > 1700) push('flash-stuck', { ms: Math.round(T.maxFlashMs), note: '点滅が FLASH_MS より長く続いている' });
    if (T.maxClearMs > 1300) push('clear-stuck', { ms: Math.round(T.maxClearMs), note: '消滅アニメが CLEAR_MS より長く続いている' });
  }

  /* ── ピクセル検査：描画済みキャンバスを直接読む ───────────── */
  // 金色＝r が b より明確に大きい明るい色／通常線＝b が r より明確に大きい
  function classify(d, w, ix, iy) {
    const o = (iy * w + ix) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
    if (r + g + b < 150) return 0;             // 背景・パネル地
    if (r >= 200 && r >= b + 15 && g >= 140) return 1;   // 金色（グリフ/ビーム）
    if (b >= 200 && b >= r + 15) return 2;               // 通常線（水色）
    return 0;
  }
  const TS = [0.14, 0.19, 0.24, 0.76, 0.81, 0.86];       // 両端寄りのみ（中心の文字・接続ドットを避ける）
  const OFFS = [-2, 0, 2];
  const BEAM_EX = 8;      // 隣パネルの本線ビームの光（最大これだけ滲む）は「このパネルが金色」の根数に数えない
  // 描画済みビームの線分一覧を1フレーム分だけ cache（隣パネルの光を幾何的に除外するため）
  let beamCache = { fr: -1, segs: null };
  function beamSegs() {
    if (beamCache.fr === T.frames) return beamCache.segs;
    const segs = [];
    for (const chain of beam) for (const rc of chain) {
      const poly = polyOf(rc[0], rc[1]); if (!poly) continue;
      const key = rc[0] + ',' + rc[1];
      for (let i = 0; i + 1 < poly.length; i++) segs.push([poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], key]);
    }
    beamCache = { fr: T.frames, segs: segs };
    return segs;
  }
  function otherBeamPx(x, y, key) {                // この点が「他のパネルのビーム」から何pxか
    const S = beamSegs(); let m = 1e9;
    for (let i = 0; i < S.length; i++) {
      const s = S[i]; if (s[4] === key) continue;
      const d = distSeg(x, y, s[0], s[1], s[2], s[3]); if (d < m) m = d;
    }
    return m;
  }
  // 共有角マーカーの除外：2枚以上のパネルが同じ角を共有していて、その点が消える線の道上（core）にある場合、
  // そこに描かれる金色の端点マーカーと接続光はどちらの盤面にも跨って描かれる（設計上そうなる）。
  // よってその周辺の金色を「この idle パネルが金色」という根数には数えない。
  // ※ glyph 全体の金色（＝本来の違反）は角から 10px 以上内側で検出されるので検出力は落ちない。
  const NODE_EX = 7;
  let nodeCache = { fr: -1, pts: null };
  function sharedCorePts() {
    if (nodeCache.fr === T.frames) return nodeCache.pts;
    let pts = [];
    try {
      const cnt = endpointCounts(), core = coreNodes() || new Set();
      for (const [k, n] of (cnt && cnt.entries ? cnt.entries() : [])) {
        const i = k.indexOf(','), nx = +k.slice(0, i);
        if (n < 2 && !(nx === 0 || nx === LW)) continue;      // 共有角または壁の出入り口だけ
        if (!core.has(k)) continue;                          // 消える線の道上であること
        pts.push([nx, +k.slice(i + 1)]);
      }
    } catch (e) { pts = []; }
    nodeCache = { fr: T.frames, pts: pts };
    return pts;
  }
  function nearSharedCore(x, y) {
    const P = sharedCorePts();
    for (let i = 0; i < P.length; i++) {
      const dx = x - P[i][0], dy = y - P[i][1];
      if (dx * dx + dy * dy <= NODE_EX * NODE_EX) return true;
    }
    return false;
  }
  // パネルの両端それぞれについて、金色クラスタ／通常線クラスタの強さを測る
  function measureEnds(d, w, h, r, c) {
    const pts = polyOf(r, c); if (!pts) return null;
    const key = r + ',' + c, segs = beamSegs();
    const ends = [false, false];
    for (let side = 0; side < 2; side++) {
      let warm = 0, cool = 0, near = 0;
      const ts = side ? [0.76, 0.81, 0.86] : [0.14, 0.19, 0.24];
      for (const t of ts) {
        const a = polyAt(pts, t);
        const len = Math.hypot(a[2], a[3]) || 1, nx = -a[3] / len, ny = a[2] / len;
        for (const o of OFFS) {
          const px = a[0] + nx * o, py = a[1] + ny * o;
          if (segs.length && otherBeamPx(px, py, key) <= BEAM_EX) { near++; T.beamSkip++; continue; }   // 隣の光は数えない
          if (nearSharedCore(px, py)) { near++; T.nodeSkip++; continue; }                                // 共有角の金色マーカーは数えない
          const ix = Math.round(px * vsx), iy = Math.round(py * vsy);
          if (ix < 1 || iy < 1 || ix >= w - 1 || iy >= h - 1) continue;
          const v = classify(d, w, ix, iy);
          if (v === 1) warm++; else if (v === 2) cool++;
        }
      }
      ends[side] = { warm, cool, gold: warm >= 5 && cool <= 1, coolish: cool >= 5 && warm <= 1, nearBeam: near };
    }
    return ends;
  }
  // 点滅開始の「その1フレーム」だけ絵が判定に追い付かないことがある（状態確定→描画は同じループ内だが、
  // rAF の.callback 間に 1 フレームの隙間が入りうる）。なので開始フレームでズレを見たら即違反にせず、
  // 以降のフレームでも残っているか必ず再検証する。残っていれば本物の違反（ユーザーが見ている状態）。
  const verify = new Map();
  function probeCell(d, w, h, r, c, soon) {
    const p = grid[r][c]; if (!p) return null;
    // 選択中パネルの縁取りは意図的なUIの金色（判定の金色ではない）ので検査対象から外す
    if (typeof selected !== 'undefined' && selected && selected.r === r && selected.c === c) { T.skipSel++; return null; }
    const ends = measureEnds(d, w, h, r, c); if (!ends) return null;
    const isFlash = p.state === 'flash' || p.state === 'clearing';
    const isSoon = !!soon && soon.has(cellKey(r, c));
    return {
      p: p, ends: ends, expect: isFlash || isSoon,
      alpha: p.state === 'clearing' ? 1 - (p.prog || 0) : 1
    };
  }
  function mismatchKind(probe, gold, cool) {
    if (!probe.expect && gold && probe.alpha > 0.9) return 'painted-gold-without-judgement';
    if (probe.expect && cool && probe.alpha > 0.7) return 'judged-but-not-painted';
    return null;
  }
  function violInfo(kind, r, c, probe) {
    const e = probe.ends;
    const info = {
      cell: cellKey(r, c), type: probe.p.type, state: probe.p.state, phase: phase,
      warm: [e[0].warm, e[1].warm], cool: [e[0].cool, e[1].cool], expect: probe.expect
    };
    if (kind === 'painted-gold-without-judgement') {
      info.core = (function () { const l = epLogical(r, c); const core = coreNodes(); return l ? [core.has(l[0]), core.has(l[1])] : null; })();
      info.note = '繋がっていない（判定対象外）のに金色に描画されている';
    } else {
      info.note = '判定上は金色のはずなのに、描画は通常線（水色）のまま';
    }
    return info;
  }
  /* ── 違反瞬間の現場検証：その金色、何に塗られているのか ───── */
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function beamDist(r, c) {                       // このパネルの折れ線まで本線ビームが何pxか
    const mine = polyOf(r, c); if (!mine) return null;
    let best = 1e9;
    for (const chain of beam) for (const rc of chain) {
      const other = polyOf(rc[0], rc[1]); if (!other) continue;
      for (let i = 0; i + 1 < mine.length; i++) for (let j = 0; j + 1 < other.length; j++) {
        const d = distSeg(mine[i][0], mine[i][1], other[j][0], other[j][1], other[j + 1][0], other[j + 1][1]);
        if (d < best) best = d;
      }
    }
    return best > 900 ? null : Math.round(best);
  }
  function partsNear(r, c) {
    const mine = polyOf(r, c); if (!mine) return null;
    let n = 0, col = '';
    const inParts = (typeof parts !== 'undefined' && parts) ? parts : [];
    const inPops = (typeof pops !== 'undefined' && pops) ? pops : [];
    for (const q of inParts) for (let i = 0; i < mine.length; i++) {
      if (Math.hypot(q.x - mine[i][0], q.y - mine[i][1]) < 12) { n++; if (!col) col = String(q.col); break; }
    }
    for (const q of inPops) for (let i = 0; i < mine.length; i++) {
      if (Math.hypot(q.x - mine[i][0], q.y - mine[i][1]) < 28) { n++; if (!col) col = 'pop:' + q.text; break; }
    }
    return { n: n, col: col };
  }
  function diagCell(d, w, h, r, c) {
    const mine = polyOf(r, c); if (!mine) return null;
    const strip = [];
    for (let i = 1; i <= 9; i++) {
      const a = polyAt(mine, i / 10), len = Math.hypot(a[2], a[3]) || 1, nx = -a[3] / len, ny = a[2] / len;
      let s = 't' + i + ':';
      for (const o of [-2, 0, 2]) {
        const ix = Math.round((a[0] + nx * o) * vsx), iy = Math.round((a[1] + ny * o) * vsy);
        const k = (iy * w + ix) * 4;
        s += (ix < 0 || iy < 0 || ix >= w || iy >= h) ? 'x' : (d[k] + ',' + d[k + 1] + ',' + d[k + 2] + (o ? '/' : ''));
      }
      strip.push(s);
    }
    const e = epLogical(r, c) || [];
    const core = (function () { try { return coreNodes() || new Set(); } catch (err) { return new Set(); } })();
    const sel = (typeof selected !== 'undefined' && selected) ? (selected.r === r && selected.c === c) : false;
    const cur = (typeof cursor !== 'undefined' && cursor) ? (cursor.r === r && cursor.c === c) : false;
    const flat = [];
    for (const chain of beam) for (const rc of chain) flat.push(rc.join(','));
    const soonSet = (function () { try { return notYetCells(); } catch (err) { return null; } })();
    return {
      strip: strip, beamPx: beamDist(r, c), fx: partsNear(r, c), sel: sel, cur: cur,
      assist: (typeof assist !== 'undefined') ? !!assist : null,
      nodes: e, inCore: e.map(n => core.has(n)), inBeam: flat.indexOf(cellKey(r, c)) >= 0,
      soon: soonSet ? soonSet.has(cellKey(r, c)) : null
    };
  }
  function verifyScan() {
    if (!verify.size) return;
    const w = canvas.width, h = canvas.height; if (!w || !h) return;
    let d; try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return; }
    const soon = (phase === PH.FLASH && running && !over) ? notYetCells() : null;
    for (const [key, rec] of Array.from(verify)) {
      const r = +key.slice(0, key.indexOf(',')), c = +key.slice(key.indexOf(',') + 1);
      const probe = probeCell(d, w, h, r, c, soon);
      if (!probe) { verify.delete(key); continue; }
      const bothGold = probe.ends[0].gold && probe.ends[1].gold;
      const bothCool = probe.ends[0].coolish && probe.ends[1].coolish;
      const kind = mismatchKind(probe, bothGold, bothCool);
      if (!kind) {                                   // 数フレーム以内に絵が判定へ追いついた
        verify.delete(key); T.lagHits++;
        T.lagMax = Math.max(T.lagMax, T.frames - rec.frame);
        continue;
      }
      if (T.frames - rec.frame >= 2) {               // 追いつかない＝ユーザーに見える違反
        verify.delete(key);
        push(kind, violInfo(kind, r, c, probe));
      }
    }
  }
  function scanPixels(now, eventTag) {
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    let d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { T.note = 'getImageData 失敗: ' + e.message; return; }
    T.pixelFrames++;
    const soon = (phase === PH.FLASH && running && !over) ? notYetCells() : null;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const probe = probeCell(d, w, h, r, c, soon); if (!probe) continue;
      T.panelsProbed++;
      const e = probe.ends;
      const bothGold = e[0].gold && e[1].gold;
      const bothCool = e[0].coolish && e[1].coolish;
      const kind = mismatchKind(probe, bothGold, bothCool);
      if (!kind) continue;
      if (eventTag === true) { verify.set(cellKey(r, c), { frame: T.frames, age: Math.round(now - (phaseStart || now)) }); continue; }
      const info = violInfo(kind, r, c, probe);
      if (kind === 'painted-gold-without-judgement') { const dg = diagCell(d, w, h, r, c); if (dg) for (const k in dg) info[k] = dg[k]; }
      push(kind, info);
    }
  }

  /* ── 自動プレイ（可能な限り「繋がる手」を選ぶ） ─────────── */
  function drive() {
    const now = performance.now();
    if (over) { if (now - T.restartAt > 1200) { T.restartAt = now; startGame(); T.restarts++; } return; }
    if (!running || paused || phase !== PH.IDLE) return;
    if (now < settleUntil || pendingFlash) return;
    if (now < T.nextDrive) return;
    T.nextDrive = now + 8;
    const base = qualifyingCells().size;
    let best = null;
    for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
      const a = grid[r][c], b = grid[r + 1][c];
      if (!a || !b || a.state !== 'idle' || b.state !== 'idle') continue;
      grid[r][c] = b; grid[r + 1][c] = a; invalidate();
      const g = qualifyingCells().size;
      grid[r][c] = a; grid[r + 1][c] = b; invalidate();
      if (g > base && (!best || g > best.g)) best = { r: r, c: c, g: g };
    }
    if (best) { if (trySwap(best.r, best.c, 1)) T.moves++; return; }
    if (Math.random() < 0.07) {
      const r = (Math.random() * (ROWS - 1)) | 0, c = (Math.random() * COLS) | 0;
      if (grid[r][c] && grid[r + 1][c] && trySwap(r, c, 1)) T.randMoves++;
    }
  }

  let wasFlashing = false;
  function frame() {
    T.frames++;
    const now = performance.now();
    if (phase === PH.IDLE) T.idleFrames++;
    else if (phase === PH.FLASH) T.flashFrames++;
    else T.clearFrames++;
    T.score = score;
    try { checkLogic(); } catch (e) { hard('logic-throw', { msg: String(e && e.message || e) }); }
    const flashing = phase !== PH.IDLE;
    const onStart = flashing && !wasFlashing;
    wasFlashing = flashing;
    if (onStart) T.flashEvents++;
    try {
      if (onStart) scanPixels(now, true);
      else if (T.frames % 3 === 0) scanPixels(now, false);
      verifyScan();                                  // 点滅開始で拾った疑いを別フレームで再検証
    } catch (e) { hard('pixel-throw', { msg: String(e && e.message || e) }); }
    try { drive(); } catch (e) { hard('drive-throw', { msg: String(e && e.message || e) }); }
    if (T.deadline && now > T.deadline) T.done = true;
  }
  function hard(kind, info) {
    // 同じ異常が毎フレーム続いても1件に畳む（時間をおいて再発したら別件として報告）
    const sig = kind + '|' + Math.floor(T.frames / 240) + '|' + String((info && info.msg) || '');
    if (seenViol.has(sig)) { dupeHits++; return; }
    seenViol.add(sig);
    if (T.viol.length < 24) { const rec = { kind: kind, frame: T.frames, at: Math.round(performance.now() - T.startedAt) }; for (const k in info) rec[k] = info[k]; T.viol.push(rec); T.shotWanted = true; }
  }

  window.addEventListener('error', ev => hard('page-error', { msg: String(ev.message), src: String(ev.filename || '') + ':' + (ev.lineno || 0) }));
  window.addEventListener('unhandledrejection', ev => hard('page-rejection', { msg: String(ev.reason && ev.reason.message || ev.reason) }));

  // ゲームのコールバックの直後に検査が走るよう rAF を包む（＝まさに描画し終えた瞬間の絵を検査する）
  const origRaf = window.requestAnimationFrame.bind(window);
  const mine = new WeakSet();
  window.requestAnimationFrame = function (cb) {
    if (typeof cb !== 'function' || mine.has(cb)) return origRaf(cb);
    const wrapped = function (t) { try { cb(t); } finally { try { frame(); } catch (e) { hard('frame-throw', { msg: String(e && e.message || e) }); } } };
    mine.add(wrapped);
    return origRaf(wrapped);
  };
  window.__SLTr = origRaf;

  T.stat = function () {
    return {
      frames: T.frames, seconds: Math.round((performance.now() - T.startedAt) / 100) / 10,
      idle: T.idleFrames, flash: T.flashFrames, clear: T.clearFrames,
      logicChecks: T.logicChecks, pixelFrames: T.pixelFrames, panelsProbed: T.panelsProbed,
      goldPanels: T.goldPanels, flashEvents: T.flashEvents, beamChains: T.beamChains, noBeam: T.noBeam,
      moves: T.moves, randMoves: T.randMoves, restarts: T.restarts,
      lagHits: T.lagHits, lagMax: T.lagMax, noBeamEvents: T.noBeamEvents, skipSel: T.skipSel, beamSkip: T.beamSkip, nodeSkip: T.nodeSkip,
      maxFlashMs: Math.round(T.maxFlashMs), maxClearMs: Math.round(T.maxClearMs),
      score: T.score, phase: phase, running: running, over: over,
      dupeHits: dupeHits, kinds: (function () { const m = {}; for (const v of T.viol) m[v.kind] = (m[v.kind] || 0) + 1; return m; })(),
      rafAlive: T.frames > 0, note: T.note, viol: T.viol, shotWanted: T.shotWanted, done: T.done, beamDiag: T.beamDiag
    };
  };
  T.board = function () {
    const ch = { slash: '/', backslash: '\\', caret: '^', vee: 'v' };
    return {
      rows: grid.map(row => row.map(p => p ? ch[p.type] : '.').join('')),
      states: grid.map(row => row.map(p => p ? (p.state === 'idle' ? '.' : p.state[0]) : ' ').join('')),
      phase: phase, flash: Array.from(flashCells), qual: Array.from(qualifyingCells()),
      chains: beam.map(ch2 => ch2.map(rc => rc.join(','))),
      score: score, chainDepth: chainDepth, running: running, over: over, paused: paused
    };
  };
  // 盤面を直接指定して検証するためのフック（例：「中央に単独で金色が出た」報告の再現）
  T.seed = function (rowsArr) {
    const back = { '/': 'slash', '\\': 'backslash', '^': 'caret', v: 'vee' };
    // 固定盤面は「点滅も消滅も起きていない初期状態」から始めないと、
    // 種まき前に進行中だったフラッシュの残骸と突き合わせて誤検出する。
    phase = PH.IDLE; phaseStart = performance.now(); flashCells = new Set();
    pending = null; pendingFlash = false; settleUntil = 0; chainDepth = 1;
    beamFor = null; beam = []; beamRev = -1; selected = null; cursor = { r: ROWS - 1, c: 2 };   // startGame と同じ状態に直す（cursor は実プレイで null にならない）
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = rowsArr[r] ? back[rowsArr[r].charAt(c)] : null;
      grid[r][c] = t ? makePanel(t) : null;
    }
    invalidate();
  };
  return 'installed';
})();
