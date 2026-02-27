const SOURCE_URL = "https://www.basketball-reference.com/";
const NBA_SCOREBOARD_URL = "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ESPN_SCOREBOARD_URL_WEB = "https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const MAX_GAMES_WITH_QUARTERS = 12;
const TEAM_CODE_ALIASES = {
  CHO: "CHA",
  BRK: "BKN",
  PHO: "PHX",
  GSW: "GSW",
  NOP: "NOP",
  SAS: "SAS",
};

function makeCorsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function toScoreValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  return /^-?\d+$/.test(value) ? Number(value) : null;
}

function normalizeKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function canonicalTeamCode(code) {
  const normalized = normalizeKey(code);
  return TEAM_CODE_ALIASES[normalized] || normalized;
}

function makeQuarterLabelsFromCount(periodCount) {
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

function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getRecentDateKeys(days = 2) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(formatDateKey(d));
  }
  return keys;
}

function hasQuarterData(game) {
  return (game?.teams || []).some(
    (team) => Array.isArray(team?.quarters) && team.quarters.length > 0
  );
}

function getDateKeyFromBoxscoreUrl(boxscoreUrl) {
  const match = String(boxscoreUrl || "").match(/\/boxscores\/(\d{8})\w*\.html/i);
  return match ? match[1] : null;
}

function extractScoresContainer(html) {
  const scoresBlock = html.match(/<div[^>]*id="scores"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (scoresBlock) return scoresBlock[1];
  return html;
}

function parseGameStatus(segment) {
  const finalMatch = segment.match(/>(Final(?:\/OT|\/2OT|\/3OT)?)</i);
  if (finalMatch) return finalMatch[1];

  const liveMatch = segment.match(/>(\d{1,2}:\d{2}\s*[AP]M\s*ET)</i);
  if (liveMatch) return liveMatch[1];

  return "Scheduled";
}

function parseQuarterLabels(tableHtml) {
  const labelRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
  const labels = [];

  let labelMatch;
  while ((labelMatch = labelRegex.exec(tableHtml)) !== null) {
    const text = stripTags(labelMatch[1]).toUpperCase();
    if (/^\d+$/.test(text)) {
      labels.push(`Q${text}`);
      continue;
    }
    if (/^(OT|\d+OT)$/.test(text)) {
      labels.push(text);
      continue;
    }
    if (text === "T") {
      labels.push("T");
    }
  }

  if (labels.length > 0 && labels[labels.length - 1] === "T") {
    labels.pop();
  }
  return labels;
}

function parseTeams(tableHtml) {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const teams = [];

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const row = rowMatch[1];
    const teamMatch = row.match(/<a[^>]*href="\/teams\/([A-Z]{3})\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
    if (!teamMatch) continue;

    const scoreCells = [];
    const scoreCellRegex = /<td[^>]*class="right[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    let scoreCellMatch;
    while ((scoreCellMatch = scoreCellRegex.exec(row)) !== null) {
      const parsedValue = toScoreValue(stripTags(scoreCellMatch[1]));
      if (parsedValue !== null) {
        scoreCells.push(parsedValue);
      }
    }

    const points = scoreCells.length > 0 ? scoreCells[scoreCells.length - 1] : null;
    const quarters = scoreCells.length > 1 ? scoreCells.slice(0, -1) : [];

    teams.push({
      code: canonicalTeamCode(teamMatch[1]),
      name: stripTags(teamMatch[2]),
      points,
      quarters,
    });
  }

  return teams;
}

function parseLineScoreFromBoxscore(html) {
  const lineScoreMatch = html.match(
    /<table[^>]*(?:id="line_score"|class="[^"]*linescore[^"]*")[^>]*>([\s\S]*?)<\/table>/i
  );
  if (!lineScoreMatch) return null;

  const tableHtml = lineScoreMatch[0];
  const teams = parseTeams(tableHtml).slice(0, 2);
  if (teams.length < 2) return null;

  const quarterLabels = parseQuarterLabels(tableHtml);
  return { teams, quarterLabels };
}

function extractGames(html) {
  const content = extractScoresContainer(html);
  const tableRegex = /<table[^>]*class="teams"[^>]*>([\s\S]*?)<\/table>/gi;
  const games = [];

  let tableMatch;
  while ((tableMatch = tableRegex.exec(content)) !== null) {
    const tableHtml = tableMatch[0];
    const afterTable = content.slice(tableMatch.index, tableMatch.index + tableHtml.length + 520);

    const teams = parseTeams(tableHtml);
    if (teams.length < 2) continue;
    const quarterLabels = parseQuarterLabels(tableHtml);

    const boxscoreMatch = afterTable.match(/href="(\/boxscores\/[^"]+)"/i);
    const boxscoreUrl = boxscoreMatch ? `https://www.basketball-reference.com${boxscoreMatch[1]}` : null;

    games.push({
      status: parseGameStatus(afterTable),
      teams: teams.slice(0, 2),
      quarterLabels,
      boxscoreUrl,
      dateKey: getDateKeyFromBoxscoreUrl(boxscoreUrl),
    });
  }

  return games;
}

function parseNbaTeam(team) {
  const periods = Array.isArray(team?.periods)
    ? team.periods.map((period) => toScoreValue(period?.score))
    : [];
  return {
    code: canonicalTeamCode(team?.teamTricode),
    name: [team?.teamCity, team?.teamName].filter(Boolean).join(" ").trim(),
    points: toScoreValue(team?.score),
    quarters: periods,
  };
}

async function fetchNbaScoreboardMap() {
  try {
    const upstream = await fetch(NBA_SCOREBOARD_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScoreFetcher/1.0)",
        Accept: "application/json",
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 60,
      },
    });
    if (!upstream.ok) return null;

    const data = await upstream.json();
    const nbaGames = Array.isArray(data?.scoreboard?.games) ? data.scoreboard.games : [];
    const gameMap = new Map();

    nbaGames.forEach((game) => {
      const awayTeam = parseNbaTeam(game?.awayTeam);
      const homeTeam = parseNbaTeam(game?.homeTeam);
      if (!awayTeam.code || !homeTeam.code) return;

      const codes = [awayTeam.code, homeTeam.code].sort();
      const key = codes.join("|");
      const periodCount = Math.max(awayTeam.quarters.length, homeTeam.quarters.length);
      const quarterLabels = makeQuarterLabelsFromCount(periodCount);

      gameMap.set(key, {
        status: String(game?.gameStatusText || "").trim() || null,
        quarterLabels,
        teamsByCode: {
          [awayTeam.code]: awayTeam,
          [homeTeam.code]: homeTeam,
        },
      });
    });

    return gameMap;
  } catch {
    return null;
  }
}

function parseEspnTeam(competitor) {
  const code = canonicalTeamCode(competitor?.team?.abbreviation);
  const points = toScoreValue(competitor?.score);
  const quarters = Array.isArray(competitor?.linescores)
    ? competitor.linescores.map((item) => toScoreValue(item?.displayValue ?? item?.value))
    : [];
  return {
    code,
    name: String(competitor?.team?.displayName || "").trim(),
    points,
    quarters,
  };
}

async function fetchEspnScoreboardMapByDate(dateKey) {
  if (!/^\d{8}$/.test(String(dateKey || ""))) return null;
  const baseUrls = [ESPN_SCOREBOARD_URL, ESPN_SCOREBOARD_URL_WEB];
  for (const baseUrl of baseUrls) {
    try {
      const upstream = await fetch(`${baseUrl}?dates=${dateKey}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ScoreFetcher/1.0)",
          Accept: "application/json",
          Referer: "https://www.espn.com/",
          Origin: "https://www.espn.com",
        },
        cf: {
          cacheEverything: true,
          cacheTtl: 120,
        },
      });
      if (!upstream.ok) continue;

      const data = await upstream.json();
      const events = Array.isArray(data?.events) ? data.events : [];
      const gameMap = new Map();

      events.forEach((event) => {
        const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
        const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
        const away = competitors.find((team) => team?.homeAway === "away");
        const home = competitors.find((team) => team?.homeAway === "home");
        if (!away || !home) return;

        const awayTeam = parseEspnTeam(away);
        const homeTeam = parseEspnTeam(home);
        if (!awayTeam.code || !homeTeam.code) return;

        const key = [awayTeam.code, homeTeam.code].sort().join("|");
        const periodCount = Math.max(awayTeam.quarters.length, homeTeam.quarters.length);
        const quarterLabels = makeQuarterLabelsFromCount(periodCount);

        gameMap.set(key, {
          status:
            String(event?.status?.type?.shortDetail || event?.status?.type?.description || "").trim() ||
            null,
          quarterLabels,
          orderedCodes: [awayTeam.code, homeTeam.code],
          teamsByCode: {
            [awayTeam.code]: awayTeam,
            [homeTeam.code]: homeTeam,
          },
        });
      });

      if (gameMap.size > 0) {
        return gameMap;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchEspnFallbackGames() {
  const allGames = [];

  for (const dateKey of getRecentDateKeys(2)) {
    const map = await fetchEspnScoreboardMapByDate(dateKey);
    if (!map) continue;

    for (const gameData of map.values()) {
      const awayCode = gameData?.orderedCodes?.[0];
      const homeCode = gameData?.orderedCodes?.[1];
      const awayTeam = awayCode ? gameData.teamsByCode[awayCode] : null;
      const homeTeam = homeCode ? gameData.teamsByCode[homeCode] : null;
      if (!awayTeam || !homeTeam) continue;

      allGames.push({
        status: gameData.status || "Scheduled",
        teams: [awayTeam, homeTeam],
        quarterLabels: Array.isArray(gameData.quarterLabels) ? gameData.quarterLabels : [],
        boxscoreUrl: null,
        dateKey,
      });
    }
  }

  return allGames;
}

async function enrichGamesWithQuarterScores(games) {
  const boxscoreEnriched = await Promise.all(
    games.map(async (game, index) => {
      if (!game?.boxscoreUrl || index >= MAX_GAMES_WITH_QUARTERS) {
        return game;
      }

      try {
        const upstream = await fetch(game.boxscoreUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ScoreFetcher/1.0)",
          },
          cf: {
            cacheEverything: true,
            cacheTtl: 120,
          },
        });
        if (!upstream.ok) return game;

        const html = await upstream.text();
        const lineScore = parseLineScoreFromBoxscore(html);
        if (!lineScore) return game;

        const hasQuarterValues = lineScore.teams.some(
          (team) => Array.isArray(team.quarters) && team.quarters.length > 0
        );
        if (!hasQuarterValues) return game;

        return {
          ...game,
          teams: lineScore.teams,
          quarterLabels: lineScore.quarterLabels,
        };
      } catch {
        return game;
      }
    })
  );

  const needsFallback = boxscoreEnriched.some((game) => !hasQuarterData(game));
  if (!needsFallback) {
    return boxscoreEnriched;
  }

  const dateKeys = [
    ...new Set(
      boxscoreEnriched
        .filter((game) => !hasQuarterData(game))
        .map((game) => game?.dateKey)
        .filter(Boolean)
    ),
  ];
  const espnMapsByDate = new Map();
  await Promise.all(
    dateKeys.map(async (dateKey) => {
      const map = await fetchEspnScoreboardMapByDate(dateKey);
      if (map) {
        espnMapsByDate.set(dateKey, map);
      }
    })
  );

  const espnEnriched = boxscoreEnriched.map((game) => {
    if (hasQuarterData(game)) return game;

    const espnMap = espnMapsByDate.get(game?.dateKey);
    if (!espnMap) return game;

    const teamCodes = (game?.teams || []).map((team) => canonicalTeamCode(team?.code)).filter(Boolean);
    if (teamCodes.length < 2) return game;

    const key = [...teamCodes].sort().join("|");
    const espnGame = espnMap.get(key);
    if (!espnGame) return game;

    const mappedTeams = (game.teams || []).map((team) => {
      const code = canonicalTeamCode(team?.code);
      const espnTeam = espnGame.teamsByCode[code];
      if (!espnTeam) return team;
      return {
        ...team,
        points: espnTeam.points,
        quarters: espnTeam.quarters,
      };
    });

    if (!mappedTeams.some((team) => Array.isArray(team?.quarters) && team.quarters.length > 0)) {
      return game;
    }

    return {
      ...game,
      status: espnGame.status || game.status,
      teams: mappedTeams,
      quarterLabels: espnGame.quarterLabels,
    };
  });

  if (!espnEnriched.some((game) => !hasQuarterData(game))) {
    return espnEnriched;
  }

  const nbaMap = await fetchNbaScoreboardMap();
  if (!nbaMap) {
    return espnEnriched;
  }

  return espnEnriched.map((game) => {
    if (hasQuarterData(game)) return game;

    const teamCodes = (game?.teams || []).map((team) => canonicalTeamCode(team?.code)).filter(Boolean);
    if (teamCodes.length < 2) return game;

    const key = [...teamCodes].sort().join("|");
    const nbaGame = nbaMap.get(key);
    if (!nbaGame) return game;

    const mappedTeams = (game.teams || []).map((team) => {
      const code = canonicalTeamCode(team?.code);
      const nbaTeam = nbaGame.teamsByCode[code];
      if (!nbaTeam) return team;
      return {
        ...team,
        points: nbaTeam.points,
        quarters: nbaTeam.quarters,
      };
    });

    const hasQuarterData = mappedTeams.some(
      (team) => Array.isArray(team?.quarters) && team.quarters.length > 0
    );
    if (!hasQuarterData) return game;

    return {
      ...game,
      status: nbaGame.status || game.status,
      teams: mappedTeams,
      quarterLabels: nbaGame.quarterLabels,
    };
  });
}

function jsonResponse(body, status = 200, origin = "*") {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...makeCorsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowOrigin = env.ALLOW_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: makeCorsHeaders(allowOrigin),
      });
    }

    if (url.pathname !== "/scores") {
      return jsonResponse(
        {
          ok: true,
          message: "Use GET /scores",
        },
        200,
        allowOrigin
      );
    }

    try {
      const upstream = await fetch(SOURCE_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ScoreFetcher/1.0)",
        },
        cf: {
          cacheEverything: true,
          cacheTtl: 90,
        },
      });

      if (!upstream.ok) {
        const fallbackGames = await fetchEspnFallbackGames();
        if (fallbackGames.length > 0) {
          return jsonResponse(
            {
              ok: true,
              source: ESPN_SCOREBOARD_URL,
              fetchedAt: new Date().toISOString(),
              gameCount: fallbackGames.length,
              fallbackReason: `Basketball Reference upstream responded with ${upstream.status}`,
              games: fallbackGames,
            },
            200,
            allowOrigin
          );
        }
        return jsonResponse(
          {
            ok: true,
            source: SOURCE_URL,
            fetchedAt: new Date().toISOString(),
            gameCount: 0,
            fallbackReason: `Basketball Reference upstream responded with ${upstream.status}`,
            games: [],
          },
          200,
          allowOrigin
        );
      }

      const html = await upstream.text();
      let games = await enrichGamesWithQuarterScores(extractGames(html));
      if (games.length === 0) {
        const fallbackGames = await fetchEspnFallbackGames();
        if (fallbackGames.length > 0) {
          games = fallbackGames;
        }
      }

      return jsonResponse(
        {
          ok: true,
          source: SOURCE_URL,
          fetchedAt: new Date().toISOString(),
          gameCount: games.length,
          games,
        },
        200,
        allowOrigin
      );
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: "Failed to fetch or parse source page.",
          detail: String(error?.message || error),
        },
        500,
        allowOrigin
      );
    }
  },
};
