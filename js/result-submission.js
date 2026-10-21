(() => {
  "use strict";

  const dialog = document.querySelector("[data-result-modal]");
  const form = document.querySelector("[data-result-form]");
  const responseFrame = document.querySelector('iframe[name="result-submission-target"]');
  if (!dialog || !form || !responseFrame) return;

  const challengingTeam = form.querySelector("[data-challenging-team]");
  const challengedTeam = form.querySelector("[data-challenged-team]");
  const winner = form.querySelector("[data-winner]");
  const datePlayed = form.querySelector("[data-date-played]");
  const dateYear = form.querySelector("[data-date-year]");
  const dateMonth = form.querySelector("[data-date-month]");
  const dateDay = form.querySelector("[data-date-day]");
  const submitButton = form.querySelector("[data-result-submit]");
  const success = dialog.querySelector("[data-result-success]");
  let pendingSubmission = false;
  let openingTrigger = null;

  function normaliseTeam(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function updateWinnerOptions() {
    const current = winner.value;
    const teams = [normaliseTeam(challengingTeam.value), normaliseTeam(challengedTeam.value)].filter(Boolean);
    const uniqueTeams = [...new Set(teams)];
    winner.replaceChildren();

    const prompt = document.createElement("option");
    prompt.value = "";
    prompt.textContent = uniqueTeams.length === 2 ? "Select the winning team" : "Select both teams first";
    prompt.selected = true;
    winner.append(prompt);

    uniqueTeams.forEach(team => {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      winner.append(option);
    });

    winner.disabled = uniqueTeams.length !== 2;
    if (uniqueTeams.includes(current)) winner.value = current;
  }

  function openModal(event) {
    openingTrigger = event.currentTarget;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.documentElement.classList.add("has-result-modal");
  }

  function closeModal() {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function resetSubmission() {
    pendingSubmission = false;
    form.reset();
    form.hidden = false;
    success.hidden = true;
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit Result <span aria-hidden="true">→</span>';
    challengedTeam.setCustomValidity("");
    updateWinnerOptions();
    form.querySelector('input[name="entry.1407799559"]')?.focus();
  }

  document.querySelectorAll("[data-result-modal-open]").forEach(button => {
    button.addEventListener("click", openModal);
  });
  dialog.querySelectorAll("[data-result-modal-close]").forEach(button => {
    button.addEventListener("click", closeModal);
  });
  dialog.querySelector("[data-result-another]")?.addEventListener("click", resetSubmission);

  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeModal();
  });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("has-result-modal");
    openingTrigger?.focus();
  });

  [challengingTeam, challengedTeam].forEach(input => {
    input.addEventListener("input", () => {
      challengedTeam.setCustomValidity("");
      updateWinnerOptions();
    });
  });

  form.addEventListener("submit", event => {
    const challenger = normaliseTeam(challengingTeam.value);
    const challenged = normaliseTeam(challengedTeam.value);
    challengingTeam.value = challenger;
    challengedTeam.value = challenged;

    if (challenger && challenged && challenger.toLowerCase() === challenged.toLowerCase()) {
      event.preventDefault();
      challengedTeam.setCustomValidity("The challenged team must be different from the challenging team.");
      challengedTeam.reportValidity();
      return;
    }
    challengedTeam.setCustomValidity("");

    const [year, month, day] = datePlayed.value.split("-");
    dateYear.value = year || "";
    dateMonth.value = month ? String(Number(month)) : "";
    dateDay.value = day ? String(Number(day)) : "";

    pendingSubmission = true;
    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";
  });

  responseFrame.addEventListener("load", () => {
    if (!pendingSubmission) return;
    pendingSubmission = false;
    form.hidden = true;
    success.hidden = false;
    success.querySelector("h3")?.focus?.();
  });

  updateWinnerOptions();
})();
