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
const LINKS = { "": "→", link: "目押し", cancel: "キャンセル", chain: "連打", follow: "派生", tc: "TC", drc: "DRC", juggle: "追撃" };
/* 相手の行動：前の自分の技（ガードされた／当たった）の有利不利から、相手がそれをするとどうなるかのヒント */
const OPP_ACTIONS = ["最速技で暴れ（4F）", "投げ", "ジャンプ", "バックステップ", "無敵技（昇龍など）", "ドライブパリィ", "ドライブインパクト", "ガードを固める", "前ステップ・ドライブラッシュ", "様子見・歩き"];
function oppHint(action, adv, res) {
  const has = adv != null; const plus = has && adv > 0, minus = has && adv < 0;
  const A = has ? (adv > 0 ? `+${adv}` : `${adv}`) : "？";
  const H = {
    "最速技で暴れ（4F）": !has ? ["?", "前の技の有利不利が不明です"] : adv >= 2 ? ["win", `こちら${A}有利。発生${adv + 3}F以下の技を出せば相手の4F暴れに勝つ（カウンターを取れる）。`] : adv >= 0 ? ["even", `こちら${A}。最速技どうしの勝負で相打ち〜五分。ガードかパリィが無難。`] : adv <= -4 ? ["lose", `こちら${A}不利で反撃確定。相手の発生${-adv}F以下の技が確定で入る。`] : ["lose", `こちら${A}不利。相手の4F暴れが先に当たる。こちらはガードかパリィ。`],
    "投げ": !has ? ["?", "前の技の有利不利が不明です"] : adv >= 1 ? ["win", `こちら${A}有利。打撃を出せば相手の投げを潰せる（投げ抜けでも対応可）。`] : ["lose", `こちら${A}。相手の投げが先に決まりやすい。投げ抜け（投げ入力）で対応。`],
    "ジャンプ": ["win", "対空（昇龍・対空通常技）で落とせる。打撃や投げを置いていると空振りして飛び込みを食らう。"],
    "バックステップ": ["even", "投げ・短い打撃はかわされる。前ステップや長い技、ドライブラッシュで追う。バクステの着地に打撃を当てるとパニカン。"],
    "無敵技（昇龍など）": ["win", "ガードすれば大きな確定反撃（パニカン）。こちらが打撃を重ねていると負けるので、様子見やガードで待つ。"],
    "ドライブパリィ": ["win", "投げで崩せる（パリィ中に投げるとパニカン扱いで大ダメージ）。打撃はパリィされてゲージを回収される。"],
    "ドライブインパクト": ["win", "こちらもドライブインパクトで返すか、発生の早い技を連続で当てて止める（2回までアーマーで受け止められる）。ガードすると画面端では壁やられ。"],
    "ガードを固める": ["win", "投げが通る。ガードを崩すなら投げ・中段・ドライブインパクト。"],
    "前ステップ・ドライブラッシュ": ["win", "小技や置き技で止められる。ラッシュにはこちらの最速技・パリィで対応。"],
    "様子見・歩き": ["even", "相手は反撃や対空の準備。こちらは無理に打たず、差し合いに戻る。"],
  }[action] || ["?", "行動を選んでください"];
  return { type: H[0], text: H[1] };
}
const STRS = ["", "弱", "中", "強", "OD"];
const COND_PRESETS = ["カウンター時", "パニカン時", "画面端", "画面中央", "DRC後", "ジャンプ攻撃から", "起き攻め", "SAゲージ必要", "Dゲージ必要", "相手がしゃがみ"];
const NODE_W = 230, GAP_X = 70, GAP_Y = 40;

const C = { zoom: null, char: null, sel: null, chart: null, dirty: false, picked: null, q: "", tab: "必殺技", drag: null, link: null, playId: 0, rate: 1.5 };

function ensureSys() {
  if (ITEMS["sys-drc"]) return;
  SYS_ITEMS.forEach(x => { ITEMS[x.id] = { item: { ...x, kana: "", cat: "システム" }, cid: "sys", kind: "sys" }; });
}
function cleanupCombo() { C.playId++; if (C.dirty) saveChart(); }

/* 強さ（弱中強OD）を選べる技か：クラシックのコマンドの最後が強さ指定のないP/K */
/* その技で選べる強さ（ボタン長押しで性質が変わる技は「溜め弱」なども） */
function strOpts(v) {
  const holds = []; (v?.frames || []).forEach(f => { const t = String(f[0] || "").replace(/\s/g, ""); if (!/ホールド/.test(t) || /^\(|^（|Lv/.test(t)) return; const m = t.match(/^(OD|弱|中|強)/); const k = (m ? m[1] : "") + "溜め"; if (m && !holds.includes(k)) holds.push(k); });
  return [...STRS, ...holds];
}
const strLabel = s => /溜め$/.test(s) ? "溜め" + s.replace(/溜め$/, "") : s;
const strable = v => v && v.kind === "move" && v.cat !== "SA" && /(^|[^弱中強+])[PK]$/.test(ITEMS[v.id]?.item.cmd || "");
function nodeView(n) {
  const v = view(n.ref); if (!v) return null;
  let name = v.kind === "normal" ? v.label : v.name, cmd = v.kind === "sys" && PREF.ctrl === "modern" && v.mcmd ? v.mcmd : v.cmd;
  if (n.str && strable(v)) {
    const hold = /溜め$/.test(n.str), b = n.str.replace(/溜め$/, "");
    name = (hold ? "溜め" : "") + b + v.name;
    cmd = PREF.ctrl === "modern" ? (v.cmd ? v.cmd + (b === "OD" ? "+強" : "") : "") : v.cmd.replace(/([PK])$/, b === "OD" ? "$1+$1" : b + "$1");
    if (hold && cmd) cmd += "（長押し）";
  }
  return { ...v, sname: name, scmd: cmd };
}
const nodeCmdHTML = (sv, big) => sv.kind === "normal"
  ? (PREF.ctrl === "modern" ? ((sv.mcmd || sv.mnorm) ? cmdHTML(sv.mcmd || sv.mnorm, { big }) : `<span class="note">モダンでは出せない</span>`) : cmdHTML(normalText(sv), { big }))
  : cmdHTML(sv.scmd || "", { big });
const normalText = sv => (sv.key[0] === "c" ? "2" : "") + BTN_JA[sv.key.slice(1)];

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
    if (n.type === "opp") return { node: null, opp: n, conds, link };
    cur = p.from;
  }
  return { node: null, conds, link };
}
/* 技カードのすぐ前に置かれた状況マス（その技がどう当たったか） */
function condsBefore(ch, id) {
  const out = []; let cur = id;
  for (let g = 0; g < 20; g++) { const p = parentsOf(ch, cur)[0]; if (!p) break; const n = ch.nodes[p.from]; if (!n || n.type !== "cond") break; out.push(n.text || ""); cur = p.from; }
  return out;
}
/* 状況マスに書かれた前提から、カウンター／パニカン扱いにするか */
const condFlags = conds => ({ pc: conds.some(t => /パニ|PC|パニッシュ/i.test(t)), ch: conds.some(t => /カウンター|CH/i.test(t)) && !conds.some(t => /パニ/.test(t)), other: conds.some(t => /DRC|ドライブラッシュ|画面端|ジャンプ|追撃|壁/.test(t)) });
function judgeNode(ch, id) {
  const n = ch.nodes[id]; if (!n || n.type !== "move") return null;
  const pm = prevMove(ch, id);
  if (pm.assist) return { mark: "unk", text: "アシストコンボのあとは計算外（最後の段の技が分からないため）" };
  if (pm.opp) return { mark: "start", text: "相手の行動への対応" };
  if (!pm.node) return { mark: "start", text: "始動" };
  const a = view(pm.node.ref), b = view(n.ref); const hc = [...condsBefore(ch, pm.id), ...pm.conds]; const f = condFlags(hc); const an = nodeView(pm.node)?.sname || a?.name;
  if (!a || !b) return { mark: "unk", text: "判定できません" };
  if (a.kind === "sys" || b.kind === "sys") return { mark: "unk", text: "システム行動をはさむため計算外" };
  const r = rel(a, b, pm.node.str, n.str);
  if (r) {
    if (r.sit === "normal") return { mark: "ok", text: `つながる：${r.text}` };
    if (r.sit === "ch" && (f.ch || f.pc)) return { mark: "okc", text: `「${an}」が${f.pc ? "パニカン" : "カウンター"}で当たった分の有利でつながる：${r.text}` };
    if (r.sit === "pc" && f.pc) return { mark: "okc", text: `「${an}」がパニカンで当たった分の有利でつながる：${r.text}` };
    return { mark: "warn", text: `${SIT[r.sit]}ならつながる（「${an}」の前に状況マス「${r.sit === "pc" ? "パニカン時" : "カウンター時"}」を置くと○）：${r.text}` };
  }
  if (f.other) return { mark: "unk", text: `前提（${hc.join("・")}）があるため計算外。実戦で確認してください` };
  if (!isGround(a) || !isGround(b)) return { mark: "unk", text: "空中の技を含むため計算外（空中コンボ・着地コンボ）" };
  const ra = rowFor(a, pm.node.str);
  if (/D/.test(String(ra?.[4] || ""))) return { mark: "unk", text: "前の技でダウン・浮きが発生。追撃できるかはデータから計算できません" };
  return { mark: "ng", text: "フレームデータ上はつながりません（ヒット時の有利が足りない、またはキャンセル不可）" };
}
const MARK = { ok: ["○", "つながる"], okc: ["○", "前提ありでつながる"], warn: ["△", "条件つき"], unk: ["？", "計算外"], ng: ["✕", "つながらない"], start: ["", ""] };

/* ---------- ルート集計 ---------- */
function routes(ch) {
  const roots = Object.keys(ch.nodes).filter(id => ch.nodes[id].type !== "memo" && !parentsOf(ch, id).length);
  const out = [];
  const walk = (id, path, seen) => {
    if (seen.has(id)) return; const p = [...path, id]; const kids = childrenOf(ch, id);
    const kidsOk = kids.filter(k => ch.nodes[k.to]?.type !== "memo");
    if (!kidsOk.length) { out.push(p); return; }
    kidsOk.forEach(k => walk(k.to, p, new Set([...seen, id])));
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
  const names = steps.filter(x => ["move", "assist", "opp"].includes(x.n.type)).map(x => x.n.type === "assist" ? `${assistOf(x.n)?.[0] || "アシスト"}×${x.n.n || 1}段` : x.n.type === "opp" ? `〔相手：${x.n.action}〕` : nodeView(x.n)?.sname).filter(Boolean);
  const hasAssist = steps.some(x => x.n.type === "assist");
  return { names, hasAssist, raw, scaled, drive, sa, ending, memo, pre, bad, count: moves.length };
}

/* ---------- 描画 ---------- */
function renderCombo() {
  ensureSys();
  if (!C.char) C.char = PREF.cChar || "ryu";
  if (C.zoom == null) C.zoom = PREF.ccZoom || 1;
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
  const W = Math.max(900, ...ids.map(id => { const n = ch.nodes[id]; return n.x + (n.w || NODE_W) + 120; })); const H = Math.max(420, ...ids.map(id => { const n = ch.nodes[id]; return n.y + (n.h || 320) + 60; }));
  const pk = C.picked && ch.nodes[C.picked];
  return `<div class="row" style="justify-content:space-between;align-items:flex-end">
      <input type="text" id="ccName" class="ccname" value="${esc(ch.name)}" placeholder="チャート名（例：屈中P始動 中央コンボ）" aria-label="チャート名">
      <div class="row"><button class="btn small" id="ccDup">複製</button><button class="btn small danger" id="ccDel">削除</button></div>
    </div>
    <div class="cctool">
      <button class="btn primary" id="ccAddMove">＋ 技を追加</button>
      <button class="btn" id="ccAddCond">＋ 状況マス</button>
      <button class="btn" id="ccAddOpp">＋ 相手の行動</button>
      <button class="btn" id="ccAddMemo">＋ コメント</button>
      ${PREF.ctrl === "modern" && (CMAP[C.char]?.modernExtra || []).length ? `<button class="btn" id="ccAddAssist">＋ アシストコンボ</button>` : ""}
      <button class="btn" id="ccImport">テキストから作る</button>
      <button class="btn" id="ccNoVid" aria-pressed="${!!PREF.ccNoVid}">${PREF.ccNoVid ? "☑" : "☐"} 映像なし</button>
      <button class="btn" id="ccExport">書き出し（PNG・GIF・動画）</button>
      ${pk ? `<span class="note">選択中：<b>${esc(pk.type === "move" ? nodeView(pk)?.sname : pk.text)}</b>（追加すると、このカードの後ろにつながります）</span><button class="btn small" id="ccUnpick">選択を外す</button>` : `<span class="note">カードを選ぶと、その後ろに追加されます。右端の● をドラッグして別のカードに離すと線を引けます。</span>`}
    </div>
    <div class="cczoom"><button class="btn small" data-zoom="-">－</button><button class="btn small" data-zoom="1" title="100%に戻す">${Math.round((C.zoom || 1) * 100)}%</button><button class="btn small" data-zoom="+">＋</button><button class="btn small" data-zoom="fit">全体を表示</button><span class="note">Ctrl＋マウスホイールでも拡大・縮小できます</span></div>
    <div class="cccanvas" id="ccCanvas"><div class="ccsizer" style="width:${W * (C.zoom || 1)}px;height:${H * (C.zoom || 1)}px"><div class="ccinner" data-w="${W}" data-h="${H}" style="width:${W}px;height:${H}px;transform:scale(${C.zoom || 1});transform-origin:0 0">
      <svg class="ccsvg" id="ccSvg" width="${W}" height="${H}"></svg>
      ${ids.map(id => nodeHTML(id)).join("")}
    </div></div></div>
    <div class="legend note"><span class="mk ok">○</span>つながる <span class="mk okc">○</span>前提ありでつながる <span class="mk warn">△</span>カウンター／パニカンならつながる <span class="mk unk">？</span>計算外（空中・ダウン後の追撃など） <span class="mk ng">✕</span>フレーム上つながらない　／ 印にマウスを乗せると理由が出ます<br>※「パニカン時」「カウンター時」の状況マスは、<b>すぐ後ろの技1つ</b>（その技がパニカン・カウンターで当たった扱い）にだけ効きます。始動技の前に1回置けばOKで、2技目以降は毎回置く必要はありません。</div>
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
const MEMO_FONTS = { gothic: ["ゴシック", "'Zen Kaku Gothic New',sans-serif"], maru: ["丸ゴシック", "'M PLUS Rounded 1c',sans-serif"], mincho: ["明朝", "'Shippori Mincho',serif"], heavy: ["極太", "'Dela Gothic One',sans-serif"], hand: ["手書き風", "'Yomogi',cursive"], pop: ["ポップ", "'Reggae One',sans-serif"], dot: ["ドット", "'DotGothic16',sans-serif"] };
const MEMO_SIZES = { S: 13, M: 18, L: 26, XL: 38 };
const MEMO_COLORS = ["#fff6c2", "#ffffff", "#ffd21f", "#ff5a6e", "#5fd0ff", "#7dff9a"];
/* カードの位置・大きさ（コメント／状況マスは幅と高さ、それ以外は拡大率） */
function nst(n) {
  let s = `left:${n.x}px;top:${n.y}px;`;
  if (n.type === "memo" || n.type === "cond") { if (n.w) s += `width:${n.w}px;`; if (n.h && n.type === "memo") s += `height:${n.h}px;`; }
  return s;
}
function nodeHTML(id) {
  const h = nodeHTML0(id); if (!h) return h; const t = C.chart.nodes[id].type; if (t !== "memo" && t !== "cond") return h;
  return h.replace(/<\/div>\s*$/, `<span class="rs" data-resize="${id}" title="ドラッグで大きさを変える"></span></div>`);
}
function memoHTML(id, n, sel) {
  const f = MEMO_FONTS[n.font] || MEMO_FONTS.gothic; const sz = MEMO_SIZES[n.size] || 13; const col = n.color || (n.style === "text" ? "#ffffff" : MEMO_COLORS[0]);
  return `<div class="ccnode memo ${n.style === "text" ? "plain" : ""} ${sel}" data-node="${id}" style="${nst(n)}">
      <div class="cchead" data-grip="${id}"><span>コメント</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
      <div class="mbar">
        <button class="mini" data-mstyle="${id}" title="枠つき／文字だけ を切り替え">${n.style === "text" ? "文字だけ" : "枠つき"}</button>
        <select data-mfont="${id}" aria-label="フォント">${Object.entries(MEMO_FONTS).map(([k, v]) => `<option value="${k}" ${k === (n.font || "gothic") ? "selected" : ""}>${v[0]}</option>`).join("")}</select>
        <select data-msize="${id}" aria-label="文字の大きさ">${Object.keys(MEMO_SIZES).map(k => `<option ${k === (n.size || "S") ? "selected" : ""}>${k}</option>`).join("")}</select>
        <span class="mcols">${MEMO_COLORS.map(c => `<button class="mcol ${c === col ? "on" : ""}" data-mcolor="${id}" data-c="${c}" style="background:${c}" aria-label="文字色"></button>`).join("")}</span>
      </div>
      <textarea class="memotext" data-memo="${id}" rows="3" placeholder="ここにコメント（ルートの計算には入りません）" style="font-family:${f[1].replace(/"/g, "'")};font-size:${sz}px;color:${col}">${esc(n.text || "")}</textarea></div>`;
}
function nodeHTML0(id) {
  const ch = C.chart, n = ch.nodes[id]; const sel = id === C.picked ? "picked" : "";
  if (n.type === "memo") return memoHTML(id, n, sel);
  if (n.type === "opp") {
    const pm = prevMove(ch, id); const pv = pm.node && view(pm.node.ref); const r = pv && rowFor(pv, pm.node.str);
    const adv = r ? fNum(n.res === "hit" ? r[4] : r[5]) : null; const h = oppHint(n.action, /D/.test(String(n.res === "hit" ? r?.[4] : "")) ? null : adv, n.res);
    return `<div class="ccnode opp ${sel}" data-node="${id}" style="${nst(n)}">
      <div class="cchead" data-grip="${id}"><span>相手の行動</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
      <div class="ccbody">
        ${pv ? `<div class="note">「${esc(nodeView(pm.node)?.sname)}」を <select data-ores="${id}"><option value="guard" ${n.res !== "hit" ? "selected" : ""}>ガードされた</option><option value="hit" ${n.res === "hit" ? "selected" : ""}>当てた</option></select> あと（${adv != null ? (adv > 0 ? "+" : "") + adv : "—"}）</div>` : `<div class="note">前に自分の技カードをつなぐと、有利不利から判定します</div>`}
        <select data-oact="${id}" class="oact" aria-label="相手の行動">${OPP_ACTIONS.map(a => `<option ${a === n.action ? "selected" : ""}>${a}</option>`).join("")}</select>
        <div class="ohint ${h.type}"><b>${{ win: "相手の負けになりやすい", lose: "相手の勝ちになりやすい", even: "読み合い", "?": "—" }[h.type]}</b><br>${esc(h.text)}</div>
      </div>
      <span class="handle" data-handle="${id}" title="ドラッグして、自分の対応の技につなぐ"></span></div>`;
  }
  if (n.type === "assist") {
    const a = assistOf(n); const max = assistSteps(a); const k = Math.min(n.n || 1, max || 1);
    return `<div class="ccnode assist ${sel}" data-node="${id}" style="${nst(n)}">
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
  if (n.type === "cond") return `<div class="ccnode cond ${sel}" data-node="${id}" style="${nst(n)}">
      <div class="cchead" data-grip="${id}"><span>状況・前提</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
      <input type="text" class="condtext" data-cond="${id}" value="${esc(n.text || "")}" placeholder="例：パニカン時" list="condList">
      ${(() => { const f = condFlags([n.text || ""]); return f.pc || f.ch ? `<div class="condhint">次の技<b>1つだけ</b>が${f.pc ? "パニカン" : "カウンター"}で当たった扱い（ヒット有利 +${f.pc ? 4 : 2}F）。その次からは通常ヒットで判定します。<b>始動技の前</b>に置いてください</div>` : ""; })()}
      <span class="handle" data-handle="${id}" title="ドラッグして次のカードにつなぐ"></span></div>`;
  const v = nodeView(n); if (!v) return "";
  const j = judgeNode(ch, id); const mk = j ? MARK[j.mark] : null;
  const r = rowFor(v, n.str); const dmg = fNum(r?.[7]); const st = fNum(r?.[1]);
  const sg = vSeg(v, n.str);
  const media = v.video ? `<video data-src="${v.video}" ${sg ? `data-seg="${sg.join(",")}"` : ""} muted loop playsinline preload="none"></video>${sg ? `<span class="segtag ${n.str === "OD" ? "od" : ""}">${n.str === "OD" ? "OD版の映像" : v.vs[n.str] ? VS_LABEL[n.str] + "の映像" : "通常版の映像"}</span>` : ""}`
    : v.kind === "normal" ? `<div class="nmedia"><span class="btnlabel">${esc(v.label)}</span><span class="nbig">${nodeCmdHTML(v, true)}</span></div>`
    : `<span class="btnlabel">${esc(v.label || v.name)}</span>`;
  const nv = PREF.ccNoVid || (!v.video && v.kind !== "move");
  return `<div class="ccnode ${nv ? "compact" : ""} ${v.kind === "normal" ? "nrm" : ""} ${sel}" data-node="${id}" style="${nst(n)}">
    <div class="cchead" data-grip="${id}"><span>${esc(v.kind === "normal" ? "通常技" : v.kind === "sys" ? "システム" : v.cat)}</span><button class="x" data-del="${id}" aria-label="削除">✕</button></div>
    ${nv ? "" : `<div class="ccmedia" data-grip="${id}">${media}</div>`}
    <div class="ccbody" ${nv ? `data-grip="${id}"` : ""}>
      ${(() => { const f = condFlags(condsBefore(ch, id)); return f.pc ? `<span class="hitpill pc">パニカンで当てる（ヒット+4F）</span>` : f.ch ? `<span class="hitpill ch">カウンターで当てる（ヒット+2F）</span>` : ""; })()}
      ${v.kana && v.kind !== "normal" ? `<span class="kana">${esc(v.kana)}</span>` : ""}
      <div class="ccnm">${esc(v.sname)}${v.kind === "normal" ? `<small>${esc(v.name)}</small>` : ""}</div>
      <div class="cccmd">${nodeCmdHTML(v, true)}</div>
      <div class="ccfoot"><span class="note">${st != null ? `発生${st}F` : ""}${dmg ? `・${dmg}ダメ` : ""}</span>
        ${strable(v) ? `<select data-str="${id}" aria-label="強さ">${strOpts(v).map(s => `<option value="${s}" ${s === (n.str || "") ? "selected" : ""}>${strLabel(s) || "強さ"}</option>`).join("")}</select>` : ""}
        ${mk && mk[0] ? `<span class="mk ${j.mark}" title="${esc(j.text)}" tabindex="0">${mk[0]}</span>` : ""}</div>
    </div>
    <span class="handle" data-handle="${id}" title="ドラッグして次のカードにつなぐ"></span>
  </div>`;
}
function drawEdges(temp) {
  const svg = $("#ccSvg"); if (!svg || !C.chart) return;
  const ch = C.chart; const inner = $(".ccinner"); const box = inner.getBoundingClientRect(); const k = box.width / inner.offsetWidth || 1;
  const rect = id => { const el = $(`[data-node="${id}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { l: (r.left - box.left) / k, r: (r.right - box.left) / k, t: (r.top - box.top) / k, h: r.height / k, s: 1 }; };
  let out = "", labels = "";
  ch.edges.forEach((e, i) => {
    const a = rect(e.from), b = rect(e.to); if (!a || !b) return;
    const x1 = a.r, y1 = a.t + Math.min(a.h / 2, 90 * a.s), x2 = b.l, y2 = b.t + Math.min(b.h / 2, 90 * b.s); const dx = Math.max(30, (x2 - x1) / 2);
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
  ccIO = new IntersectionObserver(es => es.forEach(e => { const v = e.target; if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; if (v.dataset.seg && !v._segStop) segPlay(v, v.dataset.seg.split(",").map(Number)); v.play().catch(() => {}); } else v.pause(); }), { rootMargin: "80px" });
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
    if (node.type === "move") { const pm = prevMove({ ...ch, edges: [...ch.edges, { from, to: id }] }, id); const a = pm.node && view(pm.node.ref), b = view(node.ref); const r = a && b && rel(a, b, pm.node.str, node.str); if (r) link = r.type === "link" ? "link" : r.type === "chain" ? "chain" : r.type === "follow" ? "follow" : r.type === "tc" ? "tc" : "cancel"; }
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
  const a = pm?.node ? view(pm.node.ref) : null; const f = condFlags(pm?.node ? [...condsBefore(ch, pm.id || C.picked), ...(pm.conds || [])] : []);
  const all = [...normalsOf(c.id), ...movesOf(c.id), ...SYS_ITEMS.map(x => view(x.id))];
  let pool;
  if (q) pool = all.filter(v => norm(v.name).includes(q) || norm(v.kana).includes(q) || norm(v.label || "").includes(q) || norm(v.cmd || "").includes(q));
  else if (C.tab === "おすすめ") pool = a ? all.filter(v => { const r = rel(a, v, pm.node.str); return r && (r.sit === "normal" || (r.sit === "ch" && (f.ch || f.pc)) || (r.sit === "pc" && f.pc)); }) : normalsOf(c.id).filter(isGround);
  else pool = C.tab === "通常技" ? normalsOf(c.id) : C.tab === "システム" ? SYS_ITEMS.map(x => view(x.id)) : movesOf(c.id).filter(v => v.cat === C.tab);
  const extra = !q && C.tab === "おすすめ" && a ? all.filter(v => { const r = rel(a, v, pm.node.str); return r && r.sit !== "normal" && !((r.sit === "ch" && (f.ch || f.pc)) || (r.sit === "pc" && f.pc)); }) : [];
  const item = v => { const r = a ? rel(a, v, pm.node.str) : null; return `<button class="pkcard ${r ? r.sit : ""}" data-addref="${v.id}" title="${esc(r ? SIT[r.sit] + "：" + r.text : "")}">
      ${v.video ? `<video src="${v.video}#t=0.6" muted playsinline preload="metadata"></video>` : `<span class="btnlabel" style="font-size:20px">${esc(v.kind === "normal" ? v.label : v.label || v.name)}</span>`}
      <span class="pknm">${esc(v.kind === "normal" ? v.label : v.name)}${v.kind === "normal" ? ` <small>${esc(v.name)}</small>` : ""}</span>
      <span class="pkcmd ${v.kind === "normal" ? "big" : ""}">${v.kind === "normal" ? nodeCmdHTML(v, true) : v.kind === "sys" ? cmdHTML(PREF.ctrl === "modern" && v.mcmd ? v.mcmd : v.cmd || "") : cmdHTML(v.cmd || "")}</span></button>`; };
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
  if (t.closest("#ccAddOpp")) { addNode({ type: "opp", action: OPP_ACTIONS[0], res: "guard" }); return; }
  if (t.closest("#ccAddMemo")) { const keep = C.picked; C.picked = null; const p = keep && C.chart.nodes[keep]; const id = "n" + uid(); const pos = placeAfter(keep); C.chart.nodes[id] = { type: "memo", text: "", x: pos.x, y: pos.y }; C.picked = id; touch(); rerenderChart(); setTimeout(() => $(`[data-memo="${id}"]`)?.focus(), 50); return; }
  if (t.closest("#ccAddAssist")) { addNode({ type: "assist", idx: 0, n: 1 }); return; }
  const ad = t.closest("[data-adot]"); if (ad) { C.chart.nodes[ad.dataset.adot].n = +ad.dataset.k; touch(); rerenderChart(); return; }
  if (t.closest("#ccImport")) { openImport(); return; }
  if (t.closest("#impGo")) { runImport(); return; }
  const zb = t.closest("[data-zoom]"); if (zb) { const k = zb.dataset.zoom; setZoom(k === "+" ? (C.zoom || 1) + 0.1 : k === "-" ? (C.zoom || 1) - 0.1 : k === "fit" ? fitZoom() : 1); return; }
  if (t.closest("#ccNoVid")) { PREF.ccNoVid = !PREF.ccNoVid; savePref(); rerenderChart(); return; }
  if (t.closest("#ccExport")) { openExport(); return; }
  const ms = t.closest("[data-mstyle]"); if (ms) { const n = C.chart.nodes[ms.dataset.mstyle]; n.style = n.style === "text" ? "box" : "text"; if (n.color === "#ffffff" || n.color === MEMO_COLORS[0]) delete n.color; touch(); rerenderChart(); return; }
  const mc = t.closest("[data-mcolor]"); if (mc) { C.chart.nodes[mc.dataset.mcolor].color = mc.dataset.c; touch(); rerenderChart(); return; }
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
  if (nd && !t.closest("select,input,textarea,button,video,.mbar") && !C.moved) { C.picked = C.picked === nd.dataset.node ? null : nd.dataset.node; rerenderChart(); return; }
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
  if (t.dataset.memo) { C.chart.nodes[t.dataset.memo].text = t.value; touch(); }
  if (t.dataset.cond) { C.chart.nodes[t.dataset.cond].text = t.value; touch(); clearTimeout(C.condT); C.condT = setTimeout(() => { const pos = t.selectionStart, id = t.dataset.cond; rerenderChart(); const n = $(`[data-cond="${id}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 700); }
  if (t.id === "pkq") { C.q = t.value; const pos = t.selectionStart; $("#dialog").innerHTML = `<div class="wide"></div>${pickerHTML()}`; const s = $("#pkq"); s.focus(); s.setSelectionRange(pos, pos); }
});
document.addEventListener("change", e => {
  if (!inCombo() || !C.chart) return;
  const t = e.target;
  if (t.dataset.str) { C.chart.nodes[t.dataset.str].str = t.value; touch(); rerenderChart(); }
  if (t.dataset.oact) { C.chart.nodes[t.dataset.oact].action = t.value; touch(); rerenderChart(); }
  if (t.dataset.ores) { C.chart.nodes[t.dataset.ores].res = t.value; touch(); rerenderChart(); }
  if (t.dataset.mfont) { C.chart.nodes[t.dataset.mfont].font = t.value; touch(); rerenderChart(); }
  if (t.dataset.msize) { C.chart.nodes[t.dataset.msize].size = t.value; touch(); rerenderChart(); }
  if (t.dataset.aidx) { const n = C.chart.nodes[t.dataset.aidx]; n.idx = +t.value; n.n = 1; touch(); rerenderChart(); }
});
/* ドラッグで移動・線を引く */
document.addEventListener("pointerdown", e => {
  if (!inCombo() || !C.chart) return;
  const h = e.target.closest("[data-handle]");
  if (h) { e.preventDefault(); C.link = { from: h.dataset.handle }; return; }
  const rz = e.target.closest("[data-resize]");
  if (rz) { e.preventDefault(); const id = rz.dataset.resize, el = $(`[data-node="${id}"]`); C.rsz = { id, sx: e.clientX, sy: e.clientY, w0: el.offsetWidth, h0: el.offsetHeight, free: true }; C.moved = true; return; }
  const g = e.target.closest("[data-grip]"); if (!g || e.target.closest("button,select,input,textarea")) return;
  const n = C.chart.nodes[g.dataset.grip]; if (!n) return;
  C.drag = { id: g.dataset.grip, sx: e.clientX, sy: e.clientY, x: n.x, y: n.y }; C.moved = false;
});
document.addEventListener("pointermove", e => {
  if (!inCombo() || !C.chart) return;
  if (C.rsz) {
    const r = C.rsz, n = C.chart.nodes[r.id], el = $(`[data-node="${r.id}"]`), dx = e.clientX - r.sx, dy = e.clientY - r.sy;
    if (r.free) { n.w = Math.round(Math.min(900, Math.max(120, r.w0 + dx))); el.style.width = n.w + "px"; if (n.type === "memo") { n.h = Math.round(Math.min(900, Math.max(50, r.h0 + dy))); el.style.height = n.h + "px"; } }
    drawEdges(); return;
  }
  if (C.drag) {
    const d = C.drag, z = C.zoom || 1, dx = (e.clientX - d.sx) / z, dy = (e.clientY - d.sy) / z; if (Math.abs(dx) + Math.abs(dy) > 4) C.moved = true; if (!C.moved) return;
    const n = C.chart.nodes[d.id]; n.x = Math.max(0, Math.round((d.x + dx) / 10) * 10); n.y = Math.max(0, Math.round((d.y + dy) / 10) * 10);
    const el = $(`[data-node="${d.id}"]`); if (el) { el.style.left = n.x + "px"; el.style.top = n.y + "px"; } drawEdges();
  } else if (C.link) {
    const box = $(".ccinner").getBoundingClientRect(); const a = $(`[data-node="${C.link.from}"]`).getBoundingClientRect();
    const z = C.zoom || 1; drawEdges({ x1: (a.right - box.left) / z, y1: (a.top - box.top) / z + Math.min(a.height / z / 2, 90), x2: (e.clientX - box.left) / z, y2: (e.clientY - box.top) / z });
  }
});
document.addEventListener("pointerup", e => {
  if (!inCombo() || !C.chart) return;
  if (C.rsz) { C.rsz = null; touch(); rerenderChart(); setTimeout(() => (C.moved = false), 0); return; }
  if (C.drag) { if (C.moved) { touch(); rerenderChart(); setTimeout(() => (C.moved = false), 0); } C.drag = null; return; }
  if (C.link) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node]"); const from = C.link.from; C.link = null;
    if (el && el.dataset.node !== from && !C.chart.edges.some(x => x.from === from && x.to === el.dataset.node)) {
      const to = el.dataset.node; C.chart.edges.push({ from, to, link: "" });
      const n = C.chart.nodes[to]; if (n.type === "move") { const pm = prevMove(C.chart, to); const a = pm.node && view(pm.node.ref); const r = a && rel(a, view(n.ref), pm.node.str, n.str); const last = C.chart.edges[C.chart.edges.length - 1]; if (r) last.link = r.type === "link" ? "link" : r.type === "chain" ? "chain" : r.type === "follow" ? "follow" : r.type === "tc" ? "tc" : "cancel"; }
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
      const sg = vSeg(v, it.n.str);
      await new Promise(res => { if (sg) segPlay(el, sg, false, res); el.onended = res; el.onerror = res; el.onplay = () => (el.playbackRate = C.rate); const iv = setInterval(() => { if (!alive()) { clearInterval(iv); res(); } }, 200); });
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
/* 「溜め弱フリッカー」「弱溜めフリッカー」などの長押し版 */
function parseToken(t, cid) {
  const re1 = /^(溜め|ため|タメ|長押し)\s*/, re2 = /^(弱|中|強|OD|小|大)\s*(溜め|ため|タメ)\s*/i;
  if (!re1.test(t) && !re2.test(t)) return parseToken0(t, cid);
  const t2 = t.replace(re1, "").replace(re2, "$1"); let r = parseToken0(t2, cid);
  // 溜めと書かれていたら、長押しで性質が変わる必殺技を優先（例：エドの「フリッカー」は立弱Kと同名）
  if (!(r && r.type === "move" && strOpts(view(r.ref)).some(o => /溜め$/.test(o)))) {
    const m = t2.match(/^(OD|EX|弱|中|強|小|大)?\s*(.+)$/i); const body = norm(m[2]); const pre = m[1] ? STR_MAP[m[1]] || STR_MAP[m[1].toUpperCase()] || "" : "";
    const v = movesOf(cid).filter(x => strOpts(x).some(o => /溜め$/.test(o)) && norm(x.name).includes(body)).sort((a, b) => a.name.length - b.name.length)[0];
    if (v) r = { type: "move", ref: v.id, str: pre };
  }
  if (r && r.type === "move") { const v = view(r.ref); const want = (r.str || "") + "溜め"; const opts = strOpts(v);
    if (opts.includes(want)) r.str = want; else if (!r.str) { const f = opts.find(o => /溜め$/.test(o)); if (f) r.str = f; } }
  return r;
}
function parseToken0(tok, cid) {
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
        if (prevId) { let link = tok.link === "cancel" ? "cancel" : ""; if (!link && tok.type === "move") { const pm = prevMove({ ...ch, edges: [...ch.edges, { from: prevId, to: id }] }, id); const a = pm.node && view(pm.node.ref); const rr = a && rel(a, view(tok.ref), pm.node.str, tok.str); if (rr) link = rr.type === "link" ? "link" : rr.type === "chain" ? "chain" : rr.type === "follow" ? "follow" : r.type === "tc" ? "tc" : "cancel"; } ch.edges.push({ from: prevId, to: id, link }); }
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

/* ---------- 書き出し（PNG・GIF・動画） ----------
   公式映像は他サイトからの画像化が許可されていないため、Chromeの「このタブを共有」で
   チャート部分を撮影して書き出す。 */
const EX = { fmt: "png", pos: 50, dur: 4, width: 960, labels: true };
function openExport() {
  const ok = !!navigator.mediaDevices?.getDisplayMedia;
  openModal(`<h2>コンボチャートを書き出す</h2>
    ${ok ? "" : `<div class="banner">このブラウザでは書き出しが使えません。パソコンのChromeかEdgeで開いてください。</div>`}
    <div class="chips">${[["png", "PNG（画像1枚）"], ["gif", "GIF（動くアニメ）"], ["video", "動画（MP4／WebM）"]].map(([k, t]) => `<button class="chip" data-exfmt="${k}" aria-pressed="${EX.fmt === k}">${t}</button>`).join("")}</div>
    <div id="exOpts">${exOptsHTML()}</div>
    <label class="note"><input type="checkbox" id="exLabels" ${EX.labels ? "checked" : ""}> 線の上の「つなぎ方」ラベルも写す</label>
    <p class="note">「書き出す」を押すと、Chromeが「このタブを共有しますか？」と聞いてきます。<b>「共有」</b>を選んでください。チャート全体が画面いっぱいに並び替わって撮影され、終わると元に戻ります（撮影中はマウスを動かさないでください）。</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>やめる</button><button class="btn primary" id="exGo" ${ok ? "" : "disabled"}>書き出す</button></div>`);
  $$("[data-exfmt]").forEach(b => b.onclick = () => { EX.fmt = b.dataset.exfmt; $$("[data-exfmt]").forEach(x => x.setAttribute("aria-pressed", x === b)); $("#exOpts").innerHTML = exOptsHTML(); bindExOpts(); });
  bindExOpts();
  $("#exLabels").onchange = e => (EX.labels = e.target.checked);
  $("#exGo").onclick = () => runExport();
}
function exOptsHTML() {
  if (PREF.ccNoVid) return EX.fmt === "png" ? "" : `<label class="note">長さ <input type="range" id="exDur" min="2" max="8" value="${EX.dur}"> <b id="exDurV">${EX.dur}秒</b></label>`;
  if (EX.fmt === "png") return `<label class="note">映像を止める位置 <input type="range" id="exPos" min="0" max="100" value="${EX.pos}"> <b id="exPosV">${EX.pos}%</b>（技が当たっている瞬間あたり＝40〜60%がおすすめ）</label>`;
  return `<label class="note">長さ <input type="range" id="exDur" min="2" max="8" value="${EX.dur}"> <b id="exDurV">${EX.dur}秒</b></label>
    ${EX.fmt === "gif" ? `<label class="note">GIFの横幅 <select id="exW">${[640, 960, 1280].map(w => `<option ${w === EX.width ? "selected" : ""}>${w}</option>`).join("")}</select>px（大きいほどファイルが重くなります）</label>` : ""}`;
}
function bindExOpts() {
  const p = $("#exPos"); if (p) p.oninput = () => { EX.pos = +p.value; $("#exPosV").textContent = EX.pos + "%"; };
  const d = $("#exDur"); if (d) d.oninput = () => { EX.dur = +d.value; $("#exDurV").textContent = EX.dur + "秒"; };
  const w = $("#exW"); if (w) w.onchange = () => (EX.width = +w.value);
}
const waitEv = (el, ev, ms = 4000) => new Promise(r => { const t = setTimeout(r, ms); el.addEventListener(ev, () => { clearTimeout(t); r(); }, { once: true }); });
/* チャートを画面いっぱいに並べる。戻り値＝撮影する範囲 */
function exStage() {
  const inner = $(".ccinner"), cv = $("#ccCanvas"); const pad = 24;
  let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
  $$("#ccCanvas [data-node]").forEach(el => { const s = 1; x0 = Math.min(x0, el.offsetLeft); y0 = Math.min(y0, el.offsetTop); x1 = Math.max(x1, el.offsetLeft + el.offsetWidth * s + 10); y1 = Math.max(y1, el.offsetTop + el.offsetHeight * s); });
  const bw = x1 - x0, bh = y1 - y0; const k = Math.min(2, (innerWidth - pad * 2) / bw, (innerHeight - pad * 2) / bh);
  document.body.classList.add("exporting"); if (!EX.labels) document.body.classList.add("exnolabel");
  cv.style.cssText = `position:fixed;left:0;top:0;width:${Math.ceil(bw * k + pad * 2)}px;height:${Math.ceil(bh * k + pad * 2)}px;max-height:none;overflow:hidden;z-index:9999;border-radius:0`;
  inner.style.transformOrigin = "0 0"; inner.style.transform = `translate(${pad}px,${pad}px) scale(${k}) translate(${-x0}px,${-y0}px)`;
  document.activeElement?.blur?.();
  return cv;
}
function exUnstage() { document.body.classList.remove("exporting", "exnolabel"); rerenderChart(); }
async function runExport() {
  closeModal(); const cv = exStage(); const vids = $$("#ccCanvas video[data-src]");
  vids.forEach(v => { if (!v.src) v.src = v.dataset.src; v.preload = "auto"; });
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser", frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude" }); }
  catch (e) { exUnstage(); toast("共有がキャンセルされたので、書き出しをやめました"); return; }
  const track = stream.getVideoTracks()[0]; let cropped = false;
  try { if (window.CropTarget && track.cropTo) { await track.cropTo(await CropTarget.fromElement(cv)); cropped = true; } } catch (e) {}
  const sv = document.createElement("video"); sv.muted = true; sv.srcObject = stream; await sv.play();
  const stop = () => { stream.getTracks().forEach(t => t.stop()); exUnstage(); };
  try {
    await Promise.all(vids.map(v => v.readyState >= 2 ? 0 : waitEv(v, "loadeddata", 6000)));
    if (!cropped) await sleep(300);
    await sleep(900); // 共有の確認画面が消えるのを待つ
    const rect = () => { if (cropped) return [0, 0, sv.videoWidth, sv.videoHeight]; const r = cv.getBoundingClientRect(), f = sv.videoWidth / innerWidth; return [r.left * f, r.top * f, r.width * f, r.height * f]; };
    const name = (C.chart.name || "コンボチャート").replace(/[\\/:*?"<>|]/g, "_");
    if (EX.fmt === "png") {
      await Promise.all(vids.map(async v => { v.pause(); if (!v.duration) await waitEv(v, "loadedmetadata"); v.currentTime = (v.duration || 0) * EX.pos / 100; await waitEv(v, "seeked", 3000); }));
      await sleep(400);
      const [x, y, w, h] = rect(); const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(sv, x, y, w, h, 0, 0, w, h);
      stop(); const blob = await new Promise(r => c.toBlob(r, "image/png")); exResult(blob, name + ".png", "img"); return;
    }
    vids.forEach(v => { v.currentTime = 0; v.loop = true; v.play().catch(() => {}); });
    await sleep(200);
    if (EX.fmt === "video") {
      const [x, y, w, h] = rect(); const c = document.createElement("canvas"); c.width = Math.round(w / 2) * 2; c.height = Math.round(h / 2) * 2; const g = c.getContext("2d");
      const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 }); const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      let on = true; const draw = () => { if (!on) return; g.drawImage(sv, x, y, w, h, 0, 0, c.width, c.height); requestAnimationFrame(draw); }; draw();
      rec.start(); await sleep(EX.dur * 1000); on = false; rec.stop(); await waitEv(rec, "stop"); stop();
      exResult(new Blob(chunks, { type: mime }), name + (/mp4/.test(mime) ? ".mp4" : ".webm"), "video"); return;
    }
    // GIF：1秒10コマで撮ってから作る
    const [x, y, w, h] = rect(); const W = Math.min(EX.width, Math.round(w)), H = Math.round(h * W / w);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d", { willReadFrequently: true }); const frames = [];
    const N = EX.dur * 10, t0 = performance.now();
    for (let i = 0; i < N; i++) { g.drawImage(sv, x, y, w, h, 0, 0, W, H); frames.push(g.getImageData(0, 0, W, H).data); const next = t0 + (i + 1) * 100; await sleep(Math.max(0, next - performance.now())); }
    stop();
    openModal(`<h2>GIFを作成中…</h2><p class="note" id="exProg">0 / ${N}</p>`);
    const { GIFEncoder, quantize, applyPalette } = await import("https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm");
    const gif = GIFEncoder();
    for (let i = 0; i < N; i++) { const pal = quantize(frames[i], 256); gif.writeFrame(applyPalette(frames[i], pal), W, H, { palette: pal, delay: 100 }); frames[i] = null; if (i % 3 === 0) { const p = $("#exProg"); if (p) p.textContent = `${i + 1} / ${N}`; await sleep(0); } }
    gif.finish(); exResult(new Blob([gif.bytes()], { type: "image/gif" }), name + ".gif", "img");
  } catch (e) { console.error(e); stop(); toast("書き出しに失敗しました：" + e.message); }
}
function exResult(blob, fname, kind) {
  const url = URL.createObjectURL(blob); const mb = (blob.size / 1048576).toFixed(1);
  openModal(`<div class="wide"></div><div class="row" style="justify-content:space-between"><h2 style="margin:0">書き出しました</h2><span class="note">${esc(fname)}（${mb}MB）</span></div>
    <div class="expreview">${kind === "img" ? `<img src="${url}" alt="書き出したチャート">` : `<video src="${url}" controls autoplay loop muted></video>`}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>閉じる</button><a class="btn primary" href="${url}" download="${esc(fname)}">保存する</a></div>`);
}

/* ---------- 画面の拡大・縮小 ---------- */
function setZoom(z, ax, ay) {
  const cv = $("#ccCanvas"), inner = $(".ccinner"), sz = $(".ccsizer"); if (!cv || !inner) return;
  const old = C.zoom || 1; z = Math.round(Math.min(1.6, Math.max(0.3, z)) * 100) / 100; if (z === old) return;
  const r = cv.getBoundingClientRect(); const px = ax ?? r.width / 2, py = ay ?? r.height / 2;
  const cx = (cv.scrollLeft + px) / old, cy = (cv.scrollTop + py) / old;
  C.zoom = z; PREF.ccZoom = z; savePref();
  inner.style.transform = `scale(${z})`; sz.style.width = inner.dataset.w * z + "px"; sz.style.height = inner.dataset.h * z + "px";
  cv.scrollLeft = cx * z - px; cv.scrollTop = cy * z - py;
  const lb = $('[data-zoom="1"]'); if (lb) lb.textContent = Math.round(z * 100) + "%";
}
function fitZoom() {
  const cv = $("#ccCanvas"); let x1 = 0, y1 = 0;
  $$("#ccCanvas [data-node]").forEach(el => { x1 = Math.max(x1, el.offsetLeft + el.offsetWidth + 20); y1 = Math.max(y1, el.offsetTop + el.offsetHeight + 20); });
  if (!x1) return 1; const z = Math.min(1, (cv.clientWidth - 10) / x1, (cv.clientHeight - 10) / y1); setTimeout(() => { cv.scrollLeft = 0; cv.scrollTop = 0; }, 0); return z;
}
document.addEventListener("wheel", e => {
  if (!inCombo() || !C.chart || !(e.ctrlKey || e.metaKey)) return;
  const cv = e.target.closest("#ccCanvas"); if (!cv) return;
  e.preventDefault(); const r = cv.getBoundingClientRect(); setZoom((C.zoom || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
