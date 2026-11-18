/* つながり判定（コンボチャートで使う）
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
  // 派生技：b の出し方の条件に a の名前が入っていれば、a から派生でつながる（例：疾駆け → 弧空 → 武神鉾刃脚）
  if (b.kind === "move" && a.kind === "move" && b.cond) {
    const an = norm(a.name).replace(/^od/, ""); const bc = norm(b.cond);
    if (an.length >= 2 && bc.includes(an)) return { sit: "normal", type: "follow", text: `派生（${a.name}から）` };
  }
  // a の条件欄に「b に派生可能」と書かれている（例：ジュリ 歳破衝 → 暗剣殺）
  if (b.kind === "move" && a.kind === "move" && a.cond && norm(a.cond).includes(norm(b.name)) && norm(b.name).length >= 2) return { sit: "normal", type: "follow", text: `派生（${a.name}の条件より）` };
  // ターゲットコンボ：特殊技のコマンドが「強P → 強K」のように a のボタンから始まる
  if (b.kind === "move" && b.cat === "特殊技" && a.kind === "normal" && /→/.test(ITEMS[b.id]?.item.cmd || "")) {
    const first = (ITEMS[b.id].item.cmd.split("→")[0] || "").replace(/\s/g, "");
    const mine = (a.key[0] === "c" ? "2" : "") + BTN_JA[a.key.slice(1)];
    if (first === mine) return { sit: "normal", type: "tc", text: `ターゲットコンボ（${a.label}から続けて入力）` };
  }
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
