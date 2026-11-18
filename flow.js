/* つながり判定とフローチャート
   公式フレームデータから「この技からこの技がつながるか」を計算する。
   - 目押し：ヒット時の有利フレーム ≥ 次の技の発生 なら通常ヒットでつながる
     カウンター時は +2、パニッシュカウンター時は +4 有利が増える（SF6の仕様）
   - キャンセル：キャンセル欄が C → 必殺技・SA、SA / SA2 / SA3 → SA
   - 連打キャンセル：備考に「連打キャンセル」がある弱攻撃どうし
   ジャンプ攻撃からの着地コンボ、空中コンボ（追撃）、DRC 後の有利増加は計算に含めない。 */
"use strict";

const CH_BONUS = 2, PC_BONUS = 4;
const SIT = { normal: "通常ヒット", ch: "カウンター時", pc: "パニッシュカウンター時" };

function fNum(x) { const m = String(x ?? "").replace(/[＋]/g, "+").replace(/[－−]/g, "-").match(/[+-]?\d+/); return m ? parseInt(m[0], 10) : null; }
function rowFor(v, str) {
  const F = v?.frames || []; if (!F.length) return null;
  if (str) { const r = F.find(x => (x[0] || "").replace(/\s/g, "").startsWith(str)); if (r) return r; }
  return F.find(x => fNum(x[1]) != null) || F[0];
}
const isAirName = v => /ジャンプ中|空中|垂直|前ジャンプ/.test((v.cond || "") + (v.name || ""));
/* 派生技か：条件の（）が「〜中に」「〜後に」だけのもの。「〜中に性質変化」などは単独で出せる技 */
const isFollow = v => /（派生）/.test(v.name || "") || (String(v.cond || "").match(/（[^）]*）|\([^)]*\)/g) || []).some(p => /(中に|後に|自動派生|設置中に)[）)]$/.test(p) && !/ジャンプ中に|性質変化|変化|可能|アップ/.test(p));
function isGround(v) {
  if (!v) return false;
  if (v.kind === "normal") return v.key[0] === "s" || v.key[0] === "c";
  if (v.kind === "move") return !isAirName(v);
  return false;
}
/* a のあとに b がつながるか。戻り値 {sit:"normal"|"ch"|"pc", type, text} または null */
function rel(a, b, aStr, bStr) {
  if (!a || !b || a.kind === "sys" || b.kind === "sys") return null;
  if (!isGround(a) || !isGround(b)) return null;
  const ra = rowFor(a, aStr); if (!ra) return null;
  const hit = fNum(ra[4]); const can = String(ra[6] || ""); const note = String(ra[14] || "");
  // キャンセル
  if (b.kind === "move" && !isFollow(b)) {
    if (b.cat === "必殺技" && a.kind !== "move" && /^C/.test(can)) return { sit: "normal", type: "cancel", text: "必殺技キャンセル" };
    if (b.cat === "必殺技" && a.kind === "move" && a.cat === "特殊技" && /^C/.test(can)) return { sit: "normal", type: "cancel", text: "必殺技キャンセル" };
    if (b.cat === "SA" && (/^C/.test(can) || /SA/.test(can))) return { sit: "normal", type: "sa", text: /SA3/.test(can) && !/SA2|^C/.test(can) ? "SA3（CA）でキャンセル" : /SA2/.test(can) && !/^C/.test(can) ? "SA2・SA3でキャンセル" : "SAでキャンセル" };
  }
  // 連打キャンセル（弱攻撃どうし）
  if (a.kind === "normal" && b.kind === "normal" && /連打キャンセル/.test(note) && /L[PK]$/.test(b.key) && /連打キャンセル/.test(String(rowFor(b)?.[14] || "")))
    return { sit: "normal", type: "chain", text: "連打キャンセル" };
  // 目押し（つなぎ）
  if (b.kind === "normal" || (b.kind === "move" && b.cat !== "SA" && !isFollow(b))) {
    if (hit == null || /D/.test(String(ra[4]))) return null;
    const rb = rowFor(b, bStr); const st = fNum(rb?.[1]); if (st == null) return null;
    if (hit >= st) return { sit: "normal", type: "link", text: `目押し（ヒット+${hit} ≥ 発生${st}F）` };
    if (hit + CH_BONUS >= st) return { sit: "ch", type: "link", text: `カウンター時のみ目押し（+${hit}+${CH_BONUS} ≥ 発生${st}F）` };
    if (hit + PC_BONUS >= st) return { sit: "pc", type: "link", text: `パニカン時のみ目押し（+${hit}+${PC_BONUS} ≥ 発生${st}F）` };
  }
  return null;
}
/* キャラの地上技の一覧（チャートの材料） */
function flowSets(cid) {
  const N = normalsOf(cid).filter(isGround);
  const U = movesOf(cid).filter(v => v.cat === "特殊技" && isGround(v) && !isFollow(v) && (v.frames || []).length);
  const S = movesOf(cid).filter(v => v.cat === "必殺技" && isGround(v) && !isFollow(v) && (v.frames || []).length);
  const A = movesOf(cid).filter(v => v.cat === "SA" && isGround(v) && !isFollow(v));
  return { N, U, S, A };
}
function outLinks(v, sets) {
  const all = [...sets.N, ...sets.U, ...sets.S, ...sets.A];
  return all.map(b => ({ b, r: rel(v, b) })).filter(x => x.r && x.b.id !== v.id || (x.r && x.r.type === "chain"));
}

/* ---------- 全体フローチャート ---------- */
const FL = { hover: null, open: null, showSit: false };
function fNode(v, col, extra = "") {
  const r = rowFor(v); const st = fNum(r?.[1]); const hit = r?.[4]; const can = r?.[6];
  const nm = v.kind === "normal" ? v.label : v.name;
  const sub = v.kind === "normal" ? v.name : (v.cmd ? stripTags(cmdHTML(v.cmd)) : "");
  return `<button class="fnode ${col}" data-fn="${v.id}" data-col="${col}" ${extra}>
    <span class="fn-nm">${esc(nm)}</span><span class="fn-sub">${v.kind === "normal" ? esc(sub) : cmdHTML(v.cmd || "")}</span>
    <span class="fn-fd">${st != null ? `発生${st}F` : ""}${hit ? `・ヒット${/^-?\d/.test(hit) && fNum(hit) > 0 ? "+" : ""}${esc(hit)}` : ""}${/^C/.test(can || "") ? `<i class="fn-c" title="必殺技・SAでキャンセル可">C</i>` : /SA/.test(can || "") ? `<i class="fn-c sa" title="${esc(can)}でキャンセル可">${esc(can)}</i>` : ""}</span></button>`;
}
const stripTags = h => String(h).replace(/<[^>]*>/g, "");
function flowHTML(cid) {
  const sets = flowSets(cid);
  const starters = [...sets.N, ...sets.U];
  // 目押し先（通常ヒット）になる通常技を2列目に
  return `<div class="flowhead row">
      <div class="note" style="flex:1">公式フレームデータから計算した、<b>地上でつながる技</b>の全体図です。技にマウスを乗せると、その技からのルートだけが光り、<span class="sit-ch">カウンター時</span>・<span class="sit-pc">パニカン時</span>だけつながるルートも点線で出ます。クリックすると詳しい一覧が開きます。</div>
      <label class="row note"><input type="checkbox" id="flSit" ${FL.showSit ? "checked" : ""}> 状況別（カウンター・パニカン）を常に表示</label>
    </div>
    <div class="flowwrap" id="flow">
      <svg class="flowsvg" id="flowSvg"></svg>
      <div class="fcol"><div class="fcolh">始動<br><small>通常技・特殊技</small></div>${starters.map(v => fNode(v, "c1")).join("")}</div>
      <div class="fcol"><div class="fcolh">目押しでつなぐ<br><small>通常技</small></div>${sets.N.map(v => fNode(v, "c2")).join("")}</div>
      <div class="fcol"><div class="fcolh" data-fn="grp-S" data-col="c3h">キャンセル先<br><small>必殺技</small></div>${sets.S.map(v => fNode(v, "c3")).join("")}</div>
      <div class="fcol"><div class="fcolh" data-fn="grp-A" data-col="c4h">SA<br><small>スーパーアーツ</small></div>${sets.A.map(v => fNode(v, "c4")).join("")}</div>
    </div>
    <div class="legend note"><span class="lg l-n"></span>通常ヒットでつながる　<span class="lg l-c"></span>キャンセル　<span class="lg l-ch"></span>カウンター時のみ　<span class="lg l-pc"></span>パニカン時のみ
      ／ <i class="fn-c">C</i> の付いた技は必殺技・SAでキャンセルできます（キャンセルの線はマウスを乗せた技だけ表示）。空中コンボ・ジャンプ攻撃からの着地・DRC後の追撃は計算に入っていません。オリジナルチャートで自分で追加できます。</div>
    <div id="flDetail"></div>`;
}
/* 線を描く */
function flowEdges(cid) {
  const sets = flowSets(cid); const E = [];
  const starters = [...sets.N, ...sets.U];
  for (const a of starters) {
    for (const b of sets.N) { const r = rel(a, b); if (r) E.push({ from: a.id, fc: "c1", to: b.id, tc: "c2", sit: r.sit, type: r.type }); }
    // キャンセルは列の見出しにまとめて1本
    if (sets.S.some(b => rel(a, b)?.type === "cancel")) E.push({ from: a.id, fc: "c1", to: "grp-S", tc: "c3h", sit: "normal", type: "cancel" });
    if (sets.A.some(b => rel(a, b)?.type === "sa")) E.push({ from: a.id, fc: "c1", to: "grp-A", tc: "c4h", sit: "normal", type: "cancel" });
  }
  for (const a of sets.N) {
    if (sets.S.some(b => rel(a, b)?.type === "cancel")) E.push({ from: a.id, fc: "c2", to: "grp-S", tc: "c3h", sit: "normal", type: "cancel", weak: 1 });
  }
  for (const a of sets.S) {
    for (const b of sets.A) { const r = rel(a, b); if (r) E.push({ from: a.id, fc: "c3", to: b.id, tc: "c4", sit: r.sit, type: r.type }); }
    for (const b of sets.N) { const r = rel(a, b); if (r) E.push({ from: a.id, fc: "c3", to: b.id, tc: "c2", sit: r.sit, type: r.type, back: 1 }); }
  }
  return E;
}
function drawFlow() {
  const wrap = $("#flow"), svg = $("#flowSvg"); if (!wrap || !svg) return;
  const cid = C.char; const E = flowEdges(cid);
  const W = wrap.scrollWidth, H = wrap.scrollHeight; svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const box = wrap.getBoundingClientRect();
  const pos = (id, col) => { const el = wrap.querySelector(`[data-fn="${id}"][data-col="${col}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left - box.left + wrap.scrollLeft, r: r.right - box.left + wrap.scrollLeft, y: r.top - box.top + r.height / 2 + wrap.scrollTop }; };
  const focus = FL.hover || FL.open;
  let out = "";
  for (const e of E) {
    const on = focus && (e.from === focus);
    if (e.sit !== "normal" && !FL.showSit && !on) continue;
    // キャンセル線は選んだ技のぶんだけ描く（全部描くと線だらけになるため）
    if ((e.type === "cancel" || e.weak) && !on) continue;
    const p = pos(e.from, e.fc), q = pos(e.to, e.tc); if (!p || !q) continue;
    let x1 = p.r, x2 = q.l; if (e.back) { x1 = p.l; x2 = q.r; }
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    const d = e.back ? `M${x1},${p.y} C${x1 - dx},${p.y} ${x2 + dx},${q.y} ${x2},${q.y}` : `M${x1},${p.y} C${x1 + dx},${p.y} ${x2 - dx},${q.y} ${x2},${q.y}`;
    const cls = `e ${e.type === "cancel" || e.type === "sa" ? "ec" : "en"} s-${e.sit} ${focus ? (on ? "on" : "dim") : "rest"}`;
    out += `<path class="${cls}" d="${d}" marker-end="url(#ah-${e.sit === "normal" ? (e.type === "cancel" ? "c" : "n") : e.sit})"/>`;
  }
  svg.innerHTML = `<defs>${["n", "c", "ch", "pc"].map(k => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="m-${k}"/></marker>`).join("")}</defs>${out}`;
  $$("#flow .fnode").forEach(n => {
    const id = n.dataset.fn;
    n.classList.toggle("dim", !!focus && id !== focus && !E.some(e => e.from === focus && e.to === id) && !(focus && E.some(e => e.from === focus && e.to === "grp-S") && n.dataset.col === "c3") && !(focus && E.some(e => e.from === focus && e.to === "grp-A") && n.dataset.col === "c4"));
    n.classList.toggle("focus", id === focus);
  });
}
function flowDetail(id) {
  const v = view(id); if (!v) return "";
  const sets = flowSets(C.char); const all = [...sets.N, ...sets.S, ...sets.A];
  const rs = all.map(b => ({ b, r: rel(v, b) })).filter(x => x.r);
  const grp = k => rs.filter(x => x.r.sit === k);
  const item = x => `<li><button class="linkbtn" data-fd="${x.b.id}">${esc(x.b.kind === "normal" ? x.b.label : x.b.name)}</button> <span class="note">${esc(x.r.text)}</span></li>`;
  const nm = v.kind === "normal" ? `${v.label}（${v.name}）` : v.name;
  return `<div class="panel flowdetail"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(nm)} からつながる技</h2>
      <div class="row"><button class="btn small" data-fdopen="${v.id}">技の詳細</button><button class="btn small primary" data-fdrecipe="${v.id}">この技からレシピを作る</button><button class="btn small" id="fdClose">閉じる</button></div></div>
    <div class="fdgrid">
      <div><h3 class="sit-n">${SIT.normal}</h3><ul>${grp("normal").map(item).join("") || `<li class="note">なし（ダウンを奪う技、またはつながる地上技なし）</li>`}</ul></div>
      <details ${grp("ch").length ? "" : "disabled"}><summary class="sit-ch">${SIT.ch}だけ +${CH_BONUS}（${grp("ch").length}）</summary><ul>${grp("ch").map(item).join("") || `<li class="note">追加なし</li>`}</ul></details>
      <details><summary class="sit-pc">${SIT.pc}だけ +${PC_BONUS}（${grp("pc").length}）</summary><ul>${grp("pc").map(item).join("") || `<li class="note">追加なし</li>`}</ul></details>
    </div></div>`;
}
let flowResize = null;
function bindFlow() {
  drawFlow();
  window.removeEventListener("resize", flowResize); flowResize = () => drawFlow(); window.addEventListener("resize", flowResize);
}
document.addEventListener("mouseover", e => {
  if (typeof TAB === "undefined" || TAB !== "combo" || C.mode !== "flow") return;
  const n = e.target.closest("#flow .fnode"); const id = n ? n.dataset.fn : null;
  if (id !== FL.hover) { FL.hover = id; drawFlow(); }
});
document.addEventListener("click", e => {
  if (typeof TAB === "undefined" || TAB !== "combo" || C.mode !== "flow") return;
  const n = e.target.closest("#flow .fnode");
  if (n) { FL.open = n.dataset.fn; $("#flDetail").innerHTML = flowDetail(FL.open); drawFlow(); $("#flDetail").scrollIntoView({ behavior: "smooth", block: "nearest" }); return; }
  if (e.target.id === "fdClose") { FL.open = null; $("#flDetail").innerHTML = ""; drawFlow(); return; }
  const fd = e.target.closest("[data-fd]"); if (fd) { FL.open = fd.dataset.fd; $("#flDetail").innerHTML = flowDetail(FL.open); drawFlow(); return; }
  const fo = e.target.closest("[data-fdopen]"); if (fo) { openDetail(fo.dataset.fdopen); return; }
  const fr = e.target.closest("[data-fdrecipe]"); if (fr) { C.mode = "recipe"; startEdit(null); C.edit.steps.push({ ref: fr.dataset.fdrecipe, str: "", link: "" }); renderCombo(); return; }
});
document.addEventListener("change", e => { if (e.target.id === "flSit") { FL.showSit = e.target.checked; drawFlow(); } });
