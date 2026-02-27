const fetchScoresBtn = document.getElementById("fetchScoresBtn");
const scoresStatus = document.getElementById("scoresStatus");
const scoresList = document.getElementById("scoresList");
const ESPN_SCOREBOARD_ENDPOINTS = [
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
];

function setScoresStatus(message, isError = false) {
  if (!scoresStatus) return;
  scoresStatus.textContent = message;
  scoresStatus.classList.toggle("error", isError);
}

function clearScores() {
  if (!scoresList) return;
  scoresList.innerHTML = "";
}

function normalizeScore(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function toNumericScore(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

function formatDateKey(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function makeQuarterLabels(periodCount) {
  const labels = [];
  for (let i = 0; i < periodCount; i += 1) {
    if (i < 4) {
      labels.push(`Q${i + 1}`);
    } else if (i === 4) {
      labels.push("OT");
    } else {
      labels.push(`${i - 3}OT`);
    }
  }
  return labels;
}

function parseEspnTeam(competitor) {
  const lines = Array.isArray(competitor?.linescores)
    ? competitor.linescores.map((line) => toNumericScore(line?.displayValue ?? line?.value))
    : [];
  return {
    code: String(competitor?.team?.abbreviation || "").trim(),
    name: String(competitor?.team?.displayName || competitor?.team?.name || "Team").trim(),
    points: toNumericScore(competitor?.score),
    quarters: lines,
  };
}

function parseEspnGames(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const games = [];

  events.forEach((event) => {
    const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
    const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
    const awayComp = competitors.find((team) => team?.homeAway === "away");
    const homeComp = competitors.find((team) => team?.homeAway === "home");
    if (!awayComp || !homeComp) return;

    const awayTeam = parseEspnTeam(awayComp);
    const homeTeam = parseEspnTeam(homeComp);
    const periodCount = Math.max(awayTeam.quarters.length, homeTeam.quarters.length);

    games.push({
      status:
        String(event?.status?.type?.shortDetail || event?.status?.type?.description || "Scheduled").trim(),
      teams: [awayTeam, homeTeam],
      quarterLabels: makeQuarterLabels(periodCount),
      boxscoreUrl: null,
    });
  });

  return games;
}

function gameHasQuarterData(game) {
  return (game?.teams || []).some((team) => Array.isArray(team?.quarters) && team.quarters.length > 0);
}

async function fetchEspnFallbackGames() {
  const dateKeys = [formatDateKey(0), formatDateKey(-1)];

  for (const dateKey of dateKeys) {
    for (const endpoint of ESPN_SCOREBOARD_ENDPOINTS) {
      try {
        const response = await fetch(`${endpoint}?dates=${dateKey}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });
        if (!response.ok) continue;

        const payload = await response.json();
        const games = parseEspnGames(payload);
        if (games.length > 0) {
          return {
            games,
            source: `${endpoint}?dates=${dateKey}`,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return {
    games: [],
    source: "",
  };
}

function normalizeScoresEndpoint(rawEndpoint) {
  try {
    const url = new URL(rawEndpoint);
    const path = url.pathname || "/";
    if (path === "/" || path === "") {
      url.pathname = "/scores";
      return url.toString();
    }
    if (!path.endsWith("/scores")) {
      url.pathname = `${path.replace(/\/+$/, "")}/scores`;
    }
    return url.toString();
  } catch {
    return rawEndpoint;
  }
}

function buildQuarterLabels(game, teams) {
  const teamList = Array.isArray(teams) ? teams : [];
  const maxQuarters = teamList.reduce((max, team) => {
    const count = Array.isArray(team?.quarters) ? team.quarters.length : 0;
    return Math.max(max, count);
  }, 0);
  if (maxQuarters === 0) {
    return [];
  }

  if (Array.isArray(game?.quarterLabels) && game.quarterLabels.length > 0) {
    return game.quarterLabels.slice(0, maxQuarters);
  }

  const labels = [];
  for (let i = 0; i < maxQuarters; i += 1) {
    if (i < 4) {
      labels.push(`Q${i + 1}`);
    } else if (i === 4) {
      labels.push("OT");
    } else {
      labels.push(`${i - 3}OT`);
    }
  }
  return labels;
}

function renderScores(games, sourceUrl) {
  if (!scoresList) return;
  clearScores();

  if (!Array.isArray(games) || games.length === 0) {
    setScoresStatus("No scores found right now. Try again later.", true);
    return;
  }

  const fragment = document.createDocumentFragment();

  games.forEach((game, index) => {
    const card = document.createElement("article");
    card.className = "score-card";

    const head = document.createElement("div");
    head.className = "score-head";

    const title = document.createElement("strong");
    title.textContent = game.status || `Game ${index + 1}`;
    head.appendChild(title);

    if (game.boxscoreUrl) {
      const link = document.createElement("a");
      link.href = game.boxscoreUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Box score";
      head.appendChild(link);
    }

    card.appendChild(head);

    const teams = Array.isArray(game.teams) ? game.teams : [];
    const quarterLabels = buildQuarterLabels(game, teams);

    const table = document.createElement("table");
    table.className = "score-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    const teamHead = document.createElement("th");
    teamHead.textContent = "Team";
    headRow.appendChild(teamHead);

    quarterLabels.forEach((label) => {
      const quarterHead = document.createElement("th");
      quarterHead.textContent = label;
      headRow.appendChild(quarterHead);
    });

    const totalHead = document.createElement("th");
    totalHead.textContent = "T";
    headRow.appendChild(totalHead);
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");
    teams.forEach((team) => {
      const row = document.createElement("tr");

      const name = document.createElement("td");
      name.className = "score-team";
      name.textContent = team.name || "Team";
      row.appendChild(name);

      quarterLabels.forEach((_, idx) => {
        const qCell = document.createElement("td");
        const value = Array.isArray(team.quarters) ? team.quarters[idx] : null;
        qCell.textContent = normalizeScore(value);
        row.appendChild(qCell);
      });

      const total = document.createElement("td");
      total.className = "score-num";
      total.textContent = normalizeScore(team.points);
      row.appendChild(total);

      tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    card.appendChild(table);
    fragment.appendChild(card);
  });

  scoresList.appendChild(fragment);

  if (sourceUrl) {
    setScoresStatus(`Loaded ${games.length} game(s). Source: ${sourceUrl}`);
  } else {
    setScoresStatus(`Loaded ${games.length} game(s).`);
  }
}

async function fetchScores() {
  if (!fetchScoresBtn) return;

  const rawEndpoint = (fetchScoresBtn.dataset.endpoint || "").trim();
  if (!rawEndpoint || rawEndpoint.includes("YOUR-WORKER-SUBDOMAIN")) {
    setScoresStatus("Set your deployed Worker URL in data-endpoint first.", true);
    return;
  }
  const endpoint = normalizeScoresEndpoint(rawEndpoint);

  fetchScoresBtn.disabled = true;
  fetchScoresBtn.textContent = "Fetching...";
  setScoresStatus("Fetching latest scores...");
  clearScores();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const fallback = await fetchEspnFallbackGames();
      if (fallback.games.length > 0) {
        renderScores(fallback.games, fallback.source);
        setScoresStatus("Worker is rate-limited right now. Loaded scores via ESPN fallback.");
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (typeof data?.message === "string" && data.message.includes("Use GET /scores")) {
      setScoresStatus("Endpoint is pointing to Worker root. Use the /scores route.", true);
      return;
    }

    if (data?.ok === false) {
      throw new Error(data.error || "Worker returned an error.");
    }

    const workerGames = Array.isArray(data.games) ? data.games : [];
    if (workerGames.length === 0 || !workerGames.some(gameHasQuarterData)) {
      const fallback = await fetchEspnFallbackGames();
      if (fallback.games.length > 0) {
        renderScores(fallback.games, fallback.source);
        setScoresStatus("Loaded scores via ESPN fallback (Worker source had no quarter data).");
        return;
      }
    }

    renderScores(workerGames, data.source || "");
  } catch (error) {
    const fallback = await fetchEspnFallbackGames();
    if (fallback.games.length > 0) {
      renderScores(fallback.games, fallback.source);
      setScoresStatus("Loaded scores via ESPN fallback.");
      return;
    }
    setScoresStatus(`Could not fetch scores: ${error.message}`, true);
  } finally {
    fetchScoresBtn.disabled = false;
    fetchScoresBtn.textContent = "Fetch Latest Scores";
  }
}

if (fetchScoresBtn) {
  fetchScoresBtn.addEventListener("click", fetchScores);
}
