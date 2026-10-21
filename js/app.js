import { eventData, fixtures, standings, competingTeams } from "./data.js?v=3";
import { initialiseNavigation } from "./navigation.js";
import { initialiseFixtureFilters } from "./filters.js?v=2";
import { initialiseSharing } from "./share.js";
import { loadOfficialResults } from "./official-results.js?v=2";

const OFFICIAL_RESULTS_REFRESH_INTERVAL = 60 * 1000;
let officialResultsRefreshActive = false;
let publicStandingsPhase = "round-robin";

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));
const countryNames = {
  ARG: "Argentina",
  BRA: "Brazil",
  ESP: "Spain",
  ITA: "Italy",
  POR: "Portugal",
  UAE: "United Arab Emirates"
};
const flagUrl = country => `https://cdn.premierpadel.com/fleg/${String(country).toLowerCase()}.png`;

function renderFixturePlayers(players, fallbackName) {
  if (!Array.isArray(players) || !players.length) {
    return `<span class="fixture-card__players">${escapeHTML(fallbackName)}</span>`;
  }
  return `<span class="fixture-card__players">
    ${players.map(player => {
      const country = String(player.country || "").toUpperCase();
      const flag = /^[A-Z]{2,3}$/.test(country)
        ? `<img src="${flagUrl(country)}" width="20" height="14" loading="lazy" alt="${escapeHTML(countryNames[country] || country)} flag">`
        : "";
      return `<span class="fixture-card__player">${flag}<span>${escapeHTML(player.name)}</span></span>`;
    }).join("")}
  </span>`;
}

function statusClass(status) {
  if (status === "Live") return "status-pill--live";
  if (status === "Completed") return "status-pill--completed";
  if (status === "Starting Soon") return "status-pill--soon";
  if (["Cancelled", "Postponed"].includes(status)) return "status-pill--cancelled";
  return "";
}

function renderFixtures(items) {
  const grid = document.querySelector("#fixture-grid");
  const empty = document.querySelector("#fixture-empty");
  if (!grid || !empty) return;
  grid.replaceChildren();
  empty.hidden = items.length > 0;
  items.forEach(fixture => {
    const article = document.createElement("article");
    article.className = "fixture-card";
    const fixtureUrl = fixture.url || globalThis.PadeuceFeedConfig?.get?.().scheduleUrl || eventData.officialUrl;
    const fixtureLinkLabel = fixture.status === "Completed"
      ? "View result"
      : fixture.status === "Live" ? "Open live match" : "Tournament schedule";
    const team = (side, name, score) => `
      <span class="fixture-card__team${fixture.winner === side ? " is-winner" : ""}">
        <span>
          ${renderFixturePlayers(fixture[`${side}Players`], name)}
          ${fixture.winner === side ? '<span class="winner">Winner</span>' : ""}
        </span>
        ${score ? `<strong class="fixture-card__score">${escapeHTML(score)}</strong>` : ""}
      </span>`;
    article.innerHTML = `
      <div class="fixture-card__top">
        <div>${escapeHTML(fixture.court)}</div>
        <span class="status-pill ${statusClass(fixture.status)}">${escapeHTML(fixture.status)}</span>
      </div>
      <p class="eyebrow">${escapeHTML(fixture.group || fixture.division)} · ${escapeHTML(fixture.round)}</p>
      <h3 class="fixture-card__match">
        ${team("a", fixture.a, fixture.scoreA)}
        <small class="versus">${fixture.status === "Completed" ? "Final" : "versus"}</small>
        ${team("b", fixture.b, fixture.scoreB)}
      </h3>
      <div class="card-actions">
        ${fixture.duration ? `<span class="result-card__duration">${escapeHTML(fixture.duration)}</span>` : `<a class="text-link external-link" href="${escapeHTML(fixtureUrl)}" target="_blank" rel="noopener noreferrer">${fixtureLinkLabel} ↗<span class="sr-only">(opens in a new tab)</span></a>`}
        <button class="button button--ghost button--small" type="button" data-share data-share-title="${escapeHTML(fixture.a)} vs ${escapeHTML(fixture.b)}">Share</button>
      </div>`;
    grid.append(article);
  });
}

const publicStageMatches = stage => Array.isArray(stage.fixtures)
  ? stage.fixtures
  : (stage.rounds || []).flatMap(round => round.matches || []);
const publicTeamLines = name => String(name || "Team to be confirmed")
  .split(" / ")
  .map(player => `<span>${escapeHTML(player)}</span>`)
  .join("");

function renderPublicKnockoutMatch(match) {
  const team = (side, name, score) => `
    <span class="public-knockout-match__team${match.winner === side ? " is-winner" : ""}">
      <span class="public-knockout-match__players">${publicTeamLines(name)}</span>
      ${score ? `<strong>${escapeHTML(score)}</strong>` : ""}
    </span>`;
  const url = match.url || globalThis.PadeuceFeedConfig?.get?.().standingsUrl || eventData.officialUrl;
  return `
    <a class="public-knockout-match" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(match.a)} versus ${escapeHTML(match.b)} result">
      <span class="public-knockout-match__meta"><b>${escapeHTML(match.court)}</b><span>${escapeHTML(match.status)}</span></span>
      ${team("a", match.a, match.scoreA)}
      <small>${match.status === "Completed" ? "Final" : "versus"}</small>
      ${team("b", match.b, match.scoreB)}
    </a>`;
}

function renderStandings(groups, stages = []) {
  const grid = document.querySelector("#standings-grid");
  if (!grid) return;
  if (!groups.length && !stages.some(stage => stage.phase === "knockout")) {
    grid.innerHTML = '<p class="empty-state">Standings will appear once the tournament restarts.</p>';
    return;
  }
  const roundRobinCards = groups.map(group => {
    const rows = group.rows.map(entry => `
      <tr>
        <td class="standings-table__rank"><span>${escapeHTML(entry.position)}</span></td>
        <td><span class="standings-table__team">${entry.players.map(player => `<strong>${escapeHTML(player)}</strong>`).join("")}</span></td>
        <td class="standings-table__number">${escapeHTML(entry.wins)}</td>
        <td class="standings-table__number">${escapeHTML(entry.losses)}</td>
        <td class="standings-table__sets">${escapeHTML(entry.setsFor)}–${escapeHTML(entry.setsAgainst)}</td>
      </tr>`).join("");
    return `<article class="standings-card">
      <div class="standings-card__heading">
        <p class="eyebrow">Round-robin table</p>
        <h4>${escapeHTML(group.name)}</h4>
      </div>
      <div class="table-scroll">
        <table class="standings-table">
          <caption class="sr-only">${escapeHTML(group.name)} standings</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">W</th><th scope="col">L</th><th scope="col">Sets</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  }).join("");
  const knockout = stages.filter(stage => stage.phase === "knockout");
  const knockoutDraws = [
    { key: "championship", label: "Championship Draw" },
    { key: "back-draw", label: "Back Draw" }
  ].map(draw => {
    const drawStages = knockout.filter(stage => stage.draw === draw.key);
    if (!drawStages.length) return "";
    return `<article class="public-knockout-draw"><header class="public-knockout-draw__heading"><p class="eyebrow">Knock-out</p><h4>${draw.label}</h4></header><div class="public-knockout-stage-grid">${drawStages.map(stage => `<section class="public-knockout-stage"><div class="public-knockout-stage__heading"><h5>${escapeHTML(stage.name)}</h5><span>${escapeHTML(stage.status || "Scheduled")}</span></div>${publicStageMatches(stage).map(renderPublicKnockoutMatch).join("")}</section>`).join("")}</div></article>`;
  }).join("");

  grid.innerHTML = `
    <section class="public-standings-phase" data-public-standings-phase="round-robin" aria-labelledby="public-round-robin-title">
      <header class="public-standings-phase__heading"><div><p class="eyebrow">Phase 1</p><h3 id="public-round-robin-title">Round Robin</h3></div><span>${groups.length} groups</span></header>
      <div class="public-standings-phase__grid">${roundRobinCards}</div>
    </section>
    ${knockout.length ? `<section class="public-standings-phase" data-public-standings-phase="knockout" aria-labelledby="public-knockout-title"><header class="public-standings-phase__heading"><div><p class="eyebrow">Phase 2</p><h3 id="public-knockout-title">Knock-out Results</h3></div><span>${knockout.reduce((total, stage) => total + publicStageMatches(stage).length, 0)} matches</span></header><div class="public-knockout-draw-grid">${knockoutDraws}</div></section>` : ""}`;
  applyPublicStandingsPhase();
}

function applyPublicStandingsPhase() {
  document.querySelectorAll("[data-public-standings-phase]").forEach(section => {
    section.hidden = section.dataset.publicStandingsPhase !== publicStandingsPhase;
  });
}

function initialisePublicStandingsFilter() {
  const switcher = document.querySelector("[data-public-standings-filter]");
  if (!switcher) return;
  switcher.addEventListener("click", event => {
    const button = event.target.closest("button[data-phase]");
    if (!button) return;
    publicStandingsPhase = button.dataset.phase;
    switcher.querySelectorAll("button[data-phase]").forEach(item => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    applyPublicStandingsPhase();
  });
}

function fixtureDateLabel(date, stage) {
  const [year, month, dateOfMonth] = date.split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Johannesburg"
  }).format(new Date(Date.UTC(year, month - 1, dateOfMonth, 12)));
  return `${label}${stage ? ` · ${stage}` : ""}`;
}

async function refreshOfficialResults(filters) {
  if (officialResultsRefreshActive) return;
  officialResultsRefreshActive = true;
  const status = document.querySelector("#fixture-sync-status");
  const date = document.querySelector("#fixture-date");
  try {
    const snapshot = await loadOfficialResults();
    filters.update(snapshot.fixtures);
    renderStandings(snapshot.standings || [], snapshot.standingsStages || snapshot.stages || []);
    if (date) date.textContent = fixtureDateLabel(snapshot.date, snapshot.stage);
    if (status) {
      const syncedAt = new Intl.DateTimeFormat("en-ZA", {
        timeZone: "Africa/Johannesburg",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(snapshot.generatedAt));
      status.textContent = snapshot.isTournamentEmpty
        ? "Waiting for confirmed Challenger Series fixtures"
        : snapshot.isBundledSnapshot
          ? `Saved tournament data from ${syncedAt} SAST`
          : `Tournament results synced ${syncedAt} SAST`;
      status.dataset.state = snapshot.isTournamentEmpty ? "waiting" : snapshot.isBundledSnapshot ? "fallback" : "success";
    }
  } catch (error) {
    console.warn("Could not refresh official results:", error);
    if (status) {
      status.textContent = "Tournament data is temporarily unavailable";
      status.dataset.state = "fallback";
    }
  } finally {
    officialResultsRefreshActive = false;
  }
}

function initialiseOfficialResults(filters) {
  refreshOfficialResults(filters);
  window.setInterval(() => {
    if (!document.hidden) refreshOfficialResults(filters);
  }, OFFICIAL_RESULTS_REFRESH_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshOfficialResults(filters);
  });
  window.addEventListener(globalThis.PadeuceFeedConfig?.CHANGE_EVENT || "padeuce:feed-config-change", () => {
    refreshOfficialResults(filters);
  });
}

function renderCompetingTeams() {
  const grid = document.querySelector("#seed-lists");
  if (!grid) return;
  grid.replaceChildren();
  [competingTeams.slice(0, 4), competingTeams.slice(4)].forEach(group => {
    const article = document.createElement("article");
    article.className = "seed-list team-list";
    const rows = group.map(team => `
      <li class="team-list__item">
        <span class="team-list__logo team-list__logo--${escapeHTML(team.logo)}" role="img" aria-label="${escapeHTML(team.business)} logo"></span>
        <span class="team-list__players">
          ${team.players.map(player => `<strong>${escapeHTML(player)}</strong>`).join("")}
        </span>
      </li>`).join("");
    article.innerHTML = `<ol>${rows}</ol>`;
    grid.append(article);
  });
}

function initialiseEnvironment() {
  const time = document.querySelector("[data-local-time]");
  const updateTime = () => {
    if (time) time.textContent = `${new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())} SAST`;
  };
  updateTime(); window.setInterval(updateTime, 30000);
  const banner = document.querySelector(".offline-banner");
  const sync = () => { if (banner) banner.hidden = navigator.onLine; };
  window.addEventListener("online", sync); window.addEventListener("offline", sync); sync();
}

function initialiseDivisionSwitchers() {
  document.querySelectorAll("[data-division-switcher]").forEach(switcher => {
    const group = switcher.dataset.divisionSwitcher;
    const buttons = [...switcher.querySelectorAll("button[data-division]")];
    const select = button => {
      const division = button.dataset.division;
      buttons.forEach(item => {
        const active = item === button;
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll(`[data-division-panel^="${group}:"]`).forEach(panel => {
        panel.hidden = panel.dataset.divisionPanel !== `${group}:${division}`;
      });
    };
    switcher.addEventListener("click", event => {
      const button = event.target.closest("button[data-division]");
      if (button) select(button);
    });
    switcher.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = buttons.findIndex(button => button.getAttribute("aria-selected") === "true");
      const next = event.key === "Home" ? 0
        : event.key === "End" ? buttons.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      select(buttons[next]);
      buttons[next].focus();
    });
    select(buttons.find(button => button.getAttribute("aria-selected") === "true") || buttons[0]);
  });
}

function initialise() {
  renderCompetingTeams();
  initialiseDivisionSwitchers();
  initialiseNavigation();
  initialiseSharing();
  initialiseEnvironment();
}

initialise();
