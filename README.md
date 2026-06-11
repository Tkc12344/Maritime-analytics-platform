# Global Maritime Solutions — Analytics Platform

A full-stack maritime logistics analytics dashboard built with **Python (FastAPI)** on the backend and **vanilla HTML/CSS/JavaScript** on the frontend. The platform analyses cargo movement data across global terminal networks, providing operational insights, anomaly detection, predictive forecasting, and AI-generated recommendations.

---

## Overview

The platform ingests ~18,000+ synthetic cargo movement records spanning 2020–2024 across 46 terminals in four regional hubs (EMEA, APAC, AMER, LATAM). It mirrors a production-grade analytics dashboard with 10 fully interactive pages, role-based access control, machine learning models, and an optional OpenAI integration for narrative insights.

---

## Features

### 10 Dashboard Pages

| Page | Description |
|---|---|
| **Executive Overview** | KPI summary, monthly duration trends, container volumes by hub |
| **Suez Analysis** | Impact of the March 2021 Ever Given blockage — disruption, recovery, and regional effects |
| **Bottlenecks** | Terminal utilisation ranking, vessel category baselines, over-capacity detection |
| **Efficiency Anomalies** | Z-score outlier detection, shift analysis (Day vs Night), vessel age correlation |
| **Forecasting** | ARIMA(2,1,2) and Prophet-style 12-month forecasts with confidence intervals; ML regression predictor |
| **Alerts** | Congestion alert engine with severity tiers (Warning / Critical / Emergency), acknowledgement workflow |
| **Optimization** | AI-generated optimisation recommendations ranked by efficiency gain and priority |
| **AI Insights** | GPT-4o-mini powered (or fallback) narrative analysis — executive summary, bottleneck report, Suez impact, efficiency patterns, and strategy |
| **Data Explorer** | Filterable, paginated raw movement table with hub, vessel category, and date range filters |
| **Admin** | User management and role assignment (admin only) |

### Machine Learning

- **Isolation Forest** — unsupervised anomaly detection on movement duration, container count, and vessel age
- **Z-score detection** — statistical outlier flagging (threshold: |z| > 2.5)
- **Linear Regression** — movement duration prediction from vessel category, hub, shift, age, and container count
- **ARIMA(2,1,2)** — time-series forecasting on monthly average durations with 95% confidence intervals

### Authentication & RBAC

Three demo roles with route-level enforcement:

| Role | Username | Password | Access |
|---|---|---|---|
| Admin | `admin` | `admin123` | All pages + admin panel |
| Analyst | `analyst` | `analyst123` | All analytics + generate/seed actions |
| User | `user` | `user123` | Read-only analytics |

Sessions are cookie-based (httponly, 7-day expiry) and stored in-memory.

---

## Project Structure

```
maritime_exact_python/
├── backend/
│   ├── main.py          # FastAPI app — all API routes + ML models + static file serving
│   └── requirements.txt # Python dependencies
├── frontend/
│   ├── index.html       # Single-page app shell
│   ├── app.js           # All 10 page loaders, Chart.js visualisations, API client
│   └── style.css        # Dark-theme responsive styles
└── data/
    ├── generate_datasets.py   # One-time dataset generator
    ├── terminals.csv          # 46 terminals across 4 regional hubs
    ├── vessels.csv            # 636 vessels across 4 categories
    ├── cargo_movements.csv    # ~18,000+ movements (2020–2024)
    ├── alerts.csv             # Seeded via API
    ├── optimization_recs.csv  # Generated via API
    └── insights.json          # Cached AI-generated narratives
```

---

## Getting Started

### 1. Generate the datasets

```bash
cd data
python generate_datasets.py
```

This creates all CSV files. Run once before starting the server.

### 2. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Start the server

```bash
cd backend
python main.py
```

The API and dashboard are served from the same origin at **http://localhost:8000**.

| URL | Description |
|---|---|
| `http://localhost:8000/` | Dashboard (login page) |
| `http://localhost:8000/docs` | Interactive API docs (Swagger UI) |

### 4. (Optional) Enable AI Insights

Set your OpenAI API key before starting the server:

```bash
export OPENAI_API_KEY=sk-...
python main.py
```

Without a key the insights page falls back to pre-built analytical templates — all other features work without it.

---

## API Reference

All routes are prefixed with `/api/`. Key endpoint groups:

| Prefix | Description |
|---|---|
| `/api/auth/` | Login, logout, session check |
| `/api/overview/` | KPIs, monthly trends, regional summary |
| `/api/suez/` | Disruption period analysis and timeline |
| `/api/terminals/` | Performance ranking and utilisation |
| `/api/vessels/` | Category baselines, age correlation, shift analysis |
| `/api/anomalies/` | Outlier list and statistics |
| `/api/forecast/` | ARIMA, Prophet, and regression prediction |
| `/api/alerts/` | Congestion alerts — list, seed, acknowledge, daily job |
| `/api/optimization/` | Recommendations — generate and update status |
| `/api/insights/` | AI narrative generation and caching |
| `/api/explorer/` | Paginated, filtered raw movement data |
| `/api/admin/` | User listing and role management |
| `/api/health` | Server health check |

Full interactive docs available at `/docs` when the server is running.

---

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — API framework
- [Pandas](https://pandas.pydata.org/) / [NumPy](https://numpy.org/) — data processing
- [scikit-learn](https://scikit-learn.org/) — Isolation Forest, Linear Regression, Label Encoding
- [statsmodels](https://www.statsmodels.org/) — ARIMA forecasting
- [Uvicorn](https://www.uvicorn.org/) — ASGI server

**Frontend**
- Vanilla HTML5 / CSS3 / JavaScript (no framework)
- [Chart.js 4](https://www.chartjs.org/) — all data visualisations
- Dark-themed responsive single-page app

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Server port |
| `SECRET_KEY` | `maritime-secret-key-...` | Change in production |
| `OPENAI_API_KEY` | *(empty)* | Enables GPT-4o-mini insights |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Override for custom endpoints |

---

## Notes

- All data is synthetic — generated deterministically with `random.seed(42)` for reproducibility
- The Suez Canal disruption (March 23–29, 2021) is modelled as a 45% duration spike, with a 10% elevated recovery period through June 2021
- Sessions are in-memory only — they reset on server restart
- Passwords are stored in plaintext in the demo user store — this is intentional for the demo and should not be used in production
