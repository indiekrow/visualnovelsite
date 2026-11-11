"use strict";
// The player of an exported story: game.json (tools/export_game.py) played on the app's own stage (vn_stage.js, with
// vn_script.js turning a scene's text into lines). It mirrors the page's scripted-story runtime (scriptEnter, scriptPick,
// scriptChoicesOf, vnScriptedTurn, vnSprite in web/template.html) for a story that is already written and painted: no
// model, no painter, nothing generated here.

var STORYGEN = null; // vn_script.js reads the sprite expressions from STORYGEN.sprites
const $ = (id) => document.getElementById(id);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const low = (s) => String(s ?? "").trim().toLowerCase();
const clone = (v) => JSON.parse(JSON.stringify(v));

let G = null;            // the story (game.json)
let NODES = {};          // G.script.nodes
let names = [];          // everyone in the story but the player
let run = null;          // this playthrough: {node, flags, path, ended, stage, prevEntry}
let turns = [];          // the turns played this session: {entry, steps, stage}, for the stage's back-scroll and the backlog
let settings = { pace: "normal" };
let mounted = false;
const SLOTS = 9;

// ---- Storage (Electron keeps localStorage in the game's own profile folder) ----
const keyOf = (k) => `${G.id}:${k}`;
function getJSON(k, dflt) { try { const v = localStorage.getItem(keyOf(k)); return v ? JSON.parse(v) : dflt; } catch { return dflt; } }
function setJSON(k, v) { try { localStorage.setItem(keyOf(k), JSON.stringify(v)); return true; } catch { return false; } }
function delKey(k) { try { localStorage.removeItem(keyOf(k)); } catch { /* ignore */ } }

// ---- People ----
const isPlayer = (name) => { const n = low(name), p = low(G.player); return !!n && (n === p || n === p.split(/\s+/)[0]); };
function matchName(tag) {
  const t = low(tag);
  if (!t) return null;
  if (isPlayer(t) || t === "you") return G.player;
  return names.find((n) => low(n) === t) || names.find((n) => low(n).split(/\s+/)[0] === t)
    || (t.length >= 3 ? names.find((n) => low(n).includes(t) || t.includes(low(n))) : null) || null;
}
function soleNamed(plain) {
  const t = low(plain);
  const hit = names.filter((n) => { const f = low(n).split(/\s+/)[0]; return t.includes(low(n)) || (f.length >= 3 && new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u").test(t)); });
  return hit.length === 1 ? hit[0] : null;
}
const personOf = (name) => (isPlayer(name) ? G.player : matchName(name));
const recOf = (n) => G.people[n] || null;

// What someone wears, as the exporter wrote it: "usual", "o:<key>" (dressed in other clothes), "nude" or "w:<key>"
// (undressed, still wearing something). -> the sprite variant's outfit key.
const okeyOf = (tok) => { tok = String(tok || "").trim(); return !tok || tok === "usual" ? "" : tok.startsWith("o:") ? tok.slice(2) : tok; };
const undressedTok = (tok) => tok === "nude" || String(tok).startsWith("w:");

// The page's vnSprite / vnDressed / vnUndressed for painted art only: the exact variant, then the calm one, then the
// usual clothes, then the plain cut-out, then the portrait in a frame.
function look(n, tok, expr) {
  const p = recOf(n);
  if (!p) return null;
  const e = typeof vnExpr === "function" ? vnExpr(expr) : expr || "neutral", v = p.v || {}, ok = okeyOf(tok);
  const tries = [`${ok}|${e}`, `${ok}|neutral`];
  if (ok) tries.push(`|${e}`, "|neutral");
  for (const k of tries) if (v[k]) return { src: v[k], cut: true, expr: k.split("|")[1] };
  if (p.base) return { src: p.base, cut: true, expr: "neutral" };
  if (p.portrait) return { src: p.portrait, cut: false, expr: "neutral" };
  return null;
}
function spriteOf(name, entry, expr, wear) {
  const n = personOf(name);
  if (!n) return null;
  let tok;
  if (typeof wear === "string" && wear.trim()) tok = wear.trim();
  else tok = entry?.undressed?.[n] || entry?.outfits?.[n] || "usual";
  return look(n, tok, expr);
}

// ---- The script (engine/script.py; the page's script* functions) ----
const COND_RE = /^(!?)([a-z][a-z0-9_]{0,39})(?:(>=|<=|==|!=|>|<)(-?\d{1,6}))?$/;
const IF_RE = /^\[if\s+([^\[\]]{1,200})\]\s*(.*)$/i, CG_RE = /^\[cg\s+([A-Za-z][A-Za-z0-9_]{0,23})\]$/i, WEAR_RE = /^\[wear\]\s*(.+)$/i;
const WEAR_DEFAULT_RE = /^(?:usual|default|normal|everyday|own|regular|look)$/i;
const value = (flags, name) => { const v = (flags || {})[name]; return typeof v === "number" && Number.isInteger(v) ? v : v === true ? 1 : 0; };
function setFlags(flags, sets) { for (const [f, v] of Object.entries(sets || {})) flags[f] = typeof v === "string" ? value(flags, f) + Number(v) : v; return flags; }
function holdsOne(flags, cond) {
  const m = COND_RE.exec(String(cond));
  if (!m) return false;
  const [, neg, name, op, num] = m, a = value(flags, name), b = Number(num);
  const ok = !op ? a > 0 : { ">=": a >= b, "<=": a <= b, "==": a === b, "!=": a !== b, ">": a > b, "<": a < b }[op];
  return ok !== !!neg;
}
const holds = (flags, need, unless) => (need || []).every((c) => holdsOne(flags, c)) && !(unless || []).some((c) => holdsOne(flags, c));
function resolveText(text, flags) {
  const out = [];
  for (const p of text ? String(text).split("\n\n") : []) {
    const m = p.match(IF_RE);
    if (!m) out.push(p);
    else if (holds(flags, m[1].split(/\s+/).filter(Boolean), [])) out.push(m[2].trim());
  }
  return out.join("\n\n");
}
function nextOf(node, flags) {
  const branch = node.branch || [], tops = branch.filter((b) => b.top).map((b) => value(flags, b.top)), best = tops.length ? Math.max(...tops) : 0;
  for (const b of branch) {
    if (b.top && value(flags, b.top) < best) continue;
    if (holds(flags, b.if, b.unless)) return b.to;
  }
  return node.next || "";
}
function choicesOf(node, flags) {
  if (!node || node.end) return [];
  const go = (to) => (to ? [{ text: "Continue", to, set: {}, i: -1, go: true }] : null);
  if (node.choices) {
    const all = node.choices.map((c, i) => ({ ...c, i })), held = all.filter((c) => holds(flags, c.if, c.unless));
    return held.length ? held : go(nextOf(node, flags)) || all;
  }
  return go(nextOf(node, flags)) || [];
}
function enterFlags(node, flags) {
  setFlags(flags, node.set);
  for (const e of node.set_if || []) if (holds(flags, e.if, e.unless)) setFlags(flags, e.set);
  return resolveText(node.text, flags);
}
const wearAt = (line) => { const m = String(line || "").match(WEAR_RE); if (!m) return null; const i = m[1].indexOf(":"); const name = (i < 0 ? m[1] : m[1].slice(0, i)).trim(), worn = i < 0 ? "" : m[1].slice(i + 1).trim(); return name && worn ? [name, worn] : null; };
// Who wears what at the end of a node's text, its [wear] lines applied (the page's scriptEndWear).
function endWear(node, text) {
  const outfits = { ...(node?.outfits || {}) }, off = { ...(node?.undressed || {}) };
  for (const p of String(text ?? node?.text ?? "").split("\n\n")) {
    const w = wearAt(p);
    if (!w) continue;
    const [n, worn] = w;
    delete outfits[n]; delete off[n];
    if (WEAR_DEFAULT_RE.test(worn)) continue;
    if (undressedTok(worn)) off[n] = worn; else outfits[n] = worn;
  }
  return { outfits, undressed: off };
}
function wornIn(entry, end) {
  const w = end ? endWear(entry, entry.text) : { outfits: entry.outfits || {}, undressed: entry.undressed || {} };
  return Object.fromEntries([G.player, ...names].map((n) => [n, w.undressed[n] || w.outfits[n] || "usual"]));
}
// Flags the story keeps across playthroughs (the script's `remember`; the page's scriptRemember): a true route that
// opens once every heroine's secret has been heard, each on her own route. Kept in this game's own storage.
function rememberedFlags() { const v = getJSON("remembered", {}); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function remember(flags) {
  const keep = G.script.remember || [];
  if (!keep.length) return;
  const had = rememberedFlags(), now = { ...had };
  for (const f of keep) if (Object.hasOwn(flags || {}, f) && value(flags, f) > value(now, f)) now[f] = flags[f];
  if (JSON.stringify(now) !== JSON.stringify(had)) setJSON("remembered", now);
}
const saidOf = (c) => c.say || `*You ${String(c.text).slice(0, 120).replace(/^\p{Lu}(?=\p{Ll})/u, (ch) => ch.toLowerCase()).replace(/[.!?…]+$/, "")}.*`;

// ---- Turning a node into the stage's steps (the page's vnTurn / vnScriptedTurn) ----
function lines(text) {
  return vnSteps(text, { player: G.player, matchSpeaker: (tag) => matchName(tag), soleNamed, scripted: true, sprites: G.exprs });
}
function placeCard(stage, prevWhere) {
  const where = stage?.where || "";
  if (!where || !prevWhere || where === prevWhere) return null;
  const el = mk("div", "vn-card-in"), box = mk("div");
  const t = String(stage.time || "").trim();
  if (t) box.append(mk("div", "arc-kicker", t[0].toUpperCase() + t.slice(1)));
  box.append(mk("div", "arc-title", where));
  el.append(box);
  return { k: "card", el, text: "" };
}
function turnOf(said, entry, stage, prev) {
  const mine = said ? vnTurnSteps(said, G.player) : [];
  const card = prev ? placeCard(stage, prev.stage.where) : null;
  if (card) card.stage = stage;
  const scene = lines(entry.text);
  if (mine.length && prev) {
    mine[0].wear = { ...wornIn(prev.entry, true), ...(mine[0].wear || {}) };
    const first = card || scene[0];
    if (first) first.wear = { ...wornIn(entry, false), ...(first.wear || {}) };
  }
  return { steps: [...mine, ...(card ? [card] : []), ...scene], stage: card ? prev.stage : stage };
}

// ---- Playing ----
function newRun() { return { node: "", flags: {}, path: [], ended: false, where: "", time: "" }; }
function stageOf(node) {
  if (node.where) run.where = node.where;
  if (node.time) run.time = node.time;
  return { where: run.where, time: run.time, weather: node.weather || "", cast: (node.cast || []).map((c) => ({ ...c })) };
}
// Entering a scene (the page's scriptEnter). `resumed`: a save's scene played again from its start, nothing before it.
function enter(id, { said = "", opening = false, resumed = false } = {}) {
  const node = NODES[id];
  if (!node) { console.warn("no scene", id); return; }
  run.node = id; run.path.push(id);
  if (run.path.length > 400) run.path.shift();
  entryFlags = clone(run.flags);
  const text = enterFlags(node, run.flags);
  remember(run.flags);
  const stage = stageOf(node);
  const entry = { node: id, text, outfits: node.outfits || {}, undressed: node.undressed || {} };
  const prev = opening || resumed ? null : turns.at(-1) || null;
  const t = turnOf(said, entry, stage, prev);
  turns.push({ entry, steps: t.steps, stage: t.stage, where: stage.where });
  if (turns.length > 120) turns.shift();
  VN.show(entry, t.steps, t.stage, { live: false, at: "start" });
  const cg = G.art[`cg:${id}`] || (opening ? G.art.opening : "");
  if (cg) VN.cg(cg);
  if (node.end) {
    run.ended = true;
    noteEnding(node.end);
    VN.card(endCard(node.end));
  } else if (node.chapter) {
    VN.card(chapterCard(node.chapter));
  }
  autosave();
  offer();
}
function offer() {
  if (run.ended) { VN.choices(null); return; }
  const list = choicesOf(NODES[run.node], run.flags);
  VN.choices(list.map((c) => ({ text: c.text, go: !!c.go })), (k) => pick(list[k]));
}
function pick(c) {
  if (!c || run.ended || !NODES[c.to]) return;
  VN.choices(null);
  setFlags(run.flags, c.set);
  enter(c.to, { said: c.go ? "" : saidOf(c) });
}
function chapterCard(ch) {
  const el = mk("div", "vn-card-in"), box = mk("div");
  if (ch.kicker) box.append(mk("div", "arc-kicker", ch.kicker));
  box.append(mk("div", "arc-title", ch.title || ""));
  el.append(box);
  return el;
}
function endCard(title) {
  const el = mk("div", "vn-card-in"), box = mk("div");
  box.append(mk("div", "arc-kicker", "Ending"), mk("div", "arc-title", title));
  const found = getJSON("endings", []).length, all = (G.endings || []).length;
  if (all > 1) box.append(mk("div", "arc-sub", `${found} of ${all} endings found`));
  const btns = mk("div", "card-btns"), b1 = mk("button", "", "Back to title"), b2 = mk("button", "", "Load a save");
  b1.type = b2.type = "button";
  b1.addEventListener("click", (e) => { e.stopPropagation(); toTitle(); });
  b2.addEventListener("click", (e) => { e.stopPropagation(); openSlots("load"); });
  btns.append(b1, b2); box.append(btns); el.append(box);
  return el;
}
function noteEnding(title) {
  const seen = getJSON("endings", []);
  if (!seen.includes(title)) { seen.push(title); setJSON("endings", seen); }
}

// The stage's back-scroll into earlier scenes of this session.
function turnBefore(entry) {
  let i = turns.findIndex((t) => t.entry === entry);
  if (i < 0) i = turns.length;
  return i > 0 ? turns[i - 1] : null;
}
function turnAfter(entry) {
  const i = turns.findIndex((t) => t.entry === entry);
  return i >= 0 && i + 1 < turns.length ? turns[i + 1] : null;
}

function mountStage() {
  if (mounted) return;
  mounted = true;
  VN.mount($("vn"), {
    spriteOf, bgOf: (where) => (where && G.places[where]) || "", colorOf: (n) => recOf(personOf(n))?.color || "",
    faceOf: (n) => recOf(personOf(n))?.portrait || "", isPlayer, pace: () => settings.pace,
    cgOf: (entry, label) => (entry?.node ? G.art[`cg:${entry.node}#${label}`] || "" : ""),
    onLog: () => openBacklog(), turnBefore, turnAfter,
    onFullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
  });
}
function show(screen) {
  $("title").hidden = screen !== "title";
  $("play").hidden = screen !== "play";
  // The stage ignores Space and Enter while a button has focus, and the title's button would keep it.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (screen === "title") $("btn-continue").hidden ? $("btn-new").focus() : $("btn-continue").focus();
}
function begin() {
  run = newRun(); turns = [];
  // A new game starts with what earlier playthroughs left of the remembered flags.
  const had = rememberedFlags();
  for (const f of G.script.remember || []) if (Object.hasOwn(had, f)) run.flags[f] = had[f];
  show("play"); mountStage(); VN.clear();
  enter(G.script.start, { opening: true });
}
function resume(state) {
  if (!state || !NODES[state.node]) return;
  // The save holds the flags from before its scene was entered, so entering it again applies that scene's sets once.
  run = { ...newRun(), ...clone(state), ended: false };
  run.path.pop();
  turns = [];
  show("play"); mountStage(); VN.clear();
  enter(state.node, { resumed: true });
}
function toTitle() {
  for (const d of document.querySelectorAll("dialog[open]")) d.close();
  if (mounted) VN.clear();
  renderTitle(); show("title");
}

// ---- Saves ----
// A save is the playthrough as it stood when its scene was entered: the scene, the flags before that scene's own sets,
// where and when the stage was. Saving part-way through a scene restarts that scene on load.
let entryFlags = {};
function snapshot() {
  return { node: run.node, flags: clone(entryFlags), path: run.path.slice(-60), where: run.where, time: run.time };
}
function slotInfo() {
  const node = NODES[run.node] || {}, t = turns.at(-1);
  return { at: Date.now(), where: run.where || "", chapter: node.chapter?.title || "", thumb: (G.art[`cg:${run.node}`] || G.places[run.where] || G.art.opening || ""), line: firstLine(t) };
}
function firstLine(t) {
  const s = t?.steps?.find((x) => x.k === "say" || x.k === "narr");
  return s ? (s.who ? `${s.who}: ` : "") + String(s.text).slice(0, 90) : "";
}
function autosave() { if (run && run.node) setJSON("slot:auto", { state: snapshot(), info: slotInfo() }); }
function saveTo(k) { setJSON(`slot:${k}`, { state: snapshot(), info: slotInfo() }); }
function openSlots(mode) {
  const dlg = $("slots"), grid = $("slot-grid");
  $("slots-title").textContent = mode === "save" ? "Save" : "Load";
  grid.replaceChildren();
  const keys = [...(mode === "load" ? ["auto"] : []), ...Array.from({ length: SLOTS }, (_, i) => String(i + 1))];
  for (const k of keys) {
    const rec = getJSON(`slot:${k}`, null), b = mk("button", "slot");
    b.type = "button";
    const th = mk("div", "slot-thumb");
    if (rec?.info?.thumb) th.style.backgroundImage = `url("${rec.info.thumb}")`;
    const txt = mk("div");
    txt.append(mk("div", "slot-name", k === "auto" ? "Autosave" : `Slot ${k}`));
    if (rec) {
      const when = new Date(rec.info?.at || 0).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      txt.append(mk("div", "slot-meta", [rec.info?.chapter, rec.info?.where].filter(Boolean).join(" · ") || "—"), mk("div", "slot-meta", when));
    } else txt.append(mk("div", "slot-meta", "Empty"));
    b.append(th, txt);
    if (mode === "load" && !rec) b.disabled = true;
    b.addEventListener("click", () => {
      if (mode === "save") { if (rec && !confirm(`Overwrite slot ${k}?`)) return; saveTo(k); openSlots("save"); return; }
      for (const d of document.querySelectorAll("dialog[open]")) d.close();
      resume(rec.state);
    });
    grid.append(b);
  }
  if (!dlg.open) dlg.showModal();
}

// ---- Backlog ----
function openBacklog() {
  const box = $("backlog-list");
  box.replaceChildren();
  for (const t of turns) {
    const node = NODES[t.entry.node];
    box.append(mk("div", "bl-scene", [node?.chapter?.title, t.where].filter(Boolean).join(" · ") || "Scene"));
    for (const s of t.steps) {
      if (s.k === "card") continue;
      const p = mk("p");
      if (s.k === "time") { p.className = "bl-time"; p.textContent = s.text; }
      else if (s.k === "say") { const w = mk("span", "bl-who" + (s.you ? " bl-you" : ""), s.you ? G.player.split(/\s+/)[0] : s.who); p.append(w, document.createTextNode(`“${s.text}”`)); }
      else p.textContent = s.text.replace(/\*\*?([^*\n]+?)\*\*?/g, "$1");
      box.append(p);
    }
  }
  const dlg = $("backlog");
  if (!dlg.open) dlg.showModal();
  box.scrollTop = box.scrollHeight;
}

// ---- Title, menu, settings ----
function renderTitle() {
  document.title = G.title;
  $("title-name").textContent = G.title;
  $("title-tagline").textContent = G.tagline || "";
  $("title-genre").textContent = G.genre || "";
  if (G.art.opening) $("title-art").style.backgroundImage = `url("${G.art.opening}")`;
  $("btn-continue").hidden = !getJSON("slot:auto", null);
  const found = getJSON("endings", []).length, all = (G.endings || []).length;
  $("title-endings").textContent = all > 1 && found ? `${found} of ${all} endings found` : "";
}
function openSettings() {
  $("set-pace").value = settings.pace;
  const dlg = $("settings");
  if (!dlg.open) dlg.showModal();
}
function wire() {
  $("btn-new").addEventListener("click", () => { if (getJSON("slot:auto", null) && !confirm("Start a new game? Your autosave will be replaced when you play.")) return; begin(); });
  $("btn-continue").addEventListener("click", () => { const r = getJSON("slot:auto", null); if (r) resume(r.state); });
  $("btn-load").addEventListener("click", () => openSlots("load"));
  $("btn-settings").addEventListener("click", openSettings);
  $("btn-quit").addEventListener("click", () => window.close());
  $("btn-menu").addEventListener("click", (e) => { e.stopPropagation(); $("menu").showModal(); });
  $("menu").addEventListener("click", (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    $("menu").close();
    if (act === "save") openSlots("save");
    else if (act === "load") openSlots("load");
    else if (act === "settings") openSettings();
    else if (act === "title") toTitle();
    else if (act === "quit") window.close();
  });
  for (const id of ["slots", "settings", "backlog"]) $(id).addEventListener("click", (e) => { if (e.target.closest("button")?.dataset.act === "close") $(id).close(); });
  $("set-pace").addEventListener("change", (e) => { settings.pace = e.target.value; setJSON("settings", settings); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || $("play").hidden || document.querySelector("dialog[open]")) return;
    e.preventDefault(); $("menu").showModal();
  });
}

async function boot() {
  try {
    G = await (await fetch("game.json")).json();
  } catch (e) {
    document.body.textContent = "This game's files could not be read.";
    return;
  }
  STORYGEN = { sprites: G.exprs };
  NODES = G.script.nodes;
  names = Object.keys(G.people).filter((n) => n !== G.player);
  settings = { ...settings, ...getJSON("settings", {}) };
  wire(); renderTitle(); show("title");
}
boot();
