import { loadOfficialResults } from "./official-results.js?v=2";

const DEFAULT_RESULTS_URL = "https://padeuce.com/club/playpadel-challenger/tournament/challenger-series/results";
const REFRESH_INTERVAL = 60 * 1000;
let refreshTimer;

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

const courtNumber = court => Number(String(court).match(/\d+/)?.[0] || 99);
const teamLines = team => String(team || "Team to be confirmed")
  .split(" / ")
  .map(player => `<strong>${escapeHTML(player)}</strong>`)
  .join("");
const stageSlug = value => String(value || "stage").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase();
const stageMatches = stage => Array.isArray(stage.fixtures)
  ? stage.fixtures
  : (stage.rounds || []).flatMap(round => round.matches || []);
const formatMatchScore = (scoreA, scoreB) => {
  const teamA = String(scoreA || "").trim().split(/\s+/).filter(Boolean);
  const teamB = String(scoreB || "").trim().split(/\s+/).filter(Boolean);
  return Array.from({ length: Math.max(teamA.length, teamB.length) }, (_, index) =>
    `${escapeHTML(teamA[index] || "–")}–${escapeHTML(teamB[index] || "–")}`
  ).join("  ");
};
const team = (name, winner) => `
  <span class="schedule-feed-match__team${winner ? " is-winner" : ""}">
    <span class="schedule-feed-match__players">${teamLines(name)}</span>
  </span>`;

function renderMatch(match) {
  const hasScore = Boolean(match.scoreA || match.scoreB);
  const result = hasScore ? formatMatchScore(match.scoreA, match.scoreB) : "vs";
  return `
    <a class="schedule-feed-match" href="${escapeHTML(match.url || globalThis.PadeuceFeedConfig?.get?.().scheduleUrl || DEFAULT_RESULTS_URL)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(match.a)} versus ${escapeHTML(match.b)}">
      <span class="schedule-feed-match__meta"><b>${escapeHTML(match.group || match.division)}</b><span>${escapeHTML(match.status)}</span><span>${escapeHTML(match.court)}</span></span>
      <span class="schedule-feed-match__court">${courtNumber(match.court)}</span>
      ${team(match.a, match.winner === "a")}
      <span class="schedule-feed-match__result${hasScore ? " has-score" : ""}">${result}</span>
      ${team(match.b, match.winner === "b")}
    </a>`;
}

function renderRound(round, headingLevel = 3) {
  const matches = [...(round.matches || [])].sort((a, b) => courtNumber(a.court) - courtNumber(b.court));
  const Heading = `h${headingLevel}`;
  return `
    <section class="schedule-round">
      <div class="schedule-round__heading"><${Heading}>${escapeHTML(round.name)}</${Heading}><span>${matches.length} ${matches.length === 1 ? "match" : "matches"}</span></div>
      ${matches.map(renderMatch).join("")}
    </section>`;
}

function renderKnockoutDraws(stages) {
  return [
    { key: "championship", label: "Championship Draw" },
    { key: "back-draw", label: "Back Draw" }
  ].map(draw => {
    const drawStages = stages.filter(stage => stage.draw === draw.key);
    if (!drawStages.length) return "";
    return `
      <section class="knockout-draw" aria-labelledby="${draw.key}-draw-title">
        <header class="knockout-draw__heading"><p class="eyebrow">Knock-out</p><h3 id="${draw.key}-draw-title">${draw.label}</h3></header>
        <div class="knockout-stage-grid">
          ${drawStages.map(stage => `
            <section class="knockout-stage" aria-labelledby="stage-${stageSlug(stage.id || stage.name)}">
              <div class="knockout-stage__heading"><h4 id="stage-${stageSlug(stage.id || stage.name)}">${escapeHTML(stage.name)}</h4><span>${escapeHTML(stage.status || "Scheduled")}</span></div>
              ${stageMatches(stage).map(renderMatch).join("")}
            </section>`).join("")}
        </div>
      </section>`;
  }).join("");
}

function renderSchedule(results) {
  const root = document.querySelector("[data-schedule-feed]");
  if (!root) return;
  const stages = Array.isArray(results.stages) ? results.stages : [];
  const roundRobin = stages.filter(stage => stage.phase === "round-robin");
  const knockout = stages.filter(stage => stage.phase === "knockout");
  if (!stages.length) {
    root.innerHTML = '<p class="tournament-feed-loading">No scheduled matches are available.</p>';
    return;
  }
  root.innerHTML = `
    <section class="tournament-stage-phase" aria-labelledby="round-robin-schedule-title">
      <header class="tournament-stage-phase__heading"><div><p class="eyebrow">Phase 1</p><h2 id="round-robin-schedule-title">Round Robin</h2></div><span>${roundRobin.reduce((total, stage) => total + stageMatches(stage).length, 0)} matches</span></header>
      <div class="schedule-round-grid">${roundRobin.flatMap(stage => stage.rounds || []).map(round => renderRound(round)).join("")}</div>
    </section>
    ${knockout.length ? `<section class="tournament-stage-phase" aria-labelledby="knockout-schedule-title"><header class="tournament-stage-phase__heading"><div><p class="eyebrow">Phase 2</p><h2 id="knockout-schedule-title">Knock-out</h2></div><span>${knockout.reduce((total, stage) => total + stageMatches(stage).length, 0)} matches</span></header><div class="knockout-draw-grid">${renderKnockoutDraws(knockout)}</div></section>` : ""}`;
}

function standingsCards(groups) {
  return groups.map(group => `
    <article class="standings-feed-card">
      <header class="standings-feed-card__header"><div><p class="eyebrow">Round-robin table</p><h3>${escapeHTML(group.name)}</h3></div><span>${group.rows.length} teams</span></header>
      <div class="table-scroll">
        <table class="standings-feed-table">
          <caption class="sr-only">${escapeHTML(group.name)} standings</caption>
          <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>Sets</th></tr></thead>
          <tbody>${group.rows.map(entry => `
            <tr><td><span class="standings-feed-rank">${escapeHTML(entry.position)}</span></td><td><span class="standings-feed-team">${entry.players.map(player => `<strong>${escapeHTML(player)}</strong>`).join("")}</span></td><td class="standings-feed-number">${escapeHTML(entry.wins)}</td><td class="standings-feed-number">${escapeHTML(entry.losses)}</td><td class="standings-feed-number">${escapeHTML(entry.setsFor)}–${escapeHTML(entry.setsAgainst)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </article>`).join("");
}

function renderStandings(groups, stages) {
  const root = document.querySelector("[data-standings-feed]");
  if (!root) return;
  const knockout = (stages || []).filter(stage => stage.phase === "knockout");
  if (!groups.length && !knockout.length) {
    root.innerHTML = '<p class="tournament-feed-loading">Standings will appear once the tournament restarts.</p>';
    return;
  }
  root.innerHTML = `
    <section class="tournament-stage-phase" aria-labelledby="round-robin-standings-title">
      <header class="tournament-stage-phase__heading"><div><p class="eyebrow">Phase 1</p><h2 id="round-robin-standings-title">Round Robin</h2></div><span>${groups.length} groups</span></header>
      <div class="standings-feed-grid">${standingsCards(groups)}</div>
    </section>
    ${knockout.length ? `<section class="tournament-stage-phase" aria-labelledby="knockout-standings-title"><header class="tournament-stage-phase__heading"><div><p class="eyebrow">Phase 2</p><h2 id="knockout-standings-title">Knock-out Results</h2></div><span>${knockout.reduce((total, stage) => total + stageMatches(stage).length, 0)} matches</span></header><div class="knockout-draw-grid">${renderKnockoutDraws(knockout)}</div></section>` : ""}` || '<p class="tournament-feed-loading">Standings are not available yet.</p>';
}

async function refresh() {
  const sync = document.querySelector("[data-tournament-feed-sync]");
  try {
    const results = await loadOfficialResults();
    if (document.body.dataset.tournamentView === "schedule") renderSchedule(results);
    if (document.body.dataset.tournamentView === "standings") renderStandings(results.standings || [], results.standingsStages || results.stages || []);
    if (sync) {
      sync.dataset.state = results.isTournamentEmpty ? "waiting" : results.isBundledSnapshot ? "fallback" : "success";
      sync.textContent = results.isTournamentEmpty ? "Waiting for tournament data" : results.isBundledSnapshot ? "Tournament feed unavailable" : "Live tournament data";
    }
  } catch (error) {
    console.error("Tournament feed refresh failed:", error);
    if (sync) { sync.dataset.state = "fallback"; sync.textContent = "Feed temporarily unavailable"; }
  }
}

refresh();
refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL);
window.addEventListener(globalThis.PadeuceFeedConfig?.CHANGE_EVENT || "padeuce:feed-config-change", refresh);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    window.clearInterval(refreshTimer);
  } else {
    refresh();
    refreshTimer = window.setInterval(refresh, REFRESH_INTERVAL);
  }
});
