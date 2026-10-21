(function initialiseFeedSettingsPage() {
  "use strict";

  const configApi = window.PadeuceFeedConfig;
  const form = document.querySelector("[data-feed-settings-form]");
  const resetButton = document.querySelector("[data-reset-feed-settings]");
  const status = document.querySelector("[data-settings-status]");
  const keys = ["court1Url", "court2Url", "court3Url", "court4Url", "scheduleUrl", "standingsUrl"];

  function valuesFromForm() {
    return Object.fromEntries(keys.map(key => [key, form.elements[key].value.trim()]));
  }

  function populate(values) {
    keys.forEach(key => { form.elements[key].value = values[key] || ""; });
  }

  function clearErrors() {
    keys.forEach(key => {
      const field = form.elements[key];
      const message = document.querySelector(`[data-error-for="${key}"]`);
      field.removeAttribute("aria-invalid");
      if (message) message.textContent = "";
    });
  }

  function showErrors(errors = {}) {
    clearErrors();
    Object.entries(errors).forEach(([key, message]) => {
      const field = form.elements[key];
      const target = document.querySelector(`[data-error-for="${key}"]`);
      if (field) field.setAttribute("aria-invalid", "true");
      if (target) target.textContent = message;
    });
    const firstInvalid = keys.map(key => form.elements[key]).find(field => field.getAttribute("aria-invalid") === "true");
    firstInvalid?.focus();
  }

  function connectionLabel(key, value) {
    if (/^court[1-4]Url$/.test(key)) {
      const court = configApi.parseCourtUrl(value);
      return court ? `Club ${court.clubId} · Court ${court.court}` : "Invalid court URL";
    }
    const tournament = configApi.parseTournamentUrl(value);
    return tournament ? `Club ${tournament.clubId} · Tournament ${tournament.tournamentId}` : "Invalid tournament URL";
  }

  function updateConnections(values) {
    keys.forEach(key => {
      const detail = document.querySelector(`[data-connection-detail="${key}"]`);
      const link = document.querySelector(`[data-connection="${key}"]`);
      if (detail) detail.textContent = connectionLabel(key, values[key]);
      if (link) link.href = values[key];
    });
  }

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    clearErrors();
    try {
      const saved = configApi.save(valuesFromForm());
      populate(saved);
      updateConnections(saved);
      setStatus("Feed settings saved. All site pages in this browser will now use these URLs.", "success");
    } catch (error) {
      showErrors(error.errors);
      setStatus(error.message || "Feed settings could not be saved.", "error");
    }
  });

  resetButton.addEventListener("click", () => {
    clearErrors();
    const defaults = configApi.reset();
    populate(defaults);
    updateConnections(defaults);
    setStatus("Placeholder PlayPadel Challenger Series feed URLs restored.", "success");
  });

  keys.forEach(key => {
    form.elements[key].addEventListener("input", () => {
      form.elements[key].removeAttribute("aria-invalid");
      const message = document.querySelector(`[data-error-for="${key}"]`);
      if (message) message.textContent = "";
      setStatus("Unsaved changes", "");
    });
  });

  const current = configApi.get();
  populate(current);
  updateConnections(current);
})();
