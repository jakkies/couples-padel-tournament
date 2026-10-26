(() => {
  "use strict";

  const API_BASE = "https://padeuce.com/api";
  const REFRESH_INTERVAL = 30000;
  const REQUEST_TIMEOUT = 10000;

  const scheduleRoot = document.querySelector("[data-schedule-feed]");
  const standingsRoot = document.querySelector("[data-standings-feed]");
  const syncLabels = [...document.querySelectorAll("[data-tournament-sync]")];
  if (!scheduleRoot && !standingsRoot) return;

  let latest = null;
  let claimsBySeed = new Map();
  let timer = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };

  function target() {
    const config = window.PadeuceFeedConfig;
    const parsed = config?.parseTournamentUrl?.(config.get().scheduleUrl);
    return parsed || null;
  }

  async function fetchJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Padeuce returned ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---- Mapping --------------------------------------------------------------

  const isPlaceholder = name => !name || /^player\s*\d+$/i.test(String(name).trim());

  function teamInfo(team) {
    if (!team) return { seed: null, label: "To be decided", pending: true };
    const seed = Number(team.seed) || null;
    if (!isPlaceholder(team.player1Name) || !isPlaceholder(team.player2Name)) {
      return { seed, label: [team.player1Name, team.player2Name].filter(Boolean).join(" & "), pending: false };
    }
    // Padeuce still has placeholder names, so fall back to the couple who claimed this team number.
    const claim = seed ? claimsBySeed.get(seed) : null;
    if (claim) return { seed, label: `${claim.player1} & ${claim.player2}`, pending: false };
    return { seed, label: seed ? `Team #${seed}` : "Team to be confirmed", pending: true };
  }

  function matchStatus(match, liveCodes) {
    const status = String(match.status || "").toUpperCase();
    if (status === "COMPLETED") return "completed";
    if ((match.scorerShareCode && liveCodes.has(match.scorerShareCode)) || /IN_PROGRESS|LIVE|PLAYING/.test(status)) return "live";
    if (/CANCELLED|VOIDED/.test(status)) return "cancelled";
    return "scheduled";
  }

  function mapTournament(progress, club) {
    const teams = new Map((progress.teams || []).map(team => [team.id, team]));
    const liveCodes = new Set((club?.liveCourts || []).flatMap(court => [court.shareCode, court.matchId]).filter(Boolean));
    const stages = (progress.stages || [])
      .slice()
      .sort((a, b) => Number(a.stageOrder || 0) - Number(b.stageOrder || 0))
      .map(stage => {
        const eliminated = new Set();
        const rounds = (stage.rounds || [])
          .slice()
          .sort((a, b) => Number(a.roundNumber || 0) - Number(b.roundNumber || 0))
          .map(round => ({
            number: Number(round.roundNumber || 0),
            matches: (round.matches || [])
              .slice()
              .sort((a, b) => Number(a.court || 99) - Number(b.court || 99) || Number(a.matchNumber || 0) - Number(b.matchNumber || 0))
              .map(match => {
                const status = matchStatus(match, liveCodes);
                const winner = match.winnerTeamId === match.teamAId ? "a" : match.winnerTeamId === match.teamBId ? "b" : "";
                if (winner) eliminated.add(winner === "a" ? match.teamBId : match.teamAId);
                return {
                  court: match.court,
                  number: Number(match.matchNumber || 0),
                  status,
                  winner,
                  a: teamInfo(teams.get(match.teamAId)),
                  b: teamInfo(teams.get(match.teamBId)),
                  setsA: Array.isArray(match.teamASets) ? match.teamASets : [],
                  setsB: Array.isArray(match.teamBSets) ? match.teamBSets : [],
                  url: match.scorerShareCode ? `https://padeuce.com/match/${encodeURIComponent(match.scorerShareCode)}/results` : ""
                };
              })
          }))
          .filter(round => round.matches.length);
        const knockout = /ELIM|KNOCK/i.test(String(stage.format || ""));
        const standings = (stage.standings || [])
          .map(entry => {
            const team = teams.get(entry.teamId);
            const wins = Number(entry.wins || 0);
            const losses = Number(entry.losses || 0);
            return {
              position: Number(entry.position || 0),
              team: teamInfo(team),
              played: wins + losses,
              wins,
              losses,
              setsFor: Number(entry.setsFor || 0),
              setsAgainst: Number(entry.setsAgainst || 0),
              out: knockout && (eliminated.has(entry.teamId) || losses > 0)
            };
          })
          .sort((a, b) => Number(a.out) - Number(b.out) || b.wins - a.wins || (b.setsFor - b.setsAgainst) - (a.setsFor - a.setsAgainst) || (a.position || 99) - (b.position || 99));
        return {
          name: stage.name || "Tournament",
          ruleset: stage.rulesetLabel || "",
          knockout,
          status: String(stage.status || ""),
          rounds,
          standings
        };
      })
      .filter(stage => stage.rounds.length || stage.standings.length);
    return { name: progress.tournament?.name || "", stages };
  }

  // ---- Rendering ------------------------------------------------------------

  function empty(title, copy) {
    const box = el("div", "match-empty");
    const icon = el("img");
    icon.src = "assets/images/padel-rackets-icon.png";
    icon.width = 377;
    icon.height = 302;
    icon.alt = "";
    box.append(icon, el("h3", "", title), el("p", "", copy));
    return box;
  }

  function teamCell(info, isWinner) {
    const cell = el("div", `fixture-team${isWinner ? " is-winner" : ""}${info.pending ? " is-pending" : ""}`);
    if (info.seed) cell.append(el("span", "fixture-team__seed", `#${info.seed}`));
    cell.append(el("strong", "", info.label));
    return cell;
  }

  function scoreText(match) {
    const sets = Math.max(match.setsA.length, match.setsB.length);
    if (!sets) return "vs";
    return Array.from({ length: sets }, (_, i) => `${match.setsA[i] ?? "–"}–${match.setsB[i] ?? "–"}`).join("  ");
  }

  const STATUS_LABEL = { live: "Live", completed: "Final", cancelled: "Cancelled", scheduled: "Scheduled" };

  function fixtureCard(match) {
    const card = el(match.url ? "a" : "article", `fixture-card is-${match.status}`);
    if (match.url) {
      card.href = match.url;
      card.target = "_blank";
      card.rel = "noopener";
    }
    const meta = el("div", "fixture-card__meta");
    meta.append(el("span", "fixture-card__court", `Court ${match.court}`), el("span", `fixture-card__status is-${match.status}`, STATUS_LABEL[match.status]));
    const body = el("div", "fixture-card__body");
    body.append(teamCell(match.a, match.winner === "a"), el("span", `fixture-card__score${match.setsA.length ? " has-score" : ""}`, scoreText(match)), teamCell(match.b, match.winner === "b"));
    card.append(meta, body);
    return card;
  }

  function renderSchedule(data) {
    if (!scheduleRoot) return;
    const stages = data.stages.filter(stage => stage.rounds.length);
    if (!stages.length) {
      scheduleRoot.replaceChildren(empty("Match info not available", "Fixtures will appear here as soon as the draw is published on Padeuce."));
      return;
    }
    const parts = stages.map(stage => {
      const wrap = el("section", "fixture-stage");
      const head = el("header", "fixture-stage__head");
      const matches = stage.rounds.reduce((total, round) => total + round.matches.length, 0);
      const done = stage.rounds.reduce((total, round) => total + round.matches.filter(m => m.status === "completed").length, 0);
      const title = el("div");
      title.append(el("h3", "", stage.name), el("p", "", [stage.knockout ? "Knock-out" : "", stage.ruleset].filter(Boolean).join(" · ")));
      head.append(title, el("span", "fixture-stage__count", `${done} of ${matches} played`));
      wrap.append(head);
      stage.rounds.forEach(round => {
        const block = el("div", "fixture-session");
        const label = el("div", "fixture-session__head");
        label.append(el("b", "", `Session ${round.number}`), el("span", "", `${round.matches.length} ${round.matches.length === 1 ? "match" : "matches"}`));
        const grid = el("div", "fixture-session__grid");
        round.matches.forEach(match => grid.append(fixtureCard(match)));
        block.append(label, grid);
        wrap.append(block);
      });
      return wrap;
    });
    scheduleRoot.replaceChildren(...parts);
  }

  function renderStandings(data) {
    if (!standingsRoot) return;
    const stages = data.stages.filter(stage => stage.standings.length);
    if (!stages.length) {
      standingsRoot.replaceChildren(empty("Match info not available", "Standings will appear here once the draw is published on Padeuce."));
      return;
    }
    const parts = stages.map(stage => {
      const card = el("article", "standings-live");
      const head = el("header", "standings-live__head");
      const title = el("div");
      title.append(el("p", "eyebrow", stage.knockout ? "Knock-out" : "Table"), el("h3", "", stage.name));
      head.append(title, el("b", "", `${stage.standings.length} teams`));
      const scroll = el("div", "standings-live__scroll");
      const table = el("table", "standings-live__table");
      const thead = el("thead");
      const headRow = el("tr");
      ["#", "Team", "P", "W", "L", "Sets", stage.knockout ? "Status" : ""].filter(Boolean).forEach(label => headRow.append(el("th", "", label)));
      thead.append(headRow);
      const tbody = el("tbody");
      stage.standings.forEach((row, index) => {
        const tr = el("tr", row.out ? "is-out" : "");
        const team = el("td");
        team.append(teamCell(row.team, false));
        tr.append(el("td", "standings-live__rank", index + 1), team, el("td", "", row.played), el("td", "", row.wins), el("td", "", row.losses), el("td", "", `${row.setsFor}–${row.setsAgainst}`));
        if (stage.knockout) {
          const status = el("td");
          status.append(el("span", `standings-live__pill${row.out ? " is-out" : ""}`, row.out ? "Out" : "In"));
          tr.append(status);
        }
        tbody.append(tr);
      });
      table.append(thead, tbody);
      scroll.append(table);
      card.append(head, scroll);
      return card;
    });
    standingsRoot.replaceChildren(...parts);
  }

  function setSync(state, text) {
    syncLabels.forEach(label => {
      label.dataset.state = state;
      const span = label.querySelector("span");
      if (span) span.textContent = text; else label.textContent = text;
    });
  }

  function render() {
    if (!latest) return;
    renderSchedule(latest);
    renderStandings(latest);
  }

  async function refresh() {
    const feed = target();
    if (!feed) return;
    try {
      const [progress, club] = await Promise.all([
        fetchJSON(`${API_BASE}/club/${encodeURIComponent(feed.clubId)}/tournament/${encodeURIComponent(feed.tournamentId)}/progress`),
        fetchJSON(`${API_BASE}/club/${encodeURIComponent(feed.clubId)}`).catch(() => ({}))
      ]);
      latest = mapTournament(progress, club);
      render();
      const time = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
      setSync("success", `Live from Padeuce · updated ${time}`);
    } catch (error) {
      console.warn("Tournament feed refresh failed:", error);
      if (!latest) {
        scheduleRoot?.replaceChildren(empty("Match info not available", "We couldn’t reach the live tournament feed. It will retry automatically."));
        standingsRoot?.replaceChildren(empty("Match info not available", "We couldn’t reach the live tournament feed. It will retry automatically."));
      }
      setSync("warning", "Live feed unavailable · retrying");
    }
  }

  function start() {
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_INTERVAL);
  }

  window.addEventListener("couples:claims", event => {
    claimsBySeed = new Map((event.detail || []).map(claim => [Number(claim.number), claim]));
    render();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener(window.PadeuceFeedConfig?.CHANGE_EVENT || "padeuce:feed-config-change", refresh);

  refresh();
  start();
})();
