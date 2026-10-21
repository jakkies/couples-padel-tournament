export function initialiseNavigation() {
  const header = document.querySelector("[data-header]");
  window.addEventListener("scroll", () => header?.classList.toggle("is-scrolled", window.scrollY > 30), { passive: true });

  const sections = [...document.querySelectorAll("main section[id]")];
  const pageLinks = [...document.querySelectorAll(".quick-nav a[href^='#']")];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) pageLinks.forEach(link => link.classList.toggle("is-active", link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: "-35% 0px -60%" });
  sections.forEach(section => observer.observe(section));
}

export function initialiseTabs() {
  document.querySelectorAll("[data-tabs]").forEach(widget => {
    const tabs = [...widget.querySelectorAll('[role="tab"]')];
    const activate = tab => {
      tabs.forEach(item => {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
      });
      tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", event => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault(); activate(tabs[next]);
      });
    });
  });
}
