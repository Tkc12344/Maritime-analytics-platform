/* Global Maritime Solutions — Frontend App
   All 10 dashboard pages, mirrors the live TypeScript dashboard exactly.
*/

// Auto-detect API base URL: empty string = same origin (when served by FastAPI)
// Change to "http://localhost:8000" only if opening index.html directly as a file
const API = window.location.protocol === "file:" ? "http://localhost:8000" : "";
let currentUser = null;
const chartInstances = {};

// ── Utilities ─────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

function fmt(n, dec = 1) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtInt(n) { return n == null ? "—" : Number(n).toLocaleString(); }
function badge(cls, text) { return `<span class="kpi-badge ${cls}">${text}</span>`; }
function severityBadge(s) {
  const map = { EMERGENCY: "badge-red sev-emergency", Critical: "badge-red sev-critical", Warning: "badge-yellow sev-warning", Info: "badge-blue sev-info" };
  return `<span class="kpi-badge ${map[s] || "badge-blue"}">${s}</span>`;
}
function statusBadge(s) {
  const map = { Pending: "status-pending", InProgress: "status-inprogress", Completed: "status-completed", Dismissed: "status-dismissed" };
  return `<span class="${map[s] || ""}">${s}</span>`;
}
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }
function mkChart(id, config) { destroyChart(id); const ctx = document.getElementById(id); if (!ctx) return; chartInstances[id] = new Chart(ctx, config); }

const CHART_DEFAULTS = {
  color: "#94a3b8",
  grid: { color: "rgba(255,255,255,0.05)" },
  ticks: { color: "#64748b" },
};

function lineConfig(labels, datasets, opts = {}) {
  return {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: CHART_DEFAULTS.color, boxWidth: 12, font: { size: 11 } } }, tooltip: { mode: "index", intersect: false } },
      scales: {
        x: { grid: CHART_DEFAULTS.grid, ticks: { ...CHART_DEFAULTS.ticks, maxTicksLimit: 12 } },
        y: { grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.ticks },
      },
      ...opts,
    },
  };
}
function barConfig(labels, datasets, opts = {}) {
  return {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: CHART_DEFAULTS.color, boxWidth: 12, font: { size: 11 } } } },
      scales: {
        x: { grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.ticks },
        y: { grid: CHART_DEFAULTS.grid, ticks: CHART_DEFAULTS.ticks },
      },
      ...opts,
    },
  };
}
function doughnutConfig(labels, data, colors) {
  return {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "right", labels: { color: CHART_DEFAULTS.color, boxWidth: 12, font: { size: 11 } } } },
    },
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const user = await apiFetch("/api/auth/me");
    if (user) {
      currentUser = user;
      showApp();
    } else {
      showLogin();
    }
  } catch { showLogin(); }
}

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-name").textContent = currentUser.name;
  document.getElementById("user-role").textContent = currentUser.role;
  document.getElementById("user-avatar").textContent = currentUser.name[0].toUpperCase();
  if (currentUser.role === "admin") {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  }
  navigateTo("overview");
}

document.getElementById("login-btn").addEventListener("click", async () => {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    currentUser = res.user;
    errEl.classList.add("hidden");
    showApp();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  }
});

document.getElementById("login-password").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await apiFetch("/api/auth/logout", { method: "POST" });
  currentUser = null;
  showLogin();
});

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add("active");
  PAGE_LOADERS[page]?.();
}

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

const PAGE_LOADERS = {
  overview:     loadOverview,
  suez:         loadSuez,
  bottlenecks:  loadBottlenecks,
  efficiency:   loadEfficiency,
  forecasting:  loadForecasting,
  alerts:       loadAlerts,
  optimization: loadOptimization,
  insights:     loadInsights,
  explorer:     loadExplorer,
  admin:        loadAdmin,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
async function loadOverview() {
  const el = document.getElementById("page-overview");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading overview...</div>`;
  const [kpis, trend, regional] = await Promise.all([
    apiFetch("/api/overview/kpis"),
    apiFetch("/api/overview/monthly-trend"),
    apiFetch("/api/overview/regional-summary"),
  ]);
  el.innerHTML = `
    <div class="page-header">
      <h1>Executive Overview</h1>
      <p>Global operations summary — ${fmtInt(kpis.total_movements)} total cargo movements</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Movements</div><div class="kpi-value">${fmtInt(kpis.total_movements)}</div>${badge("badge-blue","All Time")}</div>
      <div class="kpi-card"><div class="kpi-label">Total Containers</div><div class="kpi-value">${fmtInt(kpis.total_containers)}</div>${badge("badge-blue","TEU")}</div>
      <div class="kpi-card"><div class="kpi-label">Avg Duration</div><div class="kpi-value">${fmt(kpis.avg_duration)}h</div>${badge("badge-yellow","Current")}</div>
      <div class="kpi-card"><div class="kpi-label">Target Duration</div><div class="kpi-value">${fmt(kpis.target_duration)}h</div>${badge("badge-green","−15% Goal")}</div>
      <div class="kpi-card"><div class="kpi-label">Anomalies</div><div class="kpi-value">${fmtInt(kpis.anomaly_count)}</div>${badge("badge-red","Detected")}</div>
      <div class="kpi-card"><div class="kpi-label">Active Terminals</div><div class="kpi-value">${kpis.active_terminals}</div>${badge("badge-blue","Terminals")}</div>
    </div>
    <div class="charts-grid">
      <div class="chart-card full-width">
        <div class="chart-title">Monthly Movement Duration Trend</div>
        <div class="chart-sub">Average cargo movement duration over time (hours)</div>
        <div class="chart-wrap tall"><canvas id="ch-trend"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Container Volume by Hub</div>
        <div class="chart-sub">Total TEU containers per regional hub</div>
        <div class="chart-wrap"><canvas id="ch-hub-pie"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Current vs Target Duration by Hub</div>
        <div class="chart-sub">Actual vs 15% reduction target</div>
        <div class="chart-wrap"><canvas id="ch-hub-bar"></canvas></div>
      </div>
    </div>
  `;
  // Monthly trend chart
  mkChart("ch-trend", lineConfig(
    trend.map(t => t.period),
    [
      { label: "Avg Duration (h)", data: trend.map(t => t.avg_duration), borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.1)", fill: true, tension: 0.4, pointRadius: 0 },
      { label: "Max Duration (h)", data: trend.map(t => t.max_duration), borderColor: "rgba(239,68,68,0.5)", borderDash: [4,4], tension: 0.4, pointRadius: 0 },
    ]
  ));
  // Hub pie
  mkChart("ch-hub-pie", doughnutConfig(
    regional.map(r => r.regional_hub),
    regional.map(r => r.total_containers),
    ["#0ea5e9","#22c55e","#eab308","#a855f7"]
  ));
  // Hub bar
  mkChart("ch-hub-bar", barConfig(
    regional.map(r => r.regional_hub),
    [
      { label: "Avg Duration", data: regional.map(r => r.avg_duration), backgroundColor: "#0ea5e9" },
      { label: "Target Duration", data: regional.map(r => r.target_duration), backgroundColor: "#22c55e" },
    ]
  ));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: SUEZ ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════
async function loadSuez() {
  const el = document.getElementById("page-suez");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading Suez analysis...</div>`;
  const data = await apiFetch("/api/suez/analysis");
  const { periods, regional, timeline } = data;
  const disruption = periods.find(p => p.period === "Disruption") || {};
  const pre = periods.find(p => p.period === "Pre-Disruption") || {};
  const impact = pre.avg_duration ? (((disruption.avg_duration - pre.avg_duration) / pre.avg_duration) * 100).toFixed(1) : "44.8";
  el.innerHTML = `
    <div class="page-header">
      <h1>Suez Canal Disruption Analysis</h1>
      <p>Impact of the Ever Given blockage (March 23–29, 2021) on global maritime operations</p>
    </div>
    <div class="disruption-banner">
      <div class="disruption-icon">🚢</div>
      <div class="disruption-text">
        <h3>Ever Given — Suez Canal Blockage</h3>
        <p>March 23–29, 2021 · 6-day blockage · ${impact}% average duration spike · Global supply chain disruption</p>
      </div>
    </div>
    <div class="kpi-grid">
      ${periods.map(p => `
        <div class="kpi-card">
          <div class="kpi-label">${p.period}</div>
          <div class="kpi-value">${fmt(p.avg_duration)}h</div>
          <div class="kpi-sub">${fmtInt(p.movements)} movements</div>
        </div>`).join("")}
    </div>
    <div class="charts-grid">
      <div class="chart-card full-width">
        <div class="chart-title">Daily Movement Duration — March to May 2021</div>
        <div class="chart-sub">Blockage period highlighted (Mar 23–29)</div>
        <div class="chart-wrap tall"><canvas id="ch-suez-timeline"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Duration by Period</div>
        <div class="chart-sub">Average movement duration across disruption phases</div>
        <div class="chart-wrap"><canvas id="ch-suez-periods"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Regional Hub Impact</div>
        <div class="chart-sub">Normal vs Disruption duration by hub</div>
        <div class="chart-wrap"><canvas id="ch-suez-regional"></canvas></div>
      </div>
    </div>
  `;
  // Timeline
  const blockageStart = timeline.findIndex(t => t.date_id >= "2021-03-23");
  const blockageEnd   = timeline.findIndex(t => t.date_id > "2021-03-29");
  mkChart("ch-suez-timeline", {
    type: "line",
    data: {
      labels: timeline.map(t => t.date_id),
      datasets: [
        { label: "Avg Duration (h)", data: timeline.map(t => t.avg_duration), borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,0.1)", fill: true, tension: 0.3, pointRadius: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#94a3b8" } },
        annotation: {},
      },
      scales: {
        x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b", maxTicksLimit: 15 } },
        y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b" } },
      },
    },
  });
  // Periods bar
  const periodOrder = ["Pre-Disruption", "Disruption", "Recovery", "Normal"];
  const orderedPeriods = periodOrder.map(p => periods.find(x => x.period === p)).filter(Boolean);
  mkChart("ch-suez-periods", barConfig(
    orderedPeriods.map(p => p.period),
    [{ label: "Avg Duration (h)", data: orderedPeriods.map(p => p.avg_duration), backgroundColor: ["#22c55e","#ef4444","#eab308","#0ea5e9"] }],
    { plugins: { legend: { display: false } } }
  ));
  // Regional
  const hubs = [...new Set(regional.map(r => r.regional_hub))];
  const normalData = hubs.map(h => { const row = regional.find(r => r.regional_hub === h && r.period === "Normal"); return row?.avg_duration || 0; });
  const disruptData = hubs.map(h => { const row = regional.find(r => r.regional_hub === h && r.period === "Disruption"); return row?.avg_duration || 0; });
  mkChart("ch-suez-regional", barConfig(hubs, [
    { label: "Normal", data: normalData, backgroundColor: "#22c55e" },
    { label: "Disruption", data: disruptData, backgroundColor: "#ef4444" },
  ]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: BOTTLENECKS
// ═══════════════════════════════════════════════════════════════════════════════
async function loadBottlenecks() {
  const el = document.getElementById("page-bottlenecks");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading bottleneck analysis...</div>`;
  const [terminals, vessels, regional] = await Promise.all([
    apiFetch("/api/terminals/performance"),
    apiFetch("/api/vessels/category-baseline"),
    apiFetch("/api/overview/regional-summary"),
  ]);
  const networkAvg = terminals.reduce((s, t) => s + parseFloat(t.avg_duration), 0) / terminals.length;
  const overCapacity = terminals.filter(t => parseFloat(t.utilization_pct) > 85).length;
  const top10 = terminals.slice(0, 10);
  el.innerHTML = `
    <div class="page-header">
      <h1>Infrastructure Bottlenecks</h1>
      <p>Terminal utilization, vessel congestion, and capacity analysis</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Network Avg Duration</div><div class="kpi-value">${fmt(networkAvg)}h</div>${badge("badge-blue","Baseline")}</div>
      <div class="kpi-card"><div class="kpi-label">Over-Capacity Terminals</div><div class="kpi-value">${overCapacity}</div>${badge("badge-red","≥85% Util")}</div>
      <div class="kpi-card"><div class="kpi-label">Total Terminals</div><div class="kpi-value">${terminals.length}</div>${badge("badge-blue","Active")}</div>
      <div class="kpi-card"><div class="kpi-label">Worst Terminal</div><div class="kpi-value">${fmt(terminals[0]?.avg_duration)}h</div>${badge("badge-red","Slowest")}</div>
    </div>
    <div class="charts-grid">
      <div class="chart-card full-width">
        <div class="chart-title">Top 10 Slowest Terminals</div>
        <div class="chart-sub">Average movement duration (hours) — sorted descending</div>
        <div class="chart-wrap"><canvas id="ch-bt-terminals"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Duration by Vessel Category</div>
        <div class="chart-sub">Baseline efficiency per vessel type</div>
        <div class="chart-wrap"><canvas id="ch-bt-vessels"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Duration by Regional Hub</div>
        <div class="chart-sub">Hub-level performance comparison</div>
        <div class="chart-wrap"><canvas id="ch-bt-hubs"></canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Terminal Performance Table</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Terminal</th><th>Hub</th><th>Movements</th><th>Avg Duration</th><th>Utilization</th><th>Anomalies</th><th>Status</th></tr></thead>
          <tbody>
            ${terminals.slice(0, 20).map(t => {
              const util = parseFloat(t.utilization_pct);
              const dur  = parseFloat(t.avg_duration);
              const status = dur > networkAvg * 1.1 ? `<span class="badge-red kpi-badge">Bottleneck</span>` : util < 40 ? `<span class="badge-yellow kpi-badge">Underutilized</span>` : `<span class="badge-green kpi-badge">Normal</span>`;
              return `<tr><td>${t.terminal_name}</td><td>${t.regional_hub}</td><td>${fmtInt(t.movements)}</td><td class="${dur > networkAvg * 1.1 ? "text-red" : "text-green"}">${fmt(dur)}h</td><td>${fmt(util)}%</td><td>${fmtInt(t.anomaly_count)}</td><td>${status}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  mkChart("ch-bt-terminals", barConfig(
    top10.map(t => t.terminal_name.replace(" Terminal", "")),
    [{ label: "Avg Duration (h)", data: top10.map(t => t.avg_duration), backgroundColor: top10.map(t => parseFloat(t.avg_duration) > networkAvg * 1.1 ? "#ef4444" : "#0ea5e9") }],
    { indexAxis: "y", plugins: { legend: { display: false } } }
  ));
  mkChart("ch-bt-vessels", barConfig(
    vessels.map(v => v.vessel_category),
    [{ label: "Avg Duration (h)", data: vessels.map(v => v.avg_duration), backgroundColor: ["#0ea5e9","#22c55e","#eab308","#a855f7"] }],
    { plugins: { legend: { display: false } } }
  ));
  mkChart("ch-bt-hubs", barConfig(
    regional.map(r => r.regional_hub),
    [
      { label: "Avg Duration", data: regional.map(r => r.avg_duration), backgroundColor: "#0ea5e9" },
      { label: "Target", data: regional.map(r => r.target_duration), backgroundColor: "#22c55e" },
    ]
  ));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: EFFICIENCY ANOMALIES
// ═══════════════════════════════════════════════════════════════════════════════
async function loadEfficiency() {
  const el = document.getElementById("page-efficiency");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading efficiency analysis...</div>`;
  const [baseline, ageCorr, shiftData, anomalies] = await Promise.all([
    apiFetch("/api/vessels/category-baseline"),
    apiFetch("/api/vessels/age-correlation"),
    apiFetch("/api/vessels/shift-analysis"),
    apiFetch("/api/anomalies/list?limit=50"),
  ]);
  const dayShift   = shiftData.filter(s => s.shift === "Day");
  const nightShift = shiftData.filter(s => s.shift === "Night");
  const dayAvg     = dayShift.reduce((s, x) => s + parseFloat(x.avg_duration), 0) / (dayShift.length || 1);
  const nightAvg   = nightShift.reduce((s, x) => s + parseFloat(x.avg_duration), 0) / (nightShift.length || 1);
  const nightPenalty = ((dayAvg - nightAvg) / nightAvg * 100).toFixed(1);
  el.innerHTML = `
    <div class="page-header">
      <h1>Efficiency Anomalies</h1>
      <p>Vessel performance baselines, shift analysis, and outlier detection</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Anomalies</div><div class="kpi-value">${fmtInt(anomalies.length)}</div>${badge("badge-red","Detected")}</div>
      <div class="kpi-card"><div class="kpi-label">Day Shift Avg</div><div class="kpi-value">${fmt(dayAvg)}h</div>${badge("badge-yellow","Day")}</div>
      <div class="kpi-card"><div class="kpi-label">Night Shift Avg</div><div class="kpi-value">${fmt(nightAvg)}h</div>${badge("badge-blue","Night")}</div>
      <div class="kpi-card"><div class="kpi-label">Day vs Night</div><div class="kpi-value">${nightPenalty > 0 ? "+" : ""}${nightPenalty}%</div>${badge(nightPenalty > 0 ? "badge-red" : "badge-green", nightPenalty > 0 ? "Day Slower" : "Night Slower")}</div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Baseline by Vessel Category</div>
        <div class="chart-sub">Average duration per vessel type</div>
        <div class="chart-wrap"><canvas id="ch-eff-baseline"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Day vs Night Shift by Category</div>
        <div class="chart-sub">Shift timing impact on duration</div>
        <div class="chart-wrap"><canvas id="ch-eff-shift"></canvas></div>
      </div>
      <div class="chart-card full-width">
        <div class="chart-title">Vessel Age vs Duration Correlation</div>
        <div class="chart-sub">Does vessel age predict longer movement times?</div>
        <div class="chart-wrap"><canvas id="ch-eff-age"></canvas></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Top Anomalies (by Duration)</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Terminal</th><th>Hub</th><th>Vessel</th><th>Category</th><th>Duration</th><th>Z-Score</th></tr></thead>
          <tbody>
            ${anomalies.slice(0, 20).map(a => `
              <tr>
                <td>${a.date_id}</td>
                <td>${a.terminal_name}</td>
                <td>${a.regional_hub}</td>
                <td>${a.vessel_name}</td>
                <td>${a.vessel_category}</td>
                <td class="text-red">${fmt(a.move_duration)}h</td>
                <td class="font-mono ${parseFloat(a.z_score) > 3 ? "text-red" : "text-yellow"}">${fmt(a.z_score, 2)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  mkChart("ch-eff-baseline", barConfig(
    baseline.map(b => b.vessel_category),
    [{ label: "Avg Duration (h)", data: baseline.map(b => b.avg_duration), backgroundColor: ["#0ea5e9","#22c55e","#eab308","#a855f7"] }],
    { plugins: { legend: { display: false } } }
  ));
  // Shift chart
  const cats = [...new Set(shiftData.map(s => s.vessel_category))];
  mkChart("ch-eff-shift", barConfig(cats, [
    { label: "Day", data: cats.map(c => { const r = shiftData.find(s => s.vessel_category === c && s.shift === "Day"); return r?.avg_duration || 0; }), backgroundColor: "#eab308" },
    { label: "Night", data: cats.map(c => { const r = shiftData.find(s => s.vessel_category === c && s.shift === "Night"); return r?.avg_duration || 0; }), backgroundColor: "#0ea5e9" },
  ]));
  mkChart("ch-eff-age", lineConfig(
    ageCorr.map(a => a.age_group),
    [{ label: "Avg Duration (h)", data: ageCorr.map(a => a.avg_duration), borderColor: "#a855f7", backgroundColor: "rgba(168,85,247,0.1)", fill: true, tension: 0.3 }]
  ));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: FORECASTING
// ═══════════════════════════════════════════════════════════════════════════════
async function loadForecasting() {
  const el = document.getElementById("page-forecasting");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading forecasting models...</div>`;
  const [arima, prophet] = await Promise.all([
    apiFetch("/api/forecast/arima?periods=12"),
    apiFetch("/api/forecast/prophet?periods=12"),
  ]);
  el.innerHTML = `
    <div class="page-header">
      <h1>Predictive Forecasting</h1>
      <p>ARIMA and Prophet models — 12-month movement duration forecast</p>
    </div>
    <div class="charts-grid">
      <div class="chart-card full-width">
        <div class="chart-title">ARIMA Forecast — Movement Duration</div>
        <div class="chart-sub">Historical trend + 12-month forecast with 95% confidence interval</div>
        <div class="chart-wrap tall"><canvas id="ch-arima"></canvas></div>
      </div>
      <div class="chart-card full-width">
        <div class="chart-title">Prophet Forecast — Movement Duration</div>
        <div class="chart-sub">Trend + seasonal decomposition forecast</div>
        <div class="chart-wrap tall"><canvas id="ch-prophet"></canvas></div>
      </div>
    </div>
    <div class="card mb-4">
      <div class="card-title">ML Regression Prediction</div>
      <p class="text-muted mb-4" style="font-size:13px">Predict movement duration for a specific vessel/terminal combination</p>
      <div class="filters">
        <select class="filter-select" id="pred-category"><option value="Container">Container</option><option value="Tanker">Tanker</option><option value="Cargo">Cargo</option><option value="Passenger">Passenger</option></select>
        <select class="filter-select" id="pred-hub"><option value="EMEA">EMEA</option><option value="APAC">APAC</option><option value="AMER">AMER</option><option value="LATAM">LATAM</option></select>
        <select class="filter-select" id="pred-shift"><option value="Day">Day</option><option value="Night">Night</option></select>
        <input class="filter-input" id="pred-age" type="number" value="15" min="1" max="60" placeholder="Vessel Age" style="width:100px"/>
        <input class="filter-input" id="pred-containers" type="number" value="500" min="100" max="1500" placeholder="Containers" style="width:120px"/>
        <button class="btn btn-primary" id="pred-btn">Predict</button>
      </div>
      <div id="pred-result"></div>
    </div>
  `;
  // ARIMA chart
  const arimaLabels = [...arima.historical.map(h => h.period), ...arima.forecasts.map(f => f.period)];
  const arimaHistLen = arima.historical.length;
  mkChart("ch-arima", {
    type: "line",
    data: {
      labels: arimaLabels,
      datasets: [
        { label: "Historical", data: [...arima.historical.map(h => h.avg_duration), ...Array(arima.forecasts.length).fill(null)], borderColor: "#0ea5e9", tension: 0.3, pointRadius: 0 },
        { label: "Forecast", data: [...Array(arimaHistLen).fill(null), ...arima.forecasts.map(f => f.predicted)], borderColor: "#eab308", borderDash: [5,5], tension: 0.3, pointRadius: 3 },
        { label: "Upper CI", data: [...Array(arimaHistLen).fill(null), ...arima.forecasts.map(f => f.confidenceHigh)], borderColor: "rgba(234,179,8,0.3)", fill: "+1", pointRadius: 0 },
        { label: "Lower CI", data: [...Array(arimaHistLen).fill(null), ...arima.forecasts.map(f => f.confidenceLow)], borderColor: "rgba(234,179,8,0.3)", fill: false, pointRadius: 0 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#94a3b8" } } }, scales: { x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b", maxTicksLimit: 18 } }, y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b" } } } },
  });
  // Prophet chart
  const prophetLabels = [...prophet.historical.map(h => h.period), ...prophet.forecasts.map(f => f.period)];
  const prophetHistLen = prophet.historical.length;
  mkChart("ch-prophet", {
    type: "line",
    data: {
      labels: prophetLabels,
      datasets: [
        { label: "Historical", data: [...prophet.historical.map(h => h.avg_duration), ...Array(prophet.forecasts.length).fill(null)], borderColor: "#22c55e", tension: 0.3, pointRadius: 0 },
        { label: "Forecast", data: [...Array(prophetHistLen).fill(null), ...prophet.forecasts.map(f => f.predicted)], borderColor: "#a855f7", borderDash: [5,5], tension: 0.3, pointRadius: 3 },
        { label: "Trend", data: [...Array(prophetHistLen).fill(null), ...prophet.forecasts.map(f => f.trend)], borderColor: "rgba(168,85,247,0.4)", borderDash: [2,4], pointRadius: 0 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#94a3b8" } } }, scales: { x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b", maxTicksLimit: 18 } }, y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b" } } } },
  });
  document.getElementById("pred-btn").addEventListener("click", async () => {
    const body = {
      vesselCategory: document.getElementById("pred-category").value,
      vesselAge: parseFloat(document.getElementById("pred-age").value),
      regionalHub: document.getElementById("pred-hub").value,
      shift: document.getElementById("pred-shift").value,
      containerCount: parseInt(document.getElementById("pred-containers").value),
    };
    const res = await apiFetch("/api/forecast/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    document.getElementById("pred-result").innerHTML = `
      <div class="card" style="margin-top:16px;background:rgba(14,165,233,0.05);border-color:rgba(14,165,233,0.3)">
        <div style="font-size:28px;font-weight:700;color:#0ea5e9;margin-bottom:8px">${fmt(res.predictedDuration)}h</div>
        <div style="color:#94a3b8;font-size:13px">Predicted movement duration · Confidence: ${(res.confidence * 100).toFixed(0)}%</div>
        <div style="margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px">
          ${Object.entries(res.breakdown).map(([k, v]) => `<div style="background:var(--bg3);padding:8px;border-radius:6px"><div style="color:#64748b">${k}</div><div style="color:#f1f5f9;font-weight:600">${fmt(v, 1)}h</div></div>`).join("")}
        </div>
      </div>`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: ALERTS
// ═══════════════════════════════════════════════════════════════════════════════
async function loadAlerts() {
  const el = document.getElementById("page-alerts");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading alerts...</div>`;
  const [stats, alerts, congestion] = await Promise.all([
    apiFetch("/api/alerts/stats"),
    apiFetch("/api/alerts/list?limit=100"),
    apiFetch("/api/alerts/preview-congestion"),
  ]);
  const bySev = stats.bySeverity || {};
  const byHub = stats.byHub || {};
  el.innerHTML = `
    <div class="page-header">
      <h1>Alerts Dashboard</h1>
      <p>${stats.unacknowledged} unacknowledged alerts · ${stats.total} total</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Alerts</div><div class="kpi-value">${fmtInt(stats.total)}</div>${badge("badge-blue","All Time")}</div>
      <div class="kpi-card"><div class="kpi-label">Unacknowledged</div><div class="kpi-value">${fmtInt(stats.unacknowledged)}</div>${badge("badge-red","Action Needed")}</div>
      <div class="kpi-card"><div class="kpi-label">Critical</div><div class="kpi-value">${fmtInt(bySev.Critical || 0)}</div>${badge("badge-red","Critical")}</div>
      <div class="kpi-card"><div class="kpi-label">Warning</div><div class="kpi-value">${fmtInt(bySev.Warning || 0)}</div>${badge("badge-yellow","Warning")}</div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Alerts by Severity</div>
        <div class="chart-wrap"><canvas id="ch-alert-sev"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Alerts by Regional Hub</div>
        <div class="chart-wrap"><canvas id="ch-alert-hub"></canvas></div>
      </div>
    </div>
    <div class="card mb-4">
      <div class="card-title">Live Congestion Preview — ${congestion.totalChecked} Terminals Evaluated</div>
      <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <span class="kpi-badge badge-red">🚨 Emergency: ${congestion.summary?.emergency || 0}</span>
        <span class="kpi-badge badge-red">🔴 Critical: ${congestion.summary?.critical || 0}</span>
        <span class="kpi-badge badge-yellow">🟡 Warning: ${congestion.summary?.warning || 0}</span>
        <span class="text-muted" style="font-size:12px">Network avg: ${fmt(congestion.networkAvg)}h</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Terminal</th><th>Hub</th><th>Avg Duration</th><th>Deviation</th><th>Severity</th></tr></thead>
          <tbody>
            ${(congestion.allTerminals || []).slice(0, 15).map(t => `
              <tr>
                <td>${t.terminal_name}</td>
                <td>${t.regional_hub}</td>
                <td>${fmt(t.avg_duration)}h</td>
                <td class="${t.deviation_pct > 0 ? "text-red" : "text-green"}">${t.deviation_pct > 0 ? "+" : ""}${fmt(t.deviation_pct)}%</td>
                <td>${t.severity !== "NORMAL" ? severityBadge(t.severity) : `<span class="text-muted">Normal</span>`}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="card-title" style="margin:0">Alert History</div>
        <div style="display:flex;gap:8px">
          ${currentUser?.role !== "user" ? `<button class="btn btn-secondary btn-sm" id="seed-alerts-btn">Seed Historical Alerts</button>` : ""}
          ${currentUser?.role !== "user" ? `<button class="btn btn-primary btn-sm" id="run-job-btn">Run Daily Job</button>` : ""}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Severity</th><th>Hub</th><th>Observed</th><th>Status</th><th>Action</th></tr></thead>
          <tbody id="alerts-tbody">
            ${alerts.length === 0 ? `<tr><td colspan="7" class="text-muted" style="text-align:center;padding:32px">No alerts yet. Click "Seed Historical Alerts" to populate.</td></tr>` :
              alerts.slice(0, 30).map(a => `
                <tr id="alert-row-${a.id}">
                  <td class="font-mono" style="font-size:12px">${a.created_at?.slice(0,10)}</td>
                  <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.title}</td>
                  <td>${severityBadge(a.severity)}</td>
                  <td>${a.regional_hub || "—"}</td>
                  <td>${fmt(a.observed_value)}h</td>
                  <td>${a.is_acknowledged ? `<span class="text-green">✓ Acked</span>` : `<span class="text-yellow">Pending</span>`}</td>
                  <td>${!a.is_acknowledged ? `<button class="btn btn-sm btn-secondary" onclick="ackAlert(${a.id})">Ack</button>` : "—"}</td>
                </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  mkChart("ch-alert-sev", doughnutConfig(
    Object.keys(bySev), Object.values(bySev), ["#ef4444","#eab308","#0ea5e9","#22c55e"]
  ));
  mkChart("ch-alert-hub", barConfig(
    Object.keys(byHub), [{ label: "Alerts", data: Object.values(byHub), backgroundColor: ["#0ea5e9","#22c55e","#eab308","#a855f7"] }],
    { plugins: { legend: { display: false } } }
  ));
  document.getElementById("seed-alerts-btn")?.addEventListener("click", async () => {
    document.getElementById("seed-alerts-btn").textContent = "Seeding...";
    await apiFetch("/api/alerts/seed", { method: "POST" });
    loadAlerts();
  });
  document.getElementById("run-job-btn")?.addEventListener("click", async () => {
    document.getElementById("run-job-btn").textContent = "Running...";
    await apiFetch("/api/alerts/run-daily-job", { method: "POST" });
    loadAlerts();
  });
}

window.ackAlert = async (id) => {
  await apiFetch(`/api/alerts/acknowledge/${id}`, { method: "POST" });
  const row = document.getElementById(`alert-row-${id}`);
  if (row) row.querySelector("td:nth-child(6)").innerHTML = `<span class="text-green">✓ Acked</span>`;
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════════
async function loadOptimization() {
  const el = document.getElementById("page-optimization");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading optimization recommendations...</div>`;
  let recs = await apiFetch("/api/optimization/list");
  if (!recs || recs.length === 0) {
    await apiFetch("/api/optimization/generate", { method: "POST" });
    recs = await apiFetch("/api/optimization/list");
  }
  const totalGain = recs.reduce((s, r) => s + (parseFloat(r.efficiency_gain) || 0), 0) / (recs.length || 1);
  const highPriority = recs.filter(r => r.priority === "High").length;
  el.innerHTML = `
    <div class="page-header">
      <h1>Optimization Recommendations</h1>
      <p>AI-generated efficiency improvement strategies targeting 15% duration reduction</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Recommendations</div><div class="kpi-value">${recs.length}</div>${badge("badge-blue","Generated")}</div>
      <div class="kpi-card"><div class="kpi-label">High Priority</div><div class="kpi-value">${highPriority}</div>${badge("badge-red","Urgent")}</div>
      <div class="kpi-card"><div class="kpi-label">Avg Efficiency Gain</div><div class="kpi-value">${fmt(totalGain)}%</div>${badge("badge-green","Projected")}</div>
    </div>
    ${recs.length > 0 ? `
    <div class="chart-card mb-4">
      <div class="chart-title">Current vs Projected Duration</div>
      <div class="chart-sub">Expected improvement per recommendation</div>
      <div class="chart-wrap"><canvas id="ch-opt-bar"></canvas></div>
    </div>` : ""}
    <div style="display:flex;gap:12px;margin-bottom:16px">
      ${currentUser?.role !== "user" ? `<button class="btn btn-primary" id="gen-recs-btn">Generate Recommendations</button>` : ""}
    </div>
    <div id="recs-list">
      ${recs.map(r => `
        <div class="card mb-4">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <div>
              <span class="kpi-badge ${r.priority === "High" ? "badge-red" : r.priority === "Medium" ? "badge-yellow" : "badge-blue"}">${r.priority}</span>
              <span class="kpi-badge badge-blue" style="margin-left:6px">${r.category}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              ${statusBadge(r.implementation_status || "Pending")}
              ${currentUser?.role !== "user" ? `
                <button class="btn btn-sm btn-secondary" onclick="updateRecStatus(${r.id},'InProgress')">Start</button>
                <button class="btn btn-sm btn-secondary" onclick="updateRecStatus(${r.id},'Completed')">Complete</button>` : ""}
            </div>
          </div>
          <div style="font-size:15px;font-weight:600;margin-bottom:8px">${r.title}</div>
          <div style="font-size:13px;color:#94a3b8;margin-bottom:12px">${r.description || ""}</div>
          ${r.current_duration ? `
            <div style="display:flex;gap:16px;font-size:13px">
              <span>Current: <strong class="text-red">${fmt(r.current_duration)}h</strong></span>
              <span>Projected: <strong class="text-green">${fmt(r.projected_duration)}h</strong></span>
              <span>Gain: <strong class="text-green">+${fmt(r.efficiency_gain)}%</strong></span>
            </div>` : ""}
        </div>`).join("")}
    </div>
  `;
  if (recs.length > 0) {
    mkChart("ch-opt-bar", barConfig(
      recs.map(r => r.title?.slice(0, 30) + "..."),
      [
        { label: "Current Duration", data: recs.map(r => r.current_duration || 0), backgroundColor: "#ef4444" },
        { label: "Projected Duration", data: recs.map(r => r.projected_duration || 0), backgroundColor: "#22c55e" },
      ],
      { indexAxis: "y" }
    ));
  }
  document.getElementById("gen-recs-btn")?.addEventListener("click", async () => {
    document.getElementById("gen-recs-btn").textContent = "Generating...";
    await apiFetch("/api/optimization/generate", { method: "POST" });
    loadOptimization();
  });
}

window.updateRecStatus = async (id, status) => {
  await apiFetch("/api/optimization/update-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
  loadOptimization();
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: AI INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════
const INSIGHT_TYPES = [
  { value: "executive_summary",   label: "Executive Summary" },
  { value: "bottleneck_analysis", label: "Bottleneck Analysis" },
  { value: "suez_impact",         label: "Suez Canal Impact" },
  { value: "efficiency_patterns", label: "Efficiency Patterns" },
  { value: "optimization_strategy", label: "Optimization Strategy" },
];

async function loadInsights() {
  const el = document.getElementById("page-insights");
  el.innerHTML = `
    <div class="page-header">
      <h1>AI Insights</h1>
      <p>LLM-generated executive narratives and operational analysis</p>
    </div>
    <div class="filters mb-4">
      <select class="filter-select" id="insight-type">
        ${INSIGHT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
      </select>
      ${currentUser?.role !== "user" ? `<button class="btn btn-primary" id="gen-insight-btn">Generate Insight</button>` : ""}
    </div>
    <div id="insight-content"><div class="empty-state"><p>Select an insight type and click Generate.</p></div></div>
  `;
  document.getElementById("insight-type").addEventListener("change", async () => {
    const type = document.getElementById("insight-type").value;
    const cached = await apiFetch(`/api/insights/get?type=${type}`);
    if (cached) renderInsight(cached.insight);
    else document.getElementById("insight-content").innerHTML = `<div class="empty-state"><p>No cached insight. Click Generate to create one.</p></div>`;
  });
  document.getElementById("gen-insight-btn")?.addEventListener("click", async () => {
    const type = document.getElementById("insight-type").value;
    document.getElementById("insight-content").innerHTML = `<div class="loading"><div class="spinner"></div> Generating insight...</div>`;
    const res = await apiFetch(`/api/insights/generate?type=${type}`, { method: "POST" });
    renderInsight(res.insight);
  });
  // Load default
  const cached = await apiFetch("/api/insights/get?type=executive_summary");
  if (cached) renderInsight(cached.insight);
}

function renderInsight(text) {
  // Simple markdown-like rendering
  const html = text
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br/><br/>");
  document.getElementById("insight-content").innerHTML = `<div class="insight-box">${html}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: DATA EXPLORER
// ═══════════════════════════════════════════════════════════════════════════════
let explorerOffset = 0;

async function loadExplorer() {
  const el = document.getElementById("page-explorer");
  el.innerHTML = `
    <div class="page-header">
      <h1>Data Explorer</h1>
      <p>Filter and explore all 16,000+ cargo movement records</p>
    </div>
    <div class="filters mb-4">
      <select class="filter-select" id="ex-hub">
        <option value="">All Hubs</option>
        <option value="EMEA">EMEA</option><option value="APAC">APAC</option>
        <option value="AMER">AMER</option><option value="LATAM">LATAM</option>
      </select>
      <select class="filter-select" id="ex-category">
        <option value="">All Categories</option>
        <option value="Container">Container</option><option value="Tanker">Tanker</option>
        <option value="Cargo">Cargo</option><option value="Passenger">Passenger</option>
      </select>
      <input class="filter-input" id="ex-start" type="date" value="2020-01-01" />
      <input class="filter-input" id="ex-end" type="date" value="2024-12-31" />
      <button class="btn btn-primary" id="ex-search-btn">Search</button>
      <button class="btn btn-secondary" id="ex-reset-btn">Reset</button>
    </div>
    <div class="card">
      <div id="ex-results"><div class="loading"><div class="spinner"></div> Loading...</div></div>
    </div>
  `;
  document.getElementById("ex-search-btn").addEventListener("click", () => { explorerOffset = 0; fetchExplorer(); });
  document.getElementById("ex-reset-btn").addEventListener("click", () => {
    document.getElementById("ex-hub").value = "";
    document.getElementById("ex-category").value = "";
    document.getElementById("ex-start").value = "2020-01-01";
    document.getElementById("ex-end").value = "2024-12-31";
    explorerOffset = 0;
    fetchExplorer();
  });
  fetchExplorer();
}

async function fetchExplorer() {
  const hub      = document.getElementById("ex-hub")?.value || "";
  const category = document.getElementById("ex-category")?.value || "";
  const start    = document.getElementById("ex-start")?.value || "";
  const end      = document.getElementById("ex-end")?.value || "";
  const params   = new URLSearchParams({ limit: 50, offset: explorerOffset });
  if (hub)      params.set("hub", hub);
  if (category) params.set("vessel_category", category);
  if (start)    params.set("start_date", start);
  if (end)      params.set("end_date", end);
  const data = await apiFetch(`/api/explorer/movements?${params}`);
  const { rows, total } = data;
  document.getElementById("ex-results").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span class="text-muted" style="font-size:13px">Showing ${explorerOffset + 1}–${Math.min(explorerOffset + rows.length, total)} of ${fmtInt(total)} records</span>
      <div style="display:flex;gap:8px">
        ${explorerOffset > 0 ? `<button class="btn btn-secondary btn-sm" onclick="explorerPage(-1)">← Prev</button>` : ""}
        ${explorerOffset + rows.length < total ? `<button class="btn btn-secondary btn-sm" onclick="explorerPage(1)">Next →</button>` : ""}
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Terminal</th><th>Hub</th><th>Vessel</th><th>Category</th><th>Age</th><th>Containers</th><th>Duration</th><th>Shift</th><th>Anomaly</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="font-mono" style="font-size:12px">${r.date_id}</td>
              <td>${r.terminal_name}</td>
              <td>${r.regional_hub}</td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.vessel_name}</td>
              <td>${r.vessel_category}</td>
              <td>${r.vessel_age}y</td>
              <td>${fmtInt(r.container_count)}</td>
              <td class="${parseFloat(r.move_duration) > 1000 ? "text-red" : ""}">${fmt(r.move_duration)}h</td>
              <td>${r.shift}</td>
              <td>${r.is_anomaly ? `<span class="badge-red kpi-badge">Yes</span>` : `<span class="text-muted">—</span>`}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

window.explorerPage = (dir) => {
  explorerOffset = Math.max(0, explorerOffset + dir * 50);
  fetchExplorer();
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: ADMIN
// ═══════════════════════════════════════════════════════════════════════════════
async function loadAdmin() {
  const el = document.getElementById("page-admin");
  el.innerHTML = `<div class="loading"><div class="spinner"></div> Loading users...</div>`;
  const users = await apiFetch("/api/admin/users");
  const adminCount   = users.filter(u => u.role === "admin").length;
  const analystCount = users.filter(u => u.role === "analyst").length;
  el.innerHTML = `
    <div class="page-header">
      <h1>Admin — User Management</h1>
      <p>Manage platform users and role-based access control</p>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total Users</div><div class="kpi-value">${users.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Admins</div><div class="kpi-value">${adminCount}</div>${badge("badge-red","Admin")}</div>
      <div class="kpi-card"><div class="kpi-label">Analysts</div><div class="kpi-value">${analystCount}</div>${badge("badge-blue","Analyst")}</div>
    </div>
    <div class="card">
      <div class="card-title">Platform Users</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Permissions</th><th>Action</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td class="font-mono">${u.username}</td>
                <td>${u.name}</td>
                <td>${severityBadge(u.role === "admin" ? "Critical" : u.role === "analyst" ? "Warning" : "Info")}</td>
                <td style="font-size:12px;color:#64748b">${u.role === "admin" ? "Full access" : u.role === "analyst" ? "Read + Generate" : "Read only"}</td>
                <td>
                  <select class="filter-select" style="font-size:12px;padding:4px 8px" onchange="updateRole('${u.username}', this.value)">
                    <option ${u.role === "user" ? "selected" : ""} value="user">User</option>
                    <option ${u.role === "analyst" ? "selected" : ""} value="analyst">Analyst</option>
                    <option ${u.role === "admin" ? "selected" : ""} value="admin">Admin</option>
                  </select>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-title">Role Permissions</div>
      <table>
        <thead><tr><th>Permission</th><th>User</th><th>Analyst</th><th>Admin</th></tr></thead>
        <tbody>
          <tr><td>View all dashboards</td><td class="text-green">✓</td><td class="text-green">✓</td><td class="text-green">✓</td></tr>
          <tr><td>Generate forecasts</td><td class="text-red">✗</td><td class="text-green">✓</td><td class="text-green">✓</td></tr>
          <tr><td>Generate AI insights</td><td class="text-red">✗</td><td class="text-green">✓</td><td class="text-green">✓</td></tr>
          <tr><td>Run daily alert job</td><td class="text-red">✗</td><td class="text-green">✓</td><td class="text-green">✓</td></tr>
          <tr><td>Seed historical alerts</td><td class="text-red">✗</td><td class="text-red">✗</td><td class="text-green">✓</td></tr>
          <tr><td>Manage users</td><td class="text-red">✗</td><td class="text-red">✗</td><td class="text-green">✓</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

window.updateRole = async (username, role) => {
  await apiFetch("/api/admin/update-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, role }) });
};

// ── Boot ──────────────────────────────────────────────────────────────────────
checkAuth();
