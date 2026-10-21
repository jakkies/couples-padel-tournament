import { API_CONFIG, eventData, liveMatches } from "./data.js";

let refreshTimer = null;
let lastSuccessfulUpdate = null;

const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

function relativeTime(date) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `Updated ${seconds} second${seconds === 1 ? "" : "s"} ago`;
  return `Updated ${Math.floor(seconds / 60)} min ago`;
}

function createTeamRow(team) {
  const row = make("div", "live-score__team");
  const names = make("div", "live-score__names");
  team.names.forEach((name, index) => {
    const line = make("span", "", name);
    if (team.serving && index === 0) {
      const server = make("i", "server-dot");
      server.setAttribute("aria-label", "serving");
      line.append(server);
    }
    names.append(line);
  });
  const sets = make("div", "live-score__sets");
  team.sets.forEach((score, index) => {
    sets.append(make(index === team.sets.length - 1 ? "strong" : "span", "", String(score)));
  });
  row.append(names, sets, make("strong", "live-score__current", String(team.current)));
  return row;
}

function renderMatch(root, match) {
  root.replaceChildren();
  const card = make("article", "live-score");
  const stale = Date.now() - new Date(match.updatedAt).getTime() > API_CONFIG.refreshInterval * 2;
  if (stale) card.classList.add("live-score--stale");
  const top = make("div", "live-score__top");
  const badge = make("span", "live-dot", "Live");
  badge.prepend(make("i"));
  top.append(badge, make("p", "live-score__meta", `${match.court} · ${match.division}’s ${match.round}${stale ? " · Stale data" : ""}`));

  const body = make("div", "live-score__body");
  body.append(make("p", "live-score__round", `${match.format} · Mock score demonstration`));
  match.teams.forEach(team => body.append(createTeamRow(team)));

  const bottom = make("div", "live-score__bottom");
  const status = make("div");
  const servingTeam = match.teams.find(team => team.serving);
  status.append(
    make("p", "", `${match.currentSet} · ${servingTeam ? servingTeam.names.join(" / ") : "Serve"} serving`),
    make("small", "u-muted", relativeTime(match.updatedAt))
  );
  const actions = make("div", "live-score__actions");
  const open = make("a", "button button--primary button--small", "Open Live Score");
  open.href = eventData.officialUrl; open.target = "_blank"; open.rel = "noopener noreferrer";
  const share = make("button", "button button--ghost button--small", "Share Match");
  share.type = "button"; share.dataset.share = ""; share.dataset.shareTitle = `${match.teams[0].names.join(" / ")} vs ${match.teams[1].names.join(" / ")}`;
  actions.append(open, share); bottom.append(status, actions);
  card.append(top, body, bottom); root.append(card);
  root.setAttribute("aria-busy", "false");
}

function renderError(root, message) {
  root.replaceChildren();
  const card = make("article", "live-score live-score--error");
  card.append(make("p", "eyebrow", "Score service"), make("h3", "", message));
  const actions = make("div", "button-row");
  const retry = make("button", "button button--primary", "Retry");
  retry.type = "button"; retry.addEventListener("click", () => updateLiveScore(root));
  const official = make("a", "button button--ghost", "Open official tournament site");
  official.href = eventData.officialUrl; official.target = "_blank"; official.rel = "noopener noreferrer";
  actions.append(retry, official); card.append(actions); root.append(card);
  root.setAttribute("aria-busy", "false");
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_CONFIG.timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Score request failed: ${response.status}`);
    const data = await response.json();
    if (!data || !Array.isArray(data.matches)) throw new TypeError("Malformed score response");
    return data.matches;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function updateLiveScore(root = document.querySelector("#live-score-root")) {
  if (!root) return;
  try {
    if (!navigator.onLine && !API_CONFIG.useMockData) throw new Error("Offline");
    const matches = API_CONFIG.useMockData ? liveMatches : await fetchWithTimeout(API_CONFIG.liveScoreEndpoint);
    if (!matches.length) {
      renderError(root, "No live match right now. Check today’s fixtures for what’s next.");
      return;
    }
    lastSuccessfulUpdate = new Date();
    renderMatch(root, matches[0]);
  } catch (error) {
    console.error("Live score update failed:", error);
    renderError(root, "Live score temporarily unavailable.");
  }
}

export function startLiveScore() {
  const root = document.querySelector("#live-score-root");
  if (!root) return;
  updateLiveScore(root);
  const schedule = () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => updateLiveScore(root), API_CONFIG.refreshInterval);
  };
  schedule();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && refreshTimer) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    } else if (!document.hidden) {
      updateLiveScore(root);
      schedule();
    }
  });
  window.setInterval(() => {
    const stamp = root.querySelector("small");
    const match = API_CONFIG.useMockData ? liveMatches[0] : { updatedAt: lastSuccessfulUpdate };
    if (stamp && match?.updatedAt) stamp.textContent = relativeTime(match.updatedAt);
  }, 1000);
}
