(() => {
  "use strict";

  const config = window.CLAIM_SPOT_CONFIG || {};
  const TOTAL = Number(config.totalSpots) || 16;
  const endpoint = String(config.endpoint || "").trim();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const demo = !endpoint && isLocal;
  const CLAIM_KEY = "couplesPadelClaim";
  const DEMO_KEY = "couplesPadelDemoClaims";
  const SEGMENT = 360 / TOTAL;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const list = document.querySelector("[data-couples-list]");
  const openButton = document.querySelector("[data-claim-open]");
  const spotsLeft = document.querySelector("[data-spots-left]");
  const dialog = document.querySelector("[data-claim-dialog]");
  if (!list || !openButton || !dialog) return;

  const form = dialog.querySelector("[data-claim-form]");
  const formError = dialog.querySelector("[data-claim-error]");
  const spinStep = dialog.querySelector("[data-claim-spin-step]");
  const spinNames = dialog.querySelector("[data-claim-spin-names]");
  const spinButton = dialog.querySelector("[data-claim-spin]");
  const backButton = dialog.querySelector("[data-claim-back]");
  const spinError = dialog.querySelector("[data-claim-spin-error]");
  const doneStep = dialog.querySelector("[data-claim-done-step]");
  const doneNumber = dialog.querySelector("[data-claim-number]");
  const doneTitle = dialog.querySelector("[data-claim-done-title]");
  const doneText = dialog.querySelector("[data-claim-done-text]");
  const rotor = dialog.querySelector("[data-wheel-rotor]");
  const indicators = [...dialog.querySelectorAll("[data-step-indicator]")];

  let claims = [];
  let rotation = 0;
  let spinning = false;
  let pendingDetails = null;

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } }
  };

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const cleanName = value => String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  const normaliseCell = value => {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("27")) digits = "0" + digits.slice(2);
    return digits;
  };
  const pairKey = (a, b) => [a, b].map(n => String(n).toLowerCase().replace(/\s+/g, " ").trim()).sort().join("|");

  // ---- Data ---------------------------------------------------------------

  async function fetchClaims() {
    if (demo) return (store.get(DEMO_KEY) || []).map(({ number, player1, player2 }) => ({ number, player1, player2 }));
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await fetch(`${endpoint}${separator}action=list&t=${Date.now()}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Could not load spots");
    return data.claims || [];
  }

  async function submitClaim(details) {
    if (!demo) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(details)
      });
      return response.json();
    }

    // Demo mode mirrors the Apps Script rules but only saves in this browser.
    await delay(900);
    const saved = store.get(DEMO_KEY) || [];
    const existing = saved.find(c => c.email === details.email || c.cell === details.cell || pairKey(c.player1, c.player2) === pairKey(details.player1, details.player2));
    if (existing) return { ok: false, code: "duplicate", number: existing.number, player1: existing.player1, player2: existing.player2, message: `This couple, email address or cell number has already claimed spot #${existing.number}.`, claims: saved };
    const taken = new Set(saved.map(c => c.number));
    const open = Array.from({ length: TOTAL }, (_, i) => i + 1).filter(n => !taken.has(n));
    if (!open.length) return { ok: false, code: "full", message: `All ${TOTAL} spots have been claimed.`, claims: saved };
    const number = open[Math.floor(Math.random() * open.length)];
    saved.push({ number, player1: details.player1, player2: details.player2, email: details.email, cell: details.cell });
    store.set(DEMO_KEY, saved);
    return { ok: true, number, player1: details.player1, player2: details.player2, emailSent: false, claims: saved };
  }

  function setClaims(next) {
    claims = (next || [])
      .map(c => ({ number: Number(c.number), player1: String(c.player1), player2: String(c.player2) }))
      .filter(c => c.number >= 1 && c.number <= TOTAL);
    renderList();
    renderWheel();
    window.dispatchEvent(new CustomEvent("couples:claims", { detail: claims }));
  }

  async function refreshClaims() {
    if (!endpoint && !demo) return;
    try { setClaims(await fetchClaims()); } catch { /* keep the last list we had */ }
  }

  // ---- Couples list ------------------------------------------------------

  function renderList(highlight) {
    const byNumber = new Map(claims.map(c => [c.number, c]));
    const items = Array.from({ length: TOTAL }, (_, i) => {
      const number = i + 1;
      const claim = byNumber.get(number);
      const item = document.createElement("li");
      item.className = claim ? "is-claimed" : "is-open";
      if (highlight === number) item.classList.add("is-new");
      const badge = document.createElement("span");
      badge.textContent = String(number).padStart(2, "0");
      const label = document.createElement("b");
      if (claim) {
        const amp = document.createElement("em");
        amp.textContent = "&";
        label.append(claim.player1, " ", amp, " ", claim.player2);
      } else {
        label.textContent = "Spot available";
      }
      item.append(badge, label);
      return item;
    });
    list.replaceChildren(...items);

    const open = TOTAL - byNumber.size;
    if (spotsLeft) spotsLeft.textContent = open === 0 ? "All spots have been claimed." : `${open} of ${TOTAL} spots still open.`;
    if (!endpoint && !demo) {
      openButton.disabled = true;
      openButton.textContent = "Registration opening soon";
    } else if (open === 0 && !store.get(CLAIM_KEY)) {
      openButton.disabled = true;
      openButton.textContent = "All spots claimed";
    } else {
      openButton.disabled = false;
      openButton.textContent = "Claim your spot";
    }
  }

  // ---- Wheel --------------------------------------------------------------

  const SVG_NS = "http://www.w3.org/2000/svg";
  const COLOURS = ["#13301f", "#9a8434", "#1f9d55", "#2c4a33"];

  function point(angle, radius) {
    const rad = (angle - 90) * Math.PI / 180;
    return [Math.cos(rad) * radius, Math.sin(rad) * radius];
  }

  function renderWheel() {
    if (!rotor) return;
    const taken = new Set(claims.map(c => c.number));
    const parts = [];
    for (let i = 0; i < TOTAL; i++) {
      const number = i + 1;
      const start = i * SEGMENT;
      const [x0, y0] = point(start, 100);
      const [x1, y1] = point(start + SEGMENT, 100);
      const slice = document.createElementNS(SVG_NS, "path");
      slice.setAttribute("d", `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A100 100 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`);
      slice.setAttribute("fill", taken.has(number) ? "#d6cdb3" : COLOURS[i % COLOURS.length]);
      slice.setAttribute("stroke", "#fbf8f0");
      slice.setAttribute("stroke-width", "1.2");
      const mid = start + SEGMENT / 2;
      const [tx, ty] = point(mid, 74);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", tx.toFixed(2));
      label.setAttribute("y", ty.toFixed(2));
      label.setAttribute("transform", `rotate(${mid} ${tx.toFixed(2)} ${ty.toFixed(2)})`);
      label.setAttribute("class", ["wheel__label", taken.has(number) ? "is-taken" : "", number === 6 || number === 9 ? "is-marked" : ""].filter(Boolean).join(" "));
      label.textContent = number;
      parts.push(slice, label);
    }
    rotor.replaceChildren(...parts);
    setRotation(rotation);
  }

  function setRotation(value) {
    rotation = value;
    if (rotor) rotor.setAttribute("transform", `rotate(${(value % 360).toFixed(3)})`);
  }

  // Spins at a steady speed until the server answers, then eases out onto the result.
  async function spinUntil(request) {
    let result;
    let failure;
    request.then(r => { result = r; }, e => { failure = e; });

    if (reducedMotion) {
      await request.catch(() => {});
    } else {
      const started = performance.now();
      let last = started;
      await new Promise(resolve => {
        const frame = now => {
          setRotation(rotation + 0.75 * (now - last));
          last = now;
          if ((result || failure) && now - started > 1500) return resolve();
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }

    const number = result && result.number;
    if (!number) {
      await easeTo(rotation + 120, 900);
      if (failure) throw failure;
      return result;
    }
    const centre = (number - 1) * SEGMENT + SEGMENT / 2;
    const target = ((-centre % 360) + 360) % 360;
    const current = ((rotation % 360) + 360) % 360;
    let delta = target - current;
    if (delta < 0) delta += 360;
    await easeTo(rotation + delta + (reducedMotion ? 0 : 360 * 3), reducedMotion ? 0 : 4200);
    return result;
  }

  function easeTo(to, duration) {
    const from = rotation;
    if (!duration) { setRotation(to); return Promise.resolve(); }
    return new Promise(resolve => {
      const started = performance.now();
      const frame = now => {
        const t = Math.min(1, (now - started) / duration);
        setRotation(from + (to - from) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  // ---- Dialog steps -------------------------------------------------------

  function showStep(step) {
    form.hidden = step !== "details";
    spinStep.hidden = step !== "spin";
    doneStep.hidden = step !== "done";
    indicators.forEach(item => {
      const order = ["details", "spin", "done"];
      const state = order.indexOf(item.dataset.stepIndicator) - order.indexOf(step);
      item.classList.toggle("is-current", state === 0);
      item.classList.toggle("is-complete", state < 0);
    });
  }

  function showError(target, message) {
    target.textContent = message;
    target.hidden = !message;
  }

  function showDone(claim, already) {
    doneNumber.textContent = `#${claim.number}`;
    if (already) {
      doneTitle.textContent = "You’ve already claimed a spot";
      doneText.textContent = `${claim.player1} & ${claim.player2} are Team #${claim.number}. Each couple can only claim one spot.`;
    } else {
      doneTitle.textContent = `You’re in, ${claim.player1} & ${claim.player2}!`;
      doneText.textContent = demo
        ? "Demo mode: this spot is only saved in this browser and no emails were sent."
        : claim.emailSent === false
          ? "Your spot is saved. We couldn’t send the confirmation email, but the organiser has your details."
          : `A confirmation email is on its way to ${claim.email}.`;
    }
    showStep("done");
  }

  function savedClaim() {
    const saved = store.get(CLAIM_KEY);
    if (!saved || !saved.number) return null;
    const match = claims.find(c => c.number === saved.number && pairKey(c.player1, c.player2) === pairKey(saved.player1, saved.player2));
    // The organiser may have removed the claim from the sheet; let them claim again.
    if (!match && claims.length) { store.remove(CLAIM_KEY); return null; }
    return saved;
  }

  function openDialog() {
    showError(formError, "");
    showError(spinError, "");
    const saved = savedClaim();
    if (saved) showDone(saved, true); else showStep(pendingDetails ? "spin" : "details");
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    if (!saved && !pendingDetails) form.querySelector("input").focus();
    refreshClaims().then(() => {
      if (!savedClaim() && claims.length >= TOTAL) {
        showError(formError, `Sorry, all ${TOTAL} spots have been claimed.`);
      }
    });
  }

  function closeDialog() {
    if (spinning) return;
    if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
  }

  function readForm() {
    const fields = form.elements;
    const details = {
      player1: cleanName(fields.player1.value),
      player2: cleanName(fields.player2.value),
      email: String(fields.email.value || "").trim().toLowerCase(),
      cell: normaliseCell(fields.cell.value),
      website: fields.website.value
    };
    const checks = [
      [details.player1.length >= 2, fields.player1, "Please enter the first player’s name."],
      [details.player2.length >= 2, fields.player2, "Please enter the second player’s name."],
      [details.player1.toLowerCase() !== details.player2.toLowerCase(), fields.player2, "Please enter two different names."],
      [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(details.email), fields.email, "Please enter a valid email address."],
      [/^\d{9,15}$/.test(details.cell), fields.cell, "Please enter a valid cell number, e.g. 082 123 4567."]
    ];
    [...form.querySelectorAll("input")].forEach(input => input.removeAttribute("aria-invalid"));
    const failed = checks.find(([ok]) => !ok);
    if (failed) {
      failed[1].setAttribute("aria-invalid", "true");
      failed[1].focus();
      showError(formError, failed[2]);
      return null;
    }
    const key = pairKey(details.player1, details.player2);
    const clash = claims.find(c => pairKey(c.player1, c.player2) === key);
    if (clash) {
      showError(formError, `${clash.player1} & ${clash.player2} have already claimed spot #${clash.number}.`);
      return null;
    }
    return details;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    showError(formError, "");
    if (claims.length >= TOTAL) {
      showError(formError, `Sorry, all ${TOTAL} spots have been claimed.`);
      return;
    }
    const details = readForm();
    if (!details) return;
    pendingDetails = details;
    spinNames.textContent = `${details.player1} & ${details.player2}`;
    showError(spinError, "");
    showStep("spin");
    spinButton.focus();
  });

  backButton.addEventListener("click", () => {
    if (spinning) return;
    showStep("details");
  });

  spinButton.addEventListener("click", async () => {
    if (spinning || !pendingDetails) return;
    spinning = true;
    spinButton.disabled = true;
    backButton.disabled = true;
    dialog.classList.add("is-spinning");
    showError(spinError, "");
    spinButton.textContent = "Spinning…";

    try {
      const result = await spinUntil(submitClaim(pendingDetails));
      if (result.claims) setClaims(result.claims);

      if (result.ok || result.code === "duplicate") {
        const claim = {
          number: result.number,
          player1: result.player1 || pendingDetails.player1,
          player2: result.player2 || pendingDetails.player2,
          email: pendingDetails.email,
          emailSent: result.emailSent
        };
        store.set(CLAIM_KEY, claim);
        renderList(claim.number);
        pendingDetails = null;
        form.reset();
        showDone(claim, !result.ok);
      } else if (result.code === "invalid") {
        showStep("details");
        showError(formError, result.message);
      } else {
        showError(spinError, result.message || "Something went wrong. Please spin again.");
      }
    } catch {
      showError(spinError, "We couldn’t reach the registration server. Check your connection and spin again. You won’t be registered twice.");
    } finally {
      spinning = false;
      spinButton.disabled = false;
      backButton.disabled = false;
      dialog.classList.remove("is-spinning");
      spinButton.textContent = "Spin the wheel";
    }
  });

  openButton.addEventListener("click", openDialog);
  dialog.querySelectorAll("[data-claim-close]").forEach(button => button.addEventListener("click", closeDialog));
  dialog.addEventListener("cancel", event => { if (spinning) event.preventDefault(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshClaims(); });

  const demoNote = dialog.querySelector("[data-claim-demo]");
  if (demoNote) demoNote.hidden = !demo;

  renderList();
  renderWheel();
  refreshClaims();
  setInterval(() => { if (!document.hidden && !spinning) refreshClaims(); }, 60000);
})();
