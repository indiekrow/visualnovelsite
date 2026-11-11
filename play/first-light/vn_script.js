const VNS_MERGE = 160;
const VNS_ATTRIB = 80;
const VNS_TAG =/^\[([^\[\]\n]{1,40})\]\s*/;
const VNS_OPEN_TAG = /^\[[^\]\n]{0,40}$/;
const VNS_EXPRS = ["neutral", "happy", "sad", "angry", "surprised", "worried", "embarrassed", "determined"];
const VNS_TEST_SPRITES = { keys: VNS_EXPRS, synonyms: { furious: "angry", smiling: "happy", nervous: "worried", blushing: "embarrassed" } };

function vnSpriteData() {
  try { if (typeof STORYGEN !== "undefined" && STORYGEN && typeof STORYGEN === "object" && STORYGEN.sprites && typeof STORYGEN.sprites === "object") return STORYGEN.sprites; } catch {  }
  return null;
}
function vnExpr(raw, sprites = vnSpriteData()) {
  const t = String(raw ?? "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  if (!t) return "";
  const keys = (Array.isArray(sprites?.keys) && sprites.keys.length ? sprites.keys : VNS_EXPRS).map((k) => String(k).trim().toLowerCase());
  const syn = sprites?.synonyms && typeof sprites.synonyms === "object" ? sprites.synonyms : {};
  const one = (w) => (keys.includes(w) ? w : Object.hasOwn(syn, w) && keys.includes(String(syn[w]).toLowerCase()) ? String(syn[w]).toLowerCase() : "");
  return one(t) || (t.match(/[a-z]+/g) || []).map(one).find(Boolean) || "neutral";
}

function vnQuoteClose(s, i) {
  if (typeof quoteClose === "function") return quoteClose(s, i);
  const ch = s[i];
  if (ch === '"' || ch === "“") { let j = i + 1; while (j < s.length && s[j] !== '"' && s[j] !== "”") j++; return j; }
  if ((ch === "'" || ch === "‘") && (i === 0 || /[\s*(\[—–-]/.test(s[i - 1])) && /\S/.test(s[i + 1] || "")) {
    for (let j = i + 1; j < s.length; j++)
      if ((s[j] === "'" || s[j] === "’") && /\S/.test(s[j - 1]) && (j + 1 >= s.length || /[\s.,!?;:)\]*—–-]/.test(s[j + 1]))) return j;
  }
  return -1;
}
function vnParseTurn(text) {
  if (typeof parseTurn === "function") return parseTurn(text);
  const s = String(text), segs = [];
  let i = 0, buf = "";
  const push = (type, t) => { t = t.replace(/\s+/g, " ").trim(); if (t) segs.push({ type, text: t }); };
  while (i < s.length) {
    const ch = s[i];
    let j;
    if (ch === "*") {
      push("act", buf); buf = "";
      j = s.indexOf("*", i + 1); const end = j < 0 ? s.length : j;
      push("act", s.slice(i + 1, end)); i = end + 1;
    } else if ((j = vnQuoteClose(s, i)) >= 0) {
      push("act", buf); buf = "";
      const inner = s.slice(i + 1, j), wrapped = inner.trim().match(/^\*([^*]+)\*$/);
      if (wrapped) push("act", wrapped[1]); else push("say", inner);
      i = j + 1;
    } else { buf += ch; i++; }
  }
  push("act", buf);
  return segs;
}
function vnTagParts(t) {
  const c = t.indexOf(":");
  return c < 0 ? { name: t.trim(), expr: "" } : { name: t.slice(0, c).trim(), expr: t.slice(c + 1).trim().toLowerCase() };
}

function vnParagraph(s, match, sole, isMe, ex = vnExpr, me = "") {
  const bits = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i), tag = rest.match(VNS_TAG);
    if (tag) { bits.push({ t: "tag", ...vnTagParts(tag[1]) }); i += tag[0].length; continue; }
    if (VNS_OPEN_TAG.test(rest)) break;
    const j = vnQuoteClose(s, i);
    if (j >= 0) { bits.push({ t: "quote", raw: s.slice(i, j + 1), text: s.slice(i + 1, j).trim() }); i = j + 1; continue; }
    let k = i + 1;
    while (k < s.length && s[k] !== "[" && vnQuoteClose(s, k) < 0) k++;
    bits.push({ t: "prose", raw: s.slice(i, k) }); i = k;
  }
  const plain = bits.filter((b) => b.t === "prose").map((b) => b.raw).join("");
  const out = [];
  let who = null, expr = "", glue = false, named;
  const narr = (raw) => {
    const last = out.at(-1);
    if (glue && last?.k === "narr") last.raw += raw; else out.push({ k: "narr", raw });
    glue = true;
  };
  for (const b of bits) {
    if (b.t === "tag") { if (b.name) { who = b.name; expr = b.expr; } glue = false; continue; }
    if (b.t === "prose") { narr(b.raw); continue; }
    if (!b.text) continue;
    if (who != null && isMe(who)) {
      // The narrator never speaks for the player, so a line tagged with their name is dropped; in a scripted scene
      // (`me` set) the author wrote it on purpose, and it plays as the player's own line, with their sprite.
      if (me) out.push({ k: "say", who: me, expr: ex(expr), text: b.text, you: true });
      glue = false; continue;
    }
    const w = who != null ? match(who) || who : named === undefined ? (named = sole(plain) || null) : named;
    if (!w) { narr(b.raw); continue; }
    out.push({ k: "say", who: w, expr: who != null ? ex(expr) : "", text: b.text }); glue = false;
  }
  for (let k = 1; k + 1 < out.length; k++) {
    const a = out[k - 1], n = out[k], b = out[k + 1], t = n.k === "narr" ? n.raw.trim() : "";
    if (a.k !== "say" || b.k !== "say" || a.who !== b.who || !t || t.length > VNS_ATTRIB || /["“”]/.test(t)) continue;
    if (!/[,—–-]$/.test(a.text) && !/^\p{Ll}/u.test(t)) continue;
    a.text = (/,$/.test(a.text) && !/^\p{Ll}/u.test(b.text) ? a.text.slice(0, -1) + "." : a.text) + " " + b.text;
    out.splice(k, 2); k--;
  }
  const steps = [];
  for (const o of out) {
    if (o.k === "say") { steps.push(o); continue; }
    const t = o.raw.trim(), last = steps.at(-1);
    if (!t) continue;
    if (last?.k === "narr" && last.text.length + 1 + t.length < VNS_MERGE) last.text += " " + t;
    else steps.push({ k: "narr", text: t });
  }
  return steps;
}

function vnSteps(text, ctx = {}) {
  const match = ctx.matchSpeaker || (() => null), sole = ctx.soleNamed || (() => null), player = String(ctx.player || "");
  const sprites = ctx.sprites && typeof ctx.sprites === "object" ? ctx.sprites : vnSpriteData(), ex = (e) => vnExpr(e, sprites);
  const me = new Set([player, player.split(/\s+/)[0]].map((n) => n.trim().toLowerCase()).filter(Boolean));
  const isMe = (n) => me.has(String(n).trim().toLowerCase());
  const steps = [];
  const paras = String(text ?? "").replace(/^[ \t]*#{1,6}[ \t].*$/gm, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  // A scripted scene's change of clothes, "[wear] Full Name: clothes" (engine/script.py _wear_lines): no line of its
  // own; the next line carries it as `wear` ({name: clothes}), the last one when nothing follows.
  // Its event pictures work the same way: "[cg label]" (engine/script.py _wear_lines) puts `cg: label` on the next
  // line, from which the stage shows that picture until another one, or "[cg off]" (`cg: "off"`), or the scene's end.
  let pend = null, pendCg = "";
  const carry = (at) => {
    if (steps.length <= at) return;
    if (pend) { steps[at].wear = { ...(steps[at].wear || {}), ...pend }; pend = null; }
    if (pendCg) { steps[at].cg = pendCg; pendCg = ""; }
  };
  for (const p of paras) {
    const wm = ctx.scripted ? p.match(/^\[wear\]\s*([^:\n]{1,60}):\s*(.+)$/i) : null;
    if (wm) { const who = wm[1].trim(); (pend ||= {})[match(who) || who] = wm[2].trim(); continue; }
    const cm = ctx.scripted ? p.match(/^\[cg\s+([a-z][a-z0-9_]{0,23})\]$/i) : null;
    if (cm) { pendCg = cm[1].toLowerCase(); continue; }
    const at = steps.length;
    if (/^\[time\] /.test(p)) { const t = p.slice(7).trim(); if (t) steps.push({ k: "time", text: t }); carry(at); continue; }
    const lead = p.match(/^\[([^\[\]\n]{1,40})\]/);
    if (lead && (isMe(lead[1]) || isMe(vnTagParts(lead[1]).name)) && !ctx.scripted) continue;
    for (const st of vnParagraph(p, match, sole, isMe, ex, ctx.scripted ? player : "")) steps.push(st);
    carry(at);
  }
  if ((pend || pendCg) && steps.length) carry(steps.length - 1);
  if (ctx.partial && steps.length) steps.at(-1).open = true;
  return steps;
}

function vnTurnSteps(text, player) {
  const steps = [];
  for (const g of vnParseTurn(String(text ?? ""))) {
    const last = steps.at(-1);
    if (g.type === "say") steps.push({ k: "say", who: player || "", expr: "", text: g.text, you: true });
    else if (last?.k === "narr") last.text += " " + g.text;
    else steps.push({ k: "narr", text: g.text, you: true });
  }
  return steps;
}

function vnSelfTest(cases = typeof VN_CASES !== "undefined" ? VN_CASES : null) {
  if (!Array.isArray(cases)) throw new Error("Pass the cases from tools/vn_cases.json.");
  const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  const low = (s) => String(s).trim().toLowerCase(), first = (n) => low(n).split(/\s+/)[0];
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ctxOf = (c) => {
    const npcs = c.npcs || [];
    return {
      player: c.player || "", partial: !!c.partial, scripted: !!c.scripted, sprites: c.sprites || vnSpriteData() || VNS_TEST_SPRITES,
      matchSpeaker: (tag) => npcs.find((n) => low(n) === low(tag)) || npcs.find((n) => first(n) === low(tag)) || null,
      soleNamed: (plain) => {
        const t = String(plain).toLowerCase();
        const hit = npcs.filter((n) => t.includes(low(n)) || (first(n).length >= 3 && new RegExp(`\\b${reEsc(first(n))}\\b`).test(t)));
        return hit.length === 1 ? hit[0] : null;
      },
    };
  };
  const run = (c) => { try { return c.turn ? vnTurnSteps(c.text, c.player) : vnSteps(c.text, ctxOf(c)); } catch (e) { return `error: ${e.message}`; } };
  const failures = [];
  for (const c of cases) { const got = run(c); if (canon(got) !== canon(c.want)) failures.push({ name: c.name, got, want: c.want }); }
  console.log(`${cases.length - failures.length}/${cases.length} VN script cases pass`);
  return { pass: cases.length - failures.length, fail: failures.length, failures };
}
