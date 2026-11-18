/* スト6サポートツールAG
   - 技データ: data.js（公式サイトから取り込み）
   - 共有データ: shared.json（備考・ふりがな修正・通常技の映像区間・試合タグ）… GitHubに置いたものを全員が読む
   - 自分の変更: このブラウザの localStorage。「書き出し」で shared.json を作って公開する */
"use strict";
const DATA = window.SF6_DATA;
const OFFICIAL_MOVIE = (cid, code) => `https://www.streetfighter.com/6/assets/images/character/${cid}/skill/movie/${code}.mp4`;
const LS = "sf6-commentary-v2";

/* ---------- 小物 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hasKanji = s => /[一-鿿々]/.test(s || "");
const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return `${m}:${(t % 60).toFixed(1).padStart(4, "0")}`; };
const parseTime = s => { s = String(s || "").trim(); if (!s) return null; const p = s.split(":").map(Number); if (p.some(isNaN)) return null; return p.reduce((a, b) => a * 60 + b, 0); };
function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms); }
const kata2hira = s => String(s || "").replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = s => kata2hira(String(s || "").normalize("NFKC")).replace(/[\s・･、。!！?？「」（）()\-]/g, "").replace(/竜/g, "龍").toLowerCase();


/* ---------- 操作表記（テンキー／アイコン） ---------- */
const ARROW_DEG = { 6: 0, 3: 45, 2: 90, 1: 135, 4: 180, 7: 225, 8: 270, 9: 315 };
function arrowIcon(d) {
  if (d === "5") return `<span class="ic dir" title="ニュートラル"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><circle cx="10" cy="10" r="2.6" class="fg"/></svg></span>`;
  return `<span class="ic dir" title="${d}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><g transform="rotate(${ARROW_DEG[d]} 10 10)"><path class="fg" d="M4.5 10h8.2M9.6 6.2 13.6 10l-4 3.8" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg></span>`;
}
function btnIcon(str, kind) {
  const lv = { "弱": "l", "中": "m", "強": "h" }[str] || "any";
  const f = `${kind === "P" ? "punch" : "kick"}_${lv}`;
  const label = `${str || ""}${kind === "P" ? "パンチ" : "キック"}`;
  return `<img class="ic bimg" src="img/${f}.png" alt="${label}" title="${label}">`;
}
const ROT = `<span class="ic dir" title="1回転"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path class="fg" d="M14.6 7.2A5.4 5.4 0 1 0 15 11" fill="none" stroke-width="2.2" stroke-linecap="round"/><path class="fg" d="M15.8 4.2v3.6h-3.6" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
function cmdHTML(cmd, opt = {}) {
  cmd = String(cmd || ""); if (!cmd) return "";
  if (PREF.notation !== "icon") return esc(cmd);
  const re = /^(?:(1回転)|([1-9])(溜め)|([1-9])|(弱|中|強)?([PK])|(連打)|(\+|＋)|( ?→ ?)|( or )|(SP|AUTO|DI|DP)|(攻撃)|(投げ)|(弱|中|強))/;
  let out = "", buf = "";
  const flush = () => { if (buf.trim()) out += `<span class="ic txt">${esc(buf.trim())}</span>`; buf = ""; };
  // かっこ内の説明はそのまま文字で出す
  for (const part of cmd.split(/(（[^）]*）|\([^)]*\))/)) {
    if (!part) continue;
    if (/^[（(]/.test(part)) { buf += part; continue; }
    let i = 0, m;
    while (i < part.length) {
      const rest = part.slice(i);
      if ((m = rest.match(re))) {
        flush();
        if (m[1]) out += ROT;
        else if (m[2]) out += arrowIcon(m[2]) + `<span class="ic txt">溜め</span>`;
        else if (m[4]) out += arrowIcon(m[4]);
        else if (m[6]) out += btnIcon(m[5], m[6]);
        else if (m[7]) out += `<span class="ic txt">連打</span>`;
        else if (m[8]) out += `<span class="ic plus">+</span>`;
        else if (m[9]) out += `<span class="ic seq">▸</span>`;
        else if (m[10]) out += `<span class="ic txt">or</span>`;
        else if (m[11]) out += `<span class="ic mod m${m[11].toLowerCase()}">${m[11]}</span>`;
        else if (m[12]) out += `<span class="ic mod mall">攻撃</span>`;
        else if (m[13]) out += `<span class="ic mod mthrow">投げ</span>`;
        else if (m[14]) out += `<span class="ic mod ${{ "弱": "ml", "中": "mm", "強": "mh" }[m[14]]}">${m[14]}</span>`;
        i += m[0].length;
      } else { buf += rest[0]; i++; }
    }
  }
  flush();
  return `<span class="cmdicons${opt.big ? " big" : ""}">${out}</span>`;
}
const NORMAL_PREFIX = { s: ["5", ""], c: ["2", "2"], j: ["j.", "ジャンプ中"], v: ["垂直j.", "垂直ジャンプ中"] };
function normalCmd(v) {
  const p = NORMAL_PREFIX[v.key[0]]; const btn = BTN_JA[v.key.slice(1)];
  const classic = PREF.notation === "icon" ? cmdHTML((p[1] || "") + btn) : esc((v.key[0] === "s" ? "" : p[0]) + btn);
  // モダン：公式のモダン技表に載っている通常技だけモダンのコマンド。載っていないものはクラシック表記で表示
  if (PREF.ctrl === "modern") { const mc = v.mcmd || v.mnorm; return mc ? (PREF.notation === "icon" ? cmdHTML(mc) : esc(mc)) : `<span class="note">モダンでは出せない</span>`; }
  return classic;
}

/* ---------- データ索引 ---------- */
const CHARS = DATA.chars;
const CMAP = Object.fromEntries(CHARS.map(c => [c.id, c]));
const POS_SHORT = { s: "立", c: "屈", j: "J", v: "垂直J" };
const BTN_JA = { LP: "弱P", MP: "中P", HP: "強P", LK: "弱K", MK: "中K", HK: "強K" };
CHARS.forEach(c => c.normals.forEach(n => { n.long = n.label; n.label = POS_SHORT[n.key[0]] + BTN_JA[n.key.slice(1)]; }));
const ITEMS = {}; // id -> {item, cid, kind}
CHARS.forEach(c => { c.moves.forEach(m => ITEMS[m.id] = { item: m, cid: c.id, kind: "move" }); c.normals.forEach(n => ITEMS[n.id] = { item: n, cid: c.id, kind: "normal" }); });
const charName = id => CMAP[id]?.name || id;

/* ---------- 保存（共有 shared.json ＋ このブラウザの変更） ---------- */
const KEYS = ["notes", "nseg", "matches", "hotkeys", "recipes"];
const EMPTY = () => ({ notes: {}, nseg: {}, matches: {}, hotkeys: {}, recipes: {}, deleted: {}, deletedR: {} });
let SHARED = EMPTY();
let LOCAL = (() => { try { return Object.assign(EMPTY(), JSON.parse(localStorage.getItem(LS)) || {}); } catch (e) { return EMPTY(); } })();
let PREF = (() => { try { return JSON.parse(localStorage.getItem(LS + "-pref")) || {}; } catch (e) { return {}; } })();
function savePref() { try { localStorage.setItem(LS + "-pref", JSON.stringify(PREF)); } catch (e) {} }
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(LOCAL)); } catch (e) { toast("このブラウザに保存できませんでした"); } updatePills(); }
function merged() {
  const o = EMPTY();
  for (const k of KEYS) {
    o[k] = { ...SHARED[k] };
    for (const [id, v] of Object.entries(LOCAL[k] || {})) o[k][id] = (k === "notes" || k === "nseg") ? { ...(o[k][id] || {}), ...v } : v;
  }
  for (const id of Object.keys(LOCAL.deleted || {})) delete o.matches[id];
  for (const id of Object.keys(LOCAL.deletedR || {})) delete o.recipes[id];
  return o;
}
let M = merged();
function commit() { saveLocal(); M = merged(); }
function hasLocalChanges() { return [...KEYS, "deleted", "deletedR"].some(k => Object.keys(LOCAL[k] || {}).length); }
function updatePills() { $("#editPill").hidden = !PREF.edit; $("#dirtyPill").hidden = !hasLocalChanges(); }

/* 技の表示用データ（共有の備考・ふりがな修正を反映） */
function view(id) {
  const r = ITEMS[id]; if (!r) return null;
  const n = M.notes[id] || {};
  const mod = PREF.ctrl === "modern" && r.kind === "move";
  return { ...r.item, cid: r.cid, kind: r.kind, kana: n.kana ?? r.item.kana, cmd: mod ? (r.item.mcmd ?? "") : (n.cmd ?? r.item.cmd), cond: mod ? (r.item.mcond || (r.item.mcmd == null ? "（モダン操作の技表にない技）" : "")) : r.item.cond, note: n.note || "", ok: !!n.ok,
    video: r.kind === "move" ? OFFICIAL_MOVIE(r.cid, r.item.code) : "", seg: r.kind === "normal" ? normalSeg(r.cid, r.item.key) : null };
}
function setNote(id, patch) { LOCAL.notes[id] = { ...(LOCAL.notes[id] || {}), ...patch }; commit(); }
function normalSeg(cid, key) { const s = M.nseg[cid]; if (!s || !ytParse(s.yt)) return null; const seg = s.segs?.[key]; if (!seg || seg.s == null) return null; return { yt: s.yt, s: seg.s, e: seg.e ?? seg.s + 1.5 }; }
const movesOf = cid => (CMAP[cid]?.moves || []).map(m => view(m.id));
const normalsOf = cid => (CMAP[cid]?.normals || []).map(n => view(n.id));

/* ---------- YouTube ---------- */
function ytParse(url) {
  if (!url) return null; let u; try { u = new URL(String(url).trim()); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, ""); let id = "";
  if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (h === "youtube.com" || h === "music.youtube.com") { id = u.searchParams.get("v") || ""; const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{6,})/); if (m) id = m[2]; }
  if (!/^[\w-]{6,}$/.test(id)) return null;
  const tp = u.searchParams.get("t") || u.searchParams.get("start") || ""; let t = 0;
  if (/^\d+$/.test(tp)) t = +tp; else { const mm = tp.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/); if (mm) t = (+mm[1] || 0) * 3600 + (+mm[2] || 0) * 60 + (+mm[3] || 0); }
  return { id, t };
}
let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((res, rej) => {
    if (window.YT && YT.Player) return res();
    window.onYouTubeIframeAPIReady = () => res();
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = () => rej(new Error("YouTubeを読み込めませんでした")); document.head.appendChild(s);
  });
  return ytReady;
}
/* 共通プレイヤー：YouTube／動画ファイルを同じ操作で扱う */
class YTPlayer {
  constructor(host, id, start = 0, opts = {}) {
    this.ready = loadYT().then(() => new Promise(res => {
      this.p = new YT.Player(host, { videoId: id, playerVars: { start: Math.floor(start), rel: 0, playsinline: 1, modestbranding: 1, ...(opts.vars || {}) },
        events: { onReady: () => res(), onStateChange: e => opts.onState && opts.onState(e.data) } });
    }));
  }
  t() { try { return this.p?.getCurrentTime?.() || 0; } catch (e) { return 0; } }
  seek(t) { this.p?.seekTo?.(Math.max(0, t), true); }
  play() { this.p?.playVideo?.(); } pause() { this.p?.pauseVideo?.(); }
  paused() { try { return this.p?.getPlayerState?.() !== 1; } catch (e) { return true; } }
  rate(r) { this.p?.setPlaybackRate?.(r); }
  step(d) { this.pause(); this.seek(this.t() + d); }
  destroy() { try { this.p?.destroy?.(); } catch (e) {} }
}
class FilePlayer {
  constructor(video) { this.v = video; this.ready = Promise.resolve(); }
  t() { return this.v.currentTime; } seek(t) { this.v.currentTime = Math.max(0, t); }
  play() { this.v.play().catch(() => {}); } pause() { this.v.pause(); } paused() { return this.v.paused; }
  rate(r) { this.v.playbackRate = r; } step(d) { this.v.pause(); this.v.currentTime = Math.max(0, this.v.currentTime + d); } destroy() {}
}

/* ---------- 音声で答える（Chrome/Edge） ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const Mic = {
  rec: null, on: false, text: "", cb: null,
  start(cb) {
    if (!SR) return false; this.cb = cb; this.text = "";
    if (this.rec) { try { this.rec.abort(); } catch (e) {} }
    const r = new SR(); r.lang = "ja-JP"; r.interimResults = true; r.continuous = true;
    r.onresult = e => { let t = ""; for (const x of e.results) t += x[0].transcript; this.text = t; this.cb && this.cb(t); };
    r.onend = () => { if (this.on) { try { r.start(); } catch (e) {} } };
    r.onerror = e => { if (e.error === "not-allowed") { this.on = false; toast("マイクの使用が許可されていません"); } };
    this.rec = r; this.on = true; try { r.start(); } catch (e) {} return true;
  },
  reset() { this.text = ""; },
  stop() { this.on = false; try { this.rec?.stop(); } catch (e) {} this.rec = null; },
};
function judge(spoken, v) {
  const t = norm(spoken); if (!t) return null;
  const cands = [v.name, v.kana, v.name.replace(/（.*?）/g, "")].filter(Boolean).map(norm);
  return cands.some(c => c && (t.includes(c) || (c.length >= 4 && c.includes(t) && t.length >= c.length * 0.7)));
}

/* ---------- 画面切り替え ---------- */
const TABS = ["zukan", "combo", "quiz", "match", "data"];
let TAB = "zukan";
function route() {
  const t = (location.hash || "#zukan").slice(1); TAB = TABS.includes(t) ? t : "zukan";
  $$("nav a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === TAB ? "page" : "false"));
  cleanupMatch(); cleanupCombo(); Mic.stop(); render();
}
window.addEventListener("hashchange", route);
function render() { ({ zukan: renderZukan, combo: renderCombo, quiz: renderQuiz, match: renderMatch, data: renderData })[TAB](); updatePills(); }
function charBar(cur, attr = "data-char", withAll = false) {
  return `<div class="charbar" role="tablist" aria-label="キャラ">${withAll ? `<button ${attr}="all" aria-current="${cur === "all"}">全キャラ</button>` : ""}${CHARS.map(c => `<button ${attr}="${c.id}" aria-current="${c.id === cur}">${esc(c.name)}</button>`).join("")}</div>`;
}
function attrTag(a) { if (!a) return ""; const cls = /下/.test(a) ? "low" : /中/.test(a) ? "mid" : ""; return `<span class="attr ${cls}">${esc(a.replace("※", ""))}段</span>`; }

/* ---------- モーダル ---------- */
let modalCleanup = null;
function openModal(html, onClose) { if (modalCleanup) modalCleanup(); $("#dialog").innerHTML = html; $("#modal").classList.add("on"); modalCleanup = onClose || null; }
function closeModal() { if (modalCleanup) { modalCleanup(); modalCleanup = null; } $("#modal").classList.remove("on"); $("#dialog").innerHTML = ""; }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal").classList.contains("on")) closeModal(); });

/* =========================================================
   技図鑑
   ========================================================= */
const Z = { char: PREF.zChar || "ryu", cat: "すべて", hide: false, q: "" };
let io = null;
function renderZukan() {
  const c = CMAP[Z.char] || CHARS[0];
  const cats = ["すべて", "必殺技", "SA", "特殊技", "通常技"];
  const q = norm(Z.q);
  const match = v => !q || norm(v.name).includes(q) || norm(v.kana).includes(q) || norm(v.cmd || v.label || "").includes(q) || norm(v.note).includes(q);
  const moves = movesOf(c.id).filter(v => (Z.cat === "すべて" || Z.cat === v.cat) && match(v));
  const normals = (Z.cat === "すべて" || Z.cat === "通常技") ? normalsOf(c.id).filter(match) : [];
  const groups = ["必殺技", "SA", "特殊技"].map(k => [k, moves.filter(v => v.cat === k)]).filter(g => g[1].length);
  const unchecked = [...movesOf(c.id), ...normalsOf(c.id)].filter(v => hasKanji(v.name) && !v.ok).length;
  $("#main").innerHTML = `
    <div class="stack">
      ${charBar(c.id)}
      <div class="row" style="justify-content:space-between;align-items:flex-end">
        <div><span class="kana">${esc(c.kana)}</span><h1>${esc(c.name)}</h1></div>
        <div class="row">
          <input type="search" id="zq" value="${esc(Z.q)}" placeholder="技名・よみ・コマンドで検索" aria-label="検索" style="width:220px">
          <button class="btn small" id="zHide" aria-pressed="${Z.hide}">${Z.hide ? "名前を表示" : "名前を隠して覚える"}</button>
        </div>
      </div>
      <div class="chips">${cats.map(k => `<button class="chip" data-cat="${k}" aria-pressed="${k === Z.cat}">${k}</button>`).join("")}</div>
      ${unchecked && PREF.edit ? `<div class="note">ふりがなはClaudeが付けたもので、公式の読みではありません。確認したら技を開いて「確認済み」にしてください（未確認 ${unchecked}件）。</div>` : ""}
    </div>
    ${groups.map(([k, list]) => `<div class="sectionhead"><h2>${k}</h2><span class="note">${list.length}技</span></div>
      <div class="grid">${list.map(v => moveCard(v)).join("")}</div>`).join("")}
    ${normals.length ? `<div class="sectionhead"><h2>通常技</h2><span class="note">${normals.length}技　公式の映像はありません。データ管理でYouTubeの区間を登録すると映像付きになります</span></div>
      <div class="grid">${normals.map(v => normalCard(v)).join("")}</div>` : ""}
    ${!groups.length && !normals.length ? `<p class="note">該当する技がありません</p>` : ""}`;
  setupLazyVideos();
}
function moveCard(v) {
  return `<button class="card ${Z.hide ? "hidden" : ""}" data-open="${v.id}">
    <div class="media"><video data-src="${v.video}" muted loop playsinline preload="none"></video><span class="badge ${v.cat === "SA" ? "sa" : ""}">${v.cat}</span></div>
    <div class="body"><span class="kana">${esc(v.kana || " ")}</span><span class="nm">${esc(v.name)}</span>
      <span class="cmd">${cmdHTML(v.cmd)}${v.cond ? ` ${esc(v.cond)}` : ""}</span>${cardFrames(v)}${v.note ? `<span class="memo">${esc(v.note)}</span>` : ""}</div></button>`;
}
function normalCard(v) {
  return `<button class="card ${Z.hide ? "hidden" : ""}" data-open="${v.id}">
    <div class="media" style="flex-direction:column;gap:2px"><span class="btnlabel">${esc(v.label)}</span><span class="cmd">${normalCmd(v)}</span>
      <span class="fd">発生 ${esc(v.startup)}F${v.gadv ? `　ガード時 ${esc(v.gadv)}` : ""}${attrTag(v.attr)}</span>
      ${v.seg ? `<span class="badge" style="color:var(--good)">▶ 映像あり</span>` : ""}</div>
    <div class="body"><span class="nm">${esc(v.long)}</span><span class="kana" style="margin-top:2px">${esc(v.kana || " ")}</span><span class="nm sub">${esc(v.name)}</span>${v.note ? `<span class="memo">${esc(v.note)}</span>` : ""}</div></button>`;
}
function setupLazyVideos() {
  if (io) io.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else if (!v.paused) v.pause();
  }), { rootMargin: "100px" });
  $$("#main video[data-src]").forEach(v => io.observe(v));
}
document.addEventListener("click", e => {
  if (TAB !== "zukan") return;
  const ch = e.target.closest("[data-char]"); if (ch && $("#main").contains(ch)) { Z.char = ch.dataset.char; PREF.zChar = Z.char; savePref(); renderZukan(); window.scrollTo(0, 0); return; }
  const cat = e.target.closest("[data-cat]"); if (cat) { Z.cat = cat.dataset.cat; renderZukan(); return; }
  if (e.target.id === "zHide") { Z.hide = !Z.hide; renderZukan(); return; }
  const card = e.target.closest("[data-open]");
  if (card && $("#main").contains(card)) { if (Z.hide && card.classList.contains("hidden")) { card.classList.remove("hidden"); return; } openDetail(card.dataset.open); }
});
document.addEventListener("input", e => { if (TAB === "zukan" && e.target.id === "zq") { Z.q = e.target.value; const pos = e.target.selectionStart; renderZukan(); const s = $("#zq"); s.focus(); s.setSelectionRange(pos, pos); } });

/* フレームデータ表 */
function frameTable(v) {
  const F = v.frames || []; if (!F.length) return `<div class="note">公式のフレームデータに、この技の行はありません。</div>`;
  const H = DATA.frameCols;
  const adv = x => { const n = parseInt(String(x).replace(/[^\d+-]/g, ""), 10); return isNaN(n) ? "" : n > 0 ? "plus" : n < 0 ? "minus" : ""; };
  const hasV = F.some(r => r[0]);
  return `<div class="ftable"><table><thead><tr>${hasV ? "<th>種類</th>" : ""}<th>発生</th><th>持続</th><th>硬直</th><th>ヒット</th><th>ガード</th><th>キャンセル</th><th>ダメージ</th><th>補正</th><th title="${esc(H[8])}">Dゲージ<br>増(ヒット)</th><th title="${esc(H[9])}">Dゲージ<br>減(ガード)</th><th title="${esc(H[10])}">Dゲージ<br>減(パニッシュ)</th><th>SA</th><th>属性</th><th>備考</th></tr></thead>
    <tbody>${F.map(r => `<tr>${hasV ? `<td>${esc(r[0])}</td>` : ""}${r.slice(1).map((c, i) => `<td class="${i === 3 || i === 4 ? adv(c) : ""} ${i === 13 ? "fnote" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <div class="note">出典：CAPCOM公式サイト フレームデータ（${esc(DATA.framesUpdated || DATA.updated)}取得）。ヒット・ガードは硬直差（＋が有利）。</div>`;
}
/* カンタンフレーム解説：自分がこの技を出した側として読む */
const num = x => { const m = String(x ?? "").replace(/[＋]/g, "+").replace(/[－−]/g, "-").match(/[+-]?\d+/); return m ? parseInt(m[0], 10) : null; };
function speedWord(st) { return st <= 4 ? "最速クラス" : st <= 6 ? "速い" : st <= 9 ? "ふつう" : st <= 14 ? "やや遅い" : "遅い（見てから対応されやすい）"; }
function attrWord(a) {
  const o = [];
  if (/下/.test(a)) o.push("下段：相手はしゃがみガードが必要");
  if (/中/.test(a)) o.push("中段：相手は立ちガードが必要（しゃがみガード不可）");
  if (/^上|上・|※上/.test(a) && !/中/.test(a)) o.push("上段：立ち・しゃがみどちらでもガードできる");
  if (/弾/.test(a)) o.push("飛び道具");
  if (/投/.test(a)) o.push("投げ（ガード不能）");
  return o;
}
function cancelWord(c) {
  c = String(c || ""); if (!c) return "";
  if (/^C/.test(c)) return "必殺技・SAでキャンセルできる";
  if (/SA3/.test(c) && !/SA2/.test(c)) return "SA3（CA）でキャンセルできる";
  if (/SA2/.test(c)) return "SA2・SA3でキャンセルできる";
  if (/SA/.test(c)) return "SAでキャンセルできる";
  if (/\*/.test(c)) return "連打キャンセル・ターゲットコンボに対応";
  return "キャンセル：" + c;
}
function easyFrames(r, kind) {
  if (!r) return "";
  const st = num(r[1]); const hit = num(r[4]); const grd = num(r[5]); const out = [];
  if (st != null) out.push(`<li><b class="fbig">発生 ${st}F</b>　${speedWord(st)}${kind === "normal" && st <= 5 ? "。暴れ・割り込みにも使える速さ" : ""}</li>`);
  if (grd != null) {
    if (grd > 0) {
      const beat = grd + 3; // 相手が最速4Fを押しても、発生(有利+3)F以下ならこちらが先に当たる
      out.push(`<li><span class="adv plus">ガードされても +${grd} 有利</span>　こちらが先に動ける。次に出す技が<b>発生${beat}F以下</b>なら、相手が最速の4F技を押してもこちらが勝つ。${grd >= 2 ? "<b>投げ（発生5F）</b>も相手の4F技より先に決まる（投げ抜け・ジャンプ・バックステップには注意）。" : "投げは相手の最速技と相打ち〜負けになりやすい。"}</li>`);
    } else if (grd === 0) {
      out.push(`<li><span class="adv">ガードされたら ±0 五分</span>　お互い同時に動ける。速い技を押したほうが勝つ読み合い。</li>`);
    } else {
      const n = -grd;
      if (n >= 4) out.push(`<li><span class="adv minus">ガードされると ${grd} 不利・反撃確定</span>　相手の<b>発生${n}F以下の技</b>が確定で入る${n >= 7 ? "（中攻撃からのコンボも入る大きな隙）" : n >= 5 ? "（弱攻撃からのコンボが入る）" : "（最速の4F技だけ入る）"}。${n >= 12 ? "SAや強攻撃の大ダメージ反撃も入りやすい。" : ""}</li>`);
      else out.push(`<li><span class="adv minus">ガードされると ${grd} 少し不利</span>　確定反撃はないが、相手が先に動ける。続けて技を押すと相手の速い技に負けやすいので、ガードやパリィが無難。相手の投げにも注意。</li>`);
    }
  } else if (r[5]) out.push(`<li>ガード時：${esc(r[5])}</li>`);
  if (hit != null) out.push(`<li><span class="adv ${hit > 0 ? "plus" : hit < 0 ? "minus" : ""}">ヒット時 ${hit > 0 ? "+" : ""}${hit}</span>　${hit >= 4 ? `<b>発生${hit}F以下</b>の技なら目押しでつながる。` : hit > 0 ? "こちらが先に動けるが、目押しでつながる技はほぼない（最速でも4F）。そのまま攻め続けられる。" : hit === 0 ? "ヒットしても五分。" : "ヒットしても相手が先に動ける。"}</li>`);
  else if (/D/.test(r[4] || "")) out.push(`<li><span class="adv plus">ヒット時 ダウン</span>　相手が倒れるので起き攻めに行ける。</li>`);
  const cw = cancelWord(r[6]); if (cw) out.push(`<li>${cw}</li>`);
  attrWord(r[13] || "").forEach(a => out.push(`<li>${a}</li>`));
  if (/弾/.test(r[13] || "")) out.push(`<li class="note">飛び道具は、離れた位置でガードさせるほど有利になる（表の数値は近くで当てた場合）。</li>`);
  return `<ul class="easy">${out.join("")}</ul>`;
}
function easyBlock(v) {
  const F = v.frames || []; if (!F.length) return "";
  const labels = F.map((r, i) => r[0] || (F.length > 1 ? `${i + 1}` : ""));
  return `<div class="panel easybox"><div class="row" style="justify-content:space-between"><h2 style="margin:0">カンタンフレーム解説 <span class="note">（自分がこの技を出した場合）</span></h2>
    ${F.length > 1 ? `<div class="chips">${labels.map((l, i) => `<button class="chip" data-ev="${i}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("")}</div>` : ""}</div>
    <div id="easyBody">${easyFrames(F[0], v.kind)}</div>
    <div class="note">目安です。押した技の発生や相手キャラ・状況（パニッシュカウンター、距離など）で変わります。</div></div>`;
}
function cardFrames(v) {
  const r = (v.frames || []).find(x => num(x[1]) != null); if (!r) return "";
  const g = num(r[5]);
  return `<span class="fd">発生 ${num(r[1])}F${g != null ? `　ガード <span class="adv ${g > 0 ? "plus" : g < 0 ? "minus" : ""}">${g > 0 ? "+" : ""}${g}</span>` : ""}</span>`;
}
const firstStartup = v => (v.frames || []).map(r => r[1]).find(x => x && /\d/.test(x)) || "";

/* 技の詳細（大きな映像＋備考の編集） */
function openDetail(id) {
  const v = view(id); if (!v) return;
  const edit = !!PREF.edit;
  let player = null;
  const media = v.kind === "move" ? `<video id="dv" src="${v.video}" autoplay loop muted playsinline controls></video>`
    : v.seg ? `<div class="ytbox"><div id="dyt"></div></div>` : `<div class="banner">この通常技の映像はまだありません。「データ管理」→「通常技の映像」でYouTubeの区間を登録できます。</div>`;
  openModal(`<div class="wide"></div>
    <div class="row" style="justify-content:space-between"><div><span class="note">${esc(charName(v.cid))}／${esc(v.kind === "move" ? v.cat : "通常技")}</span>
      ${v.kind === "normal" ? `<div class="bigname">${esc(v.label)}</div><span class="kana" style="font-size:12px">${esc(v.kana)}</span><div>${esc(v.name)}</div>` : `<span class="kana" style="font-size:14px">${esc(v.kana)}</span><div class="bigname">${esc(v.name)}</div>`}</div>
      <button class="btn" data-close>閉じる</button></div>
    ${media}
    <div class="row">${v.kind === "move" || v.seg ? `<span class="note">速度</span>${[0.25, 0.5, 1].map(r => `<button class="btn small" data-rate="${r}" aria-pressed="${r === 1}">${r}倍</button>`).join("")}` : ""}
      <span class="note" style="margin-left:auto">${v.kind === "move" ? `${cmdHTML(v.cmd)} ${esc(v.cond)}` : `${normalCmd(v)}　` + `発生 ${esc(v.startup)}F ${v.gadv ? "／ガード時 " + esc(v.gadv) : ""}`} ${v.kind === "normal" ? attrTag(v.attr) : ""}</span></div>
    ${easyBlock(v)}
    <details class="panel"><summary><b>フレームデータの詳細</b> <span class="note">（開くと全項目の表を表示）</span></summary>${frameTable(v)}</details>
    <label class="note">実況用の備考${edit ? "" : "（編集はデータ管理で編集モードをオンに）"}
      <textarea id="dNote" rows="3" ${edit ? "" : "readonly"} placeholder="例：中距離の飛び道具。弾を撒いて相手を動かす起点">${esc(v.note)}</textarea></label>
    ${edit ? `<div class="row">${v.kind === "move" && PREF.ctrl !== "modern" ? `<label class="note row">コマンド <input type="text" id="dCmd" value="${esc(v.cmd)}" style="width:200px" title="例 236P、4溜め6P、強P長押し"></label>` : ""}<label class="note row">ふりがな <input type="text" id="dKana" value="${esc(v.kana)}" style="width:220px"></label>
      <label class="row note"><input type="checkbox" id="dOk" ${v.ok ? "checked" : ""}> 確認済み</label>
      <button class="btn primary" id="dSave">保存</button></div>` : ""}
    ${v.kind === "move" ? `<div class="note">映像：CAPCOM公式サイトのコマンドリストより</div>` : ""}`,
    () => { player?.destroy(); });
  const setRate = r => { if (v.kind === "move") $("#dv").playbackRate = r; else player?.rate(r); $$("[data-rate]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.rate === r)); };
  $$("[data-rate]").forEach(b => b.onclick = () => setRate(+b.dataset.rate));
  $$("[data-ev]").forEach(b => b.onclick = () => { $("#easyBody").innerHTML = easyFrames(v.frames[+b.dataset.ev], v.kind); $$("[data-ev]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  if (v.kind === "normal" && v.seg) {
    const p = ytParse(v.seg.yt);
    player = new YTPlayer($("#dyt"), p.id, v.seg.s, { vars: { autoplay: 1, mute: 1, start: Math.floor(v.seg.s), end: Math.ceil(v.seg.e) }, onState: st => { if (st === 0) { player.seek(v.seg.s); player.play(); } } });
    player.ready.then(() => { player.seek(v.seg.s); player.play(); });
    const iv = setInterval(() => { if (player.t() > v.seg.e) player.seek(v.seg.s); }, 100);
    const prev = modalCleanup; modalCleanup = () => { clearInterval(iv); prev && prev(); };
  }
  if (edit) $("#dSave").onclick = () => { const patch = { note: $("#dNote").value.trim(), kana: $("#dKana").value.trim(), ok: $("#dOk").checked };
    if ($("#dCmd")) { const c = $("#dCmd").value.trim(); if (c !== ITEMS[id].item.cmd) patch.cmd = c; else patch.cmd = undefined; }
    setNote(id, patch); toast("このブラウザに保存しました。全員に反映するにはデータ管理から書き出してください", 3500); closeModal(); render(); };
}

/* =========================================================
   クイズ
   ========================================================= */
const QMODES = {
  video: "公式映像を見て → 技名を選ぶ",
  say: "公式映像を見て → 技名を声に出す",
  note: "備考を読んで → 技名を選ぶ",
  cmd: "コマンドを見て → 技名を選ぶ",
  kana: "技名を見て → 読みを選ぶ",
  nName: "通常技：技名 → どのボタン？",
  nBtn: "通常技：ボタン → 技名は？",
  nVideo: "通常技：映像 → どのボタン？",
};
const Q = { cfg: { char: PREF.qChar || "ryu", mode: "video", count: 10, cats: { 必殺技: true, SA: true, 特殊技: true } }, list: [], i: 0, score: 0, ans: false, started: false, revealed: false, player: null };
function qPool(mode, cid) {
  const chars = cid === "all" ? CHARS : [CMAP[cid]];
  const out = [];
  chars.forEach(c => {
    if (["nName", "nBtn", "nVideo"].includes(mode)) normalsOf(c.id).forEach(v => { if (mode === "nVideo" && !v.seg) return; out.push(v); });
    else movesOf(c.id).forEach(v => {
      if (!Q.cfg.cats[v.cat]) return;
      if (mode === "note" && !v.note) return; if (mode === "cmd" && !v.cmd) return; if (mode === "kana" && !(v.kana && hasKanji(v.name))) return;
      out.push(v);
    });
  });
  return out;
}
const qKey = (mode, v) => mode === "kana" ? v.kana : (mode === "nName" || mode === "nVideo") ? v.label : v.name;
function qChoices(it, pool) {
  const mode = Q.cfg.mode, key = v => qKey(mode, v);
  const okCmd = v => mode !== "cmd" || (v.cmd + v.cond) !== (it.cmd + it.cond);
  const cands = shuffle(pool.filter(v => v.id !== it.id && v.cid === it.cid && key(v) && key(v) !== key(it) && okCmd(v)))
    .concat(shuffle(pool.filter(v => v.cid !== it.cid && key(v) && key(v) !== key(it))));
  const seen = new Set([key(it)]), out = [];
  for (const v of cands) { if (!seen.has(key(v))) { seen.add(key(v)); out.push(v); } if (out.length === 3) break; }
  return shuffle([it, ...out]);
}
function renderQuiz() {
  Q.player?.destroy(); Q.player = null;
  const w = $("#main");
  if (!Q.started) {
    const counts = Object.fromEntries(Object.keys(QMODES).map(k => [k, qPool(k, Q.cfg.char).length]));
    w.innerHTML = `<div class="quizwrap">
      <div><h1>クイズ</h1><p class="note">公式の技映像・技名・備考から出題します。答えは技名とふりがなで表示します。</p></div>
      <div class="panel setup">
        <label>キャラ<select id="qChar"><option value="all" ${Q.cfg.char === "all" ? "selected" : ""}>全キャラ</option>${CHARS.map(c => `<option value="${c.id}" ${Q.cfg.char === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label>出題のしかた<select id="qMode">${Object.entries(QMODES).map(([k, t]) => `<option value="${k}" ${Q.cfg.mode === k ? "selected" : ""} ${counts[k] < 2 ? "disabled" : ""}>${t}（${counts[k]}問）</option>`).join("")}</select></label>
        <label>問題数<select id="qCount">${[5, 10, 20, 50].map(n => `<option ${Q.cfg.count === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">出題する区分
          <div class="row">${["必殺技", "SA", "特殊技"].map(k => `<label class="row" style="color:var(--ink)"><input type="checkbox" data-qcat="${k}" ${Q.cfg.cats[k] ? "checked" : ""}> ${k}</label>`).join("")}</div></div>
      </div>
      ${Q.cfg.mode === "say" ? `<div class="banner">映像を見て技名を声に出し、<kbd>Enter</kbd>で答えを確認します。${SR ? "マイクをオンにすると、話した言葉で自動判定します（Chrome／Edge）。" : "このブラウザは音声認識に対応していないため、正解かどうかは自分で選びます。"}</div>` : ""}
      ${counts.nVideo < 2 ? `<div class="note">「通常技：映像」は、データ管理で通常技のYouTube区間を登録すると使えます。</div>` : ""}
      <div class="row"><button class="btn primary" id="qStart">はじめる</button><span class="note">キー操作：<kbd>1</kbd>〜<kbd>4</kbd> で回答、<kbd>Enter</kbd> で次へ</span></div></div>`;
    return;
  }
  if (Q.i >= Q.list.length) {
    w.innerHTML = `<div class="quizwrap"><div class="qcard" style="text-align:center"><div class="note">${esc(QMODES[Q.cfg.mode])}</div>
      <div class="bigname">${Q.score} / ${Q.list.length} 正解</div><div class="note">${Math.round(Q.score / Q.list.length * 100)}%</div>
      ${Q.miss?.length ? `<div class="note" style="text-align:left">間違えた技：${Q.miss.map(v => `${esc(v.name)}${v.kana ? `（${esc(v.kana)}）` : ""}`).join("、")}</div>` : ""}
      <div class="row" style="justify-content:center"><button class="btn primary" id="qAgain">もう一度</button><button class="btn" id="qBack">設定に戻る</button></div></div></div>`;
    return;
  }
  const it = Q.list[Q.i], mode = Q.cfg.mode;
  let prompt = "";
  if (mode === "video" || mode === "say") prompt = `<video id="qv" src="${it.video}" autoplay loop muted playsinline></video>`;
  else if (mode === "note") prompt = `<div>${esc(it.note).replace(/\n/g, "<br>")}</div>`;
  else if (mode === "cmd") prompt = `<div><div style="font-family:var(--display);font-size:30px">${cmdHTML(it.cmd, { big: true })}</div><div class="note">${esc(it.cond)}</div></div>`;
  else if (mode === "kana") prompt = `<div><div style="font-family:var(--display);font-size:34px">${esc(it.name)}</div><div class="note">この技名の読みは？</div></div>`;
  else if (mode === "nName") prompt = `<div><div class="note">この通常技はどのボタン？</div><span class="kana" style="font-size:14px">${esc(it.kana)}</span><div style="font-family:var(--display);font-size:32px">${esc(it.name)}</div></div>`;
  else if (mode === "nBtn") prompt = `<div><div class="note">この通常技の名前は？</div><div style="font-family:var(--display);font-size:38px">${esc(it.label)}</div><div>${normalCmd(it)}</div></div>`;
  else if (mode === "nVideo") prompt = `<div class="ytbox"><div id="qyt"></div></div>`;
  const answer = `<div class="answer"><div class="note">${esc(charName(it.cid))}／${esc(it.kind === "move" ? it.cat : "通常技")}${it.cmd ? "／" + cmdHTML(it.cmd) : it.kind === "normal" ? "／" + normalCmd(it) : ""} ${esc(it.cond || "")}</div>
    ${it.kind === "normal" ? `<div class="bigname">${esc(it.label)}</div><div class="bigkana">${esc(it.kana || "")}</div><div>${esc(it.name)}</div>` : `<div class="bigkana">${esc(it.kana || "")}</div><div class="bigname">${esc(it.name)}</div>`}${it.note && mode !== "note" ? `<div style="margin-top:6px">${esc(it.note).replace(/\n/g, "<br>")}</div>` : ""}</div>`;
  const head = `<div class="qhead"><span>${esc(charName(it.cid))}</span><span>${Q.i + 1} / ${Q.list.length}　正解 ${Q.score}</span></div>`;
  if (mode === "say") {
    w.innerHTML = `<div class="quizwrap"><div class="qcard">${head}<div class="prompt">${prompt}</div>
      ${SR ? `<div class="row"><button class="btn small" id="qMic" aria-pressed="${!!PREF.mic}">🎤 マイク ${PREF.mic ? "オン" : "オフ"}</button><div class="mic ${Q.judge === true ? "ok" : Q.judge === false ? "ng" : ""}" id="qHeard" style="flex:1">${PREF.mic ? (Mic.text ? `聞こえた言葉：${esc(Mic.text)}` : "技名を言ってください…") : "マイクをオンにすると自動で判定します"}</div></div>` : ""}
      ${Q.revealed ? answer + `<div class="row" style="justify-content:space-between"><button class="btn" id="qQuit">終了</button>
        <div class="row">${Q.judge == null ? `<button class="btn" id="qNg">言えなかった</button><button class="btn primary" id="qOk">言えた（Enter）</button>` : `<span class="${Q.judge ? "s1" : "s2"}">${Q.judge ? "○ 正解" : "× 不正解"}</span><button class="btn primary" id="qNext">次へ（Enter）</button>`}</div></div>`
        : `<div class="row" style="justify-content:flex-end"><button class="btn primary" id="qReveal">答えを見る（Enter）</button></div>`}</div></div>`;
    if (PREF.mic && !Q.revealed && SR) Mic.start(t => { const h = $("#qHeard"); if (h) h.textContent = "聞こえた言葉：" + t; if (judge(t, it)) { Q.judge = true; reveal(); } });
    return;
  }
  w.innerHTML = `<div class="quizwrap"><div class="qcard">${head}<div class="prompt">${prompt}</div>
    <div class="choices">${it.choices.map((c, k) => { let cls = ""; if (Q.ans) { if (c.id === it.id) cls = "right"; else if (k === Q.picked) cls = "wrong"; }
      const label = mode === "kana" ? esc(c.kana) : (mode === "nName" || mode === "nVideo") ? esc(c.label) : `${Q.ans && c.kana ? `<span class="kana">${esc(c.kana)}</span>` : ""}${esc(c.name)}`;
      return `<button class="choice ${cls}" data-k="${k}" ${Q.ans ? "disabled" : ""}><span class="n">${k + 1}</span>${label}</button>`; }).join("")}</div>
    ${Q.ans ? answer + `<div class="row" style="justify-content:space-between"><button class="btn" id="qQuit">終了</button><button class="btn primary" id="qNext">次へ（Enter）</button></div>` : ""}</div></div>`;
  if (mode === "nVideo") { const p = ytParse(it.seg.yt); Q.player = new YTPlayer($("#qyt"), p.id, it.seg.s, { vars: { autoplay: 1, mute: 1, controls: 0 } }); const s = it.seg; Q.iv = setInterval(() => { if (Q.player && Q.player.t() > s.e) Q.player.seek(s.s); }, 100); }
}
function reveal() { Q.revealed = true; Mic.stop(); if (Q.judge === true) Q.score++; renderQuiz(); }
function qStart() {
  const pool = qPool(Q.cfg.mode, Q.cfg.char); if (pool.length < 2) { toast("出題できる技が足りません"); return; }
  Q.list = shuffle(pool).slice(0, Q.cfg.count).map(v => ({ ...v, choices: Q.cfg.mode === "say" ? [] : qChoices(v, pool) }));
  Object.assign(Q, { i: 0, score: 0, ans: false, revealed: false, judge: null, started: true, miss: [] }); renderQuiz();
}
function qAnswer(k) { if (Q.ans || Q.cfg.mode === "say") return; const it = Q.list[Q.i]; Q.picked = k; Q.ans = true; if (it.choices[k].id === it.id) Q.score++; else Q.miss.push(it); renderQuiz(); }
function qNext() { clearInterval(Q.iv); Mic.stop(); Q.i++; Object.assign(Q, { ans: false, revealed: false, judge: null }); Mic.reset(); renderQuiz(); }
document.addEventListener("change", e => {
  if (TAB !== "quiz") return;
  if (e.target.id === "qChar") { Q.cfg.char = e.target.value; PREF.qChar = Q.cfg.char; savePref(); renderQuiz(); }
  if (e.target.id === "qMode") { Q.cfg.mode = e.target.value; renderQuiz(); }
  if (e.target.id === "qCount") Q.cfg.count = +e.target.value;
  if (e.target.dataset.qcat) { Q.cfg.cats[e.target.dataset.qcat] = e.target.checked; renderQuiz(); }
});
document.addEventListener("click", e => {
  if (TAB !== "quiz") return;
  const ch = e.target.closest(".choice"); if (ch) { qAnswer(+ch.dataset.k); return; }
  const id = e.target.closest("button")?.id;
  if (id === "qStart" || id === "qAgain") qStart();
  else if (id === "qBack" || id === "qQuit") { clearInterval(Q.iv); Mic.stop(); Q.started = false; renderQuiz(); }
  else if (id === "qNext") qNext();
  else if (id === "qReveal") reveal();
  else if (id === "qOk") { Q.judge = true; Q.score++; renderQuiz(); }
  else if (id === "qNg") { Q.judge = false; Q.miss.push(Q.list[Q.i]); renderQuiz(); }
  else if (id === "qMic") { PREF.mic = !PREF.mic; savePref(); if (!PREF.mic) Mic.stop(); renderQuiz(); }
});
document.addEventListener("keydown", e => {
  if (TAB !== "quiz" || !Q.started || $("#modal").classList.contains("on")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (Q.i >= Q.list.length) return;
  if (/^[1-4]$/.test(e.key)) qAnswer(+e.key - 1);
  if (e.key === "Enter") {
    e.preventDefault();
    if (Q.cfg.mode === "say") { if (!Q.revealed) reveal(); else if (Q.judge == null) { Q.judge = true; Q.score++; renderQuiz(); } else qNext(); }
    else if (Q.ans) qNext();
  }
});

/* =========================================================
   試合で実況練習
   ========================================================= */
const G = { cur: PREF.gMatch || null, mode: "edit", side: 1, q: "", dur: 2.5, rate: 1, pauseOnTag: !!PREF.pauseOnTag, lag: PREF.lag ?? 0.2,
  player: null, raf: 0, localUrl: {}, pending: null, lastT: 0, heard: "", judged: null };
function cleanupMatch() { cancelAnimationFrame(G.raf); G.player?.destroy(); G.player = null; G.pending = null; }
const matchesSorted = () => Object.entries(M.matches).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
function editMatch(id, fn) { const m = JSON.parse(JSON.stringify(M.matches[id])); fn(m); LOCAL.matches[id] = m; delete LOCAL.deleted[id]; commit(); }
function hotkeysOf(cid) { return (M.hotkeys[cid] || []).filter(id => ITEMS[id]).slice(0, 9); }
function itemsFor(cid) { return [...movesOf(cid), ...normalsOf(cid)]; }
function gLeftHTML() {
  const list = matchesSorted();
  return `<button class="btn primary" id="gNew">＋ 試合を登録</button>
    <div class="mlist">${list.map(([id, m]) => `<button class="matchitem" data-match="${id}" aria-current="${id === G.cur}">${esc(m.name || "無題の試合")}<small>${esc(charName(m.p1))} vs ${esc(charName(m.p2))}・タグ${(m.tags || []).length}${LOCAL.matches[id] ? "・未公開" : ""}</small></button>`).join("") || `<p class="note">まだ試合がありません</p>`}</div>`;
}
function gRightHTML(mt) {
  const sideCid = G.side === 1 ? mt.p1 : mt.p2;
  const q = norm(G.q);
  const hk = hotkeysOf(sideCid);
  const items = itemsFor(sideCid).filter(v => !q || norm(v.name).includes(q) || norm(v.kana).includes(q) || norm(v.cmd || v.label).includes(q));
  const pick = (v, k) => { const hi = hk.indexOf(v.id); return `<div class="pick ${k === 0 && q ? "first" : ""}" data-pick="${v.id}" role="button" tabindex="0"><span class="hk">${hi >= 0 ? hi + 1 : ""}</span><span>${v.kind === "normal" ? `<b>${esc(v.label)}</b> <small class="note">${esc(v.name)}</small>` : esc(v.name)}</span><span class="c">${v.kind === "move" ? (v.cmd ? cmdHTML(v.cmd) : esc(v.cat)) : normalCmd(v)}</span><button class="star ${hi >= 0 ? "on" : ""}" data-star="${v.id}" title="1〜9キーに割り当て" aria-label="キーに割り当て">★</button></div>`; };
  const tags = (mt.tags || []).slice().sort((a, b) => a.t - b.t);
  return `${G.mode === "edit" ? `<div class="panel">
        <h2 style="margin:0">技名タグを付ける</h2>
        <div class="seg"><button data-side="1" aria-pressed="${G.side === 1}">P1 ${esc(charName(mt.p1))}</button><button class="p2" data-side="2" aria-pressed="${G.side === 2}">P2 ${esc(charName(mt.p2))}</button></div>
        <input type="search" id="gq" value="${esc(G.q)}" placeholder="技名・よみ・コマンドで絞り込み（Enterで先頭）" aria-label="技を検索">
        <div class="picklist">${items.map(pick).join("")}</div>
        <div class="row note"><label class="row"><input type="checkbox" id="gPause" ${G.pauseOnTag ? "checked" : ""}> タグを付けたら一時停止</label>
          <label class="row">反応の遅れを補正 <select id="gLag">${[0, 0.2, 0.4, 0.6].map(n => `<option value="${n}" ${n === G.lag ? "selected" : ""}>${n}秒</option>`).join("")}</select></label></div>
        <div class="note"><kbd>Tab</kbd> でP1／P2切り替え、★を付けた技は <kbd>1</kbd>〜<kbd>9</kbd> キーで一発タグ付け。</div>
      </div>` : ""}
      <div class="panel">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">タグ一覧（${tags.length}）</h2>
          <div class="row"><button class="btn small" id="gEdit">試合の編集</button><button class="btn small danger" id="gDel">削除</button></div></div>
        <div class="taglist">${tags.map(t => { const v = view(t.ref); return `<div class="tag"><button class="t" data-seek="${t.t}">${fmt(t.t)}</button><span><span class="${t.side === 2 ? "s2" : "s1"}">P${t.side}</span> ${esc(v ? (v.kind === "normal" ? v.label : v.name) : t.name)}</span>${G.mode === "edit" ? `<button class="btn small" data-deltag="${t.id}" aria-label="削除">✕</button>` : "<span></span>"}</div>`; }).join("") || `<div class="note">まだタグがありません</div>`}</div>
      </div>`;
}
function renderMatch() {
  cleanupMatch();
  const list = matchesSorted();
  if (!G.cur || !M.matches[G.cur]) G.cur = list[0]?.[0] || null;
  const mt = G.cur ? M.matches[G.cur] : null;
  const left = `<div class="panel" id="gLeft">${gLeftHTML()}</div>`;
  if (!mt) {
    $("#main").innerHTML = `<div class="matchgrid">${left}<div class="stack"><h1>試合で実況練習</h1>
      <div class="banner">YouTubeの試合動画（または手元の動画ファイル）に「この瞬間にこの技」というタグを付けておくと、再生中にその技名がふりがな付きで表示されます。「答え合わせ」モードでは技の瞬間に動画が自動で止まるので、技名を声に出してから答えを確認できます。</div></div></div>`;
    return;
  }
  const yt = ytParse(mt.yt);
  const fileUrl = G.localUrl[G.cur];
  const startT = PREF["lastT-" + G.cur] ?? yt?.t ?? 0;
  $("#main").innerHTML = `<div class="matchgrid">${left}
    <div class="stack">
      <div class="row" style="justify-content:space-between">
        <div><h1>${esc(mt.name || "無題の試合")}</h1><div class="note"><span class="s1">P1 ${esc(charName(mt.p1))}</span>　vs　<span class="s2">P2 ${esc(charName(mt.p2))}</span></div></div>
        <div class="seg" role="group" aria-label="モード">
          <button data-gmode="edit" aria-pressed="${G.mode === "edit"}">タグ付け</button>
          <button data-gmode="show" aria-pressed="${G.mode === "show"}">実況練習</button>
          <button data-gmode="quiz" aria-pressed="${G.mode === "quiz"}">答え合わせ</button></div>
      </div>
      <div class="player">
        ${yt ? `<div id="ytHost"></div>` : fileUrl ? `<video id="gv" src="${fileUrl}" playsinline controls></video>`
          : `<div class="empty"><div>この試合の動画を開いてください</div><label class="btn primary">動画ファイルを選ぶ<input type="file" accept="video/*" id="gFile" hidden></label><div class="note">YouTubeの場合は「試合の編集」でURLを登録してください</div></div>`}
        <div class="ov" id="ov"></div>
      </div>
      <div class="ctrl">
        <button class="btn small" id="gPlay">▶／❚❚ <kbd>Space</kbd></button>
        <button class="btn small" data-jump="-3">−3秒 <kbd>←</kbd></button><button class="btn small" data-jump="-0.5">−0.5</button>
        <button class="btn small" data-step="-1">◀ 1コマ <kbd>,</kbd></button><button class="btn small" data-step="1">1コマ ▶ <kbd>.</kbd></button>
        <button class="btn small" data-jump="0.5">+0.5</button><button class="btn small" data-jump="3">+3秒 <kbd>→</kbd></button>
        <span class="note" style="margin-left:6px">速度</span>${[0.25, 0.5, 0.75, 1].map(r => `<button class="btn small" data-grate="${r}" aria-pressed="${G.rate === r}">${r}</button>`).join("")}
        <span class="note" id="gClock" style="margin-left:auto;font-variant-numeric:tabular-nums">0:00.0</span>
      </div>
      ${G.mode === "quiz" ? `<div class="banner">タグの瞬間で自動的に止まります。技名を声に出してから <kbd>Enter</kbd> で答えを表示、もう一度 <kbd>Enter</kbd> で再開します。${SR ? `<button class="btn small" id="gMic" aria-pressed="${!!PREF.mic}" style="margin-left:8px">🎤 マイク判定 ${PREF.mic ? "オン" : "オフ"}</button>` : ""}</div>` : ""}
      ${G.mode === "show" ? `<div class="row note"><label class="row">表示時間 <select id="gDur">${[1.5, 2.5, 3.5, 5].map(n => `<option ${n === G.dur ? "selected" : ""}>${n}</option>`).join("")}</select>秒</label>　技名と一緒に備考も表示します</div>` : ""}
      ${yt ? `<div class="note">キー操作が効かないときは、動画の外（このあたり）を一度クリックしてください。</div>` : ""}
    </div>
    <div class="stack rightcol" id="gRight">${gRightHTML(mt)}</div></div>`;
  if (yt) { G.player = new YTPlayer($("#ytHost"), yt.id, startT); G.player.ready.then(() => G.player && G.player.rate(G.rate)); }
  else if (fileUrl) { G.player = new FilePlayer($("#gv")); G.player.rate(G.rate); }
  G.lastT = startT;
  if (G.player) loop();
}
function curTags() { const mt = M.matches[G.cur]; return (mt?.tags || []); }
function capHTML(t, hidden) {
  const v = view(t.ref); const mt = M.matches[G.cur];
  const who = `P${t.side} ${charName(t.side === 2 ? mt.p2 : mt.p1)}`;
  if (hidden) return `<div class="cap ${t.side === 2 ? "p2" : ""}"><div class="who">${esc(who)}</div><div class="nm">？</div>${PREF.mic && SR ? `<div class="judge note">${esc(G.heard || "技名を言ってください…")}</div>` : `<div class="judge note">技名を言って <kbd>Enter</kbd></div>`}</div>`;
  const j = G.mode === "quiz" && PREF.mic && SR ? `<div class="judge ${G.judged ? "s1" : "s2"}">${G.judged ? "○ 正解" : `× 聞こえた言葉：${esc(G.heard || "（なし）")}`}</div>` : "";
  return `<div class="cap ${t.side === 2 ? "p2" : ""}"><div class="who">${esc(who)}</div>${v?.kind === "normal" ? `<div class="nm">${esc(v.label)}</div><div class="k">${esc(v.name)}</div>` : `${v?.kana ? `<div class="k">${esc(v.kana)}</div>` : ""}<div class="nm">${esc(v?.name || t.name)}</div>`}${v?.note && G.mode !== "edit" ? `<div class="memo">${esc(v.note.split("\n")[0])}</div>` : ""}${j}</div>`;
}
function loop() {
  let last = "", lastClock = "";
  const tick = () => {
    if (!G.player) return;
    const t = G.player.t(); const tags = curTags();
    // 答え合わせ：タグの瞬間で止める
    if (G.mode === "quiz" && !G.pending && !G.player.paused()) {
      const hit = tags.filter(g => g.t > G.lastT && g.t <= t + 0.03).sort((a, b) => a.t - b.t)[0];
      if (hit && t - G.lastT < 1.5) { G.player.pause(); G.player.seek(hit.t); G.pending = { tag: hit, revealed: false }; G.heard = ""; G.judged = null;
        if (PREF.mic && SR) Mic.start(txt => { G.heard = txt; if (G.pending && !G.pending.revealed && judge(txt, view(hit.ref) || { name: hit.name })) { G.judged = true; revealPending(); } }); }
    }
    G.lastT = t;
    let html = "";
    if (G.pending) html = capHTML(G.pending.tag, !G.pending.revealed);
    else if (G.mode !== "quiz") html = tags.filter(g => t >= g.t && t < g.t + G.dur).sort((a, b) => a.side - b.side).map(g => capHTML(g, false)).join("");
    if (html !== last) { const ov = $("#ov"); if (ov) ov.innerHTML = html; last = html; }
    const c = fmt(t); if (c !== lastClock) { const el = $("#gClock"); if (el) el.textContent = c; lastClock = c; }
    G.raf = requestAnimationFrame(tick);
  };
  G.raf = requestAnimationFrame(tick);
}
function revealPending() { if (!G.pending) return; G.pending.revealed = true; Mic.stop(); if (G.judged == null && PREF.mic && SR) G.judged = false; }
function resumePending() { const p = G.pending; G.pending = null; G.lastT = p.tag.t + 0.01; G.player?.play(); }
function addTag(ref) {
  if (!G.player) { toast("先に動画を開いてください"); return; }
  const v = view(ref); const t = Math.max(0, Math.round((G.player.t() - G.lag) * 10) / 10);
  editMatch(G.cur, m => { m.tags = (m.tags || []).concat([{ id: uid(), t, side: G.side, ref, name: v?.name || "" }]); m.lastT = t; });
  if (G.pauseOnTag) G.player.pause();
  G.q = ""; refreshMatchSide(); toast(`${fmt(t)} P${G.side}「${v?.name}」`, 1400);
}
/* 動画を作り直さずに左右の欄だけ更新 */
function refreshMatchSide() {
  const mt = M.matches[G.cur]; if (!mt) return renderMatch();
  const l = $("#gLeft"), r = $("#gRight"); if (!l || !r) return renderMatch();
  l.innerHTML = gLeftHTML(); r.innerHTML = gRightHTML(mt);
}
document.addEventListener("click", e => {
  if (TAB !== "match") return;
  const t = e.target;
  const mi = t.closest("[data-match]"); if (mi) { saveLastT(); G.cur = mi.dataset.match; PREF.gMatch = G.cur; savePref(); renderMatch(); return; }
  if (t.closest("#gNew")) { matchForm(); return; }
  if (t.closest("#gEdit")) { matchForm(G.cur); return; }
  if (t.closest("#gDel")) { delMatch(); return; }
  const gm = t.closest("[data-gmode]"); if (gm) { saveLastT(); G.mode = gm.dataset.gmode; Mic.stop(); renderMatch(); return; }
  const sd = t.closest("[data-side]"); if (sd) { G.side = +sd.dataset.side; refreshMatchSide(); return; }
  const st = t.closest("[data-star]"); if (st) { toggleHotkey(st.dataset.star); return; }
  const pk = t.closest("[data-pick]"); if (pk) { addTag(pk.dataset.pick); return; }
  const sk = t.closest("[data-seek]"); if (sk && G.player) { G.pending = null; G.player.seek(Math.max(0, +sk.dataset.seek - 0.5)); G.lastT = +sk.dataset.seek - 0.6; return; }
  const dt = t.closest("[data-deltag]"); if (dt) { editMatch(G.cur, m => { m.tags = (m.tags || []).filter(x => x.id !== dt.dataset.deltag); }); refreshMatchSide(); return; }
  if (t.closest("#gPlay")) { togglePlay(); return; }
  const jp = t.closest("[data-jump]"); if (jp && G.player) { G.pending = null; G.player.seek(G.player.t() + (+jp.dataset.jump)); G.lastT = G.player.t() - 0.01; return; }
  const sp = t.closest("[data-step]"); if (sp && G.player) { G.player.step(+sp.dataset.step / 60); return; }
  const gr = t.closest("[data-grate]"); if (gr) { G.rate = +gr.dataset.grate; G.player?.rate(G.rate); $$("[data-grate]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.grate === G.rate)); return; }
  if (t.closest("#gMic")) { PREF.mic = !PREF.mic; savePref(); if (!PREF.mic) Mic.stop(); const b = $("#gMic"); b.setAttribute("aria-pressed", PREF.mic); b.textContent = `🎤 マイク判定 ${PREF.mic ? "オン" : "オフ"}`; return; }
});
function togglePlay() {
  if (!G.player) return;
  if (G.pending) { if (!G.pending.revealed) revealPending(); else resumePending(); return; }
  G.player.paused() ? G.player.play() : G.player.pause();
}
function saveLastT() { if (G.player && G.cur && M.matches[G.cur]) { const t = G.player.t(); if (t > 0) { PREF["lastT-" + G.cur] = t; savePref(); } } }
document.addEventListener("change", e => {
  if (TAB !== "match") return;
  const t = e.target;
  if (t.id === "gFile") { const f = t.files[0]; if (!f) return; if (G.localUrl[G.cur]) URL.revokeObjectURL(G.localUrl[G.cur]); G.localUrl[G.cur] = URL.createObjectURL(f); renderMatch(); }
  if (t.id === "gPause") { G.pauseOnTag = t.checked; PREF.pauseOnTag = G.pauseOnTag; savePref(); }
  if (t.id === "gLag") { G.lag = +t.value; PREF.lag = G.lag; savePref(); }
  if (t.id === "gDur") G.dur = +t.value;
});
document.addEventListener("input", e => {
  if (TAB !== "match" || e.target.id !== "gq") return;
  G.q = e.target.value; const pos = e.target.selectionStart; refreshMatchSide(); const s = $("#gq"); if (s) { s.focus(); s.setSelectionRange(pos, pos); }
});
document.addEventListener("keydown", e => {
  if (TAB !== "match" || $("#modal").classList.contains("on")) return;
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (typing) { if (e.target.id === "gq" && e.key === "Enter") { e.preventDefault(); const f = $(".pick"); if (f) addTag(f.dataset.pick); } return; }
  const mt = M.matches[G.cur]; if (!mt) return;
  if (e.key === " ") { e.preventDefault(); togglePlay(); }
  else if (e.key === "Enter") { e.preventDefault(); if (G.pending) { if (!G.pending.revealed) revealPending(); else resumePending(); } }
  else if (e.key === "Tab" && G.mode === "edit") { e.preventDefault(); G.side = G.side === 1 ? 2 : 1; refreshMatchSide(); }
  else if (e.key === "," && G.player) G.player.step(-1 / 60);
  else if (e.key === "." && G.player) G.player.step(1 / 60);
  else if (e.key === "ArrowLeft" && G.player) { G.pending = null; G.player.seek(G.player.t() - 3); G.lastT = G.player.t(); }
  else if (e.key === "ArrowRight" && G.player) { G.pending = null; G.player.seek(G.player.t() + 3); G.lastT = G.player.t(); }
  else if (/^[1-9]$/.test(e.key) && G.mode === "edit") { const id = hotkeysOf(G.side === 1 ? mt.p1 : mt.p2)[+e.key - 1]; if (id) addTag(id); else toast("★で技をキーに割り当ててください"); }
});
function toggleHotkey(id) {
  const cid = ITEMS[id].cid; const cur = hotkeysOf(cid);
  const next = cur.includes(id) ? cur.filter(x => x !== id) : cur.length >= 9 ? (toast("割り当ては9個までです"), cur) : [...cur, id];
  LOCAL.hotkeys[cid] = next; commit(); refreshMatchSide();
}
function matchForm(id) {
  const m = id ? M.matches[id] : { name: "", p1: "ryu", p2: "ken", yt: "" };
  const opts = sel => CHARS.map(c => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  openModal(`<h2>${id ? "試合の編集" : "試合を登録"}</h2>
    <label class="note">試合名<input type="text" id="fName" value="${esc(m.name)}" placeholder="例：H-CUBE杯 決勝 第1試合" style="width:100%"></label>
    <label class="note">YouTubeのURL（動画ファイルを使う場合は空欄）<input type="text" id="fYt" value="${esc(m.yt || "")}" placeholder="https://www.youtube.com/watch?v=…" style="width:100%"></label>
    <div class="row"><label class="note" style="flex:1">P1（左）<select id="fP1" style="width:100%">${opts(m.p1)}</select></label><label class="note" style="flex:1">P2（右）<select id="fP2" style="width:100%">${opts(m.p2)}</select></label></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>やめる</button><button class="btn primary" id="fOk">${id ? "保存" : "登録する"}</button></div>`);
  $("#fName").focus();
  $("#fOk").onclick = () => {
    const yt = $("#fYt").value.trim(); if (yt && !ytParse(yt)) { toast("YouTubeのURLとして読み取れませんでした"); return; }
    const nid = id || "m" + uid();
    const base = id ? JSON.parse(JSON.stringify(M.matches[id])) : { tags: [], createdAt: Date.now() };
    LOCAL.matches[nid] = { ...base, name: $("#fName").value.trim() || "無題の試合", yt, p1: $("#fP1").value, p2: $("#fP2").value };
    delete LOCAL.deleted[nid]; commit(); G.cur = nid; PREF.gMatch = nid; savePref(); closeModal(); renderMatch();
  };
}
function delMatch() {
  const m = M.matches[G.cur]; if (!m) return;
  openModal(`<h2>「${esc(m.name)}」を削除しますか？</h2><p class="note">付けたタグもすべて消えます。共有済みの試合は、書き出して公開するまで他の人の画面には残ります。</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>やめる</button><button class="btn danger" id="dOk">削除する</button></div>`);
  $("#dOk").onclick = () => { delete LOCAL.matches[G.cur]; if (SHARED.matches[G.cur]) LOCAL.deleted[G.cur] = 1; commit(); G.cur = null; closeModal(); renderMatch(); };
}

/* =========================================================
   データ管理
   ========================================================= */
const D = { char: "ryu", player: null };
function renderData() {
  D.player?.destroy(); D.player = null;
  const s = M.nseg[D.char] || {}; const yt = ytParse(s.yt);
  const ns = normalsOf(D.char);
  const counts = { notes: Object.keys(LOCAL.notes).length, matches: Object.keys(LOCAL.matches).length + Object.keys(LOCAL.deleted).length, nseg: Object.keys(LOCAL.nseg).length, hotkeys: Object.keys(LOCAL.hotkeys).length, recipes: Object.keys(LOCAL.recipes).length + Object.keys(LOCAL.deletedR).length };
  $("#main").innerHTML = `<div class="stack" style="max-width:1100px">
    <h1>データ管理</h1>
    <div class="panel">
      <h2>編集モード</h2>
      <div class="row"><button class="btn ${PREF.edit ? "primary" : ""}" id="eToggle">${PREF.edit ? "編集モード：オン" : "編集モード：オフ"}</button>
        <span class="note">オンにすると、技図鑑で技を開いて備考・ふりがなを編集できます。変更はまずこのブラウザだけに保存されます。</span></div>
    </div>
    <div class="panel">
      <h2>変更を全員に反映する</h2>
      <div class="note">このブラウザの未公開の変更：備考・ふりがな ${counts.notes}件／試合 ${counts.matches}件／通常技の映像 ${counts.nseg}キャラ／キー割り当て ${counts.hotkeys}キャラ／コンボレシピ ${counts.recipes}件</div>
      <div class="row"><button class="btn primary" id="eExport" ${hasLocalChanges() ? "" : "disabled"}>shared.json を書き出す</button>
        <label class="btn">shared.json を読み込む<input type="file" accept=".json,application/json" id="eImport" hidden></label>
        <button class="btn danger" id="eReset" ${hasLocalChanges() ? "" : "disabled"}>未公開の変更を捨てる</button></div>
      <div class="note">書き出したファイルを、GitHubのリポジトリにある <code>shared.json</code> と差し替えると、数分で全員の画面に反映されます（GitHubのページで「Add file」→「Upload files」）。差し替えたあとに「未公開の変更を捨てる」を押してください。</div>
    </div>
    <div class="panel">
      <h2>通常技の映像（YouTubeの区間）</h2>
      <div class="note">トレーニングモードで、そのキャラの通常技を順番に出した動画をYouTubeにアップし（限定公開で可）、URLを入れてください。動画を再生しながら、各通常技の出始めで「開始」を押すと区間が登録されます。終了を空欄にすると開始から1.5秒です。</div>
      ${charBar(D.char, "data-dchar")}
      <div class="row"><input type="text" id="nYt" value="${esc(s.yt || "")}" placeholder="YouTubeのURL" style="flex:1;min-width:260px" ${PREF.edit ? "" : "disabled"}>
        ${PREF.edit ? "" : `<span class="note">編集モードをオンにすると登録できます</span>`}</div>
      ${yt ? `<div class="ytbox" style="max-width:720px"><div id="nHost"></div></div>
        <div class="ctrl"><button class="btn small" data-njump="-1">−1秒</button><button class="btn small" data-nstep="-1">◀1コマ</button><button class="btn small" data-nstep="1">1コマ▶</button><button class="btn small" data-njump="1">+1秒</button><span class="note" id="nClock"></span></div>
        <div class="stack" style="gap:4px">${ns.map(v => { const sg = s.segs?.[v.key] || {}; return `<div class="nseg"><b>${esc(v.label)}</b><span>${esc(v.name)}</span>
          <input type="text" data-nseg="${v.key}" data-f="s" value="${sg.s != null ? fmt(sg.s) : ""}" placeholder="開始" aria-label="${esc(v.label)} 開始">
          <input type="text" data-nseg="${v.key}" data-f="e" value="${sg.e != null ? fmt(sg.e) : ""}" placeholder="終了" aria-label="${esc(v.label)} 終了">
          <span class="row" style="gap:4px"><button class="btn small" data-nnow="${v.key}" data-f="s" ${PREF.edit ? "" : "disabled"}>開始=今</button><button class="btn small" data-nnow="${v.key}" data-f="e" ${PREF.edit ? "" : "disabled"}>終了=今</button>${sg.s != null ? `<button class="btn small" data-nplay="${v.key}">▶</button>` : ""}</span></div>`; }).join("")}</div>` : ""}
    </div>
    <div class="panel"><h2>データについて</h2><div class="note">技名・区分・コマンド・通常技の名前と発生フレームは、CAPCOM公式サイト（コマンドリスト／フレームデータ）から${esc(DATA.updated)}に取り込んだものです。技の映像は公式サイトのものをそのまま表示しています。ふりがなはClaudeが付けたもので、公式の読みではありません。</div></div>
  </div>`;
  if (yt) { D.player = new YTPlayer($("#nHost"), yt.id, yt.t); const tick = () => { const c = $("#nClock"); if (!c || !D.player) return; c.textContent = fmt(D.player.t()); D.raf = requestAnimationFrame(tick); }; D.raf = requestAnimationFrame(tick); }
}
function setSeg(key, f, t) { const cur = JSON.parse(JSON.stringify(M.nseg[D.char] || {})); cur.segs = cur.segs || {}; cur.segs[key] = { ...(cur.segs[key] || {}), [f]: t }; if (t == null) delete cur.segs[key][f]; LOCAL.nseg[D.char] = cur; commit(); }
document.addEventListener("click", e => {
  if (TAB !== "data") return;
  const t = e.target;
  if (t.id === "eToggle") { PREF.edit = !PREF.edit; savePref(); renderData(); return; }
  if (t.id === "eExport") { exportShared(); return; }
  if (t.id === "eReset") {
    openModal(`<h2>未公開の変更を捨てますか？</h2><p class="note">このブラウザだけにある備考・試合・通常技の映像などの変更が消え、公開中の shared.json の内容に戻ります。元に戻せません。</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>やめる</button><button class="btn danger" id="rOk">捨てる</button></div>`);
    $("#rOk").onclick = () => { LOCAL = EMPTY(); commit(); closeModal(); renderData(); }; return;
  }
  const dc = t.closest("[data-dchar]"); if (dc) { D.char = dc.dataset.dchar; renderData(); return; }
  const nn = t.closest("[data-nnow]"); if (nn && D.player) { setSeg(nn.dataset.nnow, nn.dataset.f, Math.round(D.player.t() * 100) / 100); const inp = $(`[data-nseg="${nn.dataset.nnow}"][data-f="${nn.dataset.f}"]`); if (inp) inp.value = fmt(D.player.t()); toast("登録しました"); return; }
  const np = t.closest("[data-nplay]"); if (np && D.player) { const sg = (M.nseg[D.char]?.segs || {})[np.dataset.nplay]; D.player.seek(sg.s); D.player.play(); const end = sg.e ?? sg.s + 1.5; clearInterval(D.iv); D.iv = setInterval(() => { if (D.player && D.player.t() >= end) { D.player.pause(); clearInterval(D.iv); } }, 50); return; }
  const nj = t.closest("[data-njump]"); if (nj && D.player) { D.player.seek(D.player.t() + (+nj.dataset.njump)); return; }
  const ns = t.closest("[data-nstep]"); if (ns && D.player) { D.player.step(+ns.dataset.nstep / 30); return; }
});
document.addEventListener("change", e => {
  if (TAB !== "data") return;
  const t = e.target;
  if (t.id === "nYt") { const v = t.value.trim(); if (v && !ytParse(v)) { toast("YouTubeのURLとして読み取れませんでした"); return; } const cur = JSON.parse(JSON.stringify(M.nseg[D.char] || {})); cur.yt = v; LOCAL.nseg[D.char] = cur; commit(); renderData(); }
  if (t.dataset.nseg) { const v = t.value.trim(); const sec = v ? parseTime(v) : null; if (v && sec == null) { toast("時刻は 1:23.4 のように入れてください"); return; } setSeg(t.dataset.nseg, t.dataset.f, sec); }
  if (t.id === "eImport") { const f = t.files[0]; if (!f) return; f.text().then(txt => { const j = JSON.parse(txt); for (const k of KEYS) Object.assign(LOCAL[k], j[k] || {}); commit(); toast("読み込みました（このブラウザの変更として取り込みました）"); renderData(); }).catch(() => toast("JSONを読み込めませんでした")); }
});
function exportShared() {
  const out = { version: 2, exportedAt: new Date().toISOString(), ...merged() }; delete out.deleted; delete out.deletedR;
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "shared.json"; document.body.appendChild(a); a.click(); a.remove();
  toast("shared.json を書き出しました。GitHubのファイルと差し替えてください", 4000);
}

/* 表記切り替え（ヘッダー） */
function renderNotation() {
  $$("#notation button").forEach(x => x.setAttribute("aria-pressed", x.dataset.nt === (PREF.notation || "num")));
  $$("#ctrlmode button").forEach(x => x.setAttribute("aria-pressed", x.dataset.ct === (PREF.ctrl || "classic")));
}
document.addEventListener("click", e => { const b = e.target.closest("[data-ct]"); if (!b) return; PREF.ctrl = b.dataset.ct; savePref(); renderNotation(); if (TAB === "match" && G.player) refreshMatchSide(); else render(); });
document.addEventListener("click", e => { const b = e.target.closest("[data-nt]"); if (!b) return; PREF.notation = b.dataset.nt; savePref(); renderNotation(); if (TAB === "match" && G.player) refreshMatchSide(); else render(); });

/* ---------- 起動 ---------- */
async function boot() {
  try { const r = await fetch("shared.json", { cache: "no-store" }); if (r.ok) { const j = await r.json(); SHARED = Object.assign(EMPTY(), j); } } catch (e) {}
  // 公開側に取り込まれた変更はローカルから外す（同じ内容なら）
  for (const k of KEYS) for (const id of Object.keys(LOCAL[k] || {})) if (JSON.stringify(LOCAL[k][id]) === JSON.stringify(SHARED[k][id])) delete LOCAL[k][id];
  commit(); renderNotation(); route();
}
window.addEventListener("beforeunload", saveLastT);
boot();
