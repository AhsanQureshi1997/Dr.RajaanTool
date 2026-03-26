const REQUIRED_COLUMNS = {
  patient_id: "Unique patient identifier",
  age: "Age in years",
  sex: "Sex, e.g. Male/Female",
  hypertension: "0/1 flag",
  masld: "0/1 flag",
  beta_blocker: "0/1 flag",
  septal_e_prime: "Septal e' in cm/s",
  e_over_e_prime: "E/e' ratio",
  lavi: "Left atrial volume index, mL/m²",
  trv: "Tricuspid regurgitation velocity, m/s",
  cv_event: "0/1 cardiovascular event outcome",
  renal_dysfunction: "0/1 renal dysfunction outcome",
  liver_dysfunction: "0/1 liver dysfunction outcome",
  mortality: "0/1 mortality outcome"
};

const outcomeMap = {
  "Cardiovascular event": "cv_event",
  "Renal dysfunction": "renal_dysfunction",
  "Liver dysfunction": "liver_dysfunction",
  "Mortality": "mortality"
};

const predictorList = [
  "dd_2020",
  "age",
  "hypertension",
  "masld",
  "beta_blocker",
  "septal_e_prime",
  "e_over_e_prime",
  "lavi",
  "trv"
];

let rawData = [];
let analyzedData = [];

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function randomNormal(rand, mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * sd + mean;
}

function clip(x, min, max) { return Math.max(min, Math.min(max, x)); }

function binomial(rand, p) { return rand() < p ? 1 : 0; }

function buildDemoData(n = 120, seed = 7) {
  const rand = mulberry32(seed);
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const age = Math.round(clip(randomNormal(rand, 58, 9), 28, 82));
    const sex = rand() < 0.62 ? "Male" : "Female";
    const hypertension = binomial(rand, 0.45);
    const masld = binomial(rand, 0.32);
    const beta_blocker = binomial(rand, 0.48);
    const septal_e_prime = +clip(randomNormal(rand, 7.4 - 0.6 * hypertension, 1.4), 3.5, 12.0).toFixed(2);
    const e_over_e_prime = +clip(randomNormal(rand, 13.2 + 1.6 * hypertension + 1.2 * masld, 3.2), 6.5, 28.0).toFixed(2);
    const lavi = +clip(randomNormal(rand, 32 + 4.5 * hypertension + 3.5 * masld, 7.0), 16.0, 65.0).toFixed(2);
    const trv = +clip(randomNormal(rand, 2.55 + 0.18 * hypertension, 0.33), 1.7, 4.2).toFixed(2);
    const abnormalCount = (septal_e_prime < 7 ? 1 : 0) + (e_over_e_prime > 15 ? 1 : 0) + (lavi > 34 ? 1 : 0) + (trv > 2.8 ? 1 : 0);
    const dd_2020 = abnormalCount >= 3 ? 1 : 0;
    rows.push({
      patient_id: `P${String(i).padStart(3, "0")}`,
      age,
      sex,
      hypertension,
      masld,
      beta_blocker,
      septal_e_prime,
      e_over_e_prime,
      lavi,
      trv,
      cv_event: binomial(rand, Math.min(0.07 + 0.27 * dd_2020, 0.9)),
      renal_dysfunction: binomial(rand, Math.min(0.10 + 0.20 * dd_2020, 0.9)),
      liver_dysfunction: binomial(rand, Math.min(0.11 + 0.24 * dd_2020, 0.9)),
      mortality: binomial(rand, Math.min(0.04 + 0.05 * dd_2020, 0.9))
    });
  }
  return rows;
}

function showMessage(text, type = "ok") {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = `message ${type}`;
}

function clearMessage() {
  const el = document.getElementById("message");
  el.textContent = "";
  el.className = "message hidden";
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const rows = [];
  const headers = splitCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escapeCsvValue(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach(row => {
    lines.push(headers.map(h => escapeCsvValue(row[h])).join(","));
  });
  return lines.join("\n");
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeRow(row) {
  const normalized = {};
  Object.keys(REQUIRED_COLUMNS).forEach(col => {
    if (!(col in row)) return;
    if (["patient_id", "sex"].includes(col)) {
      normalized[col] = row[col];
    } else {
      const num = Number(row[col]);
      normalized[col] = Number.isFinite(num) ? num : NaN;
    }
  });
  return normalized;
}

function validateColumns(rows) {
  if (!rows.length) return { ok: false, missing: Object.keys(REQUIRED_COLUMNS) };
  const headers = Object.keys(rows[0]);
  const missing = Object.keys(REQUIRED_COLUMNS).filter(c => !headers.includes(c));
  return { ok: missing.length === 0, missing };
}

function analyze(rows) {
  const septalThr = Number(document.getElementById("septalThr").value);
  const eeThr = Number(document.getElementById("eeThr").value);
  const laviThr = Number(document.getElementById("laviThr").value);
  const trvThr = Number(document.getElementById("trvThr").value);
  const ruleCount = Number(document.getElementById("ruleCount").value);

  return rows.map(row => {
    const abn_septal_e_prime = Number(row.septal_e_prime < septalThr);
    const abn_e_over_e_prime = Number(row.e_over_e_prime > eeThr);
    const abn_lavi = Number(row.lavi > laviThr);
    const abn_trv = Number(row.trv > trvThr);
    const dd_2020_count = abn_septal_e_prime + abn_e_over_e_prime + abn_lavi + abn_trv;
    const dd_2020 = Number(dd_2020_count >= ruleCount);
    return {
      ...row,
      abn_septal_e_prime,
      abn_e_over_e_prime,
      abn_lavi,
      abn_trv,
      dd_2020_count,
      dd_2020
    };
  });
}

function renderRequiredColumns() {
  const ul = document.getElementById("requiredCols");
  ul.innerHTML = "";
  Object.entries(REQUIRED_COLUMNS).forEach(([col, desc]) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${col}</strong>: ${desc}`;
    ul.appendChild(li);
  });
}

function renderMetrics(rows) {
  const metrics = document.getElementById("metrics");
  const ages = rows.map(r => r.age).filter(Number.isFinite).sort((a,b)=>a-b);
  const medianAge = ages.length ? ages[Math.floor(ages.length / 2)] : "-";
  const ddCount = rows.reduce((s, r) => s + r.dd_2020, 0);
  const prevalence = rows.length ? (ddCount / rows.length * 100).toFixed(1) : "0.0";
  const items = [
    ["Patients", rows.length, "Total analyzed cohort"],
    ["DD-positive", ddCount, "Patients meeting threshold rule"],
    ["DD prevalence", `${prevalence}%`, "Proportion of cohort"],
    ["Median age", medianAge, "Years"]
  ];
  metrics.innerHTML = items.map(([label, value, sub]) => `
    <div class="metric">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="sub">${sub}</div>
    </div>
  `).join("");
}

function renderTable(id, rows, columns = null, limit = null) {
  const table = document.getElementById(id);
  if (!rows || !rows.length) {
    table.innerHTML = "<tr><td>No data loaded.</td></tr>";
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const viewRows = limit ? rows.slice(0, limit) : rows;
  table.innerHTML = `
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>
      ${viewRows.map(row => `<tr>${cols.map(c => `<td>${formatCell(row[c])}</td>`).join("")}</tr>`).join("")}
    </tbody>
  `;
}

function formatCell(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.000$/, "");
  }
  return value ?? "";
}

function renderMarkerTable(rows) {
  const items = [
    ["septal e′ < threshold", "abn_septal_e_prime"],
    ["E/e′ > threshold", "abn_e_over_e_prime"],
    ["LAVI > threshold", "abn_lavi"],
    ["TRV > threshold", "abn_trv"]
  ].map(([label, col]) => {
    const sum = rows.reduce((s, r) => s + r[col], 0);
    return {
      Marker: label,
      "Positive n": sum,
      "Positive %": rows.length ? +(sum / rows.length * 100).toFixed(1) : 0
    };
  });
  renderTable("markerTable", items);
}

function renderOutcomeTable(rows) {
  const result = [];
  Object.entries(outcomeMap).forEach(([label, col]) => {
    const dd1 = rows.filter(r => r.dd_2020 === 1);
    const dd0 = rows.filter(r => r.dd_2020 === 0);
    const dd1Sum = dd1.reduce((s, r) => s + Number(r[col] || 0), 0);
    const dd0Sum = dd0.reduce((s, r) => s + Number(r[col] || 0), 0);
    const dd1N = dd1.length;
    const dd0N = dd0.length;
    const or = oddsRatio(dd1Sum, dd1N - dd1Sum, dd0Sum, dd0N - dd0Sum);
    result.push({
      Outcome: label,
      "DD+ events / total": `${dd1Sum} / ${dd1N}`,
      "DD+ rate %": dd1N ? +(dd1Sum / dd1N * 100).toFixed(1) : null,
      "DD- events / total": `${dd0Sum} / ${dd0N}`,
      "DD- rate %": dd0N ? +(dd0Sum / dd0N * 100).toFixed(1) : null,
      "Unadjusted OR": Number.isFinite(or) ? +or.toFixed(2) : null
    });
  });
  renderTable("outcomeTable", result);
}

function oddsRatio(a, b, c, d) {
  const aa = a + 0.5, bb = b + 0.5, cc = c + 0.5, dd = d + 0.5;
  return (aa * dd) / (bb * cc);
}

function setupRegressionUI() {
  const outcomeChoice = document.getElementById("outcomeChoice");
  outcomeChoice.innerHTML = Object.keys(outcomeMap).map(k => `<option value="${k}">${k}</option>`).join("");
  const predictorChoices = document.getElementById("predictorChoices");
  predictorChoices.innerHTML = predictorList.map(name => `
    <label class="checkbox-item">
      <input type="checkbox" value="${name}" ${["dd_2020","age","hypertension","masld","beta_blocker"].includes(name) ? "checked" : ""}>
      ${name}
    </label>
  `).join("");
}

function getSelectedPredictors() {
  return Array.from(document.querySelectorAll('#predictorChoices input:checked')).map(el => el.value);
}

function runRegression() {
  const outcomeLabel = document.getElementById("outcomeChoice").value;
  const outcomeCol = outcomeMap[outcomeLabel];
  const predictors = getSelectedPredictors();
  if (!predictors.length) {
    renderTable("regressionTable", [{ Message: "Select at least one predictor." }]);
    return;
  }
  const modelRows = analyzedData.filter(r => predictors.every(p => Number.isFinite(Number(r[p]))) && Number.isFinite(Number(r[outcomeCol])));
  const X = modelRows.map(r => [1, ...predictors.map(p => Number(r[p]))]);
  const y = modelRows.map(r => Number(r[outcomeCol]));

  const result = logisticRegression(X, y, predictors);
  if (!result.ok) {
    renderTable("regressionTable", [{ Error: result.error }]);
    return;
  }
  const rows = result.rows.map(r => ({
    Variable: r.name,
    "Odds ratio": +Math.exp(r.beta).toFixed(3),
    "CI lower": +Math.exp(r.beta - 1.96 * r.se).toFixed(3),
    "CI upper": +Math.exp(r.beta + 1.96 * r.se).toFixed(3),
    "p value": +normalPValue(r.beta / r.se).toFixed(4)
  }));
  renderTable("regressionTable", rows);
}

function logisticRegression(X, y, predictors, maxIter = 50) {
  const n = X.length;
  const p = X[0]?.length || 0;
  if (!n || !p) return { ok: false, error: "No usable rows for model." };
  let beta = Array(p).fill(0);
  let hessian = null;

  for (let iter = 0; iter < maxIter; iter++) {
    const pHat = X.map(row => sigmoid(dot(row, beta)));
    const grad = Array(p).fill(0);
    hessian = Array.from({ length: p }, () => Array(p).fill(0));

    for (let i = 0; i < n; i++) {
      const w = Math.max(pHat[i] * (1 - pHat[i]), 1e-6);
      for (let j = 0; j < p; j++) {
        grad[j] += X[i][j] * (y[i] - pHat[i]);
        for (let k = 0; k < p; k++) {
          hessian[j][k] -= X[i][j] * w * X[i][k];
        }
      }
    }

    const delta = solveLinearSystem(hessian.map(row => row.map(v => -v)), grad);
    if (!delta) return { ok: false, error: "Model could not be fit. Try fewer predictors." };
    beta = beta.map((b, i) => b + delta[i]);
    if (Math.max(...delta.map(Math.abs)) < 1e-6) break;
  }

  const invInfo = invertMatrix(hessian.map(row => row.map(v => -v)));
  if (!invInfo) return { ok: false, error: "Could not estimate standard errors." };
  const se = invInfo.map((row, i) => Math.sqrt(Math.max(row[i], 1e-9)));
  const names = ["const", ...predictors];
  return {
    ok: true,
    rows: names.map((name, i) => ({ name, beta: beta[i], se: se[i] }))
  };
}

function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }
function sigmoid(z) { return 1 / (1 + Math.exp(-clip(z, -35, 35))); }

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-10) return null;
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const pivot = M[i][i];
    for (let j = i; j <= n; j++) M[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  return M.map(row => row[n]);
}

function invertMatrix(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-10) return null;
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const pivot = M[i][i];
    for (let j = 0; j < 2 * n; j++) M[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      for (let j = 0; j < 2 * n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  return M.map(row => row.slice(n));
}

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return sign * y;
}

function normalCDF(x) { return 0.5 * (1 + erf(x / Math.sqrt(2))); }
function normalPValue(z) { return 2 * (1 - normalCDF(Math.abs(z))); }

function refresh() {
  if (!rawData.length) {
    clearMessage();
    renderMetrics([]);
    renderTable("previewTable", []);
    renderTable("markerTable", []);
    renderTable("outcomeTable", []);
    renderTable("regressionTable", []);
    return;
  }
  analyzedData = analyze(rawData);
  clearMessage();
  renderMetrics(analyzedData);
  renderTable("previewTable", analyzedData, [
    "patient_id","age","sex","hypertension","masld","beta_blocker","septal_e_prime",
    "e_over_e_prime","lavi","trv","dd_2020_count","dd_2020","cv_event",
    "renal_dysfunction","liver_dysfunction","mortality"
  ], 20);
  renderMarkerTable(analyzedData);
  renderOutcomeTable(analyzedData);
  runRegression();
}

function handleRows(rows, sourceLabel) {
  const validation = validateColumns(rows);
  if (!validation.ok) {
    showMessage(`Missing required columns: ${validation.missing.join(", ")}`, "error");
    return;
  }
  rawData = rows.map(normalizeRow);
  showMessage(`Loaded ${rawData.length} rows from ${sourceLabel}.`, "ok");
  refresh();
}

document.getElementById("loadDemoBtn").addEventListener("click", () => {
  handleRows(buildDemoData(), "demo dataset");
});

document.getElementById("downloadDemoBtn").addEventListener("click", () => {
  downloadText("tips_demo_dataset.csv", toCSV(buildDemoData()), "text/csv");
});

document.getElementById("downloadAnalyzedBtn").addEventListener("click", () => {
  if (!analyzedData.length) {
    showMessage("Load a dataset first.", "error");
    return;
  }
  downloadText("tips_analyzed_dataset.csv", toCSV(analyzedData), "text/csv");
});

document.getElementById("csvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCSV(text);
  handleRows(rows, file.name);
});

document.getElementById("recalcBtn").addEventListener("click", refresh);
document.getElementById("runModelBtn").addEventListener("click", runRegression);
document.getElementById("ruleCount").addEventListener("input", e => {
  document.getElementById("ruleCountLabel").textContent = e.target.value;
});

renderRequiredColumns();
setupRegressionUI();
handleRows(buildDemoData(), "demo dataset");
