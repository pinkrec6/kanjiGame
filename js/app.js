/* かんじのもり — メインロジック */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------- 保存データ ---------- */
const store = {
  get grade() {
    return localStorage.getItem("km_grade") || "1";
  },
  set grade(v) {
    localStorage.setItem("km_grade", v);
  },
  get stars() {
    try {
      return JSON.parse(localStorage.getItem("km_stars") || "{}");
    } catch {
      return {};
    }
  },
  addStar(kanji) {
    const s = this.stars;
    const cur = s[kanji] || 0;
    if (cur >= 3) return false;
    s[kanji] = cur + 1;
    localStorage.setItem("km_stars", JSON.stringify(s));
    return true;
  },
};

/* ---------- ユーティリティ ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pool() {
  const g = store.grade;
  return g === "all" ? KANJI : KANJI.filter((x) => x.g === Number(g));
}

// 出題対象以外からダミーを選ぶ
// ・読み札に写っている漢字は除外
// ・同じ読みのことばを持つ漢字も除外（火/日=ひ、早い/速い=はやい 等で正解が2つになるのを防ぐ）
function pickDistractors(target, count) {
  const used = new Set([...target.w]);
  const ok = (x) => !used.has(x.k) && x.y !== target.y;
  const candidates = pool().filter(ok);
  const fromAll = KANJI.filter((x) => ok(x) && !candidates.includes(x));
  const picked = shuffle(candidates).slice(0, count);
  // 学年しぼり込みで足りないときは全体から補う
  let i = 0;
  while (picked.length < count && i < fromAll.length) {
    picked.push(fromAll[i++]);
  }
  return picked;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.85;
    speechSynthesis.speak(u);
  } catch {
    /* 音声はおまけ機能 */
  }
}

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* ---------- 読み札の描画 ---------- */
// 「学□」のように対象の漢字だけ空欄にした札を作る
function renderClue(el, entry, { compact = false } = {}) {
  const chars = [...entry.w]
    .map((c) =>
      c === entry.k
        ? '<span class="blank">？</span>'
        : `<span class="clue-char">${c}</span>`
    )
    .join("");
  el.innerHTML = `
    <div class="clue-emoji">${entry.e}</div>
    <div class="clue-word">${chars}</div>
    <div class="clue-yomi">${entry.y}
      <button class="speak-btn" aria-label="よみあげ">🔊</button>
    </div>`;
  el.querySelector(".speak-btn").addEventListener("pointerdown", (ev) => {
    ev.stopPropagation();
    speak(entry.y);
  });
  el.classList.toggle("compact", compact);
}

/* ---------- 紙ふぶき ---------- */
function confetti(n = 24) {
  const colors = ["#ff6b9d", "#ffd93d", "#6bcB77", "#4d96ff", "#ff9f45", "#c780fa"];
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.className = "confetti";
    p.textContent = ["🌸", "⭐", "✨", "🎈"][i % 4];
    p.style.left = Math.random() * 100 + "vw";
    p.style.color = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.4 + "s";
    p.style.fontSize = 14 + Math.random() * 20 + "px";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 2600);
  }
}

/* ---------- けっか画面 ---------- */
let lastMode = null;

function showResult({ emoji, title, text, starKanji = [] }) {
  $("#result-emoji").textContent = emoji;
  $("#result-title").textContent = title;
  $("#result-text").textContent = text;
  $("#result-stars").innerHTML = starKanji.length
    ? starKanji.map((k) => `<span class="earned-star">${k}⭐</span>`).join("")
    : "";
  showScreen("#scr-result");
  confetti(30);
}

/* =========================================================
   かるた（ひとりで） 10もん
   ========================================================= */
const karuta = { deck: [], index: 0, firstTry: true, score: 0, earned: [] };

function startKaruta() {
  lastMode = startKaruta;
  karuta.deck = shuffle(pool()).slice(0, 10);
  karuta.index = 0;
  karuta.score = 0;
  karuta.earned = [];
  showScreen("#scr-karuta");
  nextKaruta();
}

function nextKaruta() {
  if (karuta.index >= karuta.deck.length) {
    const s = karuta.score;
    showResult({
      emoji: s >= 8 ? "🏆" : s >= 5 ? "🎉" : "💪",
      title: s >= 8 ? "すごい！" : s >= 5 ? "よくできました！" : "がんばったね！",
      text: `10もん中 ${s}もん いちどで せいかい！`,
      starKanji: karuta.earned,
    });
    return;
  }
  const entry = karuta.deck[karuta.index];
  karuta.firstTry = true;
  $("#karuta-progress").textContent = `${karuta.index + 1} / ${karuta.deck.length}もん`;
  renderClue($("#karuta-clue"), entry);

  const choices = shuffle([entry, ...pickDistractors(entry, 5)]);
  const box = $("#karuta-choices");
  box.innerHTML = "";
  for (const c of choices) {
    const btn = document.createElement("button");
    btn.className = "kanji-card";
    btn.textContent = c.k;
    btn.addEventListener("pointerdown", () => onKarutaPick(btn, c, entry));
    box.appendChild(btn);
  }
}

function onKarutaPick(btn, picked, entry) {
  if (btn.disabled) return;
  if (picked.k === entry.k) {
    btn.classList.add("correct");
    $$("#karuta-choices .kanji-card").forEach((b) => (b.disabled = true));
    if (karuta.firstTry) {
      karuta.score++;
      if (store.addStar(entry.k)) karuta.earned.push(entry.k);
      confetti(12);
    }
    speak(entry.y);
    setTimeout(() => {
      karuta.index++;
      nextKaruta();
    }, 1100);
  } else {
    karuta.firstTry = false;
    btn.classList.add("wrong");
    btn.disabled = true;
    setTimeout(() => btn.classList.remove("wrong"), 500);
  }
}

/* =========================================================
   かるた たいせん（ふたりで） さきに5まい
   ========================================================= */
const versus = { entry: null, score: [0, 0], locked: false, lockout: [false, false] };

function startVersus() {
  lastMode = startVersus;
  versus.score = [0, 0];
  versus.deck = shuffle(pool());
  versus.pos = 0;
  updateVsScore();
  showScreen("#scr-versus");
  nextVersus();
}

function updateVsScore() {
  $("#vs-score1").textContent = versus.score[0];
  $("#vs-score2").textContent = versus.score[1];
}

function nextVersus() {
  if (versus.pos >= versus.deck.length) {
    versus.deck = shuffle(pool());
    versus.pos = 0;
  }
  const entry = versus.deck[versus.pos++];
  versus.entry = entry;
  versus.locked = false;
  versus.lockout = [false, false];
  renderClue($("#versus-clue"), entry, { compact: true });

  const base = [entry, ...pickDistractors(entry, 3)];
  for (const [i, boxId] of ["#versus-choices1", "#versus-choices2"].entries()) {
    const box = $(boxId);
    box.innerHTML = "";
    for (const c of shuffle(base)) {
      const btn = document.createElement("button");
      btn.className = "kanji-card vs";
      btn.textContent = c.k;
      btn.addEventListener("pointerdown", () => onVersusPick(i, btn, c, entry));
      box.appendChild(btn);
    }
  }
}

function onVersusPick(player, btn, picked, entry) {
  if (versus.locked || versus.lockout[player] || btn.disabled) return;
  if (picked.k === entry.k) {
    versus.locked = true;
    btn.classList.add("correct");
    versus.score[player]++;
    updateVsScore();
    speak(entry.y);
    const panel = $$(".vs-panel")[player];
    panel.classList.add("won-round");
    setTimeout(() => panel.classList.remove("won-round"), 700);

    if (versus.score[player] >= 5) {
      const name = player === 0 ? "🌸 ひだりの ひと" : "🐳 みぎの ひと";
      setTimeout(() => {
        showResult({
          emoji: "🏆",
          title: `${name}の かち！`,
          text: `${versus.score[0]} 対 ${versus.score[1]}`,
        });
      }, 800);
    } else {
      setTimeout(nextVersus, 900);
    }
  } else {
    // おてつき: そのプレイヤーは少しのあいだ おやすみ
    versus.lockout[player] = true;
    btn.classList.add("wrong");
    const panel = $$(".vs-panel")[player];
    panel.classList.add("locked");
    setTimeout(() => {
      versus.lockout[player] = false;
      btn.classList.remove("wrong");
      panel.classList.remove("locked");
    }, 1500);
  }
}

/* =========================================================
   ことばづくり 8もん
   ========================================================= */
const kotoba = { deck: [], index: 0, slot: 0, firstTry: true, score: 0, earned: [] };

function startKotoba() {
  lastMode = startKotoba;
  // 現在の学年に合わせる: 両方の漢字が出題プールに入っていることばを優先
  const gset = new Set(pool().map((x) => x.k));
  let words = WORDS2.filter((x) => [...x.w].every((c) => gset.has(c)));
  if (words.length < 8) words = WORDS2; // 足りなければ全部から
  kotoba.deck = shuffle(words).slice(0, 8);
  kotoba.index = 0;
  kotoba.score = 0;
  kotoba.earned = [];
  showScreen("#scr-kotoba");
  nextKotoba();
}

function nextKotoba() {
  if (kotoba.index >= kotoba.deck.length) {
    const s = kotoba.score;
    showResult({
      emoji: s >= 7 ? "🏆" : s >= 4 ? "🎉" : "💪",
      title: s >= 7 ? "ことばはかせ！" : s >= 4 ? "よくできました！" : "がんばったね！",
      text: `8つの ことばの うち ${s}つ いちどで かんせい！`,
      starKanji: kotoba.earned,
    });
    return;
  }
  const word = kotoba.deck[kotoba.index];
  kotoba.slot = 0;
  kotoba.firstTry = true;
  $("#kotoba-progress").textContent = `${kotoba.index + 1} / ${kotoba.deck.length}もん`;

  $("#kotoba-clue").innerHTML = `
    <div class="clue-emoji">${word.e}</div>
    <div class="clue-yomi big">${word.y}
      <button class="speak-btn" aria-label="よみあげ">🔊</button>
    </div>`;
  $("#kotoba-clue .speak-btn").addEventListener("pointerdown", (ev) => {
    ev.stopPropagation();
    speak(word.y);
  });

  const slots = $("#kotoba-slots");
  slots.innerHTML = [...word.w]
    .map(() => '<span class="slot"></span>')
    .join('<span class="slot-plus">＋</span>');

  // タイル: 正解の2枚 + ダミー4枚
  const wordChars = [...word.w];
  const dummies = shuffle(KANJI.filter((x) => !wordChars.includes(x.k)))
    .slice(0, 4)
    .map((x) => x.k);
  const tiles = shuffle([...wordChars, ...dummies]);
  const box = $("#kotoba-tiles");
  box.innerHTML = "";
  for (const ch of tiles) {
    const btn = document.createElement("button");
    btn.className = "kanji-card tile";
    btn.textContent = ch;
    btn.addEventListener("pointerdown", () => onKotobaPick(btn, ch, word));
    box.appendChild(btn);
  }
}

function onKotobaPick(btn, ch, word) {
  if (btn.disabled) return;
  const need = [...word.w][kotoba.slot];
  if (ch === need) {
    btn.disabled = true;
    btn.classList.add("used");
    const slotEls = $$("#kotoba-slots .slot");
    slotEls[kotoba.slot].textContent = ch;
    slotEls[kotoba.slot].classList.add("filled");
    kotoba.slot++;
    if (kotoba.slot >= [...word.w].length) {
      // かんせい！
      if (kotoba.firstTry) {
        kotoba.score++;
        for (const c of word.w) {
          if (store.addStar(c)) kotoba.earned.push(c);
        }
      }
      confetti(14);
      speak(word.y);
      $("#kotoba-slots").classList.add("complete");
      setTimeout(() => {
        $("#kotoba-slots").classList.remove("complete");
        kotoba.index++;
        nextKotoba();
      }, 1200);
    }
  } else {
    kotoba.firstTry = false;
    btn.classList.add("wrong");
    setTimeout(() => btn.classList.remove("wrong"), 500);
  }
}

/* =========================================================
   かんじずかん
   ========================================================= */
let zukanGrade = 1;

function showZukan() {
  showScreen("#scr-zukan");
  renderZukan();
}

function renderZukan() {
  const stars = store.stars;
  const list = KANJI.filter((x) => x.g === zukanGrade);
  const grid = $("#zukan-grid");
  grid.innerHTML = "";
  for (const x of list) {
    const n = stars[x.k] || 0;
    const card = document.createElement("button");
    card.className = "zukan-card" + (n > 0 ? " collected" : "");
    card.innerHTML = `
      <span class="zk">${x.k}</span>
      <span class="zw">${x.w}</span>
      <span class="zs">${"⭐".repeat(n) || "・・・"}</span>`;
    card.addEventListener("pointerdown", () => speak(`${x.k === x.w ? "" : x.w + "、"}${x.y}`));
    grid.appendChild(card);
  }
  $$(".ztab").forEach((t) =>
    t.classList.toggle("active", Number(t.dataset.zg) === zukanGrade)
  );
}

function updateZukanProgress() {
  const stars = store.stars;
  const total = KANJI.length;
  const got = KANJI.filter((x) => stars[x.k] > 0).length;
  $("#zukan-progress").textContent = `あつめた かんじ ${got} / ${total}`;
}

/* ---------- 初期化 ---------- */
function updateGradeChips() {
  $$("#grade-chips .chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.grade === store.grade)
  );
}

function goHome() {
  updateZukanProgress();
  showScreen("#scr-home");
}

document.addEventListener("DOMContentLoaded", () => {
  updateGradeChips();
  updateZukanProgress();

  $$("#grade-chips .chip").forEach((c) =>
    c.addEventListener("pointerdown", () => {
      store.grade = c.dataset.grade;
      updateGradeChips();
    })
  );

  $("#btn-karuta").addEventListener("pointerdown", startKaruta);
  $("#btn-versus").addEventListener("pointerdown", startVersus);
  $("#btn-kotoba").addEventListener("pointerdown", startKotoba);
  $("#btn-zukan").addEventListener("pointerdown", showZukan);
  $("#btn-again").addEventListener("pointerdown", () => lastMode && lastMode());

  $$("[data-home]").forEach((b) => b.addEventListener("pointerdown", goHome));

  $$(".ztab").forEach((t) =>
    t.addEventListener("pointerdown", () => {
      zukanGrade = Number(t.dataset.zg);
      renderZukan();
    })
  );

  // ダブルタップ拡大の防止
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

  // オフライン用 Service Worker（https/localhost のときだけ）
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});
