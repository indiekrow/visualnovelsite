
function vnSlots(prev, step, present, lastSpoke, isPlayer) {
  const key = (n) => String(n).trim().toLowerCase(), seen = new Set();
  let s = [];
  for (const n of Array.isArray(prev) ? prev : []) if (typeof n === "string" && n.trim() && !seen.has(key(n))) { seen.add(key(n)); s.push(n); }
  s = s.slice(-3);
  if (!step) { const here = new Set((Array.isArray(present) ? present : []).filter((n) => typeof n === "string").map(key)); return s.filter((n) => here.has(key(n))); }
  const who = step.k === "say" && typeof step.who === "string" ? step.who.trim() : "";
  let mine = !!(step.you || step.player);
  try { mine ||= !!(who && typeof isPlayer === "function" && isPlayer(who)); } catch {  }
  if (!who || mine || s.some((n) => key(n) === key(who))) return s;
  if (s.length < 3) return [...s, who];
  const map = lastSpoke instanceof Map ? lastSpoke : new Map(Object.entries(lastSpoke && typeof lastSpoke === "object" ? lastSpoke : {}));
  const at = (n) => { for (const [k, v] of map) if (key(k) === key(n) && typeof v === "number") return v; return -Infinity; };
  let last = "", top = -Infinity;
  for (const [k, v] of map) if (typeof v === "number" && v > top) { top = v; last = k; }
  let out = null;
  for (const n of s) if (!(last && key(n) === key(last)) && (out === null || at(n) < at(out))) out = n;
  return s.filter((n) => n !== out).concat(who);
}

const VN = (() => {
  const CPS = 45, POS = [[], [50], [29, 71], [19, 50, 81]], AUTO_KEY = "varanthos:vn-auto";
  const PACE = { slow: 1.6, normal: 1, quick: 0.55 };
  const XFADE = 150;
  const WHEEL = 60, WHEEL_REST = 120, WHEEL_NOTCH = 70;
  const FIELDS = "input, textarea, select, [contenteditable]:not([contenteditable=false])";
  const navKey = (e) => (e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : e.key === "ArrowRight" || e.key === "PageDown" ? 1 : 0);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const key = (n) => str(n).trim().toLowerCase();
  const hex = (c) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : "");
  const call = (f, ...a) => { if (typeof f !== "function") return undefined; try { return f(...a); } catch (e) { console.warn("VN:", e); return undefined; } };
  const still = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  const plain = (t) => str(t).replace(/\*\*?([^*\n]+?)\*\*?/g, "$1");
  const now = () => performance.now();
  const fsLabel = (b) => { const on = !!document.fullscreenElement; b.textContent = on ? "Exit full screen" : "Full screen"; b.setAttribute("aria-pressed", String(on)); };
  document.addEventListener("fullscreenchange", () => document.querySelectorAll(".vn-fs").forEach(fsLabel));

  function makeStage(o = {}) {
    const cutMode = !!o.cut;
    let root = null, deps = {}, d = null, onClick = null, onKey = null, onWheel = null;
    let entry = null, steps = [], extra = [], stage = {}, live = false;
    let i = -1, slots = [], speaker = "", tick = 0;
    let spoke = new Map(), exprs = new Map(), wears = new Map();
    const sprNodes = new Map();
    let ty = null, typeT = 0, autoT = 0, autoOn = false, doneAt = 0, shownAt = 0, want = false, chase = false, doneSent = false, cgSrc = "", bare = false;
    let choice = null, choiceSeq = 0, midCg = "";
    const blank = () => ({ slots: [], exprs: new Map(), wears: new Map(), spoke: new Map(), tick: 0 });
    let back = null, turnStart = blank(), wheelAcc = 0, wheelAt = 0, wheelRest = 0;
    const nearBy = [new Map(), new Map()];

    const list = () => steps.concat(extra);
    const isP = (n) => !!(n && call(deps.isPlayer, n));
    const norm = (st) => (Array.isArray(st) ? st.filter((s) => s && typeof s === "object" && typeof s.text === "string") : []);
    const exprOf = (n) => exprs.get(key(n)) || "neutral";
    function setExpr(n, e) { if (typeof n === "string" && n.trim() && typeof e === "string" && e.trim()) exprs.set(key(n), e.trim().toLowerCase()); }
    // What someone wears from a step on, when the turn changes it part-way (a scripted scene's [wear] line: the step's
    // `wear`, {name: clothes}); until then, and after a scene change, the page decides from the entry.
    function wearIn(s) {
      if (!s || !s.wear || typeof s.wear !== "object") return;
      for (const [n, w] of Object.entries(s.wear)) if (typeof n === "string" && n.trim() && typeof w === "string" && w.trim()) wears.set(key(n), w.trim());
    }
    function spriteFor(n) {
      const sp = n ? call(deps.spriteOf, n, entry, exprOf(n), wears.has(key(n)) ? wears.get(key(n)) : undefined) : null;
      return sp && typeof sp === "object" && typeof sp.src === "string" && sp.src
        ? { src: sp.src, cut: !!sp.cut, expr: typeof sp.expr === "string" ? sp.expr : "", shadow: !!sp.shadow } : null;
    }
    const kindOf = (sp) => (sp.cut ? "cut" : "frame") + (sp.shadow ? "-shadow" : "");
    const exprKey = (e) => { e = str(e); if (typeof vnExpr !== "function") return e; try { return vnExpr(e); } catch { return e; } };
    function castOf(stg) {
      const out = [], seen = new Set();
      for (const c of Array.isArray(stg?.cast) ? stg.cast : []) {
        const name = str(typeof c === "string" ? c : c?.name).trim();
        if (!name || seen.has(key(name))) continue;
        seen.add(key(name)); out.push({ name, expr: typeof c === "object" ? exprKey(c?.expr) : "" });
        if (out.length === 3) break;
      }
      return out;
    }
    const typing = () => !!ty && (ty.n < ty.text.length || (live && !!ty.s.open));

    function todOf(t) {
      t = key(t);
      if (!t) return "";
      if (/dawn|sunrise|daybreak|first light/.test(t)) return "dawn";
      if (/dusk|sunset|twilight|late afternoon|golden hour/.test(t)) return "dusk";
      if (/evening/.test(t)) return "evening";
      if (/night|midnight|small hours/.test(t)) return "night";
      return "day";
    }
    function wxOf(w) {
      w = key(w);
      if (/snow|blizzard|flurr|sleet/.test(w)) return "snow";
      if (/rain|drizzle|shower|storm|downpour|thunder/.test(w)) return "rain";
      if (/fog|mist|haze|smog/.test(w)) return "fog";
      return "";
    }

    function build() {
      d = {};
      d.stage = mk("div", "vn-stage");
      d.bg = mk("div", "vn-bg"); d.place = mk("div", "vn-place"); d.tint = mk("div", "vn-tint"); d.wx = mk("div", "vn-wx");
      d.spr = mk("div", "vn-sprites"); d.cg = mk("div", "vn-cg"); d.card = mk("div", "vn-card");
      d.wx.hidden = d.cg.hidden = d.card.hidden = true;
      for (const e of [d.bg, d.place, d.tint, d.wx, d.spr, d.cg]) e.setAttribute("aria-hidden", "true");
      const touch = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } })();
      d.earlier = mk("button", "vn-earlier", touch ? "Earlier · tap to return" : "Earlier · scroll down to return"); d.earlier.type = "button"; d.earlier.hidden = true;
      d.earlier.title = "Back to the line you were on";
      d.earlier.addEventListener("click", (e) => { e.stopPropagation(); if (e.detail) d.earlier.blur(); toLive(); });
      d.choices = mk("div", "vn-choices"); d.choices.hidden = true; d.choices.setAttribute("role", "group"); d.choices.setAttribute("aria-label", "Your choices");
      d.stage.append(d.bg, d.place, d.tint, d.wx, d.spr, d.cg, d.card, d.choices, d.earlier);
      d.box = mk("div", "vn-box");
      d.plate = mk("div", "vn-plate"); d.plate.hidden = true;
      d.text = mk("div", "vn-text"); d.typed = mk("span", "vn-typed"); d.more = mk("span", "vn-more", "▼"); d.wait = mk("span", "vn-wait");
      d.wait.append(mk("i"), mk("i"), mk("i")); d.more.hidden = d.wait.hidden = true;
      d.more.setAttribute("aria-hidden", "true"); d.wait.setAttribute("aria-hidden", "true");
      d.text.append(d.typed, d.more, d.wait);
      d.ctl = mk("div", "vn-ctl");
      const btn = (label, title, fn) => {
        const b = mk("button", "vn-btn", label); b.type = "button"; b.title = title;
        b.addEventListener("click", (e) => { e.stopPropagation(); if (e.detail) b.blur(); fn(); });
        return b;
      };
      d.auto = btn("Auto", "Go on by itself after each line", () => auto());
      d.skip = btn("Skip", "Jump to the last line", () => skip());
      d.log = btn("Log", "The whole story so far", () => call(deps.onLog));
      d.ill = btn("Illustrate", "Paint this moment", () => { const en = back ? back.v.entry : entry; if (en) call(deps.onIllustrate, en); });
      d.auto.setAttribute("aria-pressed", "false"); d.ill.hidden = true;
      if (typeof o.controls === "function") d.ctl.append(...(call(o.controls, btn) || []));
      else d.ctl.append(d.auto, d.skip, d.log, d.ill);
      if (typeof deps.onFullscreen === "function" && document.fullscreenEnabled) {
        d.fs = btn("Full screen", "Full screen (F)", () => call(deps.onFullscreen));
        d.fs.classList.add("vn-fs"); fsLabel(d.fs); d.ctl.append(d.fs);
      }
      d.sr = mk("div", "vn-sr"); d.sr.setAttribute("aria-live", "polite");
      d.box.append(d.plate, d.text, d.ctl, d.sr);
      d.shell = mk("div", "vn-shell");
      d.shell.append(d.stage, d.box);
      root.replaceChildren(d.shell, ...[...root.children].filter((e) => e.classList.contains("vn-cutscene")));
    }
    const ours = (e) => e.target?.closest?.(".vn") === root;
    function bind() {
      onClick = (e) => {
        if (e.button || !d || !ours(e)) return;
        if (e.target.closest?.(".vn-ctl, button, a, input, textarea, select, summary, label, [data-ref], [contenteditable]")) return;
        if (window.getSelection?.().toString()) return;
        next();
      };
      onKey = cutMode ? null : (e) => {
        const dir = navKey(e);
        if (!dir && ((e.key !== " " && e.key !== "Enter" && !/^[1-9]$/.test(e.key)) || e.repeat)) return;
        if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
        if (call(o.blocked)) return;
        if (!root?.isConnected || !root.getClientRects().length || root.closest("[inert]")) return;
        if (document.querySelector("dialog[open]")) return;
        const a = document.activeElement;
        if (dir) { if (!a?.closest?.(FIELDS) && (dir < 0 ? goBack() : goFwd())) e.preventDefault(); return; }
        if (/^[1-9]$/.test(e.key)) { if (!a?.closest?.(FIELDS) && choicesShown() && choice.items[+e.key - 1]) { e.preventDefault(); pick(+e.key - 1); } return; }
        if (a && a !== document.body && a.closest?.("input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable=false])")) return;
        e.preventDefault(); next();
      };
      onWheel = (e) => {
        if (!d || e.ctrlKey || e.defaultPrevented || !ours(e)) return;
        if (call(o.blocked) || root.closest("[inert]") || document.querySelector("dialog[open]")) return;
        let dy = Number(e.deltaY) || 0;
        if (!dy || Math.abs(Number(e.deltaX) || 0) > Math.abs(dy)) return;
        dy *= e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? Math.max(400, root.clientHeight) : 1;
        const dir = dy > 0 ? 1 : -1, t = now();
        if (scrollsFirst(e.target, dir)) { wheelAcc = 0; return; }
        if (t < wheelRest) { if (Math.abs(dy) < WHEEL) wheelRest = t + WHEEL_REST; if (e.cancelable) e.preventDefault(); return; }
        if (!(dir < 0 ? canBack() : wheelFwd())) { wheelAcc = 0; return; }
        if (e.cancelable) e.preventDefault();
        if (t - wheelAt > 250 || Math.sign(wheelAcc) !== dir) wheelAcc = 0;
        wheelAt = t; wheelAcc += dy;
        if (Math.abs(wheelAcc) < WHEEL) return;
        wheelAcc = 0; wheelRest = t + (Math.abs(dy) >= WHEEL ? WHEEL_NOTCH : WHEEL_REST);
        if (dir < 0) goBack(); else goFwd();
      };
      root.addEventListener("click", onClick);
      root.addEventListener("wheel", onWheel, { passive: false });
      if (onKey) document.addEventListener("keydown", onKey);
    }
    function unbind() {
      if (root && onClick) root.removeEventListener("click", onClick);
      if (root && onWheel) root.removeEventListener("wheel", onWheel, { passive: false });
      if (onKey) document.removeEventListener("keydown", onKey);
      root?.classList.remove("vn", "vn-carding", "vn-bare", "vn-back");
      onClick = onKey = onWheel = null;
    }
    function scrollsFirst(t, dir) {
      const el = d.card.contains(t) ? d.card : d.box.contains(t) ? d.text : null;
      if (!el || el.scrollHeight - el.clientHeight < 2) return false;
      return dir < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    }

    function paintScene() {
      const where = str(stage.where).trim(), src = str(call(deps.bgOf, where) || "");
      if (src !== (d.bg.dataset.src || "")) {
        d.bg.dataset.src = src;
        const old = [...d.bg.querySelectorAll("img")];
        const drop = () => old.forEach((im) => { im.classList.remove("vn-on"); setTimeout(() => im.remove(), 450); });
        if (src) {
          const im = mk("img"); im.alt = ""; im.decoding = "async";
          im.onload = () => { if (d?.bg.dataset.src !== src) return im.remove(); im.classList.add("vn-on"); d.stage.classList.remove("vn-nobg"); drop(); };
          im.onerror = () => { im.remove(); if (d?.bg.dataset.src === src) { d.stage.classList.add("vn-nobg"); drop(); } };
          d.bg.append(im); im.src = src;
        } else { drop(); d.stage.classList.add("vn-nobg"); }
      }
      if (!src) d.stage.classList.add("vn-nobg");
      d.place.textContent = where;
      const tod = todOf(stage.time), wx = wxOf(stage.weather);
      if (tod) root.dataset.tod = tod; else delete root.dataset.tod;
      d.wx.dataset.wx = wx; d.wx.hidden = !wx;
    }

    function mkSprite(n, sp) {
      let node, img;
      if (sp.cut) node = img = mk("img", "vn-spr vn-cutout");
      else { node = mk("div", "vn-spr vn-frame"); img = mk("img"); node.append(img); }
      if (sp.shadow) node.classList.add("vn-shadow");
      img.alt = ""; img.decoding = "async"; img.draggable = false;
      img.onerror = () => node.classList.add("vn-broken");
      img.src = sp.src;
      node.setAttribute("aria-hidden", "true");
      Object.assign(node.dataset, { name: n, kind: kindOf(sp), src: sp.src });
      return node;
    }
    function retire(node) { node.classList.add("vn-out"); node.classList.remove("vn-talk", "vn-dim"); setTimeout(() => node.remove(), still() ? 0 : 320); }
    function swap(node, src) {
      const cs = getComputedStyle(node), was = { transform: cs.transform, filter: cs.filter, left: cs.left };
      node.dataset.src = src; node.classList.remove("vn-broken");
      const img = node.tagName === "IMG" ? node : node.querySelector("img");
      if (!img) return;
      if (still() || !img.complete || !img.naturalWidth) { img.src = src; return; }
      const pre = new Image();
      const go = () => {
        if (node.dataset.src !== src || !node.isConnected) return;
        const ghost = node.cloneNode(true);
        ghost.classList.add("vn-ghost"); ghost.classList.remove("vn-in", "vn-talk", "vn-dim"); delete ghost.dataset.name;
        Object.assign(ghost.style, { transition: "none", transform: was.transform, filter: was.filter, left: was.left, zIndex: getComputedStyle(node).zIndex });
        node.after(ghost); img.src = src;
        setTimeout(() => ghost.remove(), XFADE + 60);
      };
      pre.onload = () => { if (typeof pre.decode === "function") pre.decode().then(go, go); else go(); };
      pre.onerror = () => { if (node.dataset.src === src) img.src = src; };
      pre.src = src;
    }
    function drawSprites() {
      if (!d) return;
      const vis = [];
      for (const n of slots) { const sp = spriteFor(n); if (sp) vis.push([n, sp]); }
      const pos = POS[Math.min(3, vis.length)], keep = new Set(), talking = !!speaker && vis.some(([n]) => key(n) === key(speaker));
      vis.slice(0, 3).forEach(([n, sp], k) => {
        keep.add(n);
        let node = sprNodes.get(n);
        if (node && node.dataset.kind !== kindOf(sp)) { retire(node); node = null; }
        if (!node) {
          node = mkSprite(n, sp); node.classList.add("vn-in"); node.style.left = pos[k] + "%";
          d.spr.append(node); sprNodes.set(n, node);
          void node.offsetWidth; node.classList.remove("vn-in");
        } else if (node.dataset.src !== sp.src) swap(node, sp.src);
        node.dataset.expr = sp.expr || exprOf(n);
        node.style.left = pos[k] + "%";
        const on = talking && key(n) === key(speaker);
        node.classList.toggle("vn-talk", on); node.classList.toggle("vn-dim", talking && !on);
      });
      for (const [n, node] of sprNodes) if (!keep.has(n)) { retire(node); sprNodes.delete(n); }
    }
    function enter(s) {
      if (!s || s.k !== "say" || typeof s.who !== "string" || !s.who.trim() || s.you || s.player || isP(s.who)) return;
      if (!spriteFor(s.who)) return;
      slots = vnSlots(slots, s, stage.present, spoke, isP);
      spoke.set(s.who, ++tick);
    }
    const mine = (s) => !!(s.you || s.player || (s.who && isP(s.who)));
    function speakerOf(s) {
      if (!s || s.k !== "say") return "";
      if (!mine(s)) return typeof s.who === "string" ? s.who.trim() : "";
      return cutMode ? slots.find((n) => isP(n)) || "" : "";
    }
    function feel(s) {
      if (!s || s.k !== "say" || typeof s.who !== "string" || typeof s.expr !== "string") return;
      setExpr(cutMode && mine(s) ? slots.find((n) => isP(n)) || s.who : s.who, s.expr);
    }

    function showPlate(s) {
      const who = s && s.k === "say" && typeof s.who === "string" ? s.who.trim() : "";
      d.plate.replaceChildren(); d.plate.hidden = !who;
      const tint = who ? hex(call(deps.colorOf, who)) : "";
      if (tint) root.style.setProperty("--vn-say", tint); else root.style.removeProperty("--vn-say");
      if (!who) return;
      const face = isP(who) || !spriteFor(who) ? str(call(deps.faceOf, who) || "") : "";
      if (face) { const im = mk("img", "vn-face"); im.alt = ""; im.onerror = () => im.remove(); im.src = face; d.plate.append(im); }
      d.plate.append(mk("span", "vn-name", who));
    }
    function paintMore() {
      if (!d) return;
      paintChoices();
      if (back) { d.more.hidden = false; d.wait.hidden = true; d.skip.disabled = false; return; }
      const L = list(), caught = !ty || ty.n >= ty.text.length;
      d.more.hidden = typing() || (i >= L.length - 1 && !o.onEnd);
      d.wait.hidden = !(live && caught && i >= L.length - 1);
      d.skip.disabled = !L.length || (i >= L.length - 1 && !typing());
    }
    const choicesShown = () => !!d && !!choice && !d.choices.hidden;
    function pick(k) {
      const c = choice;
      if (!c || !c.items[k]) return;
      choice = null; paintChoices();
      call(c.onPick, k, c.items[k]);
    }
    function paintChoices() {
      if (!d?.choices) return;
      const show = !!choice && !back && !live && !typing() && i >= list().length - 1;
      if (!show) { d.choices.hidden = true; d.choices.replaceChildren(); d.choices.dataset.n = ""; return; }
      if (d.choices.dataset.n === choice.id) { d.choices.hidden = false; return; }
      d.choices.dataset.n = choice.id;
      d.choices.replaceChildren(...choice.items.map((it, k) => {
        const b = mk("button", "vn-choice" + (it.go ? " vn-go" : ""), it.text); b.type = "button"; b.dataset.n = String(k + 1);
        b.addEventListener("click", (e) => { e.stopPropagation(); if (e.detail) b.blur(); pick(k); });
        return b;
      }));
      d.choices.hidden = false;
    }
    function choices(items, onPick) {
      const list = (Array.isArray(items) ? items : []).map((it) => (typeof it === "string" ? { text: it } : it && typeof it === "object" ? it : null))
        .filter((it) => it && typeof it.text === "string" && it.text.trim()).map((it) => ({ text: it.text.trim(), go: !!it.go }));
      choice = list.length ? { items: list, onPick, id: String(++choiceSeq) } : null;
      paintChoices();
    }
    function stopType() { clearTimeout(typeT); typeT = 0; }
    function runType() {
      if (!ty || typeT) return;
      if (ty.n >= ty.text.length) return lineDone();
      ty.t0 = now(); ty.n0 = ty.n;
      const step = () => {
        typeT = 0;
        if (!ty || !d) return;
        ty.n = Math.min(ty.text.length, ty.n0 + 1 + Math.floor((now() - ty.t0) * CPS / 1000));
        d.typed.textContent = ty.text.slice(0, ty.n);
        d.text.scrollTop = d.text.scrollHeight;
        if (ty.n < ty.text.length) typeT = setTimeout(step, 1000 / CPS); else lineDone();
      };
      step(); paintMore();
    }
    function lineDone() {
      paintMore();
      if (typing()) return;
      doneAt = now();
      const s = ty?.s;
      if (s && s.k !== "card") d.sr.textContent = (s.k === "say" && s.who ? s.who + ": " : "") + ty.text;
      if (cgSrc && atLast()) setCg(cgSrc);
      armAuto(); checkDone();
    }
    function complete() {
      if (!ty) return;
      stopType(); ty.n = ty.text.length; d.typed.textContent = ty.text; d.text.scrollTop = d.text.scrollHeight;
      lineDone();
    }
    function showStep(s, instant) {
      clearTimeout(autoT); autoT = 0; stopType(); want = false; setBare(false);
      syncCg();
      shownAt = now();
      root.classList.toggle("vn-carding", s.k === "card");
      if (s.k === "card") {
        d.card.replaceChildren(s.el); d.card.hidden = false; d.card.scrollTop = 0;
        speaker = ""; showPlate(null); d.typed.textContent = ""; ty = { s, text: "", n: 0 };
        drawSprites(); return lineDone();
      }
      d.card.hidden = true;
      speaker = speakerOf(s);
      showPlate(s);
      d.text.classList.toggle("vn-time", s.k === "time");
      d.text.classList.toggle("vn-said", s.k === "say");
      drawSprites();
      const text = plain(s.text);
      ty = { s, text, n: instant || chase || still() || s.k === "time" || call(deps.pace) === "off" ? text.length : 0 };
      d.typed.textContent = text.slice(0, ty.n); d.text.scrollTop = ty.n ? d.text.scrollHeight : 0;
      runType();
    }
    // The stage of a turn: its place, time, weather and who stands there. A step may carry a `stage` of its own (a
    // place card at a scripted scene change): reaching it moves the stage there, so the steps before it (the player's
    // own line for the choice they made) play where they were said.
    // stageTo moves the state only (also used while replaying a past turn); applyStage paints it too.
    function stageTo(stg) {
      stage = stg && typeof stg === "object" ? { ...stg } : {};
      exprs.clear(); wears.clear();
      if (Array.isArray(stage.cast)) {
        const cast = castOf(stage);
        slots = cast.map((c) => c.name); cast.forEach((c) => setExpr(c.name, c.expr));
      } else slots = vnSlots(slots, null, stage.present, spoke, isP);
    }
    function applyStage(stg) { stageTo(stg); paintScene(); }
    function goto(n, instant) {
      const L = list();
      n = Math.min(n, L.length - 1);
      if (n < 0 || n < i) return;
      for (let k = Math.max(0, i + 1); k <= n; k++) { if (L[k].stage) applyStage(L[k].stage); wearIn(L[k]); feel(L[k]); enter(L[k]); }
      i = n; showStep(L[n], instant);
    }
    const atLast = () => !live && i >= 0 && i >= list().length - 1;
    function checkDone() {
      if (doneSent || live || !root || back) return;
      const L = list();
      if (L.length && (i < L.length - 1 || typing())) return;
      doneSent = true;
      const r = root, en = entry;
      setTimeout(() => r.dispatchEvent(new CustomEvent("vn:done", { detail: { entry: en } })), 0);
    }

    const lineMs = (s) => (s.k === "time" ? 1400 : Math.round(Math.min(10000, Math.max(1500, 1200 + 30 * plain(s.text).length))));
    function armAuto() {
      clearTimeout(autoT); autoT = 0;
      if (!autoOn || !d || typing() || back) return;
      if (bare) {
        if (cutMode && o.onEnd && atLast()) autoT = setTimeout(() => { autoT = 0; if (autoOn && bare) { setBare(false); call(o.onEnd); } }, Math.max(900, Number(call(o.bareMs)) || 2500));
        return;
      }
      const L = list(), s = L[i];
      if (!s) return;
      if (typeof o.paceMs === "function") {
        if (live) return;
        const ms = Math.max(900, (Number(call(o.paceMs, s, i, L)) || 0) - (now() - shownAt));
        autoT = setTimeout(() => { autoT = 0; if (!autoOn || typing()) return; if (i < list().length - 1) goto(i + 1); else endBeat(); }, ms);
        return;
      }
      if (i >= L.length - 1 || s.k === "card") return;
      autoT = setTimeout(() => { autoT = 0; if (autoOn && !typing()) goto(i + 1); }, Math.max(0, lineMs(s) - (now() - doneAt)));
    }

    // An event picture shown part-way through a scene: a step may carry `cg` (a scripted scene's [cg label] line; "off"
    // ends it), and the picture stays under the text from that step until the next one that carries it. `cgOf` (the
    // page) gives the painted picture for a label, or "" when it isn't painted: then the stage plays on with sprites.
    function cgAt(L, n) {
      let label = "";
      for (let k = 0; k <= n && k < L.length; k++) if (typeof L[k].cg === "string" && L[k].cg) label = L[k].cg === "off" ? "" : L[k].cg;
      return label;
    }
    const cgFor = (en, L, n) => { const label = cgAt(L, n); return label ? str(call(deps.cgOf, en, label) || "") : ""; };
    function syncCg(clear) {
      if (!d || cutMode) return;
      const src = cgFor(entry, list(), i);
      if (src) { midCg = src; setCg(src); }
      else if (midCg || clear) { midCg = ""; setCg(""); }
    }
    function setCg(src) {
      if (!d) return;
      let im = d.cg.querySelector("img");
      if (!src) { d.cg.hidden = true; d.cg.classList.remove("vn-on"); im?.remove(); setBare(false); return; }
      if (im && im.dataset.src === src) {
        if (!d.cg.hidden) return;
        if (im.complete && im.naturalWidth) { d.cg.hidden = false; d.cg.classList.add("vn-on"); return; }
      }
      // One picture giving way to another: the first stays up until the second has loaded, so the sprites don't flash
      // between them.
      if (im && !d.cg.hidden && d.cg.classList.contains("vn-on") && im.dataset.src && im.dataset.src !== src) {
        const pre = new Image();
        im.dataset.want = src;
        pre.onload = pre.onerror = () => { if (d && im.isConnected && im.dataset.want === src) { delete im.dataset.want; im.dataset.src = src; im.src = src; } };
        pre.src = src;
        return;
      }
      if (im) delete im.dataset.want;
      if (!im) { im = mk("img"); im.alt = ""; im.decoding = "async"; d.cg.append(im); }
      d.cg.classList.remove("vn-on"); d.cg.hidden = false;
      im.onload = () => d?.cg.classList.add("vn-on");
      im.onerror = () => { if (d) { d.cg.hidden = true; setBare(false); } };
      im.dataset.src = src; im.src = src;
    }
    function setBare(on) { bare = !!on; root?.classList.toggle("vn-bare", bare); }
    function boxOver() {
      if (!d?.box || !d.stage) return false;
      const b = d.box.getBoundingClientRect(), s = d.stage.getBoundingClientRect();
      return b.height > 0 && b.top < s.bottom - 1;
    }
    function endBeat() {
      if (cutMode && d && !d.cg.hidden && !bare && atLast() && boxOver()) { setBare(true); armAuto(); return; }
      call(o.onEnd);
    }

    const here = () => (typeof o.here === "function" ? call(o.here) : entry);
    function within(s, fn) {
      const was = { entry, stage, slots, exprs, wears, spoke, tick, speaker };
      ({ entry, stage, slots, exprs, wears, spoke, tick, speaker } = { wears: new Map(), ...s });
      try { return fn(); } finally {
        Object.assign(s, { entry, stage, slots, exprs, wears, spoke, tick, speaker });
        ({ entry, stage, slots, exprs, wears, spoke, tick, speaker } = was);
      }
    }
    function near(ref, dir) {
      if (ref == null) return null;
      const memo = nearBy[dir < 0 ? 0 : 1];
      if (memo.has(ref)) return memo.get(ref);
      let at = ref, v = null;
      for (let n = 0; n < 50 && !v; n++) {
        const x = typeof o.around === "function" ? call(o.around, at, dir) : call(dir < 0 ? deps.turnBefore : deps.turnAfter, at);
        if (!x || typeof x !== "object") break;
        const r = "ref" in x ? x.ref : x.entry || null, st = norm(x.steps);
        if (st.length) {
          v = { ref: r, entry: x.entry || null, steps: st, stage: x.stage && typeof x.stage === "object" ? { ...x.stage } : {} };
          const bs = beatsOf(v, x.beats);
          if (bs) v.beats = bs;
        } else if (r == null || r === at) break;
        else at = r;
      }
      if (v) memo.set(ref, v);
      return v;
    }
    function beatsOf(v, beats) {
      if (!Array.isArray(beats)) return null;
      const out = [];
      for (const b of beats) {
        const at = b?.at, s = b?.stage;
        if (!Number.isInteger(at) || at < 0 || at >= v.steps.length || !s || typeof s !== "object" || out.some((x) => x.at === at)) continue;
        const cast = Array.isArray(s.cast) ? s.cast : [];
        out.push({ at, view: { ref: v.ref, entry: v.entry, steps: v.steps, from: at,
          stage: { ...s, cast, present: cast.map((c) => str(typeof c === "string" ? c : c?.name).trim()).filter(Boolean) } } });
      }
      if (!out.length) return null;
      out.sort((a, b) => a.at - b.at);
      out[0].at = 0;
      return out;
    }
    const beatView = (v, k) => { if (!v.beats) return v; let b = v.beats[0]; for (const x of v.beats) if (x.at <= k) b = x; return b.view; };
    // The stage this turn opened on: a place card part-way through moves the live `stage`, not the lines before it.
    const ownView = () => ({ own: true, ref: here(), entry, steps: list(), stage: turnStart.stage || stage, start: turnStart });
    function startOf(v, deep = true) {
      if (v.start) return v.start;
      const s = { entry: v.entry, stage: v.stage, speaker: "", ...blank() };
      const p = deep && !Array.isArray(v.stage.cast) ? near(v.ref, -1) : null;
      if (p) { const e = stateAt(p, p.steps.length - 1, false); s.slots = e.slots; s.spoke = e.spoke; s.tick = e.tick; }
      within(s, () => stageTo(stage));
      const st = { slots: s.slots, exprs: s.exprs, wears: s.wears, spoke: s.spoke, tick: s.tick };
      if (deep) v.start = st;
      return st;
    }
    function stateAt(v, k, deep = true) {
      v = beatView(v, k);
      const st = startOf(v, deep);
      const s = { entry: v.entry, stage: v.stage, slots: st.slots.slice(), exprs: new Map(st.exprs), wears: new Map(st.wears || []), spoke: new Map(st.spoke), tick: st.tick, speaker: "" };
      within(s, () => {
        // Replay the turn the way goto() played it live, stage moves included (a scripted scene's place card).
        for (let j = v.from || 0; j <= k && j < v.steps.length; j++) {
          const st = v.steps[j];
          if (st.stage) stageTo(st.stage);
          wearIn(st); feel(st); enter(st);
        }
        speaker = speakerOf(v.steps[k]);
      });
      return s;
    }
    function paintBack(again) {
      if (!back || !d) return;
      const { v, k } = back, s = v.steps[k];
      if (!s) return toLive();
      const tops = again ? [d.text.scrollTop, d.card.scrollTop] : null;
      within(stateAt(v, k), () => {
        paintScene();
        const isCard = s.k === "card";
        root.classList.toggle("vn-carding", isCard);
        d.card.hidden = !isCard;
        if (isCard) { if (d.card.firstChild !== s.el) d.card.replaceChildren(s.el); d.card.scrollTop = 0; showPlate(null); d.typed.textContent = ""; }
        else {
          showPlate(s);
          d.text.classList.toggle("vn-time", s.k === "time"); d.text.classList.toggle("vn-said", s.k === "say");
          d.typed.textContent = plain(s.text); d.text.scrollTop = 0;
          if (!tops) d.sr.textContent = (s.k === "say" && s.who ? s.who + ": " : "") + plain(s.text);
        }
        drawSprites();
      });
      // The picture that line was read under, when the scene showed one part-way through.
      const pic = cutMode ? "" : cgFor(v.entry, v.steps, k);
      if (pic) setCg(pic); else d.cg.hidden = true;
      if (tops) [d.text.scrollTop, d.card.scrollTop] = tops;
      root.classList.add("vn-back"); d.earlier.hidden = false;
      paintCtl(); paintMore(); call(o.onBack);
    }
    function leaveLive() {
      stopType(); clearTimeout(autoT); autoT = 0; want = false; setBare(false);
      d.cg.hidden = true;
    }
    function toLive() {
      if (!back || !d) return;
      back = null; wheelAcc = 0;
      root.classList.remove("vn-back"); d.earlier.hidden = true;
      paintScene(); paintCtl(); call(o.onBack);
      const L = list();
      if (i >= L.length) i = L.length - 1;
      if (i < 0) {
        if (L.length) return goto(chase ? L.length - 1 : 0, chase);
        d.card.hidden = true; root.classList.remove("vn-carding"); showPlate(null); d.typed.textContent = "";
        drawSprites(); paintMore(); checkDone(); return;
      }
      if (!cutMode && !d.cg.hidden) syncCg(true);  // a picture a past line was read under doesn't stay for this one
      showStep(L[i], true);
      if (cutMode && cgSrc) setCg(cgSrc);
      if (chase && i < L.length - 1) goto(L.length - 1, true);
    }
    const canNext = () => bare || typing() || i < list().length - 1 || live || !!o.onEnd || !d.cg.hidden;
    const canBack = () => !!d && (back ? back.k > 0 || !!near(back.v.ref, -1) : i > 0 || !!near(here(), -1));
    const canFwd = () => !!d && (!!back || canNext());
    const wheelFwd = () => !!d && (cutMode ? canFwd() : !!back || typing() || i < list().length - 1 || live);
    function goBack() {
      if (!d || !canBack()) return false;
      if (back && back.k > 0) back.k--;
      else if (!back && i > 0) { leaveLive(); back = { v: ownView(), k: i - 1 }; }
      else { const p = near(back ? back.v.ref : here(), -1); if (!back) leaveLive(); back = { v: p, k: p.steps.length - 1 }; }
      paintBack();
      return true;
    }
    function goFwd() {
      if (!d) return false;
      if (!back) { if (!canNext()) return false; next(); return true; }
      const { v } = back;
      if (v.own) { if (back.k + 1 >= i) toLive(); else { back.k++; paintBack(); } return true; }
      if (back.k < v.steps.length - 1) { back.k++; paintBack(); return true; }
      const nx = near(v.ref, 1);
      if (nx && nx.ref !== here()) back = { v: nx, k: 0 };
      else if (nx && i > 0) back = { v: ownView(), k: 0 };
      else { toLive(); return true; }
      paintBack();
      return true;
    }

    function mount(el, dp) {
      if (!el) return;
      if (root) { unbind(); stopType(); clearTimeout(autoT); }
      root = el; deps = dp && typeof dp === "object" ? dp : {};
      root.classList.add("vn");
      sprNodes.clear(); build(); bind();
      if (cutMode) autoOn = true;
      else try { autoOn = localStorage.getItem(AUTO_KEY) === "on"; } catch { autoOn = false; }
      d.auto.setAttribute("aria-pressed", String(autoOn));
      entry = null; steps = []; extra = []; stage = {}; live = false; i = -1; slots = []; ty = null; exprs.clear(); wears.clear();
      back = null; turnStart = blank(); nearBy.forEach((m) => m.clear());
      paintScene(); paintMore();
    }
    function unmount() {
      if (root && onClick) root.removeEventListener("click", onClick);
      if (root && onWheel) root.removeEventListener("wheel", onWheel, { passive: false });
      if (onKey) document.removeEventListener("keydown", onKey);
      onClick = onKey = onWheel = null; stopType(); clearTimeout(autoT); autoT = 0; ty = null; back = null; d = null; root = null;
    }
    function show(en, st, stg, opt = {}) {
      if (!d) return;
      stopType(); clearTimeout(autoT); autoT = 0;
      if (back) { back = null; root.classList.remove("vn-back"); d.earlier.hidden = true; }
      nearBy.forEach((m) => m.clear());
      entry = en || null; steps = norm(st); extra = []; stage = stg && typeof stg === "object" ? { ...stg } : {};
      live = !!opt?.live; doneSent = want = chase = false; cgSrc = ""; midCg = ""; ty = null; i = -1; speaker = "";
      setCg(""); d.card.replaceChildren(); d.card.hidden = true; root.classList.remove("vn-carding");
      choice = null; paintChoices();
      applyStage(stage);
      turnStart = { slots: slots.slice(), exprs: new Map(exprs), wears: new Map(wears), spoke: new Map(spoke), tick, stage };
      paintCtl();
      const L = list();
      if (L.length) goto(opt?.at === "end" ? L.length - 1 : 0, opt?.at === "end");
      else { showPlate(null); d.typed.textContent = ""; drawSprites(); paintMore(); checkDone(); }
    }
    function update(st) {
      if (!d) return;
      steps = norm(st);
      if (back) { const n = list().length; if (i >= n) i = n - 1; return; }
      const L = list();
      if (i >= L.length) i = L.length - 1;
      if (i < 0) { if (L.length) goto(chase ? L.length - 1 : 0, chase); else paintMore(); return; }
      const cur = L[i];
      if (ty && cur && cur.k !== "card") {
        const text = plain(cur.text);
        if (text !== ty.text) {
          let k = 0; const max = Math.min(ty.n, text.length);
          while (k < max && text[k] === ty.text[k]) k++;
          ty.n = k; ty.text = text; d.typed.textContent = text.slice(0, k);
        }
        const fresh = cur.k === "say" && typeof cur.who === "string" && cur.expr && exprOf(cur.who) !== key(cur.expr);
        if (cur.who !== ty.s.who || cur.k !== ty.s.k || fresh) {
          feel(cur);
          speaker = speakerOf(cur);
          showPlate(cur); drawSprites();
        }
        ty.s = cur;
        if (chase) complete(); else runType();
      }
      if (chase && i < L.length - 1) return goto(L.length - 1, true);
      if (want && !typing() && i < L.length - 1) return goto(i + 1);
      paintMore(); armAuto(); checkDone();
    }
    function finish(st, stg) {
      if (!d) return;
      if (stg && typeof stg === "object" && turnStart.stage) turnStart.stage = { ...turnStart.stage, ...stg };
      if (back) {
        if (stg && typeof stg === "object") stage = { ...stage, ...stg };
        live = false; update(st === undefined ? steps : st); paintMore();
        return;
      }
      if (stg && typeof stg === "object") { stage = { ...stage, ...stg }; paintScene(); }
      live = false;
      update(st === undefined ? steps : st);
      const L = list();
      if (i < 0 && L.length) goto(0);
      paintCtl(); paintMore();
      if (cgSrc && atLast() && !typing()) setCg(cgSrc);
      checkDone();
    }
    function refresh() {
      if (!d) return;
      const s = list()[i];
      if (s?.k === "say" && typeof s.who === "string" && !slots.some((n) => key(n) === key(s.who))) enter(s);
      if (back) return paintBack(true);
      paintScene();
      drawSprites();
      if (s && s.k !== "card") showPlate(s);
      paintCtl();
    }
    function cg(src) {
      cgSrc = typeof src === "string" ? src : "";
      if (!cgSrc) return setCg("");
      if (back) return;
      if (cutMode || (atLast() && !typing())) setCg(cgSrc);
    }
    function card(el) {
      if (!d || !(el instanceof Element)) return;
      const L = list(), there = !back && (i < 0 || (i >= L.length - 1 && !typing()));
      extra.push({ k: "card", el, text: "" });
      if (there) goto(list().length - 1, true); else paintMore();
    }
    function next() {
      if (!d) return;
      if (back) { goFwd(); return; }
      if (bare) { setBare(false); if (cutMode && o.onEnd && atLast()) call(o.onEnd); else armAuto(); return; }
      if (ty && ty.n < ty.text.length) return complete();
      const L = list();
      if (i < L.length - 1 && !typing()) return goto(i + 1);
      if (live || typing()) { want = true; return; }
      if (o.onEnd) return endBeat();
      if (!d.cg.hidden && atLast()) setBare(true);
    }
    function auto(on) {
      autoOn = on === undefined ? !autoOn : !!on;
      if (!cutMode) try { localStorage.setItem(AUTO_KEY, autoOn ? "on" : "off"); } catch {  }
      if (d) d.auto.setAttribute("aria-pressed", String(autoOn));
      if (autoOn && back) toLive();
      if (autoOn) armAuto(); else { clearTimeout(autoT); autoT = 0; }
    }
    function skip() {
      if (!d) return;
      toLive();
      chase = live;
      const L = list();
      if (!L.length) return;
      if (i < L.length - 1) goto(L.length - 1, true); else complete();
    }
    function clear() {
      if (!d) return;
      stopType(); clearTimeout(autoT); autoT = 0;
      if (back) { back = null; root.classList.remove("vn-back"); d.earlier.hidden = true; }
      turnStart = blank(); nearBy.forEach((m) => m.clear());
      entry = null; steps = []; extra = []; stage = {}; live = false; i = -1; slots = []; spoke.clear(); tick = 0; exprs.clear(); wears.clear();
      ty = null; speaker = ""; want = chase = false; doneSent = true; cgSrc = ""; midCg = ""; choice = null;
      setCg(""); d.card.replaceChildren(); d.card.hidden = true; root.classList.remove("vn-carding");
      showPlate(null); d.typed.textContent = ""; d.sr.textContent = "";
      drawSprites(); paintScene(); paintCtl(); paintMore();
    }
    function paintCtl() {
      if (!d) return;
      const en = back ? back.v.entry : entry;
      d.ill.hidden = !(en && call(deps.canIllustrate, en));
      d.auto.setAttribute("aria-pressed", String(autoOn));
    }
    const peek = () => ({ i, total: list().length, live, auto: autoOn, typing: typing(), slots: slots.slice(), exprs: Object.fromEntries(exprs), wears: Object.fromEntries(wears),
      back: back ? { k: back.k, total: back.v.steps.length, own: !!back.v.own } : null, choices: choice ? choice.items.map((it) => it.text) : [], choicesShown: choicesShown() });

    return { mount, unmount, show, update, finish, refresh, cg, card, next, auto, skip, clear, peek, back: goBack, forward: goFwd,
      toLive, looking: () => !!back, el: () => root, deps: () => deps, choices };
  }

  const main = makeStage({ blocked: () => !!cut });

  let cut = null;
  const paceOf = (p) => { if (typeof p === "function") p = call(p); return typeof p === "number" && p > 0 ? p : PACE[p] || 1; };
  function cutBeatsOf(spec) {
    return (Array.isArray(spec?.beats) ? spec.beats : []).map((b) => {
      b = b && typeof b === "object" ? b : {};
      const st = (Array.isArray(b.steps) ? b.steps : []).filter((s) => s && typeof s === "object" && typeof s.text === "string");
      const s = b.stage && typeof b.stage === "object" ? b.stage : {};
      const cast = (Array.isArray(s.cast) ? s.cast : []).filter((c) => (typeof c === "string" ? c.trim() : c && typeof c === "object" && str(c.name).trim()));
      return { steps: st.length ? st : [{ k: "narr", text: "" }], cg: typeof b.cg === "string" ? b.cg : "", cgWait: !!b.cgWait,
        stage: { where: str(s.where), time: str(s.time), weather: str(s.weather), cast, present: cast.map((c) => str(typeof c === "string" ? c : c.name).trim()) } };
    });
  }
  function cutMs(c, s, L) {
    const m = paceOf(c.pace);
    if (s.k === "card") return 2600 * m;
    const lens = L.filter((x) => x.k !== "card").map((x) => plain(x.text).length);
    const total = lens.reduce((a, b) => a + b, 0), weight = lens.reduce((a, b) => a + b + 30, 0) || 1;
    return Math.round(Math.min(30000, Math.max(6000, 2500 + 55 * total)) * m * (plain(s.text).length + 30) / weight);
  }
  function paintCut(c) {
    if (c.part) c.part.textContent = c.k < 0 ? "" : `${c.k + 1} / ${c.beats.length}`;
    const looking = !!c.inst?.looking?.();
    if (c.pause) {
      c.pause.textContent = looking ? "Back to now" : c.paused ? "Resume" : "Pause";
      c.pause.title = looking ? "Back to the line you were on" : c.paused ? "Go on by itself again" : "Stop going on by itself (Next still steps on)";
    }
    if (c.hint) c.hint.hidden = !(c.k >= 0 && c.beats[c.k]?.cgWait && !c.cgs[c.k]);
  }
  function cutNext(c) {
    if (cut !== c || c.over) return;
    c.k++;
    if (c.k >= c.beats.length) return endCut(c);
    const b = c.beats[c.k];
    c.inst.show(c.entry, b.steps, b.stage);
    if (c.cgs[c.k]) c.inst.cg(c.cgs[c.k]);
    paintCut(c);
  }
  function cutPause(c) {
    if (cut !== c) return;
    c.paused = !c.paused; c.inst.auto(!c.paused); paintCut(c);
  }
  function endCut(c) {
    if (!c || c.over) return;
    c.over = true;
    if (cut === c) cut = null;
    document.removeEventListener("keydown", c.keys, true);
    if (!cut) c.host0.classList.remove("vn-cutting");
    c.inst.unmount();
    const el = c.el;
    try { if (el.contains(document.activeElement)) document.activeElement.blur(); } catch {  }
    if (still()) el.remove(); else { el.classList.add("vn-leaving"); setTimeout(() => el.remove(), 300); }
    c.resolve();
  }
  function cutAround(c, ref, dir) {
    const k = ref + dir;
    if (!Number.isInteger(ref) || k < 0 || k >= c.beats.length) return null;
    return { ref: k, entry: c.entry, steps: c.beats[k].steps, stage: c.beats[k].stage };
  }
  function cutscene(spec, opt = {}) {
    if (cut) endCut(cut);
    const beats = cutBeatsOf(spec), host0 = main.el();
    if (!beats.length || !host0?.isConnected) return Promise.resolve();
    return new Promise((resolve) => {
      const title = str(spec?.title).trim();
      const c = cut = { title, beats, k: -1, cgs: beats.map((b) => b.cg), pace: opt?.pace, entry: spec?.entry || null,
        paused: false, over: false, resolve, host0 };
      const el = c.el = mk("div", "vn-cutscene");
      el.setAttribute("role", "region"); el.setAttribute("aria-label", title ? `Cutscene: ${title}` : "Cutscene");
      el.tabIndex = -1;
      const host = mk("div", "vn-cut-host");
      c.hint = mk("div", "vn-cut-wait"); c.hint.hidden = true;
      const dots = mk("span", "vn-wait"); dots.append(mk("i"), mk("i"), mk("i")); dots.setAttribute("aria-hidden", "true");
      c.hint.append(dots, mk("span", "", "Painting this moment…"));
      c.label = mk("div", "vn-cut-label", `🎬 ${title || "Cutscene"}`); c.label.setAttribute("aria-hidden", "true");
      el.append(host);
      host0.append(el); host0.classList.add("vn-cutting");
      c.inst = makeStage({ cut: true, onEnd: () => cutNext(c), paceMs: (s, k, L) => cutMs(c, s, L), bareMs: () => 2500 * paceOf(c.pace),
        here: () => c.k, around: (ref, dir) => cutAround(c, ref, dir), onBack: () => { if (cut === c) paintCut(c); },
        controls: (btn) => {
          c.part = mk("span", "vn-cut-part");
          c.pause = btn("Pause", "", () => (c.inst.looking() ? c.inst.toLive() : cutPause(c)));
          return [c.part, c.pause, btn("Next", "The next line (Space)", () => c.inst.next()), btn("Skip to end", "End the cutscene (Esc)", () => endCut(c))];
        } });
      const over = opt?.deps && typeof opt.deps === "object" ? opt.deps : {};
      c.inst.mount(host, { ...main.deps(), ...over, onLog: null, onIllustrate: null, canIllustrate: null, turnBefore: null, turnAfter: null });
      (host.querySelector(".vn-stage") || el).append(c.label, c.hint);
      c.keys = (e) => {
        if (cut !== c || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
        if (document.querySelector("dialog[open]")) return;
        if (!el.isConnected || !el.getClientRects().length || el.closest("[inert]")) return;
        const a = document.activeElement;
        if (a?.closest?.(FIELDS)) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return endCut(c); }
        const dir = navKey(e);
        if (dir) { if (dir < 0 ? c.inst.back() : c.inst.forward()) { e.preventDefault(); e.stopPropagation(); } return; }
        if (e.key !== " " && e.key !== "Enter") return;
        if (a && a !== document.body && a !== el && a.closest?.("button, a, summary")) return;
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) c.inst.next();
      };
      document.addEventListener("keydown", c.keys, true);
      const a = document.activeElement;
      if (!a?.closest?.(FIELDS)) try { el.focus({ preventScroll: true }); } catch {  }
      if (title) {
        const t = mk("div", "vn-cut-title");
        t.append(mk("div", "vn-cut-kicker", "Cutscene"), mk("div", "vn-cut-name", title));
        c.inst.show(c.entry, [], { ...beats[0].stage, cast: [] });
        c.inst.card(t);
      } else cutNext(c);
      paintCut(c);
    });
  }
  function cutsceneCg(bi, src) {
    const c = cut;
    if (!c || !Number.isInteger(bi) || bi < 0 || bi >= c.beats.length) return;
    c.cgs[bi] = typeof src === "string" ? src : "";
    if (c.k === bi) c.inst.cg(c.cgs[bi]);
    paintCut(c);
  }

  const refresh = () => { main.refresh(); if (cut) cut.inst.refresh(); };
  const peek = () => ({ ...main.peek(), cutscene: cut ? { beat: cut.k, beats: cut.beats.length, paused: cut.paused, ...cut.inst.peek() } : null });
  const back = () => (cut ? cut.inst.back() : main.back());
  const forward = () => (cut ? cut.inst.forward() : main.forward());
  return Object.freeze({ mount: main.mount, show: main.show, update: main.update, finish: main.finish, refresh, cg: main.cg, card: main.card,
    next: main.next, auto: main.auto, skip: main.skip, clear: main.clear, back, forward, peek, cutscene, cutsceneCg, choices: main.choices });
})();
