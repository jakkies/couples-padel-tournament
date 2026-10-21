import { loadOfficialResults } from "../js/official-results.js?v=2";

const DEFAULT_RESULTS_URL = "https://padeuce.com/club/playpadel-challenger/tournament/challenger-series/results";
const REFRESH_INTERVAL = 60 * 1000;
let refreshTimer;
let adminTournamentPhase = "round-robin";

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

function courtNumber(court) {
  return Number(String(court).match(/\d+/)?.[0] || 99);
}

function scheduleStatus(status) {
  const label = String(status || "").trim();
  return label && !/^starting soon$/i.test(label) ? `<span>${escapeHTML(label)}</span>` : "";
}

function formatMatchScore(scoreA, scoreB) {
  const teamA = String(scoreA || "").trim().split(/\s+/).filter(Boolean);
  const teamB = String(scoreB || "").trim().split(/\s+/).filter(Boolean);
  return Array.from({ length: Math.max(teamA.length, teamB.length) }, (_, index) =>
    `${escapeHTML(teamA[index] || "–")}–${escapeHTML(teamB[index] || "–")}`
  ).join("  ");
}

const stageMatches = stage => Array.isArray(stage.fixtures)
  ? stage.fixtures
  : (stage.rounds || []).flatMap(round => round.matches || []);
const isCompletedMatch = match => /^completed$/i.test(String(match?.status || "").trim());

function renderAdminMatch(match) {
  const team = (name, winner) => `
    <span class="admin-match__team${winner ? " is-winner" : ""}"><span>${escapeHTML(name)}</span></span>`;
  const hasScore = Boolean(match.scoreA || match.scoreB);
  const result = hasScore ? formatMatchScore(match.scoreA, match.scoreB) : "vs";
  return `
    <a class="admin-match" href="${escapeHTML(match.url || globalThis.PadeuceFeedConfig?.get?.().scheduleUrl || DEFAULT_RESULTS_URL)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(match.a)} versus ${escapeHTML(match.b)}">
      <span class="admin-match__meta"><b class="admin-match__group">${escapeHTML(match.group || match.division)}</b>${scheduleStatus(match.status)}<span>${escapeHTML(match.court)}</span></span>
      <span class="admin-match__court">${courtNumber(match.court)}</span>
      ${team(match.a, match.winner === "a")}
      <span class="admin-match__result${hasScore ? " has-score" : ""}">${result}</span>
      ${team(match.b, match.winner === "b")}
    </a>`;
}

function renderSchedule(results) {
  const root = document.querySelector("[data-admin-schedule]");
  if (!root) return;
  const stages = Array.isArray(results.stages) ? results.stages : [];
  const roundRobin = stages.filter(stage => stage.phase === "round-robin");
  const knockout = stages.filter(stage => stage.phase === "knockout");
  const upcomingKnockoutCount = knockout.reduce((total, stage) =>
    total + stageMatches(stage).filter(match => !isCompletedMatch(match)).length, 0);
  const draw = (key, label) => {
    const drawStages = knockout
      .filter(stage => stage.draw === key)
      .map(stage => ({ stage, matches: stageMatches(stage).filter(match => !isCompletedMatch(match)) }))
      .filter(entry => entry.matches.length);
    if (!drawStages.length) return "";
    return `<section class="admin-stage-draw"><h4 class="admin-stage-draw__title">${label}</h4>${drawStages.map(({ stage, matches }) => `<section class="admin-round"><div class="admin-round__heading"><h5>${escapeHTML(stage.name)}</h5><span>${escapeHTML(stage.status || "Scheduled")}</span></div>${matches.map(renderAdminMatch).join("")}</section>`).join("")}</section>`;
  };
  const knockoutSchedule = `${draw("championship", "Championship Draw")}${draw("back-draw", "Back Draw")}`;
  root.innerHTML = stages.length ? `
    <section class="admin-stage-phase" data-admin-tournament-phase="round-robin"><header class="admin-stage-phase__heading"><div><p class="eyebrow">Phase 1</p><h4>Round Robin</h4></div><span>${roundRobin.reduce((total, stage) => total + stageMatches(stage).length, 0)} matches</span></header>${roundRobin.flatMap(stage => stage.rounds || []).map(round => `<section class="admin-round"><h5 class="admin-round__title">${escapeHTML(round.name)}</h5>${(round.matches || []).sort((a, b) => courtNumber(a.court) - courtNumber(b.court)).map(renderAdminMatch).join("")}</section>`).join("")}</section>
    <section class="admin-stage-phase" data-admin-tournament-phase="knockout"><header class="admin-stage-phase__heading"><div><p class="eyebrow">Phase 2</p><h4>Knock-out</h4></div><span>${upcomingKnockoutCount} upcoming</span></header>${knockoutSchedule || '<p class="admin-loading">No upcoming knock-out matches.</p>'}</section>`
    : '<p class="admin-loading">No matches are currently available.</p>';
  applyAdminTournamentPhase();
}

function renderStandings(groups, stages) {
  const root = document.querySelector("[data-admin-standings]");
  if (!root) return;
  const tables = groups.map(group => `
    <article class="admin-panel" data-admin-tournament-phase="round-robin">
      <header class="admin-panel__header">
        <div><p class="eyebrow">Round-robin table</p><h3>${escapeHTML(group.name)}</h3></div>
        <a class="text-link" href="../standings/">Open feed →</a>
      </header>
      <div class="table-scroll">
        <table class="admin-standings-table">
          <caption class="sr-only">${escapeHTML(group.name)} standings</caption>
          <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>Sets</th></tr></thead>
          <tbody>${group.rows.map(entry => `
            <tr>
              <td><span class="admin-standings-table__rank">${escapeHTML(entry.position)}</span></td>
              <td><span class="admin-standings-table__team">${entry.players.map(player => `<strong>${escapeHTML(player)}</strong>`).join("")}</span></td>
              <td class="admin-standings-table__number">${escapeHTML(entry.wins)}</td>
              <td class="admin-standings-table__number">${escapeHTML(entry.losses)}</td>
              <td class="admin-standings-table__number">${escapeHTML(entry.setsFor)}–${escapeHTML(entry.setsAgainst)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    </article>`).join("");
  const knockout = (stages || []).filter(stage => stage.phase === "knockout");
  const knockoutPanels = [
    { key: "championship", label: "Championship Draw" },
    { key: "back-draw", label: "Back Draw" }
  ].map(draw => {
    const drawStages = knockout.filter(stage => stage.draw === draw.key);
    if (!drawStages.length) return "";
    return `<article class="admin-panel" data-admin-tournament-phase="knockout"><header class="admin-panel__header"><div><p class="eyebrow">Knock-out results</p><h3>${draw.label}</h3></div><a class="text-link" href="../standings/">Open feed →</a></header><div class="admin-knockout-results">${drawStages.map(stage => `<section class="admin-knockout-stage"><div class="admin-round__heading"><h4>${escapeHTML(stage.name)}</h4><span>${escapeHTML(stage.status || "Scheduled")}</span></div>${stageMatches(stage).map(renderAdminMatch).join("")}</section>`).join("")}</div></article>`;
  }).join("");
  root.innerHTML = tables + knockoutPanels || '<article class="admin-panel"><p class="admin-loading">Standings are not available yet.</p></article>';
  applyAdminTournamentPhase();
}

function applyAdminTournamentPhase() {
  document.querySelectorAll(".admin-section--tournament [data-admin-tournament-phase]").forEach(section => {
    section.hidden = section.dataset.adminTournamentPhase !== adminTournamentPhase;
  });
}

function initialiseAdminStageFilter() {
  const switcher = document.querySelector("[data-admin-stage-filter]");
  if (!switcher) return;
  switcher.addEventListener("click", event => {
    const button = event.target.closest("button[data-phase]");
    if (!button) return;
    adminTournamentPhase = button.dataset.phase;
    switcher.querySelectorAll("button[data-phase]").forEach(item => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    applyAdminTournamentPhase();
  });
}

function updateLocalTime() {
  const target = document.querySelector("[data-admin-time]");
  if (!target) return;
  target.textContent = `${new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date())} SAST`;
}

function updateOnlineStatus() {
  const banner = document.querySelector(".offline-banner");
  if (banner) banner.hidden = navigator.onLine;
}

async function refreshTournament() {
  const sync = document.querySelector("[data-admin-sync]");
  try {
    const results = await loadOfficialResults();
    renderSchedule(results);
    renderStandings(results.standings || [], results.standingsStages || results.stages || []);
    if (sync) {
      sync.dataset.state = results.isTournamentEmpty ? "waiting" : results.isBundledSnapshot ? "fallback" : "success";
      sync.textContent = results.isTournamentEmpty
        ? "Waiting for confirmed Challenger Series fixtures."
        : results.isBundledSnapshot
          ? "Live feed unavailable — waiting for tournament data."
          : "Dashboard synced with the live tournament feed.";
    }
  } catch (error) {
    console.error("Admin tournament refresh failed:", error);
    if (sync) {
      sync.dataset.state = "fallback";
      sync.textContent = "Tournament data is temporarily unavailable.";
    }
  }
}

function initialise() {
  updateLocalTime();
  updateOnlineStatus();
  initialiseAdminStageFilter();
  refreshTournament();
  window.setInterval(updateLocalTime, 30 * 1000);
  refreshTimer = window.setInterval(refreshTournament, REFRESH_INTERVAL);
  window.addEventListener("online", () => { updateOnlineStatus(); refreshTournament(); });
  window.addEventListener("offline", updateOnlineStatus);
  window.addEventListener(globalThis.PadeuceFeedConfig?.CHANGE_EVENT || "padeuce:feed-config-change", refreshTournament);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearInterval(refreshTimer);
    } else {
      refreshTournament();
      refreshTimer = window.setInterval(refreshTournament, REFRESH_INTERVAL);
    }
  });
}

initialise();
