(() => {
  "use strict";

  const API_BASE = "https://padeuce.com/api";
  const REFRESH_INTERVAL = 15000;
  const REQUEST_TIMEOUT = 8000;
  let refreshTimer = null;
  let clubStream = null;
  let clubStreamClubId = null;
  const matchStreams = new Map();

  const defaultCourts = {
    court1Url: { clubId: "5zvsITM2pqsDhMVL3", court: "1" },
    court2Url: { clubId: "5zvsITM2pqsDhMVL3", court: "2" },
    court3Url: { clubId: "5zvsITM2pqsDhMVL3", court: "3" },
    court4Url: { clubId: "5zvsITM2pqsDhMVL3", court: "4" }
  };

  const createElement = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };

  function courtTarget(root) {
    const key = root.dataset.courtFeed || `court${root.dataset.courtScore}Url`;
    const url = window.PadeuceFeedConfig?.get?.()[key];
    return window.PadeuceFeedConfig?.parseCourtUrl?.(url) || defaultCourts[key] || {
      clubId: defaultCourts.court1Url.clubId,
      court: root.dataset.courtScore
    };
  }

  const courtLabel = (root, court) => root.dataset.courtName || `Court ${court}`;

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Score request failed with ${response.status}`);
      const data = await response.json();
      if (!data || typeof data !== "object") throw new TypeError("Malformed score response");
      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function renderEmpty(root, court) {
    root.classList.remove("court-score--error");
    root.replaceChildren();
    const empty = createElement("div", "court-score__empty");
    empty.append(
      createElement("p", "eyebrow", "Waiting for match"),
      createElement("strong", "", `${courtLabel(root, court)} is ready for the next score.`)
    );
    root.append(empty);
    root.setAttribute("aria-busy", "false");
  }

  function renderError(root) {
    root.classList.add("court-score--error");
    root.replaceChildren(createElement("p", "court-score__empty", "Live score temporarily unavailable."));
    root.setAttribute("aria-busy", "false");
  }

  function createScoreNumber(value, points = false) {
    return createElement("strong", `court-score__number${points ? " court-score__number--points" : ""}`, value ?? "–");
  }

  function formatPoints(score, side) {
    const own = Number(side === 1 ? score.team1Points : score.team2Points);
    const opponent = Number(side === 1 ? score.team2Points : score.team1Points);
    const fallback = side === 1 ? score.team1PointsDisplay : score.team2PointsDisplay;

    if (!Number.isFinite(own) || !Number.isFinite(opponent)) return fallback ?? "–";
    if (score.isInTiebreak) return String(own);

    if (own >= 3 && opponent >= 3) {
      if (own === opponent) return "40";
      if (own === opponent + 1) return "AD";
      if (opponent === own + 1) return "40";
    }

    return ["0", "15", "30", "40"][Math.min(own, 3)];
  }

  function setGames(score, side, setIndex) {
    const setScore = Array.isArray(score.setScores) ? score.setScores[setIndex] : null;
    if (setScore) return side === 1 ? setScore.team1 : setScore.team2;

    const completedSets = Number(score.team1Sets || 0) + Number(score.team2Sets || 0);
    if (completedSets === setIndex) {
      return side === 1 ? score.team1Games : score.team2Games;
    }
    return "–";
  }

  function createTeamRow(name, side, score) {
    const row = createElement("div", "court-score__team");
    const teamName = createElement("div", "court-score__name", name || `Team ${side}`);
    if (!score.winner && score.servingTeam === side) {
      const serving = createElement("i", "court-score__serve");
      serving.setAttribute("title", "Serving");
      serving.setAttribute("aria-label", "serving");
      teamName.append(serving);
    }

    row.append(
      teamName,
      createScoreNumber(setGames(score, side, 0)),
      createScoreNumber(setGames(score, side, 1)),
      createScoreNumber(side === 1 ? score.team1Sets : score.team2Sets),
      createScoreNumber(side === 1 ? score.team1Games : score.team2Games),
      createScoreNumber(formatPoints(score, side), true)
    );
    return row;
  }

  function renderMatch(root, courtMatch, payload, completed = false) {
    const match = payload.match || {};
    const score = payload.score || {};
    const currentSet = Math.max(1, Number(score.team1Sets || 0) + Number(score.team2Sets || 0) + 1);

    root.classList.remove("court-score--error");
    root.replaceChildren();

    const status = createElement("div", "court-score__status");
    const state = createElement("span", completed ? "status-pill status-pill--completed" : "live-dot", completed ? "Final" : "Live");
    if (!completed) state.prepend(createElement("i"));
    status.append(state, createElement("span", "court-score__set", completed ? "Completed" : `Set ${currentSet}`));

    const columns = createElement("div", "court-score__columns");
    ["Team", "Set 1", "Set 2", "Sets", "Games", "Points"].forEach(label => columns.append(createElement("span", "", label)));

    const footer = createElement("div", "court-score__footer");
    const updated = new Date(match.lastActivityAt || courtMatch.lastActivityAt || Date.now());
    footer.append(
      createElement("span", "", `Updated ${updated.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`),
      createElement("span", "", match.ruleset?.name || "Live scoring")
    );

    root.append(
      status,
      columns,
      createTeamRow(match.teamAName || courtMatch.teamAName, 1, score),
      createTeamRow(match.teamBName || courtMatch.teamBName, 2, score),
      footer
    );
    root.setAttribute("aria-busy", "false");
  }

  function findCourtRoot(court) {
    return [...document.querySelectorAll("[data-court-score]")]
      .find(root => String(courtTarget(root).court).toLowerCase() === String(court).toLowerCase());
  }

  function closeMatchStream(matchId) {
    const entry = matchStreams.get(matchId);
    if (!entry) return;
    entry.source.close();
    matchStreams.delete(matchId);
  }

  function syncMatchStreams(liveCourts, payloads) {
    const activeMatchIds = new Set(liveCourts.map(court => court.matchId));

    [...matchStreams.keys()].forEach(matchId => {
      if (!activeMatchIds.has(matchId)) closeMatchStream(matchId);
    });

    liveCourts.forEach(courtMatch => {
      const initial = payloads.find(item => item.court.matchId === courtMatch.matchId)?.payload;
      const existing = matchStreams.get(courtMatch.matchId);
      if (existing) {
        existing.courtMatch = courtMatch;
        if (initial) existing.payload = initial;
        return;
      }

      const source = new EventSource(`${API_BASE}/match/${encodeURIComponent(courtMatch.matchId)}/stream`);
      const entry = { source, courtMatch, payload: initial || {} };
      matchStreams.set(courtMatch.matchId, entry);

      source.onmessage = event => {
        try {
          const update = JSON.parse(event.data);
          if (!update || typeof update !== "object") return;

          entry.payload = {
            match: { ...(entry.payload.match || {}), ...(update.match || {}) },
            score: update.score || entry.payload.score
          };

          if (entry.payload.score) {
            const root = findCourtRoot(entry.courtMatch.court);
            if (root) renderMatch(root, entry.courtMatch, entry.payload);
          }

          if (update.match?.status === "COMPLETED") {
            closeMatchStream(entry.courtMatch.matchId);
            refreshScores();
          }
        } catch (error) {
          console.error("Live point update failed:", error);
        }
      };

      // Polling remains active as a fallback if the real-time stream disconnects.
      source.onerror = () => {};
    });
  }

  function connectClubStream() {
    const root = document.querySelector("[data-court-score]");
    if (!root) return;
    const clubId = courtTarget(root).clubId;
    if (clubStream && clubStreamClubId === clubId) return;
    if (clubStream) clubStream.close();
    clubStream = new EventSource(`${API_BASE}/club/${encodeURIComponent(clubId)}/stream`);
    clubStreamClubId = clubId;
    clubStream.onmessage = event => {
      try {
        const update = JSON.parse(event.data);
        if (update?.type === "club_update") refreshScores();
      } catch (error) {
        console.error("Club score update failed:", error);
      }
    };
    clubStream.onerror = () => {};
  }

  function closeStreams() {
    if (clubStream) {
      clubStream.close();
      clubStream = null;
      clubStreamClubId = null;
    }
    [...matchStreams.keys()].forEach(closeMatchStream);
  }

  async function refreshScores() {
    const roots = [...document.querySelectorAll("[data-court-score]")];
    if (!roots.length) return;

    if (targetsUsePlaceholderFeeds(roots)) {
      roots.forEach(root => renderEmpty(root, courtTarget(root).court));
      return;
    }

    try {
      const targets = new Map(roots.map(root => [root, courtTarget(root)]));
      const clubId = targets.values().next().value.clubId;
      const club = await fetchJSON(`${API_BASE}/club/${encodeURIComponent(clubId)}`);
      const liveCourts = Array.isArray(club.liveCourts) ? club.liveCourts : [];
      const completedCourts = club.completed && typeof club.completed === "object" ? club.completed : {};
      const payloads = await Promise.all(
        liveCourts.map(async court => ({
          court,
          payload: await fetchJSON(`${API_BASE}/match/${encodeURIComponent(court.matchId)}`)
        }))
      );
      syncMatchStreams(liveCourts, payloads);

      roots.forEach(root => {
        const courtName = targets.get(root).court;
        const live = payloads.find(item => String(item.court.court).toLowerCase() === String(courtName).toLowerCase());
        const completedEntry = Object.entries(completedCourts).find(([court]) => String(court).toLowerCase() === String(courtName).toLowerCase());
        if (live) {
          renderMatch(root, live.court, live.payload);
        } else if (completedEntry?.[1]?.score) {
          const completed = completedEntry[1];
          renderMatch(root, completed, { match: completed, score: completed.score }, true);
        } else {
          renderEmpty(root, courtName);
        }
      });
    } catch (error) {
      console.error("Court score refresh failed:", error);
      roots.forEach(root => renderError(root));
    }
  }

  function targetsUsePlaceholderFeeds(roots) {
    return roots.some(root => courtTarget(root).clubId === "playpadel-challenger");
  }

  function startPolling() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(refreshScores, REFRESH_INTERVAL);
  }

  function initialise() {
    refreshScores();
    startPolling();
    const roots = [...document.querySelectorAll("[data-court-score]")];
    if (!targetsUsePlaceholderFeeds(roots)) connectClubStream();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (refreshTimer) window.clearInterval(refreshTimer);
        refreshTimer = null;
        closeStreams();
      } else {
        refreshScores();
        startPolling();
        if (!targetsUsePlaceholderFeeds(roots)) connectClubStream();
      }
    });

    window.addEventListener("online", () => {
      refreshScores();
      if (!targetsUsePlaceholderFeeds(roots)) connectClubStream();
    });
    window.addEventListener(window.PadeuceFeedConfig?.CHANGE_EVENT || "padeuce:feed-config-change", () => {
      closeStreams();
      refreshScores();
      if (!targetsUsePlaceholderFeeds(roots)) connectClubStream();
    });
    window.addEventListener("beforeunload", closeStreams);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();
