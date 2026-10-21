(function initialiseFeedConfig(root) {
  "use strict";

  const STORAGE_KEY = "playpadel-challenger-series-feed-settings-v2";
  const CHANGE_EVENT = "padeuce:feed-config-change";
  const defaults = Object.freeze({
    court1Url: "https://padeuce.com/club/5zvsITM2pqsDhMVL3/1",
    court2Url: "https://padeuce.com/club/5zvsITM2pqsDhMVL3/2",
    court3Url: "https://padeuce.com/club/5zvsITM2pqsDhMVL3/3",
    court4Url: "https://padeuce.com/club/5zvsITM2pqsDhMVL3/4",
    scheduleUrl: "https://padeuce.com/club/playpadel-challenger/tournament/challenger-series/results",
    standingsUrl: "https://padeuce.com/club/playpadel-challenger/tournament/challenger-series/results"
  });

  function storage() {
    try {
      const candidate = root.localStorage;
      const probe = `${STORAGE_KEY}-probe`;
      candidate.setItem(probe, "1");
      candidate.removeItem(probe);
      return candidate;
    } catch {
      return null;
    }
  }

  function normaliseUrl(value) {
    const url = new URL(String(value || "").trim());
    if (!/(^|\.)padeuce\.com$/i.test(url.hostname)) throw new Error("Use a padeuce.com URL.");
    url.hash = "";
    return url.toString();
  }

  function parseCourtUrl(value) {
    try {
      const url = new URL(normaliseUrl(value));
      const match = url.pathname.match(/^\/club\/([^/]+)\/([^/]+)\/?$/i);
      if (!match || /^tournament$/i.test(match[2])) return null;
      return {
        url: url.toString(),
        clubId: decodeURIComponent(match[1]),
        court: decodeURIComponent(match[2])
      };
    } catch {
      return null;
    }
  }

  function parseTournamentUrl(value) {
    try {
      const url = new URL(normaliseUrl(value));
      const match = url.pathname.match(/^\/club\/([^/]+)\/tournament\/([^/]+)\/results\/?$/i);
      if (!match) return null;
      return {
        url: url.toString(),
        clubId: decodeURIComponent(match[1]),
        tournamentId: decodeURIComponent(match[2])
      };
    } catch {
      return null;
    }
  }

  function validate(values) {
    const supplied = values && typeof values === "object" ? values : {};
    const legacyCourtOneKey = "centre" + "CourtUrl";
    const candidate = {
      ...defaults,
      ...supplied,
      court1Url: supplied.court1Url || supplied[legacyCourtOneKey] || defaults.court1Url
    };
    const errors = {};
    const courtKeys = ["court1Url", "court2Url", "court3Url", "court4Url"];
    const courts = Object.fromEntries(courtKeys.map(key => [key, parseCourtUrl(candidate[key])]));
    const schedule = parseTournamentUrl(candidate.scheduleUrl);
    const standings = parseTournamentUrl(candidate.standingsUrl);

    courtKeys.forEach((key, index) => {
      if (!courts[key]) errors[key] = "Enter a valid Padeuce court URL.";
      const current = courts[key];
      const first = courts.court1Url;
      if (current && first && current.clubId !== first.clubId) {
        errors[key] = "All court feeds must belong to the same Padeuce club.";
      }
      if (current && courtKeys.slice(0, index).some(previousKey =>
        String(courts[previousKey]?.court).toLowerCase() === String(current.court).toLowerCase())) {
        errors[key] = `Select a different court feed for Court ${index + 1}.`;
      }
    });
    if (!schedule) errors.scheduleUrl = "Enter a valid Padeuce tournament results URL.";
    if (!standings) errors.standingsUrl = "Enter a valid Padeuce tournament results URL.";

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      value: {
        court1Url: courts.court1Url?.url || candidate.court1Url,
        court2Url: courts.court2Url?.url || candidate.court2Url,
        court3Url: courts.court3Url?.url || candidate.court3Url,
        court4Url: courts.court4Url?.url || candidate.court4Url,
        scheduleUrl: schedule?.url || candidate.scheduleUrl,
        standingsUrl: standings?.url || candidate.standingsUrl
      },
      parsed: {
        court1: courts.court1Url,
        court2: courts.court2Url,
        court3: courts.court3Url,
        court4: courts.court4Url,
        schedule,
        standings
      }
    };
  }

  function get() {
    const store = storage();
    if (!store) return { ...defaults };
    try {
      const saved = JSON.parse(store.getItem(STORAGE_KEY) || "null");
      const result = validate(saved && typeof saved === "object" ? saved : defaults);
      return result.valid ? result.value : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  function notify(value) {
    if (typeof root.dispatchEvent !== "function" || typeof root.CustomEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent(CHANGE_EVENT, { detail: value }));
  }

  function applyLinks(scope) {
    const documentRoot = scope || root.document;
    if (!documentRoot?.querySelectorAll) return;
    const config = get();
    documentRoot.querySelectorAll("[data-feed-url]").forEach(link => {
      const key = link.dataset.feedUrl;
      if (config[key]) link.href = config[key];
    });
  }

  function save(values) {
    const result = validate(values);
    if (!result.valid) {
      const error = new Error("Some feed URLs need attention.");
      error.name = "FeedConfigValidationError";
      error.errors = result.errors;
      throw error;
    }
    const store = storage();
    if (!store) throw new Error("Browser storage is unavailable for this page.");
    store.setItem(STORAGE_KEY, JSON.stringify(result.value));
    applyLinks();
    notify(result.value);
    return result.value;
  }

  function reset() {
    const store = storage();
    if (store) store.removeItem(STORAGE_KEY);
    const value = { ...defaults };
    applyLinks();
    notify(value);
    return value;
  }

  const api = {
    STORAGE_KEY,
    CHANGE_EVENT,
    defaults,
    get,
    save,
    reset,
    validate,
    parseCourtUrl,
    parseTournamentUrl,
    applyLinks
  };

  root.PadeuceFeedConfig = api;
  if (typeof module === "object" && module.exports) module.exports = api;

  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => applyLinks(), { once: true });
    } else {
      applyLinks();
    }
  }
  if (typeof root.addEventListener === "function") {
    root.addEventListener("storage", event => {
      if (event.key !== STORAGE_KEY) return;
      const value = get();
      applyLinks();
      notify(value);
    });
  }
})(typeof window === "object" ? window : globalThis);
