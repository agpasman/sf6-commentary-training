/* コンボレシピ：技をつなげて、映像とコマンドを並べて見せる。キャラごとに名前を付けて保存。
   app.js の関数・データを呼び出し時に使う（このファイルは先に読み込まれるため、読み込み時には何も実行しない） */
"use strict";

const SYS_ITEMS = [
  { id: "sys-drc", label: "DRC", name: "キャンセルドライブラッシュ", cmd: "中P+中K → 66", hint: "通常技をキャンセル" },
  { id: "sys-pdr", label: "パリィラッシュ", name: "パリィドライブラッシュ", cmd: "中P+中K → 66", hint: "パリィから" },
  { id: "sys-di", label: "インパクト", name: "ドライブインパクト", cmd: "強P+強K" },
  { id: "sys-dr", label: "リバーサル", name: "ドライブリバーサル", cmd: "6強P+強K" },
  { id: "sys-jump", label: "前ジャンプ", name: "前ジャンプ", cmd: "9" },
  { id: "sys-dash", label: "前ステップ", name: "前ステップ", cmd: "66" },
  { id: "sys-throw", label: "投げ", name: "投げ", cmd: "弱P+弱K" },
];
const LINKS = { "": "▸", cancel: "キャンセル", link: "目押し", tc: "TC", drc: "DRC" };
const STRS = ["", "弱", "中", "強", "OD"];
const POSS = ["", "画面中央", "画面端", "どこでも"];

const C = { char: null, sel: null, edit: null, q: "", tab: "通常技", rate: 1.5, playId: 0, playing: false, stageP: null, loop: false };

function ensureSys() {
  if (ITEMS["sys-drc"]) return;
  SYS_ITEMS.forEach(x => { ITEMS[x.id] = { item: { ...x, kana: "", cat: "システム" }, cid: "sys", kind: "sys" }; });
}
function cleanupCombo() { C.playId++; C.playing = false; try { C.stageP?.destroy(); } catch (e) {} C.stageP = null; }

/* 強さ（弱中強OD）を指定できる技か：コマンドの最後が強さ指定のないP/K */
const strable = v => v && v.kind === "move" && v.cat !== "SA" && /(^|[^弱中強+])[PK]$/.test(ITEMS[v.id]?.item.cmd || "");
function stepView(st) {
  const v = view(st.ref); if (!v) return null;
  let name = v.kind === "normal" ? v.label : v.name, cmd = v.kind === "normal" ? null : v.cmd;
  if (st.str && strable(v)) {
    name = (st.str === "OD" ? "OD" : st.str) + v.name;
    cmd = PREF.ctrl === "modern" ? (v.cmd ? v.cmd + (st.str === "OD" ? "+強" : "") : "") : v.cmd.replace(/([PK])$/, st.str === "OD" ? "$1+$1" : st.str + "$1");
  }
  return { ...v, sname: name, scmd: cmd };
}
const stepCmd = sv => sv.kind === "normal" ? normalCmd(sv) : cmdHTML(sv.scmd || "");
const stepCmdText = sv => {
  if (sv.kind === "normal" && PREF.ctrl === "modern") return sv.mcmd || sv.label;
  if (sv.kind === "normal") { const p = { s: "5", c: "2", j: "j.", v: "垂直j." }[sv.key[0]]; return p + BTN_JA[sv.key.slice(1)]; }
  return sv.scmd || "";
};
const recipesOf = cid => Object.entries(M.recipes || {}).filter(([, r]) => r.cid === cid).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
function saveRecipe(id, r) { LOCAL.recipes[id] = r; delete LOCAL.deletedR[id]; commit(); }

function renderCombo() {
  ensureSys(); cleanupCombo();
  if (!C.char) C.char = PREF.cChar || "ryu";
  const c = CMAP[C.char];
  const list = recipesOf(c.id);
  if (!C.edit && (!C.sel || !M.recipes[C.sel] || M.recipes[C.sel].cid !== c.id)) C.sel = list[0]?.[0] || null;
  const left = `<div class="panel">
      <button class="btn primary" id="cNew">＋ レシピを作る</button>
      <div class="mlist">${list.map(([id, r]) => `<button class="matchitem" data-recipe="${id}" aria-current="${id === C.sel && !C.edit}">${esc(r.name || "無題のレシピ")}<small>${r.steps.length}手${r.pos ? "・" + esc(r.pos) : ""}${r.dmg ? "・" + esc(r.dmg) + "ダメージ" : ""}${LOCAL.recipes[id] ? "・未公開" : ""}</small></button>`).join("") || `<p class="note">まだレシピがありません</p>`}</div>
    </div>`;
  $("#main").innerHTML = `<div class="stack">${charBar(c.id, "data-cchar")}
    <div class="combogrid">${left}<div class="stack" id="cMain">${C.edit ? editorHTML() : viewerHTML()}</div></div></div>`;
  if (!C.edit) setupComboVideos();
}

/* ---------- 表示 ---------- */
function viewerHTML() {
  const r = C.sel && M.recipes[C.sel];
  if (!r) return `<h1>コンボレシピ</h1><div class="banner">技を順番に選んでコンボを作ると、各技の映像とコマンドが横に並びます。「連続再生」で技の映像を順番に流せます。キャラごとに名前を付けて保存でき、備考も残せます。</div>`;
  const steps = r.steps.map(stepView).filter(Boolean);
  const textLine = steps.map((sv, i) => (i ? ` ${r.steps[i].link ? `[${LINKS[r.steps[i].link]}] ` : "> "}` : "") + stepCmdText(sv)).join("");
  const nameLine = steps.map(sv => sv.sname).join(" > ");
  return `<div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><h1>${esc(r.name || "無題のレシピ")}</h1>
        <div class="row" style="margin-top:4px">${r.pos ? `<span class="chip" aria-pressed="true">${esc(r.pos)}</span>` : ""}${r.dmg ? `<span class="chip">ダメージ ${esc(r.dmg)}</span>` : ""}${r.drive ? `<span class="chip">Dゲージ ${esc(r.drive)}本</span>` : ""}${r.sa ? `<span class="chip">SA ${esc(r.sa)}本</span>` : ""}</div></div>
      <div class="row"><button class="btn primary" id="cPlay">${C.playing ? "■ 止める" : "▶ 連続再生"}</button>
        <span class="note">速度</span>${[1, 1.5, 2].map(x => `<button class="btn small" data-crate="${x}" aria-pressed="${C.rate === x}">${x}倍</button>`).join("")}
        <label class="row note"><input type="checkbox" id="cLoop" ${C.loop ? "checked" : ""}> くり返す</label>
        <button class="btn small" id="cEdit">編集</button><button class="btn small" id="cDup">複製</button><button class="btn small danger" id="cDel">削除</button></div>
    </div>
    <div class="player cstage" id="cStage" ${C.playing ? "" : "hidden"}><div class="ov" id="cOv"></div></div>
    <div class="steps">${steps.map((sv, i) => `${i ? `<div class="link">${esc(LINKS[r.steps[i].link || ""])}</div>` : ""}
      <button class="stepcard" data-step="${i}">
        <div class="media">${sv.video ? `<video data-src="${sv.video}" muted loop playsinline preload="none"></video>` : `<span class="btnlabel" style="font-size:24px">${esc(sv.kind === "normal" ? sv.label : sv.label || sv.name)}</span>`}<span class="badge">${i + 1}</span></div>
        <div class="body">${sv.kind === "normal" ? `<span class="note">${esc(sv.name)}</span>` : `<span class="nm">${esc(sv.sname)}</span>`}<span class="cmd">${stepCmd(sv)}</span></div>
      </button>`).join("")}</div>
    <div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">レシピ</h2><button class="btn small" id="cCopy">文字でコピー</button></div>
      <div class="recipeline">${steps.map((sv, i) => `${i ? `<span class="ic seq">${r.steps[i].link ? esc(LINKS[r.steps[i].link]) : "▸"}</span>` : ""}${stepCmd(sv)}`).join("")}</div>
      <div class="note" id="cText">${esc(nameLine)}<br>${esc(textLine)}</div></div>
    ${r.note ? `<div class="panel"><h2 style="margin:0">備考</h2><div style="white-space:pre-wrap">${esc(r.note)}</div></div>` : ""}`;
}
function setupComboVideos() {
  const vids = $$("#cMain .steps video[data-src]");
  const io2 = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause(); }), { rootMargin: "100px" });
  vids.forEach(v => io2.observe(v));
}

/* ---------- 連続再生 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function playSeq() {
  const r = M.recipes[C.sel]; if (!r) return;
  const id = ++C.playId; C.playing = true;
  const stage = $("#cStage"); stage.hidden = false; $("#cPlay").textContent = "■ 止める";
  const alive = () => C.playId === id && document.body.contains(stage);
  do {
    for (let i = 0; i < r.steps.length && alive(); i++) {
      const sv = stepView(r.steps[i]); if (!sv) continue;
      $$("#cMain .stepcard").forEach((b, k) => b.classList.toggle("on", k === i));
      const cap = `<div class="cap"><div class="who">${i + 1} / ${r.steps.length}${i && r.steps[i].link ? "　" + esc(LINKS[r.steps[i].link]) : ""}</div><div class="nm">${esc(sv.sname)}</div><div class="k">${stepCmd(sv)}</div></div>`;
      $$("video,#cYt", stage).forEach(x => x.remove()); try { C.stageP?.destroy(); } catch (e) {} C.stageP = null;
      $("#cOv").innerHTML = cap;
      if (sv.video) {
        const v = document.createElement("video"); v.src = sv.video; v.muted = true; v.playsInline = true; v.autoplay = true;
        stage.prepend(v); v.playbackRate = C.rate;
        await new Promise(res => { v.onended = res; v.onerror = res; const iv = setInterval(() => { if (!alive()) { clearInterval(iv); res(); } }, 200); v.onplay = () => (v.playbackRate = C.rate); });
      } else if (sv.seg) {
        const host = document.createElement("div"); host.id = "cYt"; stage.prepend(host);
        const p = ytParse(sv.seg.yt); C.stageP = new YTPlayer(host, p.id, sv.seg.s, { vars: { autoplay: 1, mute: 1, controls: 0 } });
        await C.stageP.ready; C.stageP.seek(sv.seg.s); C.stageP.rate(C.rate); C.stageP.play();
        const t0 = Date.now(); while (alive() && C.stageP && C.stageP.t() < sv.seg.e && Date.now() - t0 < 8000) await sleep(80);
      } else {
        await sleep(1200 / C.rate);
      }
    }
  } while (C.loop && alive());
  if (C.playId === id) { C.playing = false; const b = $("#cPlay"); if (b) b.textContent = "▶ 連続再生"; $$("#cMain .stepcard").forEach(b => b.classList.remove("on")); }
}

/* ---------- 編集 ---------- */
function editorHTML() {
  const r = C.edit; const c = CMAP[C.char];
  const tabs = ["通常技", "特殊技", "必殺技", "SA", "システム"];
  const q = norm(C.q);
  let pool = C.tab === "通常技" ? normalsOf(c.id) : C.tab === "システム" ? SYS_ITEMS.map(x => view(x.id)) : movesOf(c.id).filter(v => v.cat === C.tab);
  if (q) pool = [...normalsOf(c.id), ...movesOf(c.id), ...SYS_ITEMS.map(x => view(x.id))].filter(v => norm(v.name).includes(q) || norm(v.kana).includes(q) || norm(v.label || "").includes(q) || norm(v.cmd || "").includes(q));
  return `<div class="row" style="justify-content:space-between"><h1>${C.sel && M.recipes[C.sel] && C.editId === C.sel ? "レシピを編集" : "レシピを作る"}</h1>
      <div class="row"><button class="btn" id="cCancel">やめる</button><button class="btn primary" id="cSave">保存</button></div></div>
    <div class="panel">
      <div class="row"><label class="note" style="flex:1;min-width:240px">レシピ名<input type="text" id="rName" value="${esc(r.name)}" placeholder="例：屈中P始動 基本コンボ" style="width:100%"></label>
        <label class="note">状況<select id="rPos">${POSS.map(p => `<option ${p === r.pos ? "selected" : ""} value="${p}">${p || "指定なし"}</option>`).join("")}</select></label>
        <label class="note">ダメージ<input type="text" id="rDmg" value="${esc(r.dmg)}" style="width:80px"></label>
        <label class="note">Dゲージ<input type="text" id="rDrive" value="${esc(r.drive)}" style="width:60px"></label>
        <label class="note">SA<input type="text" id="rSa" value="${esc(r.sa)}" style="width:50px"></label></div>
      <label class="note">備考（実況での言い方、つなぎのコツなど）<textarea id="rNote" rows="3">${esc(r.note)}</textarea></label>
    </div>
    <div class="combo-edit">
      <div class="panel"><h2 style="margin:0">並び（${r.steps.length}手）</h2>
        <div class="stack" style="gap:4px">${r.steps.map((st, i) => { const sv = stepView(st); if (!sv) return ""; return `<div class="steprow">
          <span class="note">${i + 1}</span>
          ${i ? `<select data-slink="${i}" aria-label="つなぎ方">${Object.entries(LINKS).map(([k, t]) => `<option value="${k}" ${k === (st.link || "") ? "selected" : ""}>${k ? t : "つなぎ"}</option>`).join("")}</select>` : `<span class="note">始動</span>`}
          <span><b>${esc(sv.sname)}</b> <span class="cmd">${stepCmd(sv)}</span></span>
          ${strable(view(st.ref)) ? `<select data-sstr="${i}" aria-label="強さ">${STRS.map(s => `<option value="${s}" ${s === (st.str || "") ? "selected" : ""}>${s || "強さ"}</option>`).join("")}</select>` : "<span></span>"}
          <span class="row" style="gap:2px"><button class="btn small" data-sup="${i}" ${i ? "" : "disabled"} aria-label="前へ">↑</button><button class="btn small" data-sdown="${i}" ${i < r.steps.length - 1 ? "" : "disabled"} aria-label="後ろへ">↓</button><button class="btn small danger" data-sdel="${i}" aria-label="削除">✕</button></span>
        </div>`; }).join("") || `<p class="note">右の一覧から技を押すと、ここに順番に入ります。</p>`}</div></div>
      <div class="panel"><h2 style="margin:0">技を追加</h2>
        <input type="search" id="cq" value="${esc(C.q)}" placeholder="技名・よみ・コマンドで検索" aria-label="技を検索">
        <div class="chips">${tabs.map(t => `<button class="chip" data-ctab="${t}" aria-pressed="${t === C.tab && !q}">${t}</button>`).join("")}</div>
        <div class="picklist" style="max-height:420px">${pool.map(v => `<div class="pick" data-add="${v.id}" role="button" tabindex="0" style="grid-template-columns:1fr auto"><span>${v.kind === "normal" ? `<b>${esc(v.label)}</b> <small class="note">${esc(v.name)}</small>` : esc(v.name)}</span><span class="c">${v.kind === "normal" ? normalCmd(v) : cmdHTML(v.cmd || "")}</span></div>`).join("") || `<p class="note">該当なし</p>`}</div>
      </div>
    </div>`;
}
function readEditorMeta() {
  const r = C.edit; if (!r || !$("#rName")) return;
  r.name = $("#rName").value; r.pos = $("#rPos").value; r.dmg = $("#rDmg").value; r.drive = $("#rDrive").value; r.sa = $("#rSa").value; r.note = $("#rNote").value;
}
function refreshEditor() { readEditorMeta(); const m = $("#cMain"); if (m) m.innerHTML = editorHTML(); }
function startEdit(id) {
  C.editId = id || null;
  C.edit = id ? JSON.parse(JSON.stringify(M.recipes[id])) : { cid: C.char, name: "", steps: [], note: "", pos: "", dmg: "", drive: "", sa: "", createdAt: Date.now() };
  C.q = ""; cleanupCombo(); renderCombo();
}

/* ---------- イベント ---------- */
document.addEventListener("click", e => {
  if (typeof TAB === "undefined" || TAB !== "combo") return;
  const t = e.target;
  const cc = t.closest("[data-cchar]"); if (cc) { if (C.edit && !confirmLeave()) return; C.char = cc.dataset.cchar; PREF.cChar = C.char; savePref(); C.edit = null; C.sel = null; renderCombo(); return; }
  const rc = t.closest("[data-recipe]"); if (rc) { if (C.edit && !confirmLeave()) return; C.edit = null; C.sel = rc.dataset.recipe; renderCombo(); return; }
  if (t.closest("#cNew")) { startEdit(null); return; }
  if (t.closest("#cEdit")) { startEdit(C.sel); return; }
  if (t.closest("#cDup")) { const r = JSON.parse(JSON.stringify(M.recipes[C.sel])); r.name = (r.name || "") + "（コピー）"; r.createdAt = Date.now(); const id = "r" + uid(); saveRecipe(id, r); C.sel = id; renderCombo(); toast("複製しました"); return; }
  if (t.closest("#cDel")) {
    const r = M.recipes[C.sel];
    openModal(`<h2>「${esc(r.name || "無題のレシピ")}」を削除しますか？</h2><p class="note">元に戻せません。共有済みのレシピは、書き出して公開するまで他の人の画面には残ります。</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>やめる</button><button class="btn danger" id="rdOk">削除する</button></div>`);
    $("#rdOk").onclick = () => { delete LOCAL.recipes[C.sel]; if (SHARED.recipes?.[C.sel]) LOCAL.deletedR[C.sel] = 1; commit(); C.sel = null; closeModal(); renderCombo(); }; return;
  }
  if (t.closest("#cPlay")) { if (C.playing) { cleanupCombo(); renderCombo(); } else playSeq(); return; }
  const cr = t.closest("[data-crate]"); if (cr) { C.rate = +cr.dataset.crate; $$("[data-crate]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.crate === C.rate)); const v = $("#cStage video"); if (v) v.playbackRate = C.rate; C.stageP?.rate(C.rate); return; }
  if (t.closest("#cCopy")) { const txt = $("#cText").innerText; navigator.clipboard?.writeText(txt).then(() => toast("コピーしました"), () => toast("コピーできませんでした")); return; }
  const sc = t.closest(".stepcard"); if (sc && !C.edit) { const r = M.recipes[C.sel]; const st = r.steps[+sc.dataset.step]; if (st && ITEMS[st.ref]?.kind !== "sys") openDetail(st.ref); return; }
  // 編集
  if (!C.edit) return;
  if (t.closest("#cCancel")) { C.edit = null; renderCombo(); return; }
  if (t.closest("#cSave")) {
    readEditorMeta(); const r = C.edit;
    if (!r.steps.length) { toast("技を1つ以上入れてください"); return; }
    if (!r.name.trim()) r.name = r.steps.map(stepView).filter(Boolean).map(s => s.sname).slice(0, 3).join(" > ");
    const id = C.editId || "r" + uid(); saveRecipe(id, r); C.sel = id; C.edit = null; renderCombo(); toast("保存しました（このブラウザ）。全員に共有するにはデータ管理から書き出してください", 3500); return;
  }
  const tb = t.closest("[data-ctab]"); if (tb) { C.tab = tb.dataset.ctab; C.q = ""; refreshEditor(); return; }
  const ad = t.closest("[data-add]"); if (ad) { readEditorMeta(); C.edit.steps.push({ ref: ad.dataset.add, str: "", link: "" }); refreshEditor(); return; }
  const up = t.closest("[data-sup]"); if (up) { const i = +up.dataset.sup; const s = C.edit.steps; [s[i - 1], s[i]] = [s[i], s[i - 1]]; refreshEditor(); return; }
  const dn = t.closest("[data-sdown]"); if (dn) { const i = +dn.dataset.sdown; const s = C.edit.steps; [s[i + 1], s[i]] = [s[i], s[i + 1]]; refreshEditor(); return; }
  const dl = t.closest("[data-sdel]"); if (dl) { C.edit.steps.splice(+dl.dataset.sdel, 1); refreshEditor(); return; }
});
document.addEventListener("change", e => {
  if (typeof TAB === "undefined" || TAB !== "combo") return;
  const t = e.target;
  if (t.id === "cLoop") C.loop = t.checked;
  if (!C.edit) return;
  if (t.dataset.slink) { C.edit.steps[+t.dataset.slink].link = t.value; }
  if (t.dataset.sstr) { C.edit.steps[+t.dataset.sstr].str = t.value; refreshEditor(); }
});
document.addEventListener("input", e => {
  if (typeof TAB === "undefined" || TAB !== "combo" || e.target.id !== "cq") return;
  C.q = e.target.value; const pos = e.target.selectionStart; refreshEditor(); const s = $("#cq"); s.focus(); s.setSelectionRange(pos, pos);
});
document.addEventListener("keydown", e => {
  if (typeof TAB === "undefined" || TAB !== "combo" || e.target.id !== "cq" || e.key !== "Enter") return;
  e.preventDefault(); const f = $("[data-add]"); if (f) f.click();
});
function confirmLeave() { return !C.edit || C.edit.steps.length === 0 || window.confirm("編集中のレシピは保存されません。移動しますか？"); }
