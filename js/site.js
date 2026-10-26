(() => {
  "use strict";

  function bindMobileMenu() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const nav = document.querySelector("[data-mobile-nav]");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.hidden = open;
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      toggle.setAttribute("aria-expanded", "false");
      nav.hidden = true;
    }));
  }

  function updateTime() {
    const target = document.querySelector("[data-local-time]");
    if (!target) return;
    const time = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    target.textContent = `${time} SAST`;
  }

  function bindNavigationActiveState() {
    const links = [...document.querySelectorAll('.site-nav a[href^="#"]:not([hidden]),.mobile-nav a[href^="#"]:not([hidden])')];
    const sections = [...new Set(links.map(link => link.getAttribute("href").slice(1)))].map(id => document.getElementById(id)).filter(Boolean);
    if (!links.length || !sections.length) return;
    let queued = false;
    const activate = id => links.forEach(link => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
    });
    const update = () => {
      queued = false;
      const header = document.querySelector("[data-header]");
      const marker = (header?.offsetHeight || 0) + Math.min(180, window.innerHeight * .24);
      let active = "";
      sections.forEach(section => { if (section.getBoundingClientRect().top <= marker) active = section.id; });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) active = sections.at(-1)?.id || active;
      activate(active);
    };
    const requestUpdate = () => { if (queued) return; queued = true; requestAnimationFrame(update); };
    links.forEach(link => link.addEventListener("click", () => activate(link.getAttribute("href").slice(1))));
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    window.addEventListener("hashchange", requestUpdate);
  }

  function initialiseHeroParallax() {
    const hero = document.querySelector(".hero");
    const image = document.querySelector(".hero__media");
    if (!hero || !image || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let queued = false;
    const update = () => {
      queued = false;
      const rect = hero.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      const offset = Math.min(rect.height * .12, Math.max(0, -rect.top) * .22);
      image.style.setProperty("--hero-parallax", `${offset.toFixed(1)}px`);
    };
    const requestUpdate = () => { if (queued) return; queued = true; requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
  }

  bindMobileMenu();
  bindNavigationActiveState();
  initialiseHeroParallax();
  updateTime();
  window.setInterval(updateTime, 30000);
})();
