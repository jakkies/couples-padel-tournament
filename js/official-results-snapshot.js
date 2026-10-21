// Empty fallback used until the Challenger Series feed is configured.
const resultsUrl = globalThis.PadeuceFeedConfig?.get?.().scheduleUrl ||
  "https://padeuce.com/club/playpadel-challenger/tournament/challenger-series/results";

export default {
  source: resultsUrl,
  generatedAt: "2026-08-13T00:00:00.000Z",
  date: "2026-08-13",
  stage: "Series setup",
  stages: [],
  standingsStages: [],
  standings: [],
  fixtures: [],
  isTournamentEmpty: true
};
