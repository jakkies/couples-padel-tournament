import officialResultsSnapshot from "./official-results-snapshot.js?v=2";

// Static event content with a bundled fallback for the live tournament feed.
export const API_CONFIG = {
  liveScoreEndpoint: "",
  refreshInterval: 15000,
  useMockData: true,
  timeout: 8000
};

export const eventData = {
  id: "playpadel-challenger-series", name: "PlayPadel Challenger Series", competition: "Round Robin & Knock-out",
  city: "Multiple venues", country: "South Africa", status: "upcoming",
  officialUrl: globalThis.PadeuceFeedConfig?.get?.().scheduleUrl ||
    "https://padeuce.com/club/playpadel-challenger/tournament/challenger-series/results"
};

export const liveMatches = [{
  id: "challenger-preview", status: "upcoming", court: "Court 1", division: "Open",
  round: "Series round", format: "Best of 3", currentSet: "Awaiting draw",
  updatedAt: new Date().toISOString(),
  teams: [
    { names: ["Pair to be confirmed"], sets: [], current: 0, serving: false },
    { names: ["Pair to be confirmed"], sets: [], current: 0, serving: false }
  ]
}];

export const fixtures = officialResultsSnapshot.fixtures;
export const standings = officialResultsSnapshot.standings;

export const competingTeams = [
  {business:"Competitive matches",logo:"challenger",players:["Competitive matches","Test your game under pressure"]},
  {business:"Series rankings",logo:"challenger",players:["Series rankings","Turn results into momentum"]},
  {business:"Round-robin play",logo:"challenger",players:["Round-robin play","More matches, more opportunity"]},
  {business:"Knock-out draw",logo:"challenger",players:["Knock-out draw","Earn your route to the title"]},
  {business:"Live scoring",logo:"challenger",players:["Live scoring","Follow every point on Padeuce"]},
  {business:"Player pathway",logo:"challenger",players:["Player pathway","A platform for ambitious pairs"]},
  {business:"Multiple venues",logo:"challenger",players:["Multiple venues","Series action across PlayPadel"]},
  {business:"Entries opening soon",logo:"challenger",players:["Entries opening soon","Teams announced after registration"]}
];

export const results = [];
