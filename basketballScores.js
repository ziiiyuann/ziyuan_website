const fetchScoresBtn = document.getElementById("fetchScoresBtn");
const scoresStatus = document.getElementById("scoresStatus");
const scoresList = document.getElementById("scoresList");

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

    renderScores(data.games || [], data.source || "");
  } catch (error) {
    setScoresStatus(`Could not fetch scores: ${error.message}`, true);
  } finally {
    fetchScoresBtn.disabled = false;
    fetchScoresBtn.textContent = "Fetch Latest Scores";
  }
}

if (fetchScoresBtn) {
  fetchScoresBtn.addEventListener("click", fetchScores);
}
