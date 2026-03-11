const DEFAULT_LUNG_DATASET = "lung_cancer_dataset.csv";

const loadLungDataBtn = document.getElementById("loadLungDataBtn");
const lungFileInput = document.getElementById("lungFileInput");
const lungDataStatus = document.getElementById("lungDataStatus");
const lungForm = document.getElementById("lungForm");
const estimateRiskBtn = document.getElementById("estimateRiskBtn");
const lungEstimateStatus = document.getElementById("lungEstimateStatus");
const lungResult = document.getElementById("lungResult");
const lungCigsPerDayField = document.getElementById("lungCigsPerDayField");
const lungYearsSmokingField = document.getElementById("lungYearsSmokingField");

const lungInputs = {
  age: document.getElementById("lungAge"),
  gender: document.getElementById("lungGender"),
  smokingStatus: document.getElementById("lungSmokingStatus"),
  cigsPerDay: document.getElementById("lungCigsPerDay"),
  yearsSmoking: document.getElementById("lungYearsSmoking"),
  pollution: document.getElementById("lungPollution"),
  secondhand: document.getElementById("lungSecondhand"),
  family: document.getElementById("lungFamily"),
  chronic: document.getElementById("lungChronic"),
  asbestos: document.getElementById("lungAsbestos"),
  radon: document.getElementById("lungRadon"),
  coughBlood: document.getElementById("lungCoughBlood"),
};

let lungPatients = [];
let patientScores = [];
let datasetStats = null;

function toggleSmokingFields() {
  const smokingStatus = String(lungInputs.smokingStatus?.value || "").toLowerCase();
  const isNeverSmoked = smokingStatus.includes("never");

  if (lungCigsPerDayField) {
    lungCigsPerDayField.hidden = false;
    lungCigsPerDayField.classList.toggle("field-disabled", isNeverSmoked);
  }
  if (lungYearsSmokingField) {
    lungYearsSmokingField.hidden = false;
    lungYearsSmokingField.classList.toggle("field-disabled", isNeverSmoked);
  }

  if (lungInputs.cigsPerDay) {
    lungInputs.cigsPerDay.disabled = isNeverSmoked;
  }
  if (lungInputs.yearsSmoking) {
    lungInputs.yearsSmoking.disabled = isNeverSmoked;
  }

  if (isNeverSmoked) {
    if (lungInputs.cigsPerDay) lungInputs.cigsPerDay.value = "0";
    if (lungInputs.yearsSmoking) lungInputs.yearsSmoking.value = "0";
  }
}

function setLungDataStatus(message, isError = false) {
  if (!lungDataStatus) return;
  lungDataStatus.textContent = message;
  lungDataStatus.classList.toggle("error", isError);
}

function setLungEstimateStatus(message, isError = false) {
  if (!lungEstimateStatus) return;
  lungEstimateStatus.textContent = message;
  lungEstimateStatus.classList.toggle("error", isError);
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function boolToNum(value) {
  return String(value || "").trim().toLowerCase() === "yes" ? 1 : 0;
}

function normalizePatientRow(row) {
  const age = parseNumber(row.Age);
  const cigsPerDay = parseNumber(row.Cigarettes_Per_Day);
  const yearsSmoking = parseNumber(row.Years_Smoking);
  if (age === null) return null;

  return {
    age,
    gender: String(row.Gender || "").trim(),
    smokingStatus: String(row.Smoking_Status || "").trim(),
    cigsPerDay: cigsPerDay === null ? 0 : cigsPerDay,
    yearsSmoking: yearsSmoking === null ? 0 : yearsSmoking,
    pollution: String(row.Air_Pollution_Exposure || "").trim(),
    secondhand: String(row.Secondhand_Smoke || "").trim(),
    family: String(row.Family_History || "").trim(),
    chronic: String(row.Chronic_Lung_Disease || "").trim(),
    asbestos: String(row.Asbestos_Exposure || "").trim(),
    radon: String(row.Radon_Exposure || "").trim(),
    coughBlood: String(row.Coughing_Blood || "").trim(),
  };
}

function scoreProfile(profile) {
  let score = 0;
  score += clamp((profile.age - 20) / 60, 0, 1) * 14;

  const smoking = profile.smokingStatus.toLowerCase();
  if (smoking.includes("current")) score += 20;
  else if (smoking.includes("former")) score += 12;

  score += clamp(profile.cigsPerDay / 40, 0, 1) * 16;
  score += clamp(profile.yearsSmoking / 40, 0, 1) * 14;

  if (boolToNum(profile.secondhand)) score += 5;
  if (boolToNum(profile.family)) score += 8;
  if (boolToNum(profile.chronic)) score += 10;
  if (boolToNum(profile.asbestos)) score += 8;
  if (boolToNum(profile.radon)) score += 8;
  if (boolToNum(profile.coughBlood)) score += 12;

  const pollution = profile.pollution.toLowerCase();
  if (pollution.includes("high")) score += 9;
  else if (pollution.includes("moderate")) score += 5;

  if (String(profile.gender || "").toLowerCase() === "male") score += 2;

  return clamp(score, 0, 120);
}

function computeDatasetStats(patients) {
  const scores = patients.map((p) => scoreProfile(p)).sort((a, b) => a - b);
  if (!scores.length) return null;

  const sum = scores.reduce((acc, value) => acc + value, 0);
  const mean = sum / scores.length;
  const p25 = scores[Math.floor(scores.length * 0.25)];
  const p50 = scores[Math.floor(scores.length * 0.5)];
  const p75 = scores[Math.floor(scores.length * 0.75)];

  return { scores, mean, p25, p50, p75 };
}

function findPercentile(sortedValues, value) {
  if (!sortedValues.length) return 0;
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedValues[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return (lo / sortedValues.length) * 100;
}

function chanceBand(chance) {
  if (chance < 30) return "Lower";
  if (chance < 55) return "Moderate";
  if (chance < 75) return "Elevated";
  return "High";
}

function renderResult(payload) {
  if (!lungResult) return;
  lungResult.innerHTML = `
    <h3>Estimated Similarity: ${payload.estimatedChance.toFixed(1)}%</h3>
    <p class="movie-result-meta">
      <span>Band: ${payload.band}</span>
      <span>Dataset Percentile: ${payload.percentile.toFixed(1)}%</span>
      <span>Profile Score: ${payload.profileScore.toFixed(1)} / 120</span>
    </p>
    <p class="movie-result-overview">
      This is a rough profile-based estimate calibrated against your 2015-2025 lung cancer dataset.
      It should be treated as an educational indicator, not a clinical prediction.
    </p>
  `;
  lungResult.hidden = false;
}

function getUserProfile() {
  return {
    age: parseNumber(lungInputs.age?.value) ?? 30,
    gender: String(lungInputs.gender?.value || "Female"),
    smokingStatus: String(lungInputs.smokingStatus?.value || "Never Smoked"),
    cigsPerDay: parseNumber(lungInputs.cigsPerDay?.value) ?? 0,
    yearsSmoking: parseNumber(lungInputs.yearsSmoking?.value) ?? 0,
    pollution: String(lungInputs.pollution?.value || "Low"),
    secondhand: String(lungInputs.secondhand?.value || "No"),
    family: String(lungInputs.family?.value || "No"),
    chronic: String(lungInputs.chronic?.value || "No"),
    asbestos: String(lungInputs.asbestos?.value || "No"),
    radon: String(lungInputs.radon?.value || "No"),
    coughBlood: String(lungInputs.coughBlood?.value || "No"),
  };
}

function estimateRisk() {
  if (!lungPatients.length || !datasetStats) {
    setLungEstimateStatus("Load the dataset first.", true);
    return;
  }

  const userProfile = getUserProfile();
  const profileScore = scoreProfile(userProfile);
  const percentile = findPercentile(patientScores, profileScore);

  const centered = (profileScore - datasetStats.mean) / 11;
  const logistic = 1 / (1 + Math.exp(-centered));
  const estimatedChance = clamp((logistic * 0.65 + (percentile / 100) * 0.35) * 100, 1, 99);
  const band = chanceBand(estimatedChance);

  renderResult({
    estimatedChance,
    percentile,
    profileScore,
    band,
  });

  setLungEstimateStatus("Estimate generated from dataset-calibrated profile score.");
}

async function parseCsvAndLoad(csvText, sourceLabel) {
  if (typeof Papa === "undefined") {
    setLungDataStatus("CSV parser failed to load. Refresh and try again.", true);
    return;
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim().replace(/^\uFEFF/, ""),
  });

  const normalized = (parsed.data || [])
    .map((row) => normalizePatientRow(row))
    .filter(Boolean);

  if (!normalized.length) {
    setLungDataStatus("No valid patient rows found in CSV.", true);
    return;
  }

  lungPatients = normalized;
  datasetStats = computeDatasetStats(lungPatients);
  patientScores = datasetStats ? datasetStats.scores : [];

  if (!datasetStats) {
    setLungDataStatus("Dataset loaded but failed to compute stats.", true);
    return;
  }

  estimateRiskBtn.disabled = false;
  setLungDataStatus(`Loaded ${lungPatients.length.toLocaleString()} records from ${sourceLabel}.`);
  setLungEstimateStatus("Dataset loaded. Fill the form and click Estimate Risk.");
}

async function loadDatasetFromSite() {
  setLungDataStatus("Loading dataset from site...");
  try {
    const response = await fetch(DEFAULT_LUNG_DATASET, { method: "GET" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csvText = await response.text();
    await parseCsvAndLoad(csvText, DEFAULT_LUNG_DATASET);
  } catch (error) {
    setLungDataStatus(`Could not load ${DEFAULT_LUNG_DATASET}. Upload manually instead. (${error.message})`, true);
  }
}

if (loadLungDataBtn) {
  loadLungDataBtn.addEventListener("click", loadDatasetFromSite);
}

if (lungInputs.smokingStatus) {
  lungInputs.smokingStatus.addEventListener("change", toggleSmokingFields);
  toggleSmokingFields();
}

if (lungFileInput) {
  lungFileInput.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    setLungDataStatus(`Reading ${file.name}...`);
    try {
      const text = await file.text();
      await parseCsvAndLoad(text, file.name);
    } catch (error) {
      setLungDataStatus(`Failed to read file: ${error.message}`, true);
    }
  });
}

if (lungForm) {
  lungForm.addEventListener("submit", (event) => {
    event.preventDefault();
    estimateRisk();
  });
}
