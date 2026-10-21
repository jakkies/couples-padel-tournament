export function initialiseFixtureFilters(initialFixtures, render) {
  let fixtures = initialFixtures;
  const state = { court: "all", division: "all", phase: "round-robin" };
  const applyFilters = () => {
    render(fixtures.filter(item =>
      (state.court === "all" || item.court === state.court) &&
      (state.division === "all" || item.division === state.division) &&
      (state.phase === "all" || item.phase === state.phase)
    ));
  };

  document.querySelectorAll("[data-filter-group]").forEach(group => {
    group.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button) return;
      group.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
      state[group.dataset.filterGroup] = button.dataset.value;
      applyFilters();
    });
  });

  applyFilters();

  return {
    update(nextFixtures) {
      fixtures = nextFixtures;
      applyFilters();
    }
  };
}
