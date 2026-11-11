// Fills the page from config.js, runs the playable scenes, and sends the idea form.
(function () {
  const S = window.SITE || {};
  const all = (sel, root) => (root || document).querySelectorAll(sel);
  const one = (sel, root) => (root || document).querySelector(sel);
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\/\S+$/i.test(u.trim()) ? u.trim() : "");
  const safeEmail = (e) => (typeof e === "string" && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e.trim()) ? e.trim() : "");
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /* ---- Settings from config.js ---- */
  if (S.brand) {
    all("[data-brand]").forEach((n) => (n.textContent = S.brand));
    document.title = `${S.brand}: bring your story to life as a game`;
  }
  if (S.tagline) all("[data-tagline]").forEach((n) => (n.textContent = S.tagline));
  if (S.turnaround) all("[data-turnaround]").forEach((n) => (n.textContent = S.turnaround));
  if (S.year) all("[data-year]").forEach((n) => (n.textContent = S.year));
  for (const [k, v] of Object.entries(S.prices || {})) all(`[data-price="${k}"]`).forEach((n) => (n.textContent = `$${v}`));
  // The launch offer: regular prices crossed out beside the current ones. With no regularPrices, none of it shows.
  const regular = S.regularPrices || {};
  const onOffer = Object.keys(regular).some((k) => regular[k] > (S.prices || {})[k]);
  all("[data-regular]").forEach((n) => { if (regular[n.dataset.regular]) n.textContent = `$${regular[n.dataset.regular]}`; });
  all("[data-offer-label]").forEach((n) => { if (S.offerLabel) n.textContent = S.offerLabel; });
  all("[data-offer]").forEach((n) => (n.hidden = !onOffer));

  const etsy = safeUrl(S.etsyUrl), paypal = safeUrl(S.paypalUrl), email = safeEmail(S.contactEmail);
  const make = (label, href, cls, external) => {
    const a = el("a", `btn ${cls}`, label); a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener"; }
    return a;
  };
  // Payment links come after a plan is agreed, so they sit beside the form rather than replacing it.
  all("[data-order-buttons]").forEach((box) => {
    const btns = [];
    if (etsy) btns.push(make("Pay on Etsy", etsy, "btn-primary", true));
    if (paypal) btns.push(make("Pay with PayPal", paypal, etsy ? "btn-ghost" : "btn-primary", true));
    box.replaceChildren(...btns);
    const pay = box.closest("[data-pay]");
    if (pay) pay.hidden = !btns.length;
  });
  all("[data-contact]").forEach((a) => { if (email) { a.href = `mailto:${email}`; a.hidden = false; } });

  /* ---- Playable scenes ----
     Every line is taken from the game's own script (export/build/<game>/stage/game.json), trimmed to fit; the Mio
     scene opens on its best line, which comes a little later in the game. A beat is one click:
       { who, spr, fx, t }  a character speaks; spr swaps their sprite, fx is hop | shake | in
       { you: true, t }     the player's line        { as: "Name", t }  someone with no sprite
       { t }                narration                { choice: [{ label, beats }] }  a choice, each with its outcome */
  const A = (name) => `assets/${name}.webp`;
  const SCENES = {
    hero: {
      cast: { aoi: { name: "Aoi", color: "#fff07a", pos: "c", spr: "rts-aoi-surprised" } },
      beats: [
        { who: "aoi", spr: "rts-aoi-surprised", fx: "hop", t: "Everyone! This boy has eaten toast for breakfast every day for a year!" },
        { you: true, t: "Aoi—" },
        { who: "aoi", spr: "rts-aoi-embarrassed", fx: "hop", t: "Look at him. He's the *colour* of toast!" },
        { t: "The stallholders laugh. She shoves the squid into your hand." },
        { t: "Then the woman at the dried-fish stall takes Aoi's chin in her hand." },
        { as: "Stallholder", t: "You're Kaori's girl! … We thought you'd all gone to Kobe for good. After that business." },
        { who: "aoi", spr: "rts-aoi-neutral", t: "She's well. Thank you. We're all well." },
        { t: "The smile's still there. It's a degree cooler." },
        { you: true, t: "Aoi, what did she mean?" },
        { who: "aoi", t: "You've got squid on your cardigan." },
        { choice: [
          { label: "Let it go and make her laugh instead", beats: [
            { t: "Aoi laughs so suddenly she has to stop walking." },
            { you: true, t: "You'd carry a chicken on a bicycle?" },
            { who: "aoi", spr: "rts-aoi-embarrassed", fx: "hop", t: "I'd carry *you* on a bicycle. A chicken's nothing!" },
            { t: "Whatever the woman at the dried-fish stall said is three stops behind you." },
          ] },
          { label: "Ask her what ‘that business’ was", beats: [
            { who: "aoi", spr: "rts-aoi-sad", t: "Not here. Not with squid on your cardigan and the tram in six minutes." },
            { you: true, t: "Then when?" },
            { who: "aoi", t: "I'll tell you. I promise! I just need to work out how." },
            { who: "aoi", t: "I've had eight years. I still haven't." },
          ] },
        ] },
      ],
      end: { t: "That was one choice. A story has dozens, and yours could start anywhere.", cta: { label: "Bring your story to life", href: "#idea" } },
    },
    thread: {
      cast: { mio: { name: "Mio", color: "#7cc7ff", pos: "c", spr: "rts-mio-surprised" } },
      beats: [
        { who: "mio", t: "It came with a train ticket. A real one! So it must be a serious scholarship." },
        { t: "A provisional place. Conditional on the Tokiwa Scholarship. Interview, end of May." },
        { t: "Venue: the Kōyūkai Boathouse, Hiiragi Bay. Time: ten at night." },
        { you: true, t: "...Ten at night?" },
        { who: "mio", fx: "hop", t: "It's strange, isn't it? Is it strange? My teacher said the city does things differently." },
        { you: true, t: "A boathouse." },
        { who: "mio", t: "Senpai. Do you know the boathouse? Is it far from the tram?" },
      ],
      end: { t: "The boathouse has been padlocked since 2012. There are lights in it on Saturdays." },
    },
    blood: {
      cast: {
        akari: { name: "Akari", color: "#ff9b85", pos: "l", spr: "nbb-akari-smug" },
        yoru: { name: "Yoru", color: "#c7a8ff", pos: "r", spr: "nbb-yoru" },
      },
      beats: [
        { who: "yoru", t: "She will not stop, Ren Asahina. She has named every dog on our street." },
        { who: "akari", spr: "nbb-akari-angry", fx: "shake", t: "Yoru!" },
        { who: "yoru", t: "I am Yoru. I am the other one. Good evening." },
        { who: "akari", spr: "nbb-akari-neutral", t: "What's that smell?" },
        { you: true, t: "Welcome dinner. Gyoza. Garlic and chive." },
        { who: "akari", fx: "hop", t: "Gar— hah— HAH—" },
        { t: "She sneezes four times. Her cap lands in the sink." },
        { who: "yoru", t: "My sister has an allergy." },
        { who: "akari", spr: "nbb-akari-angry", fx: "shake", t: "*We* have an allergy! You're just better at holding it!" },
        { who: "yoru", t: "You did not have to announce it." },
        { who: "akari", fx: "shake", t: "I sneezed! Sneezing isn't announcing!" },
        { who: "yoru", t: "Four times, Nee-san." },
      ],
      end: { t: "They are vampires. They are trying very hard to be normal." },
    },
  };

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");

  function playScene(fig, def) {
    const sprites = {};
    const files = new Set();
    const walk = (beats) => beats.forEach((b) => { if (b.spr) files.add(b.spr); if (b.choice) b.choice.forEach((c) => walk(c.beats)); });
    walk(def.beats);
    files.forEach((f) => { new Image().src = A(f); });

    fig.replaceChildren();
    fig.classList.add("live");
    for (const [key, c] of Object.entries(def.cast)) {
      const img = el("img", `spr spr-${c.pos}`); img.alt = ""; img.src = A(c.spr);
      img.addEventListener("animationend", () => img.classList.remove("fx-hop", "fx-shake", "fx-in"));
      sprites[key] = img; fig.append(img);
    }
    const box = el("figcaption", "box"); box.setAttribute("aria-live", "polite");
    const name = el("span", "name"), line = el("span", "line");
    box.append(name, line);
    const dots = el("div", "scene-dots");
    const mainLen = def.beats.filter((b) => !b.choice).length;
    for (let i = 0; i < mainLen; i++) dots.append(el("i"));
    const hint = el("span", "scene-hint pulse", "▶ Click to play");
    const next = el("button", "scene-next"); next.type = "button"; next.setAttribute("aria-label", "Play the next line of this scene");
    fig.append(box, dots, hint, next);

    let queue, i, inBranch, overlay;
    const many = Object.keys(def.cast).length > 1;

    function show(b) {
      const c = b.who ? def.cast[b.who] : null;
      if (c && b.spr) sprites[b.who].src = A(b.spr);
      if (c && b.fx) { const s = sprites[b.who]; s.classList.remove("fx-hop", "fx-shake", "fx-in"); void s.offsetWidth; s.classList.add(`fx-${b.fx}`); }
      if (many) for (const [k, s] of Object.entries(sprites)) s.classList.toggle("quiet", !!c && k !== b.who);
      name.textContent = c ? c.name : b.you ? "You" : b.as || "";
      name.style.setProperty("--c", c ? c.color : b.you ? "#ffffff" : "#d9dfee");
      const spoken = c || b.you || b.as;
      line.className = `line fx-line${spoken ? "" : " narr"}`;
      line.innerHTML = spoken ? `“${rich(b.t)}”` : rich(b.t);
      void line.offsetWidth;
      all("i", dots).forEach((d, n) => d.classList.toggle("on", inBranch || n <= i));
    }
    function clearOverlay() { if (overlay) { overlay.remove(); overlay = null; } next.hidden = false; fig.classList.remove("veiled"); }
    function start() {
      clearOverlay(); queue = def.beats; i = 0; inBranch = false;
      for (const [key, c] of Object.entries(def.cast)) { sprites[key].src = A(c.spr); sprites[key].classList.remove("quiet"); }
      hint.textContent = "▶ Click to play"; hint.classList.add("pulse"); hint.hidden = false;
      show(queue[0]);
    }
    function choose(options) {
      next.hidden = true; hint.hidden = true; fig.classList.add("veiled");
      overlay = el("div", "scene-choices");
      overlay.append(el("p", null, "What do you do?"));
      options.forEach((o) => {
        const b = el("button", null, o.label); b.type = "button";
        b.addEventListener("click", () => { clearOverlay(); hint.hidden = false; queue = o.beats; i = 0; inBranch = true; show(queue[0]); next.focus({ preventScroll: true }); });
        overlay.append(b);
      });
      fig.append(overlay);
      one("button", overlay).focus({ preventScroll: true });
    }
    function finish() {
      next.hidden = true; hint.hidden = true; fig.classList.add("veiled");
      overlay = el("div", "scene-end");
      overlay.append(el("p", null, def.end.t));
      const row = el("div", "row");
      if (def.end.cta) row.append(make(def.end.cta.label, def.end.cta.href, "btn-primary", false));
      const again = el("button", "btn btn-ghost", "Play again"); again.type = "button";
      again.addEventListener("click", () => { start(); next.focus({ preventScroll: true }); });
      row.append(again); overlay.append(row); fig.append(overlay);
      one("a, button", row).focus({ preventScroll: true });
    }
    next.addEventListener("click", () => {
      hint.textContent = "Next ▸"; hint.classList.remove("pulse");
      i += 1;
      const b = queue[i];
      if (!b) return finish();
      if (b.choice) return choose(b.choice);
      show(b);
    });
    start();
  }
  all("figure[data-scene]").forEach((fig) => { const def = SCENES[fig.dataset.scene]; if (def) playScene(fig, def); });

  // Thumbnails change the scene's background.
  all("[data-thumbs-for]").forEach((strip) => {
    const fig = one(`figure[data-scene="${strip.dataset.thumbsFor}"]`);
    const btns = all("button[data-bg]", strip);
    btns.forEach((b, n) => {
      b.setAttribute("aria-pressed", n === 0 ? "true" : "false");
      b.addEventListener("click", () => {
        if (fig) fig.style.setProperty("--bg", `url('${b.dataset.bg}')`);
        btns.forEach((o) => o.setAttribute("aria-pressed", o === b ? "true" : "false"));
      });
    });
  });

  // The phone-width "Start your story" bar steps aside once the form itself is on screen.
  const bar = one(".sticky-cta"), ideaSection = one("#idea");
  if (bar && ideaSection && "IntersectionObserver" in window) {
    new IntersectionObserver((entries) => { bar.classList.toggle("away", entries[0].isIntersecting); }, { threshold: 0.15 }).observe(ideaSection);
  }

  /* ---- Idea form ---- */
  const form = one("[data-idea-form]");
  if (form) {
    let mode = ["netlify", "email", "off"].includes(S.ideaForm) ? S.ideaForm : "netlify";
    if (mode === "email" && !email) mode = "off";
    const msg = one("[data-form-msg]", form), done = one("[data-idea-done]");
    const real = one("[data-real]", form), permBox = one("[data-permission]", form), perm = one("input", permBox);
    const idea = form.elements.idea;
    const say = (text, ok) => { msg.textContent = text; msg.classList.toggle("ok", !!ok); };

    if (mode === "off") {
      form.hidden = true;
      if (!etsy && !paypal) { done.hidden = false; one("h3", done).textContent = "Orders are opening soon."; one("p", done).textContent = "Come back in a little while."; }
    }
    real.addEventListener("change", () => { permBox.hidden = !real.checked; if (!real.checked) perm.checked = false; });
    all("[data-pick-plan]").forEach((a) => a.addEventListener("click", () => {
      const r = one(`input[name="plan"][value="${a.dataset.pickPlan}"]`, form); if (r) r.checked = true;
    }));
    all("[data-starter]", form).forEach((b) => b.addEventListener("click", () => { idea.value = b.dataset.starter; idea.focus(); }));

    const answers = () => {
      const fd = new FormData(form);
      return {
        name: (fd.get("name") || "").trim(), email: (fd.get("email") || "").trim(), for: fd.get("for") || "",
        genre: fd.getAll("genre").join(", "), idea: (fd.get("idea") || "").trim(), plan: fd.get("plan") || "",
        audio: fd.get("audio") ? "Yes" : "No",
        real_people: real.checked ? "Yes" : "No", permission: perm.checked ? "Confirmed" : "",
      };
    };
    const mailto = (a) => {
      const body = [`Name: ${a.name}`, `Reply to: ${a.email}`, `For: ${a.for}`, `Kind of story: ${a.genre || "not chosen"}`, `Size: ${a.plan}`, `Voice-over and music add-on: ${a.audio}`,
        `Includes real people: ${a.real_people}${a.permission ? " (permission confirmed)" : ""}`, "", a.idea].join("\n");
      return `mailto:${email}?subject=${encodeURIComponent("My story idea")}&body=${encodeURIComponent(body)}`;
    };
    const finished = () => { form.hidden = true; done.hidden = false; done.focus(); };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = answers();
      all(".bad", form).forEach((n) => n.classList.remove("bad"));
      const fail = (field, text) => { say(text); if (field) { field.classList.add("bad"); field.focus(); } };
      if (!a.name) return fail(form.elements.name, "Please enter your first name.");
      if (!safeEmail(a.email)) return fail(form.elements.email, "Please give an email address for the reply.");
      if (a.idea.length < 15) return fail(idea, "Say a little more about your idea: a sentence is enough.");
      if (real.checked && !perm.checked) return fail(perm, "Please confirm you have permission from the real people in your story.");
      if (form.elements["bot-field"].value) return finished();   // a bot filled the hidden field: accept and drop

      const local = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
      if (mode === "netlify" && !local) {
        say("Sending…", true);
        try {
          const body = new URLSearchParams({ "form-name": "idea", ...a }).toString();
          const res = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
          if (res.ok) return finished();
        } catch (_) { /* fall through to email */ }
      }
      if (email) {
        location.href = mailto(a);
        return say("Your email app has opened with your idea filled in. Press send there and it will be on its way.", true);
      }
      say(local ? "This form sends once the site is live on its host; it can't send from a local preview."
        : "Sorry, your idea couldn't be sent just now. Please try again in a little while.");
    });
  }
})();
