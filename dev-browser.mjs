// dev-browser.mjs — 実ブラウザ（Edge / Chrome）の描画を自動で検証するランナー
//
//   node dev-browser.mjs                      … 起動して 60 秒あいプレイさせ、判定と絵の一致を検証
//   node dev-browser.mjs --seconds 180        … 長めに回す
//   node dev-browser.mjs --probe              … 起動確認＋1枚スクショだけで終了（まずこれを）
//   node dev-browser.mjs --port 9222          … すでに起動済みのブラウザへ接続する
//   node dev-browser.mjs --board "..v.v|./...|..."  … 盤面を固定して検証（報告の再現用）
//
// 見ているもの（＝ユーザー報告の「繋がっていないのに消える／金色になる」）
//   1. ゴースト金色      光ったパネルの両端が、判定(core)の上に居ない
//   2. 本線の実在        点滅中に「左壁→右壁の単純経路」のビームが必ず 1 本以上ある
//   3. 取りこぼし        点滅集合 flashCells が判定集合 qualifyingCells を含む
//   4. 絵と判定の不一致  キャンバスの実ピクセルを読み、金色で塗られたパネルと判定対象パネルを照合
//   5. 滞留              点滅/消滅が規定時間より長く続かない
// 違反が出た瞬間にスクリーンショットと盤面ダンプを browser-check/ に保存する。
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SECONDS = +opt('seconds', opt('sec', 60));
const PROBE = flag('probe');
const CONNECT_ONLY = flag('port');
const BOARD = opt('board', '');
const OUT_DIR = path.join(HERE, opt('out', 'browser-check'));
const URL_PAGE = 'file:///' + path.join(HERE, 'index.html').replace(/\\/g, '/');
const HARNESS = fs.readFileSync(path.join(HERE, 'dev-browser-harness.js'), 'utf8');

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findBrowser() {
  const cands = [];
  const pf = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const pf64 = process.env.PROGRAMFILES || 'C:\\Program Files';
  const local = process.env.LOCALAPPDATA || '';
  cands.push(path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  cands.push(path.join(pf64, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  if (local) cands.push(path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  cands.push(path.join(pf64, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  cands.push(path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  return cands.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}
async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej).listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
async function jsonAt(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* まだ起動前 */ }
    await sleep(300);
  }
  return null;
}

/* ── CDP クライアント（Node 内蔵 WebSocket のみ・ライブラリ不要） ── */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pend.has(m.id)) { const { res, rej } = this.pend.get(m.id); this.pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      else if (m.method) { this.events.push(m); }
    }); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('WS 接続失敗')), { once: true }); });
    return new CDP(ws);
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); });
  }
  async evl(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('page eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ } } }
}
function saveShot(cdp, tag, board) {
  return (async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const png = path.join(OUT_DIR, `${stamp}-${tag}.png`);
    const txt = path.join(OUT_DIR, `${stamp}-${tag}.txt`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    fs.writeFileSync(txt, (board || '(盤面取得できず)') + '\n', 'utf8');
    log('   🖼 保存 → ' + path.relative(HERE, png));
    return png;
  })();
}

async function main() {
  let port = +opt('port', 0), child = null;
  let stop = false, lastViol = 0, shots = 0, prev = null;
  if (!port) {
    const exe = findBrowser();
    if (!exe) { log('✗ msedge.exe / chrome.exe が見つかりません。`--port 9222` で起動済みのブラウザに接続できます。'); process.exit(2); }
    port = await freePort();
    const profile = path.join(HERE, '.edge-sl');
    fs.mkdirSync(profile, { recursive: true });
    const args = [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--mute-audio', '--window-size=900,1080',
      `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
      `--user-data-dir=${profile}`, URL_PAGE
    ];
    log('▶ ' + path.basename(exe) + ' を headless で起動 (port ' + port + ')');
    child = spawn(exe, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
    child.on('exit', (code) => { if (!stop) log('（ブラウザが終了しました exit=' + code + '）'); });
  } else {
    log('▶ 起動済みブラウザに接続します (port ' + port + ')');
  }

  const ver = await jsonAt(`http://127.0.0.1:${port}/json/version`, 80);
  if (!ver) {
    log('✗ デバッガに接続できませんでした。ブラウザが起動していません。');
    if (child) killTree(child.pid);
    process.exit(3);
  }
  let targets = await jsonAt(`http://127.0.0.1:${port}/json/list`, 20) || [];
  let page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url)) || targets.find(t => t.type === 'page');
  if (!page) { log('✗ ページターゲットが見つかりません'); if (child) killTree(child.pid); process.exit(4); }
  const cdp = await CDP.connect(page.webSocketDebuggerUrl);
  log('✓ CDP 接続: ' + (ver['Browser'] || 'unknown') + ' / ' + path.basename(page.url || ''));
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // ゲームの初期化完了を待つ（canvas 取得・フォント読み込みなど）
  let ready = 'wait';
  for (let i = 0; i < 100; i++) {
    ready = await cdp.evl('(typeof grid!=="undefined"&&typeof startGame==="function"&&document.readyState!=="loading")?"ready":"wait"');
    if (ready === 'ready') break;
    await sleep(200);
  }
  if (ready !== 'ready') { log('✗ ゲーム変数が初期化されません（index.html が読み込めていない）'); cdp.close(); if (child) killTree(child.pid); process.exit(5); }

  const installed = await cdp.evl(HARNESS);
  if (installed !== 'installed') { log('✗ ハーネス導入失敗: ' + installed); cdp.close(); if (child) killTree(child.pid); process.exit(6); }
  await cdp.evl('startGame(); "go"');
  if (BOARD) {
    const rows = BOARD.split('|');
    await cdp.evl('window.__SLT.seed(' + JSON.stringify(rows) + '); "seeded"');
    await cdp.evl('window.__SLT.deadline = performance.now() + ' + Math.round(SECONDS * 1000));
    log('▶ 固定盤面で検証: ' + rows.join(' '));
  } else {
    await cdp.evl(`window.__SLT.deadline = performance.now() + ${Math.round((PROBE ? 6 : SECONDS) * 1000)}`);
    log(PROBE ? '▶ プローブ：描画が動いているか確認します' : `▶ あいプレイを開始（${SECONDS}秒）：繋がる手を自動で探して組み続けます`);
  }
  log('  検査対象: ゴースト金色 / 本線の実在 / 取りこぼし / 絵と判定の一致 / 滞留時間');

  const t0 = Date.now();
  while (true) {
    await sleep(PROBE ? 2000 : 1500);
    let s;
    try { s = JSON.parse(await cdp.evl('JSON.stringify(window.__SLT.stat())')); }
    catch (e) { log('  ⚠ 状態取得失敗: ' + e.message); break; }
    const newV = s.viol.length - lastViol;
    if (newV > 0) {
      for (const v of s.viol.slice(lastViol)) {
        const brief = { ...v }; delete brief.strip;
        log('  ✗ [' + v.kind + '] ' + (v.note || v.reason || '') + '  ' + JSON.stringify(brief).slice(0, 320));
        if (v.strip) for (const line of v.strip) log('        ' + line);
        if (shots < 6) {
          const boardObj = JSON.parse(await cdp.evl('JSON.stringify(window.__SLT.board())'));
          await saveShot(cdp, 'violate-' + v.kind + '-' + (v.cell || '').replace(',', '-'),
            'VIOLATION: ' + JSON.stringify({ ...v, strip: undefined }) + '\n\nBOARD:\n' + JSON.stringify(boardObj, null, 1));
          shots++;
        }
      }
      lastViol = s.viol.length;
      await cdp.evl('window.__SLT.shotWanted=false;"ok"');
    }
    if (PROBE) {
      log(`  frames=${s.frames}  phase=${s.phase}  idle/flash/clear=${s.idle}/${s.flash}/${s.clear}  score=${s.score}`);
      if (s.frames >= 100 || Date.now() - t0 > 8000) break;
      continue;
    }
    const line = `  ${String(Math.round(s.seconds)).padStart(4)}s  frames=${String(s.frames).padStart(5)}`
      + `  idle/flash/clear=${s.idle}/${s.flash}/${s.clear}  手=${s.moves}(+運${s.randMoves})  点滅=${s.flashEvents}  本線=${s.beamChains}`
      + `  金色パネル=${s.goldPanels}  ピクセル=${s.pixelFrames}f/${s.panelsProbed}p  score=${s.score}  違反=${s.viol.length}`;
    if (line !== prev) log(line);
    prev = line;
    if (s.done) break;
    if (Date.now() - t0 > (SECONDS + 30) * 1000) { log('  （上限時間に到達）'); break; }
  }

  const fin = JSON.parse(await cdp.evl('JSON.stringify(window.__SLT.stat())'));
  if (PROBE || flag('shots')) { await saveShot(cdp, 'page', JSON.stringify(JSON.parse(await cdp.evl('JSON.stringify(window.__SLT.board())')), null, 1)); shots++; }
  cdp.close();
  if (child) { stop = true; killTree(child.pid); }

  const kinds = {};
  for (const v of fin.viol) kinds[v.kind] = (kinds[v.kind] || 0) + 1;
  log('');
  log('─ 結果 ───────────────────────────────────────────');
  log(`  描画フレーム        : ${fin.frames} （rAF稼働 ${fin.rafAlive ? '✓' : '✗'}）`);
  log(`  idle / flash / clear: ${fin.idle} / ${fin.flash} / ${fin.clear}`);
  log(`  論理検査 / 絵の検査 : ${fin.logicChecks} 回 / ${fin.pixelFrames} フレーム・${fin.panelsProbed} パネル`);
  log(`  あいプレイ          : 手 ${fin.moves} + ランダム ${fin.randMoves}、点滅 ${fin.flashEvents} 回、本線ビーム ${fin.beamChains} 本`);
  log(`  位相の長さ          : 点滅 最大 ${fin.maxFlashMs}ms / 消滅 最大 ${fin.maxClearMs}ms`);
  log(`  自己回復した遅れ    : ${fin.lagHits} 件（絵が判定に追いつくまで最大 ${fin.lagMax} フレーム／本線0本が2f以上続いた回数 ${fin.noBeamEvents}）`);
  log(`  金色検査の除外      : 隣のビーム光 ${fin.beamSkip} 点 / 共有角の金色マーカー ${fin.nodeSkip} 点 / 選択中パネル ${fin.skipSel} 回（いずれも「金色」の根数に不算）`);
  log(`  保存した画像        : ${shots} 枚 → ${path.relative(HERE, OUT_DIR)}/`);
  if (fin.note) log('  備考: ' + fin.note);
  if (fin.beamDiag && fin.beamDiag.length) {   // 本線ビームが空だった瞬間の内部状態（原因特定用）
    log('  本線ビームが空だった瞬間の状態:');
    for (const d of fin.beamDiag) log('    ' + JSON.stringify(d));
  }
  if (fin.viol.length) {
    log('  ✗ 違反 ' + fin.viol.length + ' 件: ' + Object.entries(kinds).map(([k, n]) => k + '×' + n).join(', '));
    log('RESULT: ✗ 判定と描画にズレがあります');
    process.exit(1);
  }
  if (fin.frames < 30) { log('RESULT: ? 描画フレームが少なすぎます（ブラウザが描画していない可能性）'); process.exit(7); }
  if (fin.flashEvents === 0) { log('RESULT: ? 線が1度も光りませんでした（--seconds を増やすか、あいプレイが弱いです）'); process.exit(8); }
  log('RESULT: ✓ 光った線はすべて左壁→右壁の実経路で、キャンバスの金色描画と判定は一致していました');
  process.exit(0);
}
main().catch(e => { log('✗ ' + (e && e.stack || e)); process.exit(9); });
