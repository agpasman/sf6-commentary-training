/* コンボチャート：技のカード（映像・コマンド付き）を線でつないで、自分のコンボを組む。分岐あり。
   - 技カード：公式映像・技名・大きめのコマンド・前の技とのつながり判定（○△？✕）
   - 状況マス：「パニカン時」「画面端」など前提を書くカード。後ろの技の判定にも反映
   - ルートごとに合計ダメージ（目安）・使うゲージ・最後がダウンか（起き攻めへ行けるか）を表示
   データは recipes（v:2）に保存。古い一本道のレシピは開いたときにチャートへ変換する。 */
"use strict";

const SYS_ITEMS = [
  { id: "sys-drc", label: "DRC", name: "キャンセルドライブラッシュ", cmd: "中P+中K → 66", mcmd: "DP → 66" },
  { id: "sys-pdr", label: "パリィラッシュ", name: "パリィドライブラッシュ", cmd: "中P+中K → 66", mcmd: "DP → 66" },
  { id: "sys-di", label: "インパクト", name: "ドライブインパクト", cmd: "強P+強K", mcmd: "DI" },
  { id: "sys-dr", label: "リバーサル", name: "ドライブリバーサル", cmd: "6強P+強K", mcmd: "6+DI" },
  { id: "sys-jump", label: "前ジャンプ", name: "前ジャンプ", cmd: "9" },
  { id: "sys-dash", label: "前ステップ", name: "前ステップ", cmd: "66" },
  { id: "sys-throw", label: "投げ", name: "投げ", cmd: "弱P+弱K", mcmd: "弱+中" },
];
const LINKS = { "": "→", link: "目押し", cancel: "キャンセル", chain: "連打", tc: "TC", drc: "DRC", juggle: "追撃" };
const STRS = ["", "弱", "中", "強", "OD"];
const COND_PRESETS = ["カウンター時", "パニカン時", "画面端", "画面中央", "DRC後", "ジャンプ攻撃から", "起き攻め", "SAゲージ必要", "Dゲージ必要", "相手がしゃがみ"];
const NODE_W = 230, GAP_X = 70, GAP_Y = 40;

const C = { char: null, sel: null, chart: null, dirty: false, picked: null, q: "", tab: "必殺技", drag: null, link: null, playId: 0, rate: 1.5 };

function ensureSys() {
  if (ITEMS["sys-drc"]) return;
  SYS_ITEMS.forEach(x => { ITEMS[x.id] = { item: { ...x, kana: "", cat: "システム" }, cid: "sys", kind: "sys" }; });
}
function cleanupCombo() { C.playId++; if (C.dirty) saveChart(); }

/* 強さ（弱中強OD）を選べる技か：クラシックのコマンドの最後が強さ指定のないP/K */
const strable = v => v && v.kind === "move" && v.cat !== "SA" && /(^|[^弱中強+])[PK]$/.test(ITEMS[v.id]?.item.cmd || "");
function nodeView(n) {
  const v = view(n.ref); if (!v) return null;
  let name = v.kind === "normal" ? v.label : v.name, cmd = v.kind === "sys" && PREF.ctrl === "modern" && v.mcmd ? v.mcmd : v.cmd;
  if (n.str && strable(v)) {
    name = n.str + v.name;
    cmd = PREF.ctrl === "modern" ? (v.cmd ? v.cmd + (n.str === "OD" ? "+強" : "") : "") : v.cmd.replace(/([PK])$/, n.str === "OD" ? "$1+$1" : n.str + "$1");
  }
  return { ...v, sname: name, scmd: cmd };
}
const nodeCmdHTML = (sv, big) => sv.kind === "normal"
  ? (PREF.ctrl === "modern" && sv.mcmd ? cmdHTML(sv.mcmd, { big }) : cmdHTML(normalText(sv), { big }) + (PREF.ctrl === "modern" ? `<span class="note" style="font-size:10px;margin-left:4px">クラシック表記</span>` : ""))
  : cmdHTML(sv.scmd || "", { big });
const normalText = sv => (sv.key[0] === "c" ? "2" : sv.key[0] === "s" ? "5" : "") + BTN_JA[sv.key.slice(1)];

/* ---------- 保存と変換 ---------- */
const chartsOf = cid => Object.entries(M.recipes || {}).filter(([, r]) => r.cid === cid).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
function toChart(r) {
  if (r.v === 2) return JSON.parse(JSON.stringify(r));
  // 旧形式（一本道）を変換
  const nodes = {}, edges = []; let prev = null;
  (r.steps || []).forEach((st, i) => { const id = "n" + i; nodes[id] = { type: "move", ref: st.ref, str: st.str || "", x: 30 + i * (NODE_W + GAP_X), y: 40 }; if (prev) edges.push({ from: prev, to: id, link: st.link || "" }); prev = id; });
  if (r.pos) { const id = "c0"; nodes[id] = { type: "cond", text: r.pos, x: 30, y: 330 }; }
  return { v: 2, cid: r.cid, name: r.name || "", note: r.note || "", nodes, edges, createdAt: r.createdAt || Date.now() };
}
function saveChart() {
  if (!C.chart || !C.sel) return;
  LOCAL.recipes[C.sel] = JSON.parse(JSON.stringify(C.chart)); delete LOCAL.deletedR[C.sel]; commit(); C.dirty = false; renderSideList();
}
let saveTimer = 0;
function touch() { C.dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(saveChart, 600); }

/* ---------- 判定（前の技とのつながり） ---------- */
const parentsOf = (ch, id) => ch.edges.filter(e => e.to === id);
const childrenOf = (ch, id) => ch.edges.filter(e => e.from === id);
/* id の直前の技ノードと、その間にある状況マスを集める（最初の親をたどる） */
function prevMove(ch, id) {
  const conds = []; let cur = id, link = parentsOf(ch, id)[0]?.link || "";
  for (let g = 0; g < 50; g++) {
    const p = parentsOf(ch, cur)[0]; if (!p) return { node: null, conds, link };
    const n = ch.nodes[p.from]; if (!n) return { node: null, conds, link };
    if (n.type === "move") return { node: n, id: p.from, conds, link };
    if (n.type === "cond") conds.push(n.text || "");
    if (n.type === "assist") return { node: null, assist: true, conds, link };
    cur = p.from;
  }
  return { node: null, conds, link };
}
/* 状況マスに書かれた前提から、カウンター／パニカン扱いにするか */
const condFlags = conds => ({ pc: conds.some(t => /パニ|PC|パニッシュ/i.test(t)), ch: conds.some(t => /カウンター|CH/i.test(t)) && !conds.some(t => /パニ/.test(t)), other: conds.some(t => /DRC|ドライブラッシュ|画面端|ジャンプ|追撃|壁/.test(t)) });
function judgeNode(ch, id) {
  const n = ch.nodes[id]; if (!n || n.type !== "move") return null;
  const pm = prevMove(ch, id);
  if (pm.assist) return { mark: "unk", text: "アシストコンボのあとは計算外（最後の段の技が分からないため）" };
  if (!pm.node) return { mark: "start", text: "始動" };
  const a = view(pm.node.ref), b = view(n.ref); const f = condFlags(pm.conds);
  if (!a || !b) return { mark: "unk", text: "判定できません" };
  if (a.kind === "sys" || b.kind === "sys") return { mark: "unk", text: "システム行動をはさむため計算外" };
  const r = rel(a, b, pm.node.str, n.str);
  if (r) {
    if (r.sit === "normal") return { mark: "ok", text: `つながる：${r.text}` };
    if (r.sit === "ch" && (f.ch || f.pc)) return { mark: "okc", text: `前提（${pm.conds.join("・")}）でつながる：${r.text}` };
    if (r.sit === "pc" && f.pc) return { mark: "okc", text: `前提（${pm.conds.join("・")}）でつながる：${r.text}` };
    return { mark: "warn", text: `${SIT[r.sit]}ならつながる（状況マスで「${r.sit === "pc" ? "パニカン時" : "カウンター時"}」を入れると○）：${r.text}` };
  }
  if (f.other) return { mark: "unk", text: `前提（${pm.conds.join("・")}）があるため計算外。実戦で確認してください` };
  if (!isGround(a) || !isGround(b)) return { mark: "unk", text: "空中の技を含むため計算外（空中コンボ・着地コンボ）" };
  const ra = rowFor(a, pm.node.str);
  if (/D/.test(String(ra?.[4] || ""))) return { mark: "unk", text: "前の技でダウン・浮きが発生。追撃できるかはデータから計算できません" };
  return { mark: "ng", text: "フレームデータ上はつながりません（ヒット時の有利が足りない、またはキャンセル不可）" };
}
const MARK = { ok: ["○", "つながる"], okc: ["○", "前提ありでつながる"], warn: ["△", "条件つき"], unk: ["？", "計算外"], ng: ["✕", "つながらない"], start: ["", ""] };

/* ---------- ルート集計 ---------- */
function routes(ch) {
  const roots = Object.keys(ch.nodes).filter(id => !parentsOf(ch, id).length);
  const out = [];
  const walk = (id, path, seen) => {
    if (seen.has(id)) return; const p = [...path, id]; const kids = childrenOf(ch, id);
    if (!kids.length) { out.push(p); return; }
    kids.forEach(k => walk(k.to, p, new Set([...seen, id])));
  };
  roots.forEach(r => walk(r, [], new Set()));
  return out.filter(p => p.some(id => ["move", "assist"].includes(ch.nodes[id]?.type)));
}
const SA_FLOOR = 0; // SAの最低保証は目安から外す
function saLevel(v) {
  const list = movesOf(v.cid).filter(x => x.cat === "SA" && !isFollow(x) && !isAirName(x)).sort((a, b) => a.code.localeCompare(b.code));
  let i = list.findIndex(x => x.id === v.id); if (i < 0) i = list.findIndex(x => v.name.includes(x.name.replace(/^空中/, "")) || x.name.includes(v.name.replace(/^空中/, "")));
  return Math.min(3, (i < 0 ? 0 : i) + 1);
}
function routeSummary(ch, path) {
  const steps = path.map(id => ({ id, n: ch.nodes[id] })).filter(x => x.n);
  const moves = steps.filter(x => x.n.type === "move").map(x => ({ ...x, v: nodeView(x.n) })).filter(x => x.v);
  let raw = 0, scaled = 0, extra = 0, starter = 0, drive = 0, sa = 0; const notes = [];
  const table = [100, 100, 80, 70, 60, 50, 40, 30, 20, 10];
  moves.forEach((m, i) => {
    if (m.v.kind === "sys") { if (m.v.id === "sys-drc") drive += 3; if (m.v.id === "sys-di" || m.v.id === "sys-pdr") drive += 1; return; }
    const r = rowFor(m.v, m.n.str); const d = fNum(r?.[7]) || 0; const sc = String(r?.[8] || "");
    let mult = table[Math.min(i, 9)];
    if (i > 0) mult -= starter + extra;
    const imm = sc.match(/即時補正(\d+)/); if (imm) mult -= +imm[1];
    mult = Math.max(10, mult);
    raw += d; scaled += Math.round(d * mult / 100);
    if (i === 0) { const st = sc.match(/始動補正(\d+)/); if (st) starter = +st[1]; }
    const cb = sc.match(/コンボ補正(\d+)/); if (cb) extra += +cb[1];
    if (m.n.str === "OD") drive += 2;
    if (m.v.cat === "SA") sa = Math.max(sa, saLevel(m.v));
  });
  const last = moves.filter(m => m.v.kind !== "sys").slice(-1)[0];
  let ending = "";
  if (last) {
    const r = rowFor(last.v, last.n.str); const h = String(r?.[4] || "");
    if (/D/.test(h)) ending = "ダウンを奪う → 起き攻めへ行ける";
    else if (fNum(h) != null) ending = fNum(h) > 0 ? `ヒット後 +${fNum(h)} 有利（攻め継続）` : `ヒット後 ${fNum(h)}（相手が先に動ける）`;
  }
  const memo = steps.filter(x => x.n.type === "cond" && path.indexOf(x.id) > path.indexOf(last?.id)).map(x => x.n.text).filter(Boolean);
  const pre = steps.filter(x => x.n.type === "cond" && path.indexOf(x.id) < path.indexOf(last?.id)).map(x => x.n.text).filter(Boolean);
  const bad = moves.map(m => judgeNode(ch, m.id)).filter(j => j && (j.mark === "ng" || j.mark === "warn")).length;
  const names = steps.filter(x => x.n.type === "move" || x.n.type === "assist").map(x => x.n.type === "assist" ? `${assistOf(x.n)?.[0] || "アシスト"}×${x.n.n || 1}段` : nodeView(x.n)?.sname).filter(Boolean);
  const hasAssist = steps.some(x => x.n.type === "assist");
  return { names, hasAssist, raw, scaled, drive, sa, ending, memo, pre, bad, count: moves.length };
}

/* ---------- 描画 ---------- */
function renderCombo() {
  ensureSys();
  if (!C.char) C.char = PREF.cChar || "ryu";
  const c = CMAP[C.char];
  const list = chartsOf(c.id);
  if (!C.sel || !M.recipes[C.sel] || M.recipes[C.sel].cid !== c.id) { C.sel = list[0]?.[0] || null; C.chart = null; C.picked = null; }
  if (C.sel && (!C.chart || C.chartId !== C.sel)) { C.chart = toChart(M.recipes[C.sel]); C.chartId = C.sel; }
  $("#main").innerHTML = `<div class="stack">${charBar(c.id, "data-cchar")}
    <div class="ccgrid">
      <div class="panel ccside">
        <button class="btn primary" id="ccNew">＋ 新しいコンボチャート</button>
        <div class="mlist">${list.map(([id, r]) => `<button class="matchitem" data-chart="${id}" aria-current="${id === C.sel}">${esc(r.name || "無題のチャート")}<small>${r.v === 2 ? Object.values(r.nodes || {}).filter(n => n.type === "move").length + "技" : (r.steps || []).length + "技"}${LOCAL.recipes[id] ? "・未公開" : ""}</small></button>`).join("") || `<p class="note">まだチャートがありません</p>`}</div>
      </div>
      <div class="stack" id="ccMain">${C.chart ? chartHTML() : emptyHTML()}</div>
    </div></div>`;
  if (C.chart) { drawEdges(); setupNodeVideos(); }
}
function emptyHTML() {
  return `<div class="row" style="justify-content:space-between"><h1>コンボチャート</h1><button class="btn" id="ccImport">テキストから作る</button></div><div class="banner">技のカード（公式映像・コマンド付き）を線でつないで、自分のコンボを図にできます。1つの技から線を2本出せば分岐も作れます。「パニカン時」「画面端」などの前提は状況マスに書けます。各ルートの合計ダメージ（目安）や、最後にダウンを取って起き攻めへ行けるかも自動で表示します。</div>`;
}
function chartHTML() {
  const ch = C.chart; const rs = routes(ch);
  const ids = Object.keys(ch.nodes);
  const W = Math.max(900, ...ids.map(id => ch.nodes[id].x + NODE_W + 120)); const H = Math.max(420, ...ids.map(id => ch.nodes[id].y + 320));
  const pk = C.picked && ch.nodes[C.picked];
  return `<div class="row" style="justify-content:space-between;align-items:flex-end">
      <input type="text" id="ccName" class="ccname" value="${esc(ch.name)}" placeholder="チャート名（例：屈中P始動 中央コンボ）" aria-label="チャート名">
      <div class="row"><button class="btn small" id="ccDup">複製</button><button class="btn small danger" id="ccDel">削除</button></div>
    </div>
    <div class="cctool">
      <button class="btn primary" id="ccAddMove">＋ 技を追加</button>
      <button class="btn" id="ccAddCond">＋ 状況マス</button>
      ${PREF.ctrl === "modern" && (CMAP[C.char]?.modernExtra || []).length ? `<button class="btn" id="ccAddAssist">＋ アシストコンボ</button>` : ""}
      <button class="btn" id="ccImport">テキストから作る</button>
      ${pk ? `<span class="note">選択中：<b>${esc(pk.type === "move" ? nodeView(pk)?.sname : pk.text)}</b>（追加すると、このカードの後ろにつながります）</span><button class="btn small" id="ccUnpick">選択を外す</button>` : `<span class="note">カードを選ぶと、その後ろに追加されます。右端の● をドラッグして別のカードに離すと線を引けます。</span>`}
    </div>
    <div class="cccanvas" id="ccCanvas"><div class="ccinner" style="width:${W}px;height:${H}px">
      <svg class="ccsvg" id="ccSvg" width="${W}" height="${H}"></svg>
      ${ids.map(id => nodeHTML(id)).join("")}
    </div></div>
    <div class="legend note"><span class="mk ok">○</span>つながる <span class="mk okc">○</span>前提ありでつながる <span class="mk warn">△</span>カウンター／パニカンならつながる <span class="mk unk">？</span>計算外（空中・ダウン後の追撃など） <span class="mk ng">✕</span>フレーム上つながらない　／ 印にマウスを乗せると理由が出ます</div>
    <div class="panel"><h2 style="margin:0">ルートごとのまとめ（${rs.length}）</h2>
      ${rs.map((p, i) => { const s = routeSummary(ch, p); return `<div class="route">
        <div class="rtitle"><b>ルート${i + 1}</b>${s.pre.length ? `<span class="condpill">${s.pre.map(esc).join("・")}</span>` : ""} ${esc(s.names.join(" > "))}</div>
        <div class="rstats"><span>合計ダメージ <b>${s.scaled.toLocaleString()}</b><small>（補正込みの目安／単純合計 ${s.raw.toLocaleString()}）</small></span>
          <span>Dゲージ <b>${s.drive}</b>本</span><span>SA <b>${s.sa ? "Lv" + s.sa : "なし"}</b></span>
          <span class="${/ダウン/.test(s.ending) ? "s1" : ""}">${esc(s.ending || "—")}</span>
          ${s.memo.length ? `<span>起き攻め・その後：<b>${s.memo.map(esc).join("／")}</b></span>` : ""}
          ${s.bad ? `<span class="s2">要確認のつなぎ ${s.bad}か所</span>` : ""}${s.hasAssist ? `<span class="note">アシストコンボ分のダメージは含みません</span>` : ""}
          <button class="btn small" data-play="${i}">▶ 再生</button></div></div>`; }).join("") || `<p class="note">技を追加するとルートが出ます。</p>`}
      <div class="note">ダメージは各技の公式ダメージに、コンボ補正（2ヒット目まで100%、3ヒット目80%から10%ずつ減少）と始動補正・即時補正・コンボ補正を当てはめた目安です。多段技は1ヒットとして計算し、SAの最低保証やDRCの補正は含めていません。</div>
    </div>
    <datalist id="condList">${COND_PRESETS.map(p => `<option value="${p}"></option>`).join("")}</datalist>
    <label class="note">メモ（コツ・実況での言い方など）<textarea id="ccNote" rows="3">${esc(ch.note)}</textarea></label>`;
}
function assistOf(n) { const ex = CMAP[C.char]?.modernExtra || []; return ex[n.idx] || null; }
function assistSteps(a) { return a ? a[1].split("→").length : 0; }
/* アシストコンボの押し方：最初の入力（アイコン）＋「続けて ○ を n回」 */
function assistHTML(a, n) {
  if (!a) return "";
  const first = a[1].split("→")[0].trim(); const btn = (a[1].match(/(弱|中|強)/) || [])[1] || "";
  return `${cmdHTML(first, { big: true })}${n > 1 ? `<span class="ic txt">続けて</span>${cmdHTML(btn, { big: true })}<span class="ic txt" style="font-size:18px;color:var(--ink)">×${n - 1}</span>` : ""}`;
}
function nodeHTML(id) {
  const ch = C.chart, n = ch.nodes[id]; const sel = id === C.picked ? "picked" : "";
  if (n.type === "assist") {
    const a = assistOf(n); const max = assistSteps(a); const k = Math.min(n.n || 1, max || 1);
    return `<div class="ccnode assist ${sel}" data-node="${id}" style="left:${n.x}px;top:${n.y}px">
      <div class="cchead" data-grip="${id}"><span>モダン：アシストコンボ</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
      <div class="ccbody">
        <div class="ccnm">${esc(a ? a[0] : "アシストコンボ")}</div>
        <div class="dots" role="group" aria-label="何段目まで">${Array.from({ length: max }, (_, i) => `<button class="dot ${i < k ? "on" : ""}" data-adot="${id}" data-k="${i + 1}" aria-label="${i + 1}段目">${i + 1}</button>`).join("")}</div>
        <div class="note"><b style="color:var(--ink)">${k}段目まで</b>（全${max}段）</div>
        <div class="cccmd" style="flex-wrap:wrap;gap:2px">${assistHTML(a, k)}</div>
        ${a && a[2] ? `<div class="note">${esc(a[2])}</div>` : ""}
        <select data-aidx="${id}" aria-label="アシストコンボの種類">${(CMAP[C.char]?.modernExtra || []).map((x, i) => `<option value="${i}" ${i === n.idx ? "selected" : ""}>${esc(x[0])}</option>`).join("")}</select>
      </div>
      <span class="handle" data-handle="${id}" title="ドラッグして次のカードにつなぐ"></span></div>`;
  }
  if (n.type === "cond") return `<div class="ccnode cond ${sel}" data-node="${id}" style="left:${n.x}px;top:${n.y}px">
      <div class="cchead" data-grip="${id}"><span>状況・前提</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
      <input type="text" class="condtext" data-cond="${id}" value="${esc(n.text || "")}" placeholder="例：パニカン時" list="condList">
      <span class="handle" data-handle="${id}" title="ドラッグして次のカードにつなぐ"></span></div>`;
  const v = nodeView(n); if (!v) return "";
  const j = judgeNode(ch, id); const mk = j ? MARK[j.mark] : null;
  const r = rowFor(v, n.str); const dmg = fNum(r?.[7]); const st = fNum(r?.[1]);
  const media = v.video ? `<video data-src="${v.video}" muted loop playsinline preload="none"></video>`
    : v.kind === "normal" ? `<div class="nmedia"><span class="btnlabel">${esc(v.label)}</span><span class="nbig">${nodeCmdHTML(v, true)}</span></div>`
    : `<span class="btnlabel">${esc(v.label || v.name)}</span>`;
  return `<div class="ccnode ${sel}" data-node="${id}" style="left:${n.x}px;top:${n.y}px">
    <div class="cchead" data-grip="${id}"><span>${esc(v.kind === "normal" ? "通常技" : v.kind === "sys" ? "システム" : v.cat)}</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
    <div class="ccmedia" data-grip="${id}">${media}</div>
    <div class="ccbody">
      ${v.kana && v.kind !== "normal" ? `<span class="kana">${esc(v.kana)}</span>` : ""}
      <div class="ccnm">${esc(v.sname)}${v.kind === "normal" ? `<small>${esc(v.name)}</small>` : ""}</div>
      <div class="cccmd">${nodeCmdHTML(v, true)}</div>
      <div class="ccfoot"><span class="note">${st != null ? `発生${st}F` : ""}${dmg ? `・${dmg}ダメ` : ""}</span>
        ${strable(v) ? `<select data-str="${id}" aria-label="強さ">${STRS.map(s => `<option value="${s}" ${s === (n.str || "") ? "selected" : ""}>${s || "強さ"}</option>`).join("")}</select>` : ""}
        ${mk && mk[0] ? `<span class="mk ${j.mark}" title="${esc(j.text)}" tabindex="0">${mk[0]}</span>` : ""}</div>
    </div>
    <span class="handle" data-handle="${id}" title="ドラッグして次のカードにつなぐ"></span>
  </div>`;
}
function drawEdges(temp) {
  const svg = $("#ccSvg"); if (!svg || !C.chart) return;
  const ch = C.chart; const box = $(".ccinner").getBoundingClientRect();
  const rect = id => { const el = $(`[data-node="${id}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, h: r.height }; };
  let out = "", labels = "";
  ch.edges.forEach((e, i) => {
    const a = rect(e.from), b = rect(e.to); if (!a || !b) return;
    const x1 = a.r, y1 = a.t + Math.min(a.h / 2, 90), x2 = b.l, y2 = b.t + Math.min(b.h / 2, 90); const dx = Math.max(30, (x2 - x1) / 2);
    out += `<path class="ccedge" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}" marker-end="url(#ccah)"/>`;
    labels += `<button class="elabel" data-edge="${i}" style="left:${(x1 + x2) / 2}px;top:${(y1 + y2) / 2}px" title="押すとつなぎ方を変更／削除">${esc(LINKS[e.link || ""])}</button>`;
  });
  if (temp) out += `<path class="ccedge temp" d="M${temp.x1},${temp.y1} L${temp.x2},${temp.y2}"/>`;
  svg.innerHTML = `<defs><marker id="ccah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8a94c2"/></marker></defs>${out}`;
  $$(".elabel").forEach(x => x.remove()); $(".ccinner").insertAdjacentHTML("beforeend", labels);
}
let ccIO = null;
function setupNodeVideos() {
  if (ccIO) ccIO.disconnect();
  ccIO = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause(); }), { rootMargin: "80px" });
  $$("#ccCanvas video[data-src]").forEach(v => ccIO.observe(v));
}
function rerenderChart() { const keep = $("#ccCanvas"); const sx = keep?.scrollLeft, sy = keep?.scrollTop; $("#ccMain").innerHTML = chartHTML(); drawEdges(); setupNodeVideos(); const c = $("#ccCanvas"); if (c) { c.scrollLeft = sx || 0; c.scrollTop = sy || 0; } renderSideList(); }
function renderSideList() {
  const el = $(".ccside .mlist"); if (!el) return;
  el.innerHTML = chartsOf(C.char).map(([id, r]) => `<button class="matchitem" data-chart="${id}" aria-current="${id === C.sel}">${esc(r.name || "無題のチャート")}<small>${r.v === 2 ? Object.values(r.nodes || {}).filter(n => n.type === "move").length + "技" : (r.steps || []).length + "技"}${LOCAL.recipes[id] ? "・未公開" : ""}</small></button>`).join("");
}

/* ---------- 追加 ---------- */
function placeAfter(pid) {
  const ch = C.chart;
  if (!pid || !ch.nodes[pid]) {
    const ys = Object.values(ch.nodes).map(n => n.y); return { x: 30, y: ys.length ? Math.max(...ys) + 330 : 30 };
  }
  const p = ch.nodes[pid]; const kids = childrenOf(ch, pid).map(e => ch.nodes[e.to]).filter(Boolean);
  const x = p.x + NODE_W + GAP_X; let y = p.y;
  if (kids.length) y = Math.max(...kids.map(k => k.y)) + 300 + GAP_Y;
  return { x, y };
}
function addNode(node) {
  const ch = C.chart; const id = "n" + uid(); const from = C.picked && ch.nodes[C.picked] ? C.picked : null;
  Object.assign(node, placeAfter(from)); ch.nodes[id] = node;
  if (from) {
    let link = "";
    if (node.type === "move") { const pm = prevMove({ ...ch, edges: [...ch.edges, { from, to: id }] }, id); const a = pm.node && view(pm.node.ref), b = view(node.ref); const r = a && b && rel(a, b, pm.node.str, node.str); if (r) link = r.type === "link" ? "link" : r.type === "chain" ? "chain" : "cancel"; }
    ch.edges.push({ from, to: id, link });
  }
  C.picked = id; touch(); rerenderChart();
  const el = $(`[data-node="${id}"]`); el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}
function pickerHTML() {
  const ch = C.chart; const c = CMAP[C.char];
  const tabs = ["おすすめ", "通常技", "特殊技", "必殺技", "SA", "システム"];
  const q = norm(C.q);
  const pm = C.picked && ch.nodes[C.picked] ? (ch.nodes[C.picked].type === "move" ? { node: ch.nodes[C.picked], conds: [] } : prevMove(ch, C.picked)) : null;
  const a = pm?.node ? view(pm.node.ref) : null; const f = condFlags(pm?.conds || []);
  const all = [...normalsOf(c.id), ...movesOf(c.id), ...SYS_ITEMS.map(x => view(x.id))];
  let pool;
  if (q) pool = all.filter(v => norm(v.name).includes(q) || norm(v.kana).includes(q) || norm(v.label || "").includes(q) || norm(v.cmd || "").includes(q));
  else if (C.tab === "おすすめ") pool = a ? all.filter(v => { const r = rel(a, v, pm.node.str); return r && (r.sit === "normal" || (r.sit === "ch" && (f.ch || f.pc)) || (r.sit === "pc" && f.pc)); }) : normalsOf(c.id).filter(isGround);
  else pool = C.tab === "通常技" ? normalsOf(c.id) : C.tab === "システム" ? SYS_ITEMS.map(x => view(x.id)) : movesOf(c.id).filter(v => v.cat === C.tab);
  const extra = !q && C.tab === "おすすめ" && a ? all.filter(v => { const r = rel(a, v, pm.node.str); return r && r.sit !== "normal" && !((r.sit === "ch" && (f.ch || f.pc)) || (r.sit === "pc" && f.pc)); }) : [];
  const item = v => { const r = a ? rel(a, v, pm.node.str) : null; return `<button class="pkcard ${r ? r.sit : ""}" data-addref="${v.id}" title="${esc(r ? SIT[r.sit] + "：" + r.text : "")}">
      ${v.video ? `<video src="${v.video}#t=0.6" muted playsinline preload="metadata"></video>` : `<span class="btnlabel" style="font-size:20px">${esc(v.kind === "normal" ? v.label : v.label || v.name)}</span>`}
      <span class="pknm">${esc(v.kind === "normal" ? v.label : v.name)}${v.kind === "normal" ? ` <small>${esc(v.name)}</small>` : ""}</span>
      <span class="pkcmd">${v.kind === "normal" ? (PREF.ctrl === "modern" ? (v.mcmd ? cmdHTML(v.mcmd) : "") : cmdHTML(normalText(v))) : cmdHTML(v.cmd || "")}</span></button>`; };
  return `<div class="row" style="justify-content:space-between"><h2 style="margin:0">技を追加${a ? `<span class="note">（「${esc(nodeView(pm.node)?.sname)}」の後ろ）</span>` : ""}</h2><button class="btn" data-close>閉じる</button></div>
    <input type="search" id="pkq" value="${esc(C.q)}" placeholder="技名・よみ・コマンドで検索" aria-label="技を検索">
    <div class="chips">${tabs.map(t => `<button class="chip" data-pktab="${t}" aria-pressed="${t === C.tab && !q}">${t}${t === "おすすめ" && a ? "（つながる技）" : ""}</button>`).join("")}</div>
    <div class="pkgrid">${pool.map(item).join("") || `<p class="note">${C.tab === "おすすめ" && a ? "フレームデータ上、通常ヒットでつながる地上技はありません（ダウン技・空中技など）。ほかのタブから自由に選べます。" : "該当なし"}</p>`}</div>
    ${extra.length ? `<details><summary class="sit-ch">カウンター／パニカン時だけつながる技（${extra.length}）</summary><div class="pkgrid">${extra.map(item).join("")}</div></details>` : ""}`;
}
function openPicker() { openModal(`<div class="wide"></div>${pickerHTML()}`); $("#pkq")?.focus(); }

/* ---------- イベント ---------- */
const inCombo = () => typeof TAB !== "undefined" && TAB === "combo";
document.addEventListener("click", e => {
  if (!inCombo()) return;
  const t = e.target;
  const cc = t.closest("[data-cchar]"); if (cc) { if (C.dirty) saveChart(); C.char = cc.dataset.cchar; PREF.cChar = C.char; savePref(); C.sel = null; C.chart = null; renderCombo(); return; }
  const cl = t.closest("[data-chart]"); if (cl) { if (C.dirty) saveChart(); C.sel = cl.dataset.chart; C.chart = null; C.picked = null; renderCombo(); return; }
  if (t.closest("#ccNew")) { if (C.dirty) saveChart(); const id = "r" + uid(); LOCAL.recipes[id] = { v: 2, cid: C.char, name: "", note: "", nodes: {}, edges: [], createdAt: Date.now() }; delete LOCAL.deletedR[id]; commit(); C.sel = id; C.chart = null; C.picked = null; renderCombo(); C.tab = "通常技"; openPicker(); return; }
  if (t.closest("#ccImport")) { openImport(); return; }
  if (t.closest("#impGo")) { runImport(); return; }
  if (!C.chart) return;
  // 技選び（モーダル内）
  const pt = t.closest("[data-pktab]"); if (pt) { C.tab = pt.dataset.pktab; C.q = ""; $("#dialog").innerHTML = `<div class="wide"></div>${pickerHTML()}`; return; }
  const ar = t.closest("[data-addref]"); if (ar) { closeModal(); addNode({ type: "move", ref: ar.dataset.addref, str: "" }); return; }
  if (t.closest("#ccAddMove")) { C.tab = C.picked ? "おすすめ" : "通常技"; C.q = ""; openPicker(); return; }
  if (t.closest("#ccAddCond")) { addNode({ type: "cond", text: "" }); setTimeout(() => $(`[data-cond="${C.picked}"]`)?.focus(), 50); return; }
  if (t.closest("#ccAddAssist")) { addNode({ type: "assist", idx: 0, n: 1 }); return; }
  const ad = t.closest("[data-adot]"); if (ad) { C.chart.nodes[ad.dataset.adot].n = +ad.dataset.k; touch(); rerenderChart(); return; }
  if (t.closest("#ccImport")) { openImport(); return; }
  if (t.closest("#impGo")) { runImport(); return; }
  if (t.closest("#ccUnpick")) { C.picked = null; rerenderChart(); return; }
  const dl = t.closest("[data-del]"); if (dl) { const id = dl.dataset.del; delete C.chart.nodes[id]; C.chart.edges = C.chart.edges.filter(x => x.from !== id && x.to !== id); if (C.picked === id) C.picked = null; touch(); rerenderChart(); return; }
  const eg = t.closest("[data-edge]"); if (eg) { edgeMenu(+eg.dataset.edge); return; }
  const pl = t.closest("[data-play]"); if (pl) { playRoute(routes(C.chart)[+pl.dataset.play]); return; }
  if (t.closest("#ccDup")) { saveChart(); const r = JSON.parse(JSON.stringify(C.chart)); r.name = (r.name || "") + "（コピー）"; r.createdAt = Date.now(); const id = "r" + uid(); LOCAL.recipes[id] = r; commit(); C.sel = id; C.chart = null; renderCombo(); toast("複製しました"); return; }
  if (t.closest("#ccDel")) {
    openModal(`<h2>「${esc(C.chart.name || "無題のチャート")}」を削除しますか？</h2><p class="note">元に戻せません。共有済みのチャートは、書き出して公開するまで他の人の画面には残ります。</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>やめる</button><button class="btn danger" id="ccDelOk">削除する</button></div>`);
    $("#ccDelOk").onclick = () => { delete LOCAL.recipes[C.sel]; if (SHARED.recipes?.[C.sel]) LOCAL.deletedR[C.sel] = 1; commit(); C.sel = null; C.chart = null; C.dirty = false; closeModal(); renderCombo(); }; return;
  }
  // カードを選ぶ（ドラッグでなければ）
  const nd = t.closest("[data-node]");
  if (nd && !t.closest("select,input,button,video") && !C.moved) { C.picked = C.picked === nd.dataset.node ? null : nd.dataset.node; rerenderChart(); return; }
  if (nd && t.closest("video") && !C.moved) { const v = view(C.chart.nodes[nd.dataset.node]?.ref); if (v && v.kind !== "sys") openDetail(v.id); }
});
function edgeMenu(i) {
  const e = C.chart.edges[i]; if (!e) return;
  openModal(`<h2>つなぎ方</h2><div class="chips">${Object.entries(LINKS).map(([k, t]) => `<button class="chip" data-setlink="${k}" aria-pressed="${k === (e.link || "")}">${k ? t : "指定なし"}</button>`).join("")}</div>
    <div class="row" style="justify-content:space-between"><button class="btn danger" id="edDel">この線を消す</button><button class="btn" data-close>閉じる</button></div>`);
  $$("[data-setlink]").forEach(b => b.onclick = () => { e.link = b.dataset.setlink; touch(); closeModal(); rerenderChart(); });
  $("#edDel").onclick = () => { C.chart.edges.splice(i, 1); touch(); closeModal(); rerenderChart(); };
}
document.addEventListener("input", e => {
  if (!inCombo() || !C.chart) return;
  const t = e.target;
  if (t.id === "ccName") { C.chart.name = t.value; touch(); }
  if (t.id === "ccNote") { C.chart.note = t.value; touch(); }
  if (t.dataset.cond) { C.chart.nodes[t.dataset.cond].text = t.value; touch(); clearTimeout(C.condT); C.condT = setTimeout(() => { const pos = t.selectionStart, id = t.dataset.cond; rerenderChart(); const n = $(`[data-cond="${id}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 700); }
  if (t.id === "pkq") { C.q = t.value; const pos = t.selectionStart; $("#dialog").innerHTML = `<div class="wide"></div>${pickerHTML()}`; const s = $("#pkq"); s.focus(); s.setSelectionRange(pos, pos); }
});
document.addEventListener("change", e => {
  if (!inCombo() || !C.chart) return;
  const t = e.target;
  if (t.dataset.str) { C.chart.nodes[t.dataset.str].str = t.value; touch(); rerenderChart(); }
  if (t.dataset.aidx) { const n = C.chart.nodes[t.dataset.aidx]; n.idx = +t.value; n.n = 1; touch(); rerenderChart(); }
});
/* ドラッグで移動・線を引く */
document.addEventListener("pointerdown", e => {
  if (!inCombo() || !C.chart) return;
  const h = e.target.closest("[data-handle]");
  if (h) { e.preventDefault(); C.link = { from: h.dataset.handle }; return; }
  const g = e.target.closest("[data-grip]"); if (!g || e.target.closest("button,select,input")) return;
  const n = C.chart.nodes[g.dataset.grip]; if (!n) return;
  C.drag = { id: g.dataset.grip, sx: e.clientX, sy: e.clientY, x: n.x, y: n.y }; C.moved = false;
});
document.addEventListener("pointermove", e => {
  if (!inCombo() || !C.chart) return;
  if (C.drag) {
    const d = C.drag, dx = e.clientX - d.sx, dy = e.clientY - d.sy; if (Math.abs(dx) + Math.abs(dy) > 4) C.moved = true; if (!C.moved) return;
    const n = C.chart.nodes[d.id]; n.x = Math.max(0, Math.round((d.x + dx) / 10) * 10); n.y = Math.max(0, Math.round((d.y + dy) / 10) * 10);
    const el = $(`[data-node="${d.id}"]`); if (el) { el.style.left = n.x + "px"; el.style.top = n.y + "px"; } drawEdges();
  } else if (C.link) {
    const box = $(".ccinner").getBoundingClientRect(); const a = $(`[data-node="${C.link.from}"]`).getBoundingClientRect();
    drawEdges({ x1: a.right - box.left, y1: a.top - box.top + Math.min(a.height / 2, 90), x2: e.clientX - box.left, y2: e.clientY - box.top });
  }
});
document.addEventListener("pointerup", e => {
  if (!inCombo() || !C.chart) return;
  if (C.drag) { if (C.moved) { touch(); rerenderChart(); setTimeout(() => (C.moved = false), 0); } C.drag = null; return; }
  if (C.link) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node]"); const from = C.link.from; C.link = null;
    if (el && el.dataset.node !== from && !C.chart.edges.some(x => x.from === from && x.to === el.dataset.node)) {
      const to = el.dataset.node; C.chart.edges.push({ from, to, link: "" });
      const n = C.chart.nodes[to]; if (n.type === "move") { const pm = prevMove(C.chart, to); const a = pm.node && view(pm.node.ref); const r = a && rel(a, view(n.ref), pm.node.str, n.str); const last = C.chart.edges[C.chart.edges.length - 1]; if (r) last.link = r.type === "link" ? "link" : r.type === "chain" ? "chain" : "cancel"; }
      touch(); rerenderChart();
    } else drawEdges();
  }
});
document.addEventListener("keydown", e => {
  if (!inCombo() || !C.chart || !C.picked) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || $("#modal").classList.contains("on")) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const id = C.picked; delete C.chart.nodes[id]; C.chart.edges = C.chart.edges.filter(x => x.from !== id && x.to !== id); C.picked = null; touch(); rerenderChart(); }
});
window.addEventListener("resize", () => { if (inCombo() && C.chart) drawEdges(); });

/* ---------- ルートの再生 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function playRoute(path) {
  if (!path) return; const ch = C.chart;
  const items = path.map(id => ({ id, n: ch.nodes[id] })).filter(x => x.n);
  const id = ++C.playId;
  openModal(`<div class="row" style="justify-content:space-between"><h2 style="margin:0">ルート再生</h2><div class="row"><span class="note">速度</span>${[1, 1.5, 2].map(x => `<button class="btn small" data-prate="${x}" aria-pressed="${C.rate === x}">${x}倍</button>`).join("")}<button class="btn" data-close>閉じる</button></div></div>
    <div class="player" id="prStage"><div class="ov" id="prOv"></div></div>`, () => { C.playId++; });
  $$("[data-prate]").forEach(b => b.onclick = () => { C.rate = +b.dataset.prate; $$("[data-prate]").forEach(x => x.setAttribute("aria-pressed", +x.dataset.prate === C.rate)); const v = $("#prStage video"); if (v) v.playbackRate = C.rate; });
  const alive = () => C.playId === id && $("#prStage");
  for (const it of items) {
    if (!alive()) return;
    const stage = $("#prStage"); $$("video", stage).forEach(v => v.remove());
    if (it.n.type === "cond") { $("#prOv").innerHTML = `<div class="cap"><div class="who">状況・前提</div><div class="nm">${esc(it.n.text || "")}</div></div>`; await sleep(1100 / C.rate); continue; }
    const v = nodeView(it.n); if (!v) continue;
    $("#prOv").innerHTML = `<div class="cap"><div class="nm">${esc(v.sname)}</div><div class="k">${nodeCmdHTML(v)}</div></div>`;
    if (v.video) {
      const el = document.createElement("video"); el.src = v.video; el.muted = true; el.playsInline = true; el.autoplay = true; stage.prepend(el); el.playbackRate = C.rate;
      await new Promise(res => { el.onended = res; el.onerror = res; el.onplay = () => (el.playbackRate = C.rate); const iv = setInterval(() => { if (!alive()) { clearInterval(iv); res(); } }, 200); });
    } else await sleep(1200 / C.rate);
  }
}

/* =========================================================
   テキストからチャートを作る
   例：「2中P > 236強P」「屈中P→強波動拳」「cr.MP xx 236HP」「5LP 5LP 2MK xx DR 5HP」
   1行が1ルート。行の頭が同じ技なら、そこから分岐として合流させる。
   ========================================================= */
const STR_MAP = { "弱": "弱", "中": "中", "強": "強", "小": "弱", "大": "強", L: "弱", M: "中", H: "強", l: "弱", m: "中", h: "強", OD: "OD", EX: "OD", od: "OD", ex: "OD" };
function splitTokens(line) {
  // 区切りの種類（キャンセルか）も残す
  const out = []; let rest = line.trim(); let link = "";
  const re = /^(.*?)(\s*(?:xx|XX|キャンセル|ｷｬﾝｾﾙ)\s*|\s*(?:>|＞|→|->|=>|⇒|▶|▸|,|、|，|~|〜|／|\/)\s*|\s+)/;
  while (rest) {
    const m = rest.match(re);
    if (!m) { out.push({ t: rest, link }); break; }
    if (m[1].trim()) out.push({ t: m[1].trim(), link });
    link = /xx|XX|キャンセル|ｷｬﾝｾﾙ/.test(m[2]) ? "cancel" : "";
    rest = rest.slice(m[0].length);
  }
  return out.filter(x => x.t);
}
function parseToken(tok, cid) {
  let t = tok.normalize("NFKC").trim();
  // 状況
  if (/^[\(（\[【].*[\)）\]】]$/.test(t)) t = t.slice(1, -1).trim();
  if (/^(PC|パニカン|パニッシュカウンター|パニッシュ|CH|カウンター|画面端|端|中央|画面中央|起き攻め|DI|インパクト|壁)$/i.test(t) && !/^(DI|インパクト)$/i.test(t)) return { type: "cond", text: t.replace(/^PC$/i, "パニカン時").replace(/^CH$/i, "カウンター時") };
  // システム
  const sysMap = [[/^(DRC|DR|ドライブラッシュ|ラッシュ|CDR|キャンセルラッシュ|キャンセルドライブラッシュ)$/i, "sys-drc"], [/^(PDR|パリィラッシュ|パリィドライブラッシュ|生ラッシュ)$/i, "sys-pdr"], [/^(DI|インパクト|ドライブインパクト)$/i, "sys-di"], [/^(前ステ|前ステップ|ダッシュ|66)$/i, "sys-dash"], [/^(前ジャンプ|ジャンプ|9)$/i, "sys-jump"], [/^(投げ|通常投げ)$/i, "sys-throw"]];
  for (const [re, id] of sysMap) if (re.test(t)) return { type: "move", ref: id, str: "" };
  const nm = normalsOf(cid), mv = movesOf(cid);
  // 通常技：5中P 2MP cr.MP 屈中P 立ち強K j.HK J強P 小P 大K
  let m = t.match(/^(5|2|8|j\.?|J\.?|ジャンプ|垂直J|立ち?|屈|しゃがみ|st\.?|s\.|cr\.?|c\.|n\.)?\s*(弱|中|強|小|大|L|M|H|l|m|h)\s*(P|K|p|k)$/);
  if (m) {
    const pos = !m[1] || /^(5|立|st|s\.|n\.)/i.test(m[1]) ? "s" : /^(2|屈|しゃがみ|cr|c\.)/i.test(m[1]) ? "c" : /垂直|8/.test(m[1]) ? "v" : "j";
    const key = pos + { 弱: "L", 中: "M", 強: "H" }[STR_MAP[m[2]]] + m[3].toUpperCase();
    const v = nm.find(x => x.key === key) || (pos === "v" ? nm.find(x => x.key === "j" + key.slice(1)) : null);
    if (v) return { type: "move", ref: v.id, str: "" };
  }
  // コマンド表記：236HP 236強P 623PP 214K 41236P
  m = t.match(/^((?:[1-9]){2,}|[1-9]?\[?[1-9]\]?[1-9])\s*(弱|中|強|小|大|L|M|H|OD|EX|l|m|h)?\s*(P|K|p|k)(P|K|p|k)?$/i);
  if (m) {
    const digits = m[1].replace(/[\[\]]/g, ""); const pk = m[3].toUpperCase(); const str = m[4] ? "OD" : (m[2] ? STR_MAP[m[2]] || STR_MAP[m[2].toUpperCase()] : "");
    const cands = mv.filter(v => { const c = (ITEMS[v.id]?.item.cmd || "").replace(/\s/g, ""); return c === digits + pk || c === digits + "+" + pk; });
    const v = cands.find(x => !isAirName(x)) || cands[0];
    if (v) return { type: "move", ref: v.id, str };
  }
  // 技名：強波動拳 OD昇龍拳 EX波動 中足 など
  m = t.match(/^(OD|EX|弱|中|強|小|大)?\s*(.+)$/i);
  const pre = m && m[1] ? STR_MAP[m[1]] || STR_MAP[m[1].toUpperCase()] || "" : ""; const body = norm(m ? m[2] : t);
  const ALIAS = { "中足": "cMK", "大足": "cHK", "小足": "cLK", "中パン": "sMP", "大パン": "sHP", "小パン": "sLP", "中k": "sMK", "強k": "sHK" };
  for (const [k, key] of Object.entries(ALIAS)) if (norm(t) === norm(k)) { const v = nm.find(x => x.key === key); if (v) return { type: "move", ref: v.id, str: "" }; }
  const all = [...mv, ...nm];
  let v = all.find(x => norm(x.name) === body) || all.find(x => norm(x.kana) === body) || all.find(x => norm(x.label) === norm(t));
  if (!v && body.length >= 2) v = mv.filter(x => norm(x.name).startsWith(body) || norm(x.name).includes(body)).sort((a, b) => a.name.length - b.name.length)[0];
  if (v) return { type: "move", ref: v.id, str: v.kind === "move" && strable(v) ? pre : "" };
  return { type: "cond", text: "？" + tok, unknown: true };
}
function parseText(text, cid) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const toks = splitTokens(line); const merged = [];
    // 「OD 波動拳」「強 昇龍拳」のように強さだけ離れているものは次とくっつける
    for (let i = 0; i < toks.length; i++) { if (/^(OD|EX|弱|中|強|大|小)$/i.test(toks[i].t) && toks[i + 1]) { merged.push({ t: toks[i].t + toks[i + 1].t, link: toks[i].link }); i++; } else merged.push(toks[i]); }
    return merged.map(x => ({ ...parseToken(x.t, cid), link: x.link, src: x.t }));
  });
}
function openImport() {
  openModal(`<div class="wide"></div><div class="row" style="justify-content:space-between"><h2 style="margin:0">テキストからチャートを作る（${esc(CMAP[C.char].name)}）</h2><button class="btn" data-close>閉じる</button></div>
    <div class="note">攻略サイトなどのコンボ表記を貼り付けてください。1行が1ルートで、行の頭が同じ技なら分岐としてまとめます。<br>
    読める書き方の例：<code>2中P > 強波動拳</code>　<code>屈中P→236強P</code>　<code>cr.MP xx 236HP</code>　<code>5LP 5LP 2MK xx DR 5HP > 623PP</code>　<code>(PC) 立強P > 昇龍拳</code></div>
    <textarea id="impText" rows="6" placeholder="例：&#10;2MP xx 236HP&#10;2MP xx DR 5HP > 623PP">${esc(C.impText || "")}</textarea>
    <div class="row"><button class="btn" id="impPrev">読み取り結果を見る</button><label class="row note"><input type="checkbox" id="impAppend" ${C.chart ? "" : "disabled"}> 今のチャートに追加する</label><button class="btn primary" id="impGo">チャートを作る</button></div>
    <div id="impOut"></div>`);
  $("#impPrev").onclick = previewImport; $("#impText").focus();
}
function previewImport() {
  const rows = parseText($("#impText").value, C.char); C.impText = $("#impText").value;
  $("#impOut").innerHTML = rows.map((r, i) => `<div class="impline"><b>ルート${i + 1}</b> ${r.map(x => x.type === "cond" ? `<span class="condpill ${x.unknown ? "bad" : ""}">${esc(x.text)}</span>` : `<span class="imptok" title="元の表記：${esc(x.src)}">${x.link === "cancel" ? '<small>C</small>' : ""}${esc(nodeView(x)?.sname || x.src)}</span>`).join(" → ")}</div>`).join("") || `<p class="note">読み取れる技がありません</p>`;
}
function runImport() {
  const text = $("#impText")?.value || ""; C.impText = text;
  const rows = parseText(text, C.char); if (!rows.length) { toast("コンボの表記を貼り付けてください"); return; }
  const append = $("#impAppend")?.checked && C.chart;
  if (!append) { if (C.dirty) saveChart(); const id = "r" + uid(); C.sel = id; C.chart = { v: 2, cid: C.char, name: rows[0].filter(x => x.type === "move").slice(0, 3).map(x => nodeView(x)?.sname).join(" > "), note: "元の表記：\n" + text.trim(), nodes: {}, edges: [], createdAt: Date.now() }; C.chartId = id; }
  const ch = C.chart; const baseY = Math.max(0, ...Object.values(ch.nodes).map(n => n.y + 330)); let row = 0;
  const tree = []; // [{tok key, id, kids}]
  rows.forEach(r => {
    let level = tree, prevId = null, col = 0;
    r.forEach(tok => {
      const key = tok.type === "cond" ? "c:" + tok.text : tok.ref + "|" + tok.str;
      let hit = level.find(x => x.key === key);
      if (!hit) {
        const id = "n" + uid(); const isNewRow = level !== tree && level.length > 0;
        if (isNewRow || (level === tree && tree.length > 0 && col === 0)) row++;
        ch.nodes[id] = tok.type === "cond" ? { type: "cond", text: tok.text, x: 30 + col * (NODE_W + GAP_X), y: baseY + row * 330 } : { type: "move", ref: tok.ref, str: tok.str || "", x: 30 + col * (NODE_W + GAP_X), y: baseY + row * 330 };
        if (prevId) { let link = tok.link === "cancel" ? "cancel" : ""; if (!link && tok.type === "move") { const pm = prevMove({ ...ch, edges: [...ch.edges, { from: prevId, to: id }] }, id); const a = pm.node && view(pm.node.ref); const rr = a && rel(a, view(tok.ref), pm.node.str, tok.str); if (rr) link = rr.type === "link" ? "link" : rr.type === "chain" ? "chain" : "cancel"; } ch.edges.push({ from: prevId, to: id, link }); }
        hit = { key, id, kids: [] }; level.push(hit);
      }
      prevId = hit.id; level = hit.kids; col++;
    });
  });
  LOCAL.recipes[C.sel] = JSON.parse(JSON.stringify(ch)); delete LOCAL.deletedR[C.sel]; commit();
  closeModal(); C.picked = null; renderCombo();
  const unk = rows.flat().filter(x => x.unknown).length;
  toast(unk ? `チャートを作りました。読み取れなかった表記が${unk}か所あります（「？」の状況マス）` : "チャートを作りました", 4000);
}
