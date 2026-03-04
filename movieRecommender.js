const DEFAULT_MOVIE_DATASET = "assets/data/top-rated-movies-2026.csv";

const loadMovieDataBtn = document.getElementById("loadMovieDataBtn");
const movieFileInput = document.getElementById("movieFileInput");
const movieDataStatus = document.getElementById("movieDataStatus");
const movieForm = document.getElementById("movieForm");
const movieType = document.getElementById("movieType");
const movieGenre = document.getElementById("movieGenre");
const movieMinRating = document.getElementById("movieMinRating");
const movieMaxRuntime = document.getElementById("movieMaxRuntime");
const movieYearFrom = document.getElementById("movieYearFrom");
const movieYearTo = document.getElementById("movieYearTo");
const movieKeyword = document.getElementById("movieKeyword");
const recommendMovieBtn = document.getElementById("recommendMovieBtn");
const surpriseMovieBtn = document.getElementById("surpriseMovieBtn");
const movieRecommendStatus = document.getElementById("movieRecommendStatus");
const movieResult = document.getElementById("movieResult");
const movieAlternativesWrap = document.getElementById("movieAlternativesWrap");
const movieAlternatives = document.getElementById("movieAlternatives");

let movies = [];

const COLUMN_ALIASES = {
  title: ["title", "movietitle", "seriestitle", "name", "film", "movie"],
  year: ["year", "releasedyear", "releaseyear", "releasedate", "yearreleased"],
  certificate: ["certificate", "rated", "maturityrating", "contentrating", "agecertification"],
  rating: ["rating", "imdbrating", "voteaverage", "score", "tmdb"],
  votes: ["votes", "votecount", "numvotes", "noofvotes", "imdbvotes"],
  runtime: ["runtime", "duration", "durationmin", "runtimeminutes", "runtimeinminutes"],
  genres: ["genre", "genres", "genrelist", "type"],
  overview: ["overview", "description", "summary", "plot", "synopsis"],
  stars: ["stars", "cast", "actors", "starring", "maincast"],
  language: ["language", "originallanguage", "lang"],
};

function setMovieDataStatus(message, isError = false) {
  if (!movieDataStatus) return;
  movieDataStatus.textContent = message;
  movieDataStatus.classList.toggle("error", isError);
}

function setMovieRecommendStatus(message, isError = false) {
  if (!movieRecommendStatus) return;
  movieRecommendStatus.textContent = message;
  movieRecommendStatus.classList.toggle("error", isError);
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function parseYear(value) {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function inferTitleType(certificate) {
  const cert = String(certificate || "").trim().toUpperCase();
  if (cert.startsWith("TV")) {
    return "tv";
  }
  return "movie";
}

function splitGenres(value) {
  return String(value || "")
    .split(/[,|;/]/)
    .map((genre) => genre.trim())
    .filter(Boolean);
}

function findValue(map, aliases) {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (map.has(key)) {
      const value = map.get(key);
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
}

function looksLikeHeaderRow(title, yearRaw, ratingRaw, votesRaw, runtimeRaw, genresRaw) {
  const values = [title, yearRaw, ratingRaw, votesRaw, runtimeRaw, genresRaw]
    .map((value) => normalizeKey(value));
  const headerTokens = new Set([
    "title",
    "year",
    "rating",
    "votes",
    "duration",
    "runtime",
    "genre",
    "genres",
  ]);
  const matchedHeaders = values.filter((value) => headerTokens.has(value)).length;
  return matchedHeaders >= 3;
}

function normalizeMovieRow(row) {
  const normalized = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    normalized.set(normalizeKey(key), value);
  });

  const title = findValue(normalized, COLUMN_ALIASES.title);
  if (!title) return null;

  const yearRaw = findValue(normalized, COLUMN_ALIASES.year);
  const certificate = findValue(normalized, COLUMN_ALIASES.certificate);
  const ratingRaw = findValue(normalized, COLUMN_ALIASES.rating);
  const votesRaw = findValue(normalized, COLUMN_ALIASES.votes);
  const runtimeRaw = findValue(normalized, COLUMN_ALIASES.runtime);
  const genresRaw = findValue(normalized, COLUMN_ALIASES.genres);
  const overview = findValue(normalized, COLUMN_ALIASES.overview);
  const stars = findValue(normalized, COLUMN_ALIASES.stars);
  const language = findValue(normalized, COLUMN_ALIASES.language);

  if (looksLikeHeaderRow(title, yearRaw, ratingRaw, votesRaw, runtimeRaw, genresRaw)) {
    return null;
  }

  const genres = splitGenres(genresRaw);
  const rating = parseNumber(ratingRaw);
  const votes = parseNumber(votesRaw);
  const runtime = parseNumber(runtimeRaw);
  const year = parseYear(yearRaw);
  const titleType = inferTitleType(certificate);

  return {
    title,
    titleType,
    year,
    rating,
    votes,
    runtime,
    genres,
    overview,
    certificate: certificate || "",
    stars: stars || "",
    language: language || "Unknown",
  };
}

function fillSelectOptions(selectEl, values, includeAny = true) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  if (includeAny) {
    const anyOption = document.createElement("option");
    anyOption.value = "";
    anyOption.textContent = "Any";
    selectEl.appendChild(anyOption);
  }
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });
  selectEl.disabled = false;
}

function enableMovieForm() {
  recommendMovieBtn.disabled = false;
  surpriseMovieBtn.disabled = false;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function movieMatchesFilters(movie, filters) {
  if (filters.type && movie.titleType !== filters.type) {
    return false;
  }
  if (filters.genre && !movie.genres.some((genre) => genre.toLowerCase() === filters.genre.toLowerCase())) {
    return false;
  }
  if (filters.minRating !== null && (movie.rating === null || movie.rating < filters.minRating)) {
    return false;
  }
  if (filters.maxRuntime !== null && (movie.runtime === null || movie.runtime > filters.maxRuntime)) {
    return false;
  }
  if (filters.yearFrom !== null && (movie.year === null || movie.year < filters.yearFrom)) {
    return false;
  }
  if (filters.yearTo !== null && (movie.year === null || movie.year > filters.yearTo)) {
    return false;
  }
  if (filters.keyword) {
    const haystack = `${movie.title} ${movie.overview} ${movie.genres.join(" ")} ${movie.stars}`.toLowerCase();
    if (!haystack.includes(filters.keyword.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function scoreMovie(movie, filters) {
  let score = 0;
  score += (movie.rating || 0) * 11;
  score += Math.log10((movie.votes || 0) + 1) * 4.4;

  if (filters.genre && movie.genres.some((genre) => genre.toLowerCase() === filters.genre.toLowerCase())) {
    score += 9;
  }
  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    const text = `${movie.title} ${movie.overview} ${movie.genres.join(" ")} ${movie.stars}`.toLowerCase();
    if (text.includes(keyword)) {
      score += 8;
    }
  }

  return score;
}

function weightedPick(items) {
  if (!items.length) return null;
  const minScore = Math.min(...items.map((item) => item.score));
  const weighted = items.map((item) => ({
    ...item,
    weight: Math.max(1, item.score - minScore + 1),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let target = Math.random() * total;
  for (const item of weighted) {
    target -= item.weight;
    if (target <= 0) return item;
  }
  return weighted[weighted.length - 1];
}

function uniformPick(items) {
  if (!items.length) return null;
  const idx = Math.floor(Math.random() * items.length);
  return items[idx];
}

function randomSubset(items, limit) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, limit));
}

function renderMovieResult(primary, alternatives, candidateCount) {
  if (!movieResult || !movieAlternatives || !movieAlternativesWrap) return;

  const yearText = primary.year ? String(primary.year) : "Unknown year";
  const typeText = primary.titleType === "tv" ? "TV Show" : "Movie";
  const runtimeText = primary.runtime ? `${Math.round(primary.runtime)} mins` : "Unknown runtime";
  const certificateText = primary.certificate || "NR";
  const ratingText = primary.rating !== null ? primary.rating.toFixed(1) : "N/A";
  const votesText = primary.votes !== null ? primary.votes.toLocaleString() : "N/A";
  const genresText = primary.genres.length ? primary.genres.join(", ") : "Unspecified";
  const overview = primary.overview || "No overview available in dataset.";
  const starsText = primary.stars ? primary.stars.replace(/[\[\]'"]/g, "").trim() : "";

  movieResult.innerHTML = `
    <h3>${escapeHtml(primary.title)}</h3>
    <p class="movie-result-meta">
      <span>${escapeHtml(typeText)}</span>
      <span>${escapeHtml(yearText)}</span>
      <span>${escapeHtml(runtimeText)}</span>
      <span>${escapeHtml(certificateText)}</span>
      <span>Rating: ${escapeHtml(ratingText)}</span>
      <span>Votes: ${escapeHtml(votesText)}</span>
    </p>
    <p class="movie-result-genres"><strong>Genres:</strong> ${escapeHtml(genresText)}</p>
    ${starsText ? `<p class="movie-result-genres"><strong>Stars:</strong> ${escapeHtml(starsText)}</p>` : ""}
    <p class="movie-result-overview">${escapeHtml(overview)}</p>
  `;
  movieResult.hidden = false;

  movieAlternatives.innerHTML = "";
  alternatives.forEach((movie) => {
    const item = document.createElement("li");
    item.textContent = `${movie.title}${movie.year ? ` (${movie.year})` : ""}`;
    movieAlternatives.appendChild(item);
  });
  movieAlternativesWrap.hidden = alternatives.length === 0;

  setMovieRecommendStatus(`Found ${candidateCount} matching title(s).`);
}

function getFilters() {
  const minRating = parseNumber(movieMinRating?.value);
  const maxRuntime = parseNumber(movieMaxRuntime?.value);
  const yearFrom = parseNumber(movieYearFrom?.value);
  const yearTo = parseNumber(movieYearTo?.value);

  return {
    type: String(movieType?.value || "").trim(),
    genre: String(movieGenre?.value || "").trim(),
    minRating: minRating !== null ? minRating : null,
    maxRuntime: maxRuntime !== null ? maxRuntime : null,
    yearFrom: yearFrom !== null ? Math.round(yearFrom) : null,
    yearTo: yearTo !== null ? Math.round(yearTo) : null,
    keyword: String(movieKeyword?.value || "").trim(),
  };
}

function recommendMovie() {
  if (!movies.length) {
    setMovieRecommendStatus("Load the dataset first.", true);
    return;
  }

  const filters = getFilters();
  const matched = movies.filter((movie) => movieMatchesFilters(movie, filters));
  if (!matched.length) {
    movieResult.hidden = true;
    movieAlternativesWrap.hidden = true;
    setMovieRecommendStatus("No titles matched your filters. Try relaxing them.", true);
    return;
  }

  const ranked = matched
    .map((movie) => ({ ...movie, score: scoreMovie(movie, filters) }))
    .sort((a, b) => b.score - a.score);

  const poolSize = Math.min(35, ranked.length);
  const pool = ranked.slice(0, poolSize);
  const picked = weightedPick(pool);
  if (!picked) {
    setMovieRecommendStatus("Unable to generate a recommendation right now.", true);
    return;
  }

  const alternatives = ranked
    .filter((movie) => movie.title !== picked.title)
    .slice(0, 5);

  renderMovieResult(picked, alternatives, matched.length);
}

function recommendSurprise() {
  if (!movies.length) {
    setMovieRecommendStatus("Load the dataset first.", true);
    return;
  }

  const selectedType = String(movieType?.value || "").trim();
  const pool = selectedType
    ? movies.filter((movie) => movie.titleType === selectedType)
    : movies;

  if (!pool.length) {
    setMovieRecommendStatus("No titles available for the selected type.", true);
    movieResult.hidden = true;
    movieAlternativesWrap.hidden = true;
    return;
  }

  const picked = uniformPick(pool);
  if (!picked) {
    setMovieRecommendStatus("Unable to generate a random recommendation right now.", true);
    return;
  }

  const alternatives = randomSubset(
    pool.filter((movie) => movie.title !== picked.title),
    5
  );

  renderMovieResult(picked, alternatives, pool.length);
  const scopeLabel = selectedType === "tv" ? "TV shows" : selectedType === "movie" ? "movies" : "titles";
  setMovieRecommendStatus(`Uniform random pick from ${pool.length} ${scopeLabel}.`);
}

async function parseCsvAndLoad(csvText, sourceLabel) {
  if (typeof Papa === "undefined") {
    setMovieDataStatus("CSV parser library failed to load. Please refresh.", true);
    return;
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    delimiter: "",
    delimitersToGuess: [",", "\t", ";", "|"],
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim().replace(/^\uFEFF/, ""),
  });

  const normalized = (parsed.data || [])
    .map((row) => normalizeMovieRow(row))
    .filter(Boolean);

  if (!normalized.length) {
    setMovieDataStatus("No valid movie rows found. Check your CSV headers/content.", true);
    return;
  }

  movies = normalized;

  const genres = Array.from(
    new Set(
      movies.flatMap((movie) => movie.genres).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  fillSelectOptions(movieGenre, genres, true);
  enableMovieForm();

  setMovieDataStatus(`Loaded ${movies.length.toLocaleString()} titles from ${sourceLabel}.`);
  setMovieRecommendStatus("Dataset loaded. Set filters and click Recommend.");
}

async function loadDatasetFromSite() {
  setMovieDataStatus("Loading dataset from site...");
  try {
    const response = await fetch(DEFAULT_MOVIE_DATASET, { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const csvText = await response.text();
    await parseCsvAndLoad(csvText, DEFAULT_MOVIE_DATASET);
  } catch (error) {
    setMovieDataStatus(
      `Could not load ${DEFAULT_MOVIE_DATASET}. Upload your CSV instead. (${error.message})`,
      true
    );
  }
}

if (loadMovieDataBtn) {
  loadMovieDataBtn.addEventListener("click", loadDatasetFromSite);
}

if (movieFileInput) {
  movieFileInput.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    setMovieDataStatus(`Reading ${file.name}...`);
    try {
      const text = await file.text();
      await parseCsvAndLoad(text, file.name);
    } catch (error) {
      setMovieDataStatus(`Failed to read file: ${error.message}`, true);
    }
  });
}

if (movieForm) {
  movieForm.addEventListener("submit", (event) => {
    event.preventDefault();
    recommendMovie();
  });
}

if (surpriseMovieBtn) {
  surpriseMovieBtn.addEventListener("click", () => {
    recommendSurprise();
  });
}
