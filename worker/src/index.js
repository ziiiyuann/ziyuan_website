const SOURCE_URL = "https://www.basketball-reference.com/";

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
    const teamMatch = row.match(/<a[^>]*href="\/teams\/[^"]+"[^>]*>([\s\S]*?)<\/a>/i);
    if (!teamMatch) continue;

    const scoreCells = [];
    const scoreCellRegex = /<td[^>]*class="right[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    let scoreCellMatch;
    while ((scoreCellMatch = scoreCellRegex.exec(row)) !== null) {
      scoreCells.push(toScoreValue(stripTags(scoreCellMatch[1])));
    }

    const points = scoreCells.length > 0 ? scoreCells[scoreCells.length - 1] : null;
    const quarters = scoreCells.length > 1 ? scoreCells.slice(0, -1) : [];

    teams.push({
      name: stripTags(teamMatch[1]),
      points,
      quarters,
    });
  }

  return teams;
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
    });
  }

  return games;
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
        return jsonResponse(
          {
            ok: false,
            error: `Upstream responded with ${upstream.status}`,
          },
          502,
          allowOrigin
        );
      }

      const html = await upstream.text();
      const games = extractGames(html);

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
