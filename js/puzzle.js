/* かんじパズル — 盤に漢字を置いて熟語を作る対戦モード（2〜4人） */
"use strict";

/* ---------- 調整パラメータ（シミュレーションで決定） ---------- */
// シミュレーション結果（scratchpad/sim.ps1, 2026-07）:
//   元案（山札・初期配置とも全440字から一様）だと初手で置ける確率は 33.6%。
//   山札を熟語参加数で重み付け + 初期配置をハブ漢字にした本設定では 93.8%。
const PZ = {
  SIZE: 7, // 盤面 7×7
  HAND: 10, // 手札枚数（ターン終了時にここまで補充）
  SEEDS: 8, // 初期配置の漢字数
  ROUNDS: 8, // 1人あたりのターン数
  MAX_SWAP: 3, // パス時に交換できる枚数
  COPY_CAP: 4, // 同じ漢字の山札への最大投入枚数
  HUB_MIN: 8, // 初期配置に使う漢字の最低「熟語参加数」
};

/* ---------- 辞書（JUKUGO + ことばづくり用 WORDS2 を統合） ---------- */
const PZ_DICT = (() => {
  const m = new Map();
  for (const x of JUKUGO) if (!m.has(x.w)) m.set(x.w, x.y);
  for (const x of WORDS2) if (x.w.length === 2 && !m.has(x.w)) m.set(x.w, x.y);
  return m;
})();

// 各漢字が参加する熟語数（山札の重み & ハブ判定に使う）
const PZ_DEG = (() => {
  const d = new Map();
  for (const w of PZ_DICT.keys()) {
    for (const c of w) d.set(c, (d.get(c) || 0) + 1);
  }
  return d;
})();

const PZ_PLAYERS = [
  { emoji: "🌸", name: "もも", cls: "pp1" },
  { emoji: "🐳", name: "そら", cls: "pp2" },
  { emoji: "🍊", name: "みかん", cls: "pp3" },
  { emoji: "🐢", name: "みどり", cls: "pp4" },
];

const puzzle = {
  players: [],
  current: 0,
  board: [],
  deck: [],
  selected: null,
  swapMode: false,
  swapSel: new Set(),
  busy: false,
  playerCount: 2,
  free: false, // フリーモード: どこでも置けて、熟語判定は人間がする
  judge: null, // フリーモードの判定パネル用 {runs, marks, ch}
};

/* ---------- セットアップ ---------- */
function showPuzzleSetup() {
  showScreen("#scr-pzsetup");
}

function startPuzzle(count, free) {
  puzzle.playerCount = count;
  puzzle.free = !!free;
  lastMode = () => startPuzzle(count, free);

  // 山札: 熟語に参加する漢字を参加数で重みづけして投入。
  // フリーモードは人間が判定するので、辞書外の漢字も1枚ずつ混ぜる
  const deck = [];
  for (const [k, deg] of PZ_DEG) {
    for (let i = 0; i < Math.min(deg, PZ.COPY_CAP); i++) deck.push(k);
  }
  if (puzzle.free) {
    for (const x of KANJI) if (!PZ_DEG.has(x.k)) deck.push(x.k);
  }
  puzzle.deck = shuffle(deck);

  // 盤面: よくつながる漢字（ハブ）を、縦横で隣り合わないように配置
  puzzle.board = Array(PZ.SIZE * PZ.SIZE).fill(null);
  const hubs = shuffle([...PZ_DEG].filter(([, d]) => d >= PZ.HUB_MIN).map(([k]) => k))
    .concat(shuffle([...PZ_DEG.keys()])); // ハブが足りないときの予備
  const cells = shuffle([...Array(PZ.SIZE * PZ.SIZE).keys()]);
  let placed = 0;
  for (const cell of cells) {
    if (placed >= PZ.SEEDS) break;
    if (pzNeighbors(cell).some((n) => puzzle.board[n] !== null)) continue;
    puzzle.board[cell] = hubs[placed++];
  }

  puzzle.players = PZ_PLAYERS.slice(0, count).map((p) => ({
    ...p,
    score: 0,
    turnsLeft: PZ.ROUNDS,
    hand: puzzle.deck.splice(0, PZ.HAND),
  }));
  puzzle.current = 0;
  puzzle.selected = null;
  puzzle.swapMode = false;
  puzzle.busy = false;
  puzzle.judge = null;
  $("#pz-judge").classList.remove("show");
  $("#pz-popup").classList.remove("show");

  showScreen("#scr-puzzle");
  pzRenderAll();
  pzShowOverlay();
}

/* ---------- 盤面ヘルパー ---------- */
function pzNeighbors(i) {
  const r = Math.floor(i / PZ.SIZE);
  const c = i % PZ.SIZE;
  const out = [];
  if (r > 0) out.push(i - PZ.SIZE);
  if (r < PZ.SIZE - 1) out.push(i + PZ.SIZE);
  if (c > 0) out.push(i - 1);
  if (c < PZ.SIZE - 1) out.push(i + 1);
  return out;
}

// idx に ch を置いたときにできる縦横の「つながり」を列挙する
// 返り値: [{ str, len, pairs:[{w, y, known}], allKnown }]（2文字以上の並びのみ）
function pzRuns(idx, ch) {
  const b = puzzle.board;
  const r = Math.floor(idx / PZ.SIZE);
  const c = idx % PZ.SIZE;
  const runs = [];

  for (const dir of ["h", "v"]) {
    const chars = [ch];
    if (dir === "h") {
      for (let x = c - 1; x >= 0 && b[r * PZ.SIZE + x]; x--) chars.unshift(b[r * PZ.SIZE + x]);
      for (let x = c + 1; x < PZ.SIZE && b[r * PZ.SIZE + x]; x++) chars.push(b[r * PZ.SIZE + x]);
    } else {
      for (let y = r - 1; y >= 0 && b[y * PZ.SIZE + c]; y--) chars.unshift(b[y * PZ.SIZE + c]);
      for (let y = r + 1; y < PZ.SIZE && b[y * PZ.SIZE + c]; y++) chars.push(b[y * PZ.SIZE + c]);
    }
    if (chars.length < 2) continue;
    const pairs = [];
    for (let i = 0; i + 1 < chars.length; i++) {
      const w = chars[i] + chars[i + 1];
      pairs.push({ w, y: PZ_DICT.get(w) || null, known: PZ_DICT.has(w) });
    }
    runs.push({
      str: chars.join(""),
      len: chars.length,
      pairs,
      allKnown: pairs.every((p) => p.known),
    });
  }
  return runs;
}

// じしょモードの判定: つながりの隣接ペアがすべて辞書にあるときだけ置ける
function pzCheck(idx, ch) {
  const runs = pzRuns(idx, ch);
  if (!runs.length || runs.some((r) => !r.allKnown)) return { ok: false, score: 0, words: [] };
  return {
    ok: true,
    score: runs.reduce((s, r) => s + r.len, 0),
    words: runs.flatMap((r) => r.pairs),
  };
}

function pzLegalCells(ch) {
  const out = [];
  for (let i = 0; i < puzzle.board.length; i++) {
    if (puzzle.board[i]) continue;
    if (puzzle.free) {
      out.push(i); // フリーモードはどこでもOK
      continue;
    }
    if (!pzNeighbors(i).some((n) => puzzle.board[n])) continue;
    if (pzCheck(i, ch).ok) out.push(i);
  }
  return out;
}

function pzAnyMove(player) {
  return puzzle.free || player.hand.some((ch) => pzLegalCells(ch).length > 0);
}

/* ---------- 描画 ---------- */
function pzRenderAll() {
  pzRenderScores();
  pzRenderBoard();
  pzRenderHand();
  pzRenderActions();
}

function pzRenderScores() {
  const box = $("#pz-scores");
  box.innerHTML = "";
  puzzle.players.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = `pz-chip ${p.cls}` + (i === puzzle.current ? " active" : "");
    el.innerHTML = `<span>${p.emoji}${p.name}</span><b>${p.score}</b>`;
    box.appendChild(el);
  });
  const cur = puzzle.players[puzzle.current];
  $("#pz-turninfo").textContent = `のこり${cur.turnsLeft}かい・やま${puzzle.deck.length}`;
}

function pzRenderBoard() {
  const box = $("#pz-board");
  // フリーモードはどこでも置けるので、ハイライトは出さない
  const legal = puzzle.selected !== null && !puzzle.swapMode && !puzzle.free
    ? new Set(pzLegalCells(puzzle.players[puzzle.current].hand[puzzle.selected]))
    : new Set();
  box.innerHTML = "";
  puzzle.board.forEach((ch, i) => {
    const cell = document.createElement("button");
    cell.className = "pz-cell" + (ch ? " filled" : "") + (legal.has(i) ? " legal" : "");
    cell.textContent = ch || "";
    if (!ch) cell.addEventListener("pointerdown", () => pzTapCell(i));
    box.appendChild(cell);
  });
}

function pzRenderHand() {
  const box = $("#pz-hand");
  const p = puzzle.players[puzzle.current];
  box.innerHTML = "";
  p.hand.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className =
      "kanji-card pz-tile" +
      (puzzle.selected === i ? " picked" : "") +
      (puzzle.swapSel.has(i) ? " swapsel" : "");
    btn.textContent = ch;
    btn.addEventListener("pointerdown", () => pzTapHand(i));
    box.appendChild(btn);
  });
}

function pzRenderActions() {
  const p = puzzle.players[puzzle.current];
  const msg = $("#pz-msg");
  if (puzzle.swapMode) {
    msg.textContent = `いらない カードを ${PZ.MAX_SWAP}まいまで えらんでね`;
    $("#pz-pass").hidden = true;
    $("#pz-swapok").hidden = false;
    $("#pz-swapok").disabled = puzzle.swapSel.size === 0;
    $("#pz-swapok").textContent = `すてて ひく（${puzzle.swapSel.size}まい）`;
    $("#pz-swapcancel").hidden = false;
  } else {
    $("#pz-pass").hidden = false;
    $("#pz-swapok").hidden = true;
    $("#pz-swapcancel").hidden = true;
    if (puzzle.selected !== null) {
      if (puzzle.free) {
        msg.textContent = "すきな あいてる マスに おいてね";
      } else {
        const cells = pzLegalCells(p.hand[puzzle.selected]);
        msg.textContent = cells.length
          ? "ひかっている マスに おけるよ！"
          : "その カードは おけないよ…べつの カードは？";
      }
    } else {
      msg.textContent = pzAnyMove(p)
        ? "カードを えらんでね"
        : "おける カードが ないみたい…パスして こうかんしよう";
    }
  }
}

/* ---------- 操作 ---------- */
function pzTapHand(i) {
  if (puzzle.busy) return;
  if (puzzle.swapMode) {
    if (puzzle.swapSel.has(i)) puzzle.swapSel.delete(i);
    else if (puzzle.swapSel.size < PZ.MAX_SWAP) puzzle.swapSel.add(i);
    pzRenderHand();
    pzRenderActions();
    return;
  }
  puzzle.selected = puzzle.selected === i ? null : i;
  pzRenderBoard();
  pzRenderHand();
  pzRenderActions();
}

function pzTapCell(idx) {
  if (puzzle.busy || puzzle.swapMode || puzzle.selected === null) return;
  if (puzzle.board[idx]) return;
  const p = puzzle.players[puzzle.current];
  const ch = p.hand[puzzle.selected];

  if (puzzle.free) {
    pzPlaceFree(idx, ch, p);
    return;
  }

  const res = pzCheck(idx, ch);
  if (!res.ok) return;

  puzzle.busy = true;
  pzCommitTile(idx, ch, p);
  p.score += res.score;
  store.addStar(ch);

  pzRenderAll();
  confetti(Math.min(8 + res.score * 2, 20));
  speak(res.words.map((x) => x.y).join("、"));
  pzShowPointsPopup(res.score, res.words);
}

// タイルを盤に置いて手札を補充する（両モード共通）
function pzCommitTile(idx, ch, p) {
  puzzle.board[idx] = ch;
  p.hand.splice(puzzle.selected, 1);
  puzzle.selected = null;
  if (puzzle.deck.length && p.hand.length < PZ.HAND) p.hand.push(puzzle.deck.pop());
}

function pzShowPointsPopup(score, words) {
  const popup = $("#pz-popup");
  popup.innerHTML =
    `<div class="pz-pts">${score > 0 ? "+" + score + "てん" : "0てん"}</div>` +
    words
      .map((x) => `<div class="pz-word">${x.w}<span>${x.y ? "（" + x.y + "）" : ""}</span></div>`)
      .join("");
  popup.classList.add("show");
  setTimeout(() => {
    popup.classList.remove("show");
    pzEndTurn();
  }, score > 0 ? 1600 : 900);
}

/* ---------- フリーモード: 人間が熟語を判定する ---------- */
function pzPlaceFree(idx, ch, p) {
  puzzle.busy = true;
  const runs = pzRuns(idx, ch);
  pzCommitTile(idx, ch, p);
  pzRenderAll();

  if (!runs.length) {
    // 2文字以上の並びができていない → 0てんでそのまま次へ
    pzShowPointsPopup(0, []);
    return;
  }

  // 判定パネル: 並びごとに ○/× を決めてもらう（初期値は辞書判定）
  puzzle.judge = { runs, marks: runs.map((r) => r.allKnown), ch };
  pzRenderJudge();
  $("#pz-judge").classList.add("show");
}

function pzRenderJudge() {
  const { runs, marks } = puzzle.judge;
  const box = $("#pz-judge-runs");
  box.innerHTML = "";
  runs.forEach((r, i) => {
    const row = document.createElement("button");
    row.className = "pz-run" + (marks[i] ? " yes" : " no");
    const hints = r.pairs
      .filter((x) => x.known)
      .map((x) => `${x.w}（${x.y}）`)
      .join("・");
    row.innerHTML = `
      <span class="pz-run-mark">${marks[i] ? "⭕" : "❌"}</span>
      <span class="pz-run-str">${r.str}</span>
      <span class="pz-run-pts">${marks[i] ? "+" + r.len : "0"}てん</span>
      ${hints ? `<span class="pz-run-hint">💡 ${hints}</span>` : ""}`;
    row.addEventListener("pointerdown", () => {
      puzzle.judge.marks[i] = !puzzle.judge.marks[i];
      pzRenderJudge();
    });
    box.appendChild(row);
  });
  const total = runs.reduce((s, r, i) => s + (marks[i] ? r.len : 0), 0);
  $("#pz-judge-sum").textContent = `ごうけい +${total}てん`;
}

function pzJudgeConfirm() {
  const { runs, marks, ch } = puzzle.judge;
  const p = puzzle.players[puzzle.current];
  const score = runs.reduce((s, r, i) => s + (marks[i] ? r.len : 0), 0);
  const words = runs
    .filter((_, i) => marks[i])
    .flatMap((r) => (r.len === 2 ? [{ w: r.str, y: PZ_DICT.get(r.str) || null }] : [{ w: r.str, y: null }]));
  p.score += score;
  if (score > 0) {
    store.addStar(ch);
    confetti(Math.min(8 + score * 2, 20));
    const known = words.filter((x) => x.y).map((x) => x.y);
    if (known.length) speak(known.join("、"));
  }
  puzzle.judge = null;
  $("#pz-judge").classList.remove("show");
  pzRenderScores();
  pzShowPointsPopup(score, words);
}

function pzPass() {
  if (puzzle.busy || puzzle.swapMode) return;
  if (!puzzle.deck.length) {
    // 山札切れ: 交換できないのでそのまま番をとばす
    puzzle.busy = true;
    setTimeout(pzEndTurn, 300);
    return;
  }
  puzzle.swapMode = true;
  puzzle.swapSel.clear();
  puzzle.selected = null;
  pzRenderAll();
}

function pzSwapConfirm() {
  const p = puzzle.players[puzzle.current];
  const idxs = [...puzzle.swapSel].sort((a, b) => b - a);
  if (!idxs.length) return;
  puzzle.busy = true;
  const back = [];
  for (const i of idxs) back.push(p.hand.splice(i, 1)[0]);
  for (let i = 0; i < back.length && puzzle.deck.length; i++) p.hand.push(puzzle.deck.pop());
  puzzle.deck.unshift(...shuffle(back)); // すてた札は山の底へ
  puzzle.swapMode = false;
  puzzle.swapSel.clear();
  pzRenderAll();
  setTimeout(pzEndTurn, 300);
}

function pzSwapCancel() {
  puzzle.swapMode = false;
  puzzle.swapSel.clear();
  pzRenderAll();
}

/* ---------- ターン進行 ---------- */
function pzEndTurn() {
  const p = puzzle.players[puzzle.current];
  p.turnsLeft--;

  const boardFull = puzzle.board.every((c) => c);
  const allDone = puzzle.players.every((x) => x.turnsLeft <= 0);
  const allEmpty = puzzle.players.every((x) => x.hand.length === 0);
  if (boardFull || allDone || allEmpty) {
    pzFinish();
    return;
  }

  // 次のプレイヤー（ターンが残っている人）
  do {
    puzzle.current = (puzzle.current + 1) % puzzle.players.length;
  } while (puzzle.players[puzzle.current].turnsLeft <= 0);

  puzzle.selected = null;
  puzzle.busy = false;
  pzRenderAll();
  pzShowOverlay();
}

function pzShowOverlay() {
  const p = puzzle.players[puzzle.current];
  const ov = $("#pz-overlay");
  ov.innerHTML = `
    <div class="pz-ov-emoji">${p.emoji}</div>
    <div class="pz-ov-name">${p.name}の ばん！</div>
    <div class="pz-ov-tap">タップしてね</div>`;
  ov.classList.add("show");
}

function pzFinish() {
  const ranked = [...puzzle.players].sort((a, b) => b.score - a.score);
  const win = ranked[0];
  const tie = ranked.length > 1 && ranked[1].score === win.score;
  showResult({
    emoji: "🏆",
    title: tie ? "ひきわけ！" : `${win.emoji}${win.name}の かち！`,
    text: ranked.map((p) => `${p.emoji}${p.name}：${p.score}てん`).join("　"),
  });
}

/* ---------- 初期化 ---------- */
function pzMode() {
  return localStorage.getItem("km_pzmode") || "dict";
}

function pzUpdateModeChips() {
  $$("#pz-mode .chip").forEach((c) => c.classList.toggle("active", c.dataset.mode === pzMode()));
  $("#pz-mode-desc").textContent =
    pzMode() === "free"
      ? "どこにでも おける！じゅくごに なったかは みんなで はんてい（⭕❌）"
      : "アプリが じゅくごを はんてい。おけるマスが ひかるよ";
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-puzzle").addEventListener("pointerdown", showPuzzleSetup);
  pzUpdateModeChips();
  $$("#pz-mode .chip").forEach((c) =>
    c.addEventListener("pointerdown", () => {
      localStorage.setItem("km_pzmode", c.dataset.mode);
      pzUpdateModeChips();
    })
  );
  $$("#pz-count .big-btn").forEach((b) =>
    b.addEventListener("pointerdown", () => startPuzzle(Number(b.dataset.n), pzMode() === "free"))
  );
  $("#pz-judge-ok").addEventListener("pointerdown", pzJudgeConfirm);
  $("#pz-pass").addEventListener("pointerdown", pzPass);
  $("#pz-swapok").addEventListener("pointerdown", pzSwapConfirm);
  $("#pz-swapcancel").addEventListener("pointerdown", pzSwapCancel);
  $("#pz-overlay").addEventListener("pointerdown", () => {
    $("#pz-overlay").classList.remove("show");
    puzzle.busy = false;
  });
});
