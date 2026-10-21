const SPREADSHEET_ID = "1LxYqM_MLD_yFUEEQo4NKPzEuIwAk1SlD589JEf5SWaU";
const REFRESH_INTERVAL = 2 * 60 * 1000;
const SHEETS = {
  schedule: { name: "1. Scheduled Games", range: "A1:F102" },
  results: { name: "2. Result Submissions", range: "A1:H102" },
  rankings: { name: "3. Rankings", range: "A1:W1000" }
};

let refreshInProgress = false;

function cell(row, index) {
  const value = row?.c?.[index];
  return String(value?.f ?? value?.v ?? "").trim();
}

function divisionKey(value) {
  const division = String(value || "").toLowerCase().replace(/[’']/g, "").trim();
  if (division.startsWith("mix")) return "mixed";
  if (division.startsWith("lad") || division.startsWith("wom")) return "ladies";
  if (division.startsWith("men") || division.startsWith("man")) return "men";
  return "";
}

function loadTable({ name, range }) {
  return new Promise((resolve, reject) => {
    const callbackName = `_pcsSheet${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error(`Timed out loading ${name}`)), 15000);
    const finish = (error, table) => {
      window.clearTimeout(timeout);
      script.remove();
      delete globalThis[callbackName];
      if (error) reject(error);
      else resolve(table);
    };

    globalThis[callbackName] = response => {
      if (response?.status === "error" || !response?.table) {
        finish(new Error(`Could not read ${name}`));
        return;
      }
      finish(null, response.table);
    };
    script.onerror = () => finish(new Error(`Could not connect to ${name}`));

    const query = new URLSearchParams({
      sheet: name,
      range,
      tqx: `out:json;responseHandler:${callbackName}`,
      cache: String(Date.now())
    });
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${query}`;
    document.head.append(script);
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setCount(key, count, type) {
  const target = document.querySelector(`[data-challenge-count="${key}:${type}"]`);
  if (!target) return;
  if (type === "schedule") target.textContent = `${count} ${count === 1 ? "match" : "matches"}`;
  else target.textContent = count ? `${count} ${count === 1 ? "result" : "results"}` : "No results";
}

function emptyState(title, description, marker) {
  const empty = element("div", "challenge-empty");
  empty.append(
    element("span", "", marker),
    element("h4", "", title),
    element("p", "", description)
  );
  return empty;
}

function matchTeam(label, name) {
  const row = element("div", "challenge-match__team");
  row.append(element("span", "", label), element("strong", "", name));
  return row;
}

function renderSchedule(table) {
  const grouped = { men: [], ladies: [], mixed: [] };
  (table.rows || []).forEach(row => {
    const division = divisionKey(cell(row, 3));
    const challenging = cell(row, 4);
    const challenged = cell(row, 5);
    if (!division || !challenging || !challenged) return;
    grouped[division].push({
      week: cell(row, 1),
      date: cell(row, 2),
      challenging,
      challenged
    });
  });

  Object.entries(grouped).forEach(([division, matches]) => {
    const container = document.querySelector(`[data-challenge-content="${division}:schedule"]`);
    if (!container) return;
    container.replaceChildren();
    setCount(division, matches.length, "schedule");
    if (!matches.length) {
      container.append(emptyState(
        `${division === "men" ? "Men’s" : division === "ladies" ? "Ladies’" : "Mixed"} games will appear here`,
        "Scheduled challenges load automatically from the live sheet.",
        "01"
      ));
      return;
    }
    matches.forEach(match => {
      const card = element("article", "challenge-match");
      const meta = element("div", "challenge-match__meta");
      meta.append(element("span", "", match.week || "Challenge week"), element("time", "", match.date || "Date TBC"));
      const teams = element("div", "challenge-match__teams");
      teams.append(matchTeam("Challenger", match.challenging), matchTeam("Challenged", match.challenged));
      card.append(meta, teams);
      container.append(card);
    });
  });
}

function renderResults(table) {
  const grouped = { men: [], ladies: [], mixed: [] };
  (table.rows || []).forEach(row => {
    const division = divisionKey(cell(row, 3));
    const challenged = cell(row, 4);
    const winner = cell(row, 5);
    const score = cell(row, 6);
    const challenging = cell(row, 7);
    if (!division || !winner || (!challenged && !challenging)) return;
    grouped[division].push({
      week: cell(row, 1),
      date: cell(row, 2),
      challenged,
      challenging,
      winner,
      score
    });
  });

  Object.entries(grouped).forEach(([division, results]) => {
    const container = document.querySelector(`[data-challenge-content="${division}:results"]`);
    if (!container) return;
    container.replaceChildren();
    setCount(division, results.length, "results");
    if (!results.length) {
      container.append(emptyState("No scores submitted yet", "Submitted scores load automatically from the live sheet.", "✓"));
      return;
    }
    results.slice().reverse().forEach(result => {
      const card = element("article", "challenge-result");
      const meta = element("div", "challenge-match__meta");
      meta.append(element("span", "", result.week || "Challenge result"), element("time", "", result.date || "Date not supplied"));
      const body = element("div", "challenge-result__body");
      const copy = element("div", "challenge-result__copy");
      copy.append(element("span", "challenge-result__label", "Winner"), element("strong", "", result.winner));
      const opponent = result.winner === result.challenging ? result.challenged : result.challenging;
      if (opponent) copy.append(element("small", "", `Defeated ${opponent}`));
      body.append(copy, element("b", "challenge-result__score", result.score || "Result submitted"));
      card.append(meta, body);
      container.append(card);
    });
  });
}

function rankingRows(table, startColumn) {
  return (table.rows || []).map(row => ({
    player1: cell(row, startColumn),
    rating1: cell(row, startColumn + 1),
    player2: cell(row, startColumn + 2),
    rating2: cell(row, startColumn + 3),
    combined: cell(row, startColumn + 4),
    rank: cell(row, startColumn + 5),
    movement: cell(row, startColumn + 6) || "-"
  })).filter(entry => entry.player1 && entry.player2 && Number(entry.rank) > 0)
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}

function renderRankings(table) {
  const divisions = {
    men: rankingRows(table, 0),
    ladies: rankingRows(table, 8),
    mixed: rankingRows(table, 16)
  };

  Object.entries(divisions).forEach(([division, rankings]) => {
    const container = document.querySelector(`[data-ladder-content="${division}"]`);
    const count = document.querySelector(`[data-ladder-count="${division}"]`);
    if (!container) return;
    container.querySelectorAll(".ladder-row,.ladder-table__empty").forEach(row => row.remove());
    if (count) count.textContent = rankings.length ? `${rankings.length} ranked pairs` : "Rankings pending";
    if (!rankings.length) {
      const empty = element("div", "ladder-table__empty");
      empty.append(element("strong", "", "Initial rankings pending"), element("p", "", "Pairs will be seeded by their combined Playtomic profile rating."));
      container.append(empty);
      return;
    }
    rankings.forEach(entry => {
      const row = element("div", "ladder-row");
      const rank = element("span", "ladder-row__rank", entry.rank);
      const pair = element("span", "ladder-row__pair");
      pair.append(element("strong", "", `${entry.player1} & ${entry.player2}`));
      if (entry.rating1 || entry.rating2) pair.append(element("small", "", `${entry.rating1 || "–"} + ${entry.rating2 || "–"}`));
      const movement = ["⬆", "⬇"].includes(entry.movement) ? entry.movement : "-";
      const movementLabel = movement === "⬆" ? "Moved up" : movement === "⬇" ? "Moved down" : "No movement";
      const status = element("span", `ladder-row__status ladder-row__status--${movement === "⬆" ? "up" : movement === "⬇" ? "down" : "same"}`, movement);
      status.setAttribute("aria-label", movementLabel);
      status.title = movementLabel;
      row.append(rank, pair, element("strong", "ladder-row__rating", entry.combined || "–"), status);
      container.append(row);
    });
  });
}

function setSyncStatus(message, state) {
  const target = document.querySelector("[data-challenger-sync]");
  if (!target) return;
  target.textContent = message;
  target.dataset.state = state;
}

async function refreshChallengerSheet() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  setSyncStatus("Refreshing scheduled games, results and rankings…", "loading");
  const [schedule, results, rankings] = await Promise.allSettled([
    loadTable(SHEETS.schedule),
    loadTable(SHEETS.results),
    loadTable(SHEETS.rankings)
  ]);

  let loaded = 0;
  if (schedule.status === "fulfilled") { renderSchedule(schedule.value); loaded += 1; }
  if (results.status === "fulfilled") { renderResults(results.value); loaded += 1; }
  if (rankings.status === "fulfilled") { renderRankings(rankings.value); loaded += 1; }

  if (loaded === 3) {
    const time = new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    setSyncStatus(`Live sheet updated at ${time}`, "success");
  } else if (loaded) {
    setSyncStatus("Some live sheet data is temporarily unavailable. Retrying automatically.", "warning");
  } else {
    setSyncStatus("Live sheet is temporarily unavailable. Retrying automatically.", "error");
  }
  refreshInProgress = false;
}

function initialiseChallengerSheet() {
  refreshChallengerSheet();
  window.setInterval(() => {
    if (!document.hidden) refreshChallengerSheet();
  }, REFRESH_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshChallengerSheet();
  });
}

initialiseChallengerSheet();
