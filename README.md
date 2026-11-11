# STREAMLINE — ストリームライン / 流光连线
### LIGHT-LINK DELUXE ・「Line Link Puzzle」改良版

[🇯🇵 日本語](#日本語) · [🇬🇧 English](#english) · [🇨🇳 中文](#中文)

![Langs](https://img.shields.io/badge/languages-ja%20%7C%20en%20%7C%20zh-blue)
![Platform](https://img.shields.io/badge/platform-web%20(PC%20%2B%20mobile)-green)
![No build](https://img.shields.io/badge/build-none-informational)
![Spec](https://img.shields.io/badge/original%20rules-100%25%20inherited-orange)

---

## 日本語

### 概要
**STREAMLINE（ストリームライン）** は「Line Link Puzzle」をそのまま遊べる形で進化させた改良版です。
縦10行 × 横5列のフィールドに下からせり上がる **ライン付きパネル**（`／ ＼ ∧ ∨`）を上下に入れ替え、**左壁から右壁まで光の線をつなぐ**アクションパズル。つながった線は約1秒点滅し、その猶予中にもう一本つないで巻き込めば**能動連鎖**になります。

初代のルール・数値・手触りは一切変えていません（NORMAL 選択時）。変わったのは「読みやすさ」「伸びしろ」「気持ちよさ」です。

### 仕様
| 項目 | 値・挙動 |
|---|---|
| フィールド | 横5列 × 縦10行／開始時に下2行 |
| パネル種 | `／ ＼ ∧ ∨` の4種（角どうしの接続） |
| 入れ替え | 縦（上下）のみ。横入れ替えはなし |
| 消える条件 | 左壁⇔右壁をつなぐ本線＋**枝先が端列まで届く枝**のみ。行き止まりは残る |
| 猶予時間 | 約1秒（1000ms）→ 消滅400ms |
| 能動連鎖 | 猶予中につないだ線を同じ消滅に巻き込む |
| 落下 | 消えた後の空隙へパネルが落ちる |
| せり上がり | 3500ms 開始 → 200点ごとにレベルアップ、-180ms、最短1200ms（上限レベル15） |
| ゲームオーバー | 上端の赤破線に到達 |
| その他 | 日・英・中、`localStorage` ハイスコア、Space でサウンド切替 |

### 改良版で追加した機能
- 👀 **せり上がりプレビュー＋タイマーバー**：次に積まれる1行が半透明で見え、バーで残り時間が分かる。
- 🧭 **アシスト表示**（既定ON・`H`で切替）：左壁側ネットワーク＝水色、右壁側＝マゼンタ、**左壁→右壁へ抜けている線＝金色**の塗り分け。金色の点は消滅判定と同じ計算なので、**金色の線は必ず消えます**。
- ⛓️ **落ち連鎖**：落下の衝撃で新的な線が生まれた場合、次の1手まで待たず自動で点滅が始まる（落下・せり上がりが**落ち着いた後**に開始）。
- 🔦 **接続の見える化**：壁に触れている角をソケットで示し（左右に抜けている線だけが金色）、消滅の1秒間はその本線を**左壁→右壁へ流れる金色の光の帯**として描画。「どこが繋がって消えたのか」が必ず目で追えます。
- 💠 **巻き込みボーナス／連鎖倍率**：1回の消滅に含まれた枚数と本数でスコアが伸びる（`枚数×10×レベル×連鎖係数`、巻き込み `枚数×15×レベル×連鎖数`）。
- ❄️ **スローフィールド**：ゲージ100で `S`/`Shift` を押すと **5秒間だけせり上がりが停止**。難易度でゲージの溜まり速度が変化。
- 🎚️ **難易度 EASY / NORMAL / HARD**（別枠ハイスコア・別枠最大連鎖を保存）。
- 🎮 **キーボード完結操作＋ドラッグ入れ替え**、ポーズ、タブを裏に返すと自動ポーズ。
- ✨ **演出強化**：粒子・画面シェイク・スコアポップ・コンフェッティ、Retina（DPR）対応、`prefers-reduced-motion` 対応。
- 🌐 言語切替は即時反映、オフライン検知表示あり。

### 難易度
| 難易度 | 初動のせり上がり | レベルアップ短縮 | 最短間隔 | ゲージ溜まり |
|---|---|---|---|---|
| EASY | 4200ms | -150ms | 2000ms | 1.4× |
| **NORMAL**（初代相当） | **3500ms** | **-180ms** | **1200ms** | 1.0× |
| HARD | 2800ms | -220ms | 900ms | 0.75× |

### 操作方法
| 入力 | 動作 |
|---|---|
| クリック / タップ | パネル選択 → 上下の隣を再タップで入れ替え |
| ドラッグ | 上または下へ引っ張って入れ替え |
| ← → | カーソル（選択）を左右に移動 |
| ↑ ↓ | 選択中パネルの入れ替え |
| Enter / Home | 現在位置の選択・解除 |
| Space / M | サウンド ON/OFF |
| S / Shift | スローフィールド発動 |
| H | アシスト表示 ON/OFF |
| P / Esc | ポーズ（裏で非表示時も自動ポーズ） |
| R | リスタート |

### 使用ライブラリ（ネットから取得）
| ライブラリ | 取得元 | 用途 |
|---|---|---|
| GSAP 3.12.5 | `cdn.jsdelivr.net/npm/gsap@3.12.5` | 落下・点滅・ポップなどの補間 |
| canvas-confetti 1.9.3 | `cdn.jsdelivr.net/npm/canvas-confetti@1.9.3` | レベルアップ／高スコア演出 |
| Google Fonts（Orbitron / Noto Sans JP） | `fonts.googleapis.com` | 書体 |

> **接続が悪い場合でも遊べます。** いずれも取得に失敗すると内蔵フォールバック（自作トゥイーン／コンフェッティなし／システムフォント）に切り替わり、タイトル画面に `offline mode` と表示されます。

### 起動方法
1. `streamline/index.html` を**ブラウザで開くだけ**（ビルド不要）。`file://` でも動作します。
2. CDN を読むため初回はネット接続があるときに見た目が最適化されます。

<details>
<summary>（任意）ローカルサーバーで開く</summary>

```bash
cd streamline
python -m http.server 8000     # → http://localhost:8000
# Node があれば
npx serve .
```
</details>

### 技術メモ
- 単一 HTML（`index.html`）完結。依存は上記 CDN のみで、ビルド工程はありません。
- 描画は `<canvas>` 2D（DPR 対応）。接続判定は初代同様「かど座標」ノードグラフ上で行い、**「左壁⇔右壁のいずれかの実単純経路上にある角」** を次の線形時間アルゴリズムで求めます：①左右壁の全角を超级点 S・T としてグラフに接続 ②Tarjan の辺スタックで**二連結分解**（ブロック＝橋を含まない最大ブロックと橋そのもの）③ブロックと切断点を頂点にした**ブロックカット木**を作る ④ S の所属ブロックから T の所属ブロックへの道上のブロックに属する角と、その道に挟まる切断点を「本線（core）」とする。／この定義だと枝分かれした本線も正しく扱えます（ある角が「左壁から到達」かつ「右壁から到達」でも、同じ経路上に無い＝消えない場合があり、単純な双方向到達では偽陽子が出ます）。
- 音は Web Audio API によるリアルタイム合成（ローパス＋遅延リバーブ）。
- 状態機械：`IDLE → FLASH(1000ms) → CLEAR(400ms) → 落下 → IDLE`（入れ替え・落下・せり上がりが定位置に収まってから FLASH へ移行します）。
- 保存キー：`sl.lang / sl.sound / sl.assist / sl.diff / sl.high.<難易度> / sl.chain.<難易度>`。
- 開発検証：`node dev-test.mjs` で本体スクリプトをそのまま Node 上に走らせ、73項目（継承ルール・timing・落ち連鎖・せり上がり・スロー・ゲームオーバー・多言語描画・本線の経路復元・猶予中につないだ線の検出・消滅中の本線・アニメーション開始位置・**アシスト金色と判定の一致**・**猶予中の確定線ロック**・**消滅の取りこぼし**）を確認済み。
- 総当たり検証：`node dev-fuzz.mjs` は ①ランダム盤面の消滅対象を「全単純経路を列挙する厳密定義」と照合（既定 4,000 枚で不一致0）②dense盤面で行き止まりが消えないこと③描く本線が本当に左壁開始・右壁終了の単純経路であること（900枚超で不備0）まで確認します。`A_ROWS` / `A_TRIES` などの環境変数で盤面の濃さを調整できます。
- 常時検査：`node dev-stress.mjs` は実ループ（`update`／`renderField`）を約1万フレーム高速回転し、毎フレーム ①**判定が別アルゴリズムと一致**（辺は必ず x を1列ぶん増やすので、x 単調な DAG の到達計算＝単一行路上のノードと厳密比較）②**光った線は必ず左壁→右壁の単一行路上**③消滅集合と panel.state の一致・本線の帯が両壁に到達④フラッシュが1.6秒以内に完了⑤**金色のまま残るパネル（ゴースト）の不在**を検査します。猶予中は「直前の手をなかったことにする」手もわざと打ちます（現在は確定線ロックにより拒否されるため、線は壊れません）。

### ブラウザ描画の自動検証（キャンバスの絵そのものを検査）
`index.html` を実ブラウザ（Edge / Chrome の headless）で開き、DevTools Protocol 経由で **描画済みキャンバスのピクセル**まで読む検査です。ゲーム本体にテスト用コードは不要で、ページ内の `game` の変数・関数をそのまま参照します。

```powershell
Set-Location streamline
node dev-browser.mjs --seconds 90                        # 90秒プレイさせて検査（既定 60秒）
node dev-browser.mjs --probe                             # rAFが動いているか＋1枚スクショ（動作確認）
node dev-browser.mjs --port 9412                         # 起動済みブラウザ（--remote-debugging-port）に接続
node dev-browser.mjs --board "./.^v/|...10行...|. ...."   # 盤面を固定して再現検査（. は空マス）
node dev-browser.mjs --shots --out C:\tmp\sl             # 合否に関わらずスクショ保存／保存先変更
```

検査項目（ゲームの描画コールバック直後＝まさに描き終えた絵を、毎フレーム）:

| チェック | 見ている内容 |
|---|---|
| `ghost-gold` | 点滅中に金色で描かれたパネルが、実際に消滅対象（`qualifyingCells()`）に入っているか |
| `painted-gold-without-judgement` | **キャンバス上で金色に見えたパネルが、判定では消えないパネルだった**（報告の事象そのもの） |
| `judged-but-not-painted` | 判定上は消えるのに、絵では水色（通常線）のまま残っている |
| `no-beam` / `bad-beam` | 点滅中に本線の帯が0本になっていないか／帯が必ず左壁（x=0）開始・右壁（x=280）終了か |
| `cell-dropped` / `clear-scope-grew` / `state-set-mismatch` | 点滅集合・消滅集合・`panel.state` の三者一致（光った線が減らない／消滅範囲が拡大しない） |
| `flash-stuck` / `clear-stuck` | 点滅≈1000ms・消滅≈400ms で完了しているか（位相の停滞検出） |
| `page-error` / `page-rejection` / `*-throw` | ページ側の例外と検査側の例外 |

- 点滅開始の **1フレームだけ** 絵が判定に追い付かない瞬間は自己回復するため「遅れ」として別集計し、**2フレーム以上残ったものだけ**を違反にします（`lagMax=1` の自己回復だけなら合格）。
- 隣パネルの本線帯の光（最大8px）が重なる画素は「そのパネルが金色」の根数に数えません（選択中パネルの金色縁取りも同様）。同じく、**2枚以上のパネルが共有する角のうち消える線の道上にある点**に描かれる金色マーカー（設計上ふたつの盤面にまたがって描かれる）も根数に数えません。除外件数はサマリに表示し、直近の実行では 隣帯の光 1,793点／共有角 24点 ＝ 全サンプルの 0.2% 程度で、検出力は落ちていません（次の感度確認で実証）。
- 点滅中に本線帯が0本になった瞬間があれば、その時の内部状態（`beamFor`/`graphRev`/猶予フラグ/判定集合サイズ/点滅パネルの型と状態）をサマリに出力します。今回の実施で「種まき直後の過渡状態」が原因の誤検出を2件、この出力で特定して潰しました。
- 違反が出た瞬間の **スクリーンショット＋盤面ダンプ**（型・状態・点滅集合・core判定・帯との距離px・現場のRGBサンプル列）を `browser-check/` に保存します。
- 終了コード：`0`=合格 / `1`=違反 / `2`=ブラウザ未検出 / `3`=デバッガ接続失敗 / `4`〜`9`=初期化・実行の問題。
- **検査自身の感度確認**：一時的に idle パネルを金色に塗る改変を `index.html` に入れると `painted-gold-without-judgement` が多数検出され（実測24件・exit 1）、検査が実際に効いていることを確認済みです。

---

## English

### Overview
**STREAMLINE** is the deluxe remake of the "Line Link Puzzle" sitting in the parent folder. Line-marked panels (`/ \ ∧ ∨`) rise from the bottom of a 10-row × 5-column field; swap them vertically to connect light **from the left wall all the way to the right wall**. A finished line flashes for a ~1 s grace window — connect another one during it and both clear together as an **active chain**.

The original rules, numbers and feel are untouched (on NORMAL). Only legibility, headroom and juice changed.

### Inherited from the original (unchanged)
| Item | Behaviour |
|---|---|
| Field | 5 columns × 10 rows, 2 starting rows |
| Panels | `/ \ ∧ ∨`, joined corner-to-corner |
| Swapping | vertical only |
| Clearing rule | only panels on the main left↔right path plus branches whose tips reach an edge column; dead ends stay |
| Timing | ~1000 ms grace → 400 ms clear |
| Active chaining | sweep during the grace window |
| Gravity | panels fall into gaps |
| Rising | 3500 ms at start, −180 ms per level (every 200 pts), floor 1200 ms, level cap 15 |
| Game over | panels reach the red dashed top line |
| Misc | ja/en/zh, `localStorage` high score, Space toggles sound |

### What the remake adds
- 👀 **Riser preview + timer bar** — the incoming row is shown ghosted, the bar shows how long you have.
- 🧭 **Assist overlay** (on by default, `H`) — left-network panels tinted cyan, right-network gold, so the missing link is obvious.
- ⛓️ **Fall chains** — if gravity creates a new line, flashing starts automatically (once the panels have settled).
- 🔦 **Visible connections** — corners touching a wall get a **gold socket**, and during the 1 s flash the cleared line is drawn as a **gold beam running left wall → right wall**, so you can always see *which* path cleared. Flashing never starts mid-swap / mid-fall / mid-rise.
- 💠 **Sweep bonus & chain multiplier** — `cells × 10 × level × chain factor`, plus `extra × 15 × level × chains`.
- ❄️ **Slow field** — with a full gauge, `S`/`Shift` freezes the rise for **5 seconds**.
- 🎚️ **EASY / NORMAL / HARD** difficulties with separate high scores and chain records.
- 🎮 **Full keyboard play + drag-to-swap**, pause, auto-pause on tab blur.
- ✨ Particles, screen shake, score pops, confetti; crisp DPR rendering; `prefers-reduced-motion` respected.

### Controls
| Input | Action |
|---|---|
| Click / Tap | select → tap the panel above/below again to swap |
| Drag | pull a panel up or down to swap |
| ← → | move the cursor |
| ↑ ↓ | swap selected panel |
| Enter / Home | select / deselect at cursor |
| Space / M | sound on/off |
| S / Shift | slow field |
| H | assist overlay |
| P / Esc | pause (also auto-pauses when hidden) |
| R | restart |

### Libraries (fetched from the network)
GSAP 3.12.5 and canvas-confetti 1.9.3 from jsDelivr, plus Google Fonts (Orbitron / Noto Sans JP).
If any of them cannot be fetched, built-in fallbacks take over (own tween engine, no confetti, system fonts) and the title screen shows `offline mode` — the game still plays.


### Running
Open `streamline/index.html` in a browser. No build step; `file://` works too.
`node dev-test.mjs` runs the 73-case logic harness (inherited rules, timing, chains, rise, slow field, game over, path reconstruction, grace-window line detection, beam during the clear phase, animation start positions, gold-dot/judgment agreement, grace-window lock of confirmed lines, stranding guard, all three locales); `node dev-fuzz.mjs` runs the brute-force rule check, `node dev-stress.mjs` the per-frame invariant check described above, and `node dev-browser.mjs` the real-browser pixel check (exit code 0 = pass, 1 = mismatch; `--probe` for a 5-second sanity run, `--board "..."` to pin a board for reproduction).

---

## 中文

### 概述
**STREAMLINE（流光连线）** 是同级目录「Line Link Puzzle」的强化版。10 行 × 5 列的场地中，带线条的面板（`／ ＼ ∧ ∨`）自底部上升，通过上下交换把光路**从左墙连到右墙**。成线后会闪烁约 1 秒，在此期间再连一条即可一起消除，形成**主动连锁**。

初代的规则与数值在 NORMAL 难度下完全保留，改动的只有“看得清、有余地、够爽快”这三点。

### 从初代继承（未改动）
5 列 × 10 行／初始 2 行 ｜ 4 种面板、角对角连接 ｜ 仅上下交换 ｜ 只有连接左右墙的“主线”和**末端到达边缘列的分支**会消除，死胡同保留 ｜ 闪烁 1000ms → 消除 400ms ｜ 消除后下落 ｜ 上升 3500ms 起、每 200 分升 1 级、每次 −180ms、下限 1200ms、等级上限 15 ｜ 到达顶部红色虚线即结束 ｜ 日/英/中、`localStorage` 最高分、Space 切换声音。

### 强化版新增
- 👀 上升预告行（半透明）＋时间条
- 🧭 辅助显示（默认开启，`H` 切换）：左侧网络染青色、右侧网络染品红，**真正从左墙通到右墙的线染金色**——金色与消除判定用的是同一套计算，所以金色的线一定会被消掉
- ⛓️ 下落连锁：落下后若形成新线会自动进入闪烁（等面板停稳后才开始闪烁）
- 🔦 连接可视化：贴墙的角画出接口（只有真正左右贯通的线才是金色接口），消除的那 1 秒把主线画成**从左墙流向右墙的金色光束**，一眼就能看出到底是哪条线消掉了；交换／下落／上升过程中不会开始闪烁
- 💠 卷入奖励与连锁倍率
- ❄️ 减速场：能量满时按 `S`/`Shift` 让上升停止 5 秒
- 🎚️ EASY / NORMAL / HARD 三档难度（最高分分别保存）
- 🎮 全键盘操作、拖拽交换、暂停、切到后台自动暂停
- ✨ 粒子、震屏、分数弹跳、彩带；Retina 绘制；支持 `prefers-reduced-motion`

### 操作
点击/轻触选择 → 再点上下相邻面板交换 ｜ 拖拽上下交换 ｜ ← → 移动光标 ｜ ↑ ↓ 交换 ｜ Enter/Home 选择或取消 ｜ Space/M 声音 ｜ S/Shift 减速场 ｜ H 辅助 ｜ P/Esc 暂停 ｜ R 重开

### 运行方式
浏览器直接打开 `streamline/index.html` 即可，无需构建；`file://` 也可运行。
若 CDN 无法访问，会自动回落到内置补间/无彩带/系统字体，并在标题页显示 `offline mode`。
开发校验：`node dev-test.mjs`（73 项全部通过）；`node dev-fuzz.mjs` 用穷举法比对 4,000 张随机盘面和 1,500 张 dense 盘面，消除集合与“所有简单路径”的严格定义完全一致（0 处不符，死胡同道从不会被消掉）。
闪烁反馈也一并加固：闪烁中的面板保留**实线**（改为亮金色、整组同相位闪动，不再与光束的虚线叠成双层），光束跟随面板的实际绘制位置、宽限期内盘面一变就重建、并在 400ms 消除阶段保持到最后；宽限期内新接上的线会立刻泛起淡金色，不再“毫无预告地被顺带消掉”。
本轮又修掉了三处会导致“没连上却出现特效／判定不对”的问题：①**金色辅助点改与判定同算**——原先金色点表示“从左墙和右墙都能到达”，于是从主线岔出去的**死胡同分支也会发金**，看起来连着却不会消（判定本身没错，分支不会消）；现在金色＝确实在左墙→右墙通路上的角，走到两壁但止步的死胡同改为淡青白，只通一侧的仍是青色／品红。②**宽限期内已连通的线不可再交换**（与初代“确定线固定”一致），金色确定后不会再被手动拆掉，硬要动会播放拒绝音；宽限期内刚接上、尚未贯通的线仍可自由交换。③**消除集合开始闪烁后只增不减**，消除结束时仍处闪烁／消除状态的面板一律复位，因此不会出现“金色却不会消失”的残留面板。
校验：`node dev-test.mjs`（73 项全通过）、`node dev-fuzz.mjs`（穷举比对，0 处不符）、`node dev-stress.mjs`（把真实主循环跑约一万帧，逐帧核对“判定＝另一套算法（把每条边看作 x 单调推进的 DAG 可达性）”“发光的线确实在左墙→右墙的单一路径上”“没有残留的金色面板”，0 项违反）。

浏览器实测：`node dev-browser.mjs`（用 headless Edge/Chrome 打开游戏，读取**已绘制画布的像素**逐帧核对"金色＝即将消失、蓝色＝不会消失"，并核对光束必从左墙起、右墙止）。最近一次：9,419 帧 / 29,044 个面板的像素检查 **0 项违反**；注入"给不会消失的面板涂金色"后能检出 24 项违反，说明检查有效。详见日文节的《浏览器描画的自动验证》。

---

## ファイル構成 / File structure / 文件结构
```
LineLinkPuzzle/
├── index.html              # 初代（そのままで残してあります）
├── README.md               # 初代の説明
└── streamline/
    ├── index.html          # ★ STREAMLINE（改良版・本編）
    ├── README.md           # このドキュメント
    ├── dev-test.mjs        # ロジック検証ハーネス（任意・開発用）
    ├── dev-fuzz.mjs        # 消滅ルールの総当たり検証（任意・開発用）
    ├── dev-board.mjs       # 固定盤面で「全単純経路の列挙」と判定coreを照合（任意・開発用）
    ├── dev-stress.mjs      # 実ループ常時検査：毎フレーム不変条件（任意・開発用）
    ├── dev-browser.mjs     # ★ 実ブラウザ（headless Edge/Chrome）で描画ピクセルを検査（任意・開発用）
    ├── dev-browser-harness.js  #  ↑ ページ側で実行される検査本体（dev-browser.mjs が読み込みます）
    └── browser-check/      # 検査セーブ先（違反時のスクショ＋盤面ダンプ）
```

## License
本サンプルは学習・利用目的で自由に使用・改変して構いません。 / Free to use and modify for learning purposes. / 可自由用于学习与修改。
