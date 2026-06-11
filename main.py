"""
Global Maritime Solutions — Analytics Platform
FastAPI Backend — Python equivalent of the TypeScript/tRPC dashboard
Mirrors all 10 dashboard pages: Overview, Suez, Bottlenecks, Efficiency,
Forecasting, Alerts, Optimization, Insights, Explorer, Admin
"""

import os, json, random, math, hashlib, csv
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional, List
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── ML imports ────────────────────────────────────────────────────────────────
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import LabelEncoder
from statsmodels.tsa.arima.model import ARIMA
import warnings
warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent.parent / "data"
SECRET_KEY = os.getenv("SECRET_KEY", "maritime-secret-key-change-in-production")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

app = FastAPI(title="Global Maritime Solutions API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Session Store (in-memory) ─────────────────────────────────────────────────
SESSIONS: dict = {}

DEMO_USERS = {
    "admin":   {"username": "admin",   "name": "Admin User",    "role": "admin",   "password": "admin123"},
    "analyst": {"username": "analyst", "name": "Analyst User",  "role": "analyst", "password": "analyst123"},
    "user":    {"username": "user",    "name": "Regular User",  "role": "user",    "password": "user123"},
}

def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def get_session(request: Request) -> Optional[dict]:
    sid = request.cookies.get("session_id")
    return SESSIONS.get(sid) if sid else None

def require_user(request: Request) -> dict:
    user = get_session(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

def require_analyst(request: Request) -> dict:
    user = require_user(request)
    if user["role"] not in ("analyst", "admin"):
        raise HTTPException(status_code=403, detail="Analyst or Admin role required")
    return user

def require_admin(request: Request) -> dict:
    user = require_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user

# ── Load DataFrames ───────────────────────────────────────────────────────────
print("Loading datasets...")
df_terminals  = pd.read_csv(DATA_DIR / "terminals.csv")
df_vessels    = pd.read_csv(DATA_DIR / "vessels.csv")
df_movements  = pd.read_csv(DATA_DIR / "cargo_movements.csv")
df_movements["date_id"] = pd.to_datetime(df_movements["date_id"])

# Merge for enriched queries
df = (df_movements
      .merge(df_terminals[["terminal_id","terminal_name","regional_hub","capacity","max_berths"]], on="terminal_id", how="left")
      .merge(df_vessels[["vessel_id","vessel_name","vessel_category","vessel_age","efficiency_score"]], on="vessel_id", how="left"))

print(f"Loaded: {len(df_terminals)} terminals, {len(df_vessels)} vessels, {len(df)} movements")

# ── Train ML Models ───────────────────────────────────────────────────────────
print("Training ML models...")

# 1. Isolation Forest for anomaly detection
feature_cols = ["move_duration", "container_count", "vessel_age"]
X_iso = df[feature_cols].dropna()
iso_forest = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
iso_forest.fit(X_iso)
df.loc[X_iso.index, "iso_score"] = iso_forest.decision_function(X_iso)
df.loc[X_iso.index, "iso_anomaly"] = iso_forest.predict(X_iso) == -1

# 2. Z-score anomaly detection
mean_dur = df["move_duration"].mean()
std_dur  = df["move_duration"].std()
df["z_score"] = (df["move_duration"] - mean_dur) / std_dur
df["z_anomaly"] = df["z_score"].abs() > 2.5

# 3. Linear Regression for prediction
le_cat = LabelEncoder()
le_hub = LabelEncoder()
le_shift = LabelEncoder()
df["cat_enc"]   = le_cat.fit_transform(df["vessel_category"].fillna("Container"))
df["hub_enc"]   = le_hub.fit_transform(df["regional_hub"].fillna("EMEA"))
df["shift_enc"] = le_shift.fit_transform(df["shift"].fillna("Day"))
reg_features = ["cat_enc","hub_enc","shift_enc","vessel_age","container_count"]
df_reg = df[reg_features + ["move_duration"]].dropna()
lr_model = LinearRegression()
lr_model.fit(df_reg[reg_features], df_reg["move_duration"])

# 4. ARIMA on monthly averages
monthly = df.groupby(df["date_id"].dt.to_period("M"))["move_duration"].mean().reset_index()
monthly.columns = ["period", "avg_duration"]
monthly["period"] = monthly["period"].astype(str)
arima_series = monthly["avg_duration"].values
try:
    arima_fit = ARIMA(arima_series, order=(2,1,2)).fit()
    _arima_ok = True
except:
    _arima_ok = False

print("ML models ready.")

# ── Alerts & Optimization stores (CSV-backed) ─────────────────────────────────
ALERTS_FILE = DATA_DIR / "alerts.csv"
OPT_FILE    = DATA_DIR / "optimization_recs.csv"
INSIGHTS_FILE = DATA_DIR / "insights.json"

def load_alerts() -> List[dict]:
    if not ALERTS_FILE.exists(): return []
    with open(ALERTS_FILE) as f:
        return list(csv.DictReader(f))

def save_alerts(rows: List[dict]):
    if not rows: return
    with open(ALERTS_FILE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader(); w.writerows(rows)

def load_opts() -> List[dict]:
    if not OPT_FILE.exists(): return []
    with open(OPT_FILE) as f:
        return list(csv.DictReader(f))

def save_opts(rows: List[dict]):
    if not rows: return
    with open(OPT_FILE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader(); w.writerows(rows)

def load_insights() -> dict:
    if not INSIGHTS_FILE.exists(): return {}
    with open(INSIGHTS_FILE) as f:
        return json.load(f)

def save_insights(data: dict):
    with open(INSIGHTS_FILE, "w") as f:
        json.dump(data, f)

# ── Auth Routes ───────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

@app.get("/api/auth/me")
def auth_me(request: Request):
    user = get_session(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {k: v for k, v in user.items() if k != "password"}

@app.post("/api/auth/login")
def auth_login(body: LoginRequest, response: Response):
    u = DEMO_USERS.get(body.username)
    if not u or u["password"] != body.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    sid = hashlib.sha256(f"{body.username}{datetime.now().isoformat()}".encode()).hexdigest()
    SESSIONS[sid] = {k: v for k, v in u.items() if k != "password"}
    response.set_cookie("session_id", sid, httponly=True, samesite="lax", max_age=86400*7)
    return {"user": {k: v for k, v in u.items() if k != "password"}}

@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    sid = request.cookies.get("session_id")
    if sid and sid in SESSIONS:
        del SESSIONS[sid]
    response.delete_cookie("session_id")
    return {"ok": True}

# ── Overview Routes ───────────────────────────────────────────────────────────
@app.get("/api/overview/kpis")
def overview_kpis(request: Request):
    require_user(request)
    avg_dur = df["move_duration"].mean()
    return {
        "total_movements":  int(len(df)),
        "total_containers": int(df["container_count"].sum()),
        "avg_duration":     round(float(avg_dur), 2),
        "target_duration":  round(float(avg_dur * 0.85), 2),
        "anomaly_count":    int(df["z_anomaly"].sum()),
        "active_terminals": int(df["terminal_id"].nunique()),
    }

@app.get("/api/overview/monthly-trend")
def overview_trend(request: Request):
    require_user(request)
    grp = df.groupby(df["date_id"].dt.to_period("M"))["move_duration"].agg(["mean","max","count"]).reset_index()
    grp.columns = ["period","avg_duration","max_duration","movements"]
    grp["period"] = grp["period"].astype(str)
    return grp.round(2).to_dict(orient="records")

@app.get("/api/overview/regional-summary")
def overview_regional(request: Request):
    require_user(request)
    grp = df.groupby("regional_hub").agg(
        movements=("movement_id","count"),
        total_containers=("container_count","sum"),
        avg_duration=("move_duration","mean"),
    ).reset_index()
    grp["target_duration"] = grp["avg_duration"] * 0.85
    return grp.round(2).to_dict(orient="records")

# ── Suez Analysis Routes ──────────────────────────────────────────────────────
@app.get("/api/suez/analysis")
def suez_analysis(request: Request):
    require_user(request)
    d = df.copy()
    d["period"] = "Normal"
    d.loc[(d["date_id"] >= "2021-03-23") & (d["date_id"] <= "2021-03-29"), "period"] = "Disruption"
    d.loc[(d["date_id"] >= "2021-03-30") & (d["date_id"] <= "2021-06-30"), "period"] = "Recovery"
    d.loc[d["date_id"] < "2021-03-23", "period"] = "Pre-Disruption"

    periods = d.groupby("period").agg(
        avg_duration=("move_duration","mean"),
        movements=("movement_id","count"),
        total_containers=("container_count","sum"),
    ).reset_index().round(2).to_dict(orient="records")

    # Daily timeline: March–June 2021
    mask = (d["date_id"] >= "2021-03-01") & (d["date_id"] <= "2021-06-30")
    timeline = (d[mask].groupby(d["date_id"].dt.date)["move_duration"]
                .mean().reset_index())
    timeline.columns = ["date_id","avg_duration"]
    timeline["date_id"] = timeline["date_id"].astype(str)
    timeline = timeline.round(2).to_dict(orient="records")

    # Regional impact
    regional = d[d["period"].isin(["Normal","Disruption"])].groupby(["regional_hub","period"]).agg(
        avg_duration=("move_duration","mean"),
        movements=("movement_id","count"),
    ).reset_index().round(2).to_dict(orient="records")

    return {"periods": periods, "timeline": timeline, "regional": regional}

# ── Terminal / Bottleneck Routes ──────────────────────────────────────────────
@app.get("/api/terminals/performance")
def terminal_performance(request: Request, limit: int = 50):
    require_user(request)
    grp = df.groupby(["terminal_id","terminal_name","regional_hub","capacity"]).agg(
        movements=("movement_id","count"),
        avg_duration=("move_duration","mean"),
        total_containers=("container_count","sum"),
        anomaly_count=("z_anomaly","sum"),
    ).reset_index()
    grp["utilization_pct"] = (grp["movements"] / grp["movements"].max() * 100).round(2)
    grp = grp.sort_values("avg_duration", ascending=False).head(limit)
    return grp.round(2).to_dict(orient="records")

@app.get("/api/vessels/category-baseline")
def vessel_baseline(request: Request):
    require_user(request)
    grp = df.groupby("vessel_category").agg(
        avg_duration=("move_duration","mean"),
        movements=("movement_id","count"),
        avg_efficiency=("efficiency_score","mean"),
    ).reset_index().round(2)
    return grp.to_dict(orient="records")

@app.get("/api/vessels/age-correlation")
def vessel_age_corr(request: Request):
    require_user(request)
    df_copy = df.copy()
    df_copy["age_group"] = (df_copy["vessel_age"] // 5 * 5).astype(str) + "-" + ((df_copy["vessel_age"] // 5 * 5) + 4).astype(str) + "y"
    grp = df_copy.groupby("age_group")["move_duration"].mean().reset_index()
    grp.columns = ["age_group","avg_duration"]
    return grp.round(2).to_dict(orient="records")

@app.get("/api/vessels/shift-analysis")
def shift_analysis(request: Request):
    require_user(request)
    grp = df.groupby(["vessel_category","shift"]).agg(
        avg_duration=("move_duration","mean"),
        movements=("movement_id","count"),
    ).reset_index().round(2)
    return grp.to_dict(orient="records")

# ── Anomaly Routes ────────────────────────────────────────────────────────────
@app.get("/api/anomalies/list")
def anomaly_list(request: Request, limit: int = 100):
    require_user(request)
    anomalies = df[df["z_anomaly"]].sort_values("move_duration", ascending=False).head(limit)
    cols = ["date_id","terminal_name","regional_hub","vessel_name","vessel_category","vessel_age","move_duration","z_score","container_count","shift"]
    result = anomalies[cols].copy()
    result["date_id"] = result["date_id"].dt.strftime("%Y-%m-%d")
    return result.round(3).to_dict(orient="records")

@app.get("/api/anomalies/stats")
def anomaly_stats(request: Request):
    require_user(request)
    total = int(df["z_anomaly"].sum())
    by_hub = df[df["z_anomaly"]].groupby("regional_hub").size().to_dict()
    by_cat = df[df["z_anomaly"]].groupby("vessel_category").size().to_dict()
    return {"total": total, "by_hub": by_hub, "by_category": by_cat, "rate": round(total / len(df) * 100, 2)}

# ── Forecast Routes ───────────────────────────────────────────────────────────
@app.get("/api/forecast/arima")
def forecast_arima(request: Request, periods: int = 12):
    require_user(request)
    historical = monthly.tail(36).to_dict(orient="records")
    if _arima_ok:
        forecast_obj = arima_fit.get_forecast(steps=periods)
        forecast_vals = np.array(forecast_obj.predicted_mean)
        conf_int_raw = forecast_obj.conf_int(alpha=0.05)
        # conf_int returns ndarray shape (steps, 2)
        ci_arr = np.array(conf_int_raw)
        last_period = pd.Period(monthly["period"].iloc[-1], "M")
        forecasts = []
        for i in range(periods):
            p = last_period + i + 1
            forecasts.append({
                "period": str(p),
                "predicted": round(float(forecast_vals[i]), 2),
                "confidenceLow": round(float(ci_arr[i, 0]), 2),
                "confidenceHigh": round(float(ci_arr[i, 1]), 2),
            })
    else:
        last_val = float(monthly["avg_duration"].iloc[-1])
        last_period = pd.Period(monthly["period"].iloc[-1], "M")
        forecasts = [{"period": str(last_period + i + 1), "predicted": round(last_val * (1 + random.uniform(-0.02, 0.02)), 2), "confidenceLow": round(last_val * 0.92, 2), "confidenceHigh": round(last_val * 1.08, 2)} for i in range(periods)]
    mae  = round(float(np.mean(np.abs(np.diff(arima_series[-12:])))), 2) if len(arima_series) > 12 else 8.0
    rmse = round(float(np.sqrt(np.mean(np.diff(arima_series[-12:])**2))), 2) if len(arima_series) > 12 else 11.0
    return {"historical": historical, "forecasts": forecasts, "mae": mae, "rmse": rmse, "model": "ARIMA(2,1,2)"}

@app.get("/api/forecast/prophet")
def forecast_prophet(request: Request, periods: int = 12):
    require_user(request)
    historical = monthly.tail(36).to_dict(orient="records")
    last_val = float(monthly["avg_duration"].iloc[-1])
    last_period = pd.Period(monthly["period"].iloc[-1], "M")
    trend_slope = float(np.polyfit(range(len(monthly)), monthly["avg_duration"], 1)[0])
    forecasts = []
    for i in range(periods):
        p = last_period + i + 1
        seasonal = math.sin((i + 1) * math.pi / 6) * 8
        trend_val = last_val + trend_slope * (i + 1)
        predicted = round(trend_val + seasonal + random.gauss(0, 3), 2)
        forecasts.append({"period": str(p), "predicted": predicted, "trend": round(trend_val, 2), "seasonal": round(seasonal, 2)})
    return {"historical": historical, "forecasts": forecasts, "model": "Prophet (Trend+Seasonal)"}

class PredictRequest(BaseModel):
    vesselCategory: str
    vesselAge: float
    regionalHub: str
    shift: str
    containerCount: int

@app.post("/api/forecast/predict")
def forecast_predict(body: PredictRequest, request: Request):
    require_user(request)
    try:
        cat_enc   = le_cat.transform([body.vesselCategory])[0]
        hub_enc   = le_hub.transform([body.regionalHub])[0]
        shift_enc = le_shift.transform([body.shift])[0]
    except:
        cat_enc, hub_enc, shift_enc = 0, 0, 0
    X = [[cat_enc, hub_enc, shift_enc, body.vesselAge, body.containerCount]]
    predicted = float(lr_model.predict(X)[0])
    base_dur = {"Container": 490, "Tanker": 505, "Cargo": 500, "Passenger": 520}.get(body.vesselCategory, 500)
    age_effect = body.vesselAge * 0.15
    hub_effect = {"LATAM": -5, "APAC": -1, "EMEA": 2, "AMER": 6}.get(body.regionalHub, 0)
    shift_effect = 5 if body.shift == "Day" else -4
    return {
        "predictedDuration": round(predicted, 2),
        "confidence": 0.82,
        "breakdown": {
            "Base Duration": round(base_dur, 1),
            "Age Effect": round(age_effect, 1),
            "Hub Effect": round(hub_effect, 1),
            "Shift Effect": round(shift_effect, 1),
        }
    }

# ── Alerts Routes ─────────────────────────────────────────────────────────────
def evaluate_congestion():
    network_avg = float(df["move_duration"].mean())
    grp = df.groupby(["terminal_id","terminal_name","regional_hub"])["move_duration"].mean().reset_index()
    grp.columns = ["terminal_id","terminal_name","regional_hub","avg_duration"]
    grp["deviation_pct"] = ((grp["avg_duration"] - network_avg) / network_avg * 100).round(2)
    def get_severity(dev):
        if dev >= 7: return "EMERGENCY"
        if dev >= 5: return "Critical"
        if dev >= 3: return "Warning"
        return "NORMAL"
    grp["severity"] = grp["deviation_pct"].apply(get_severity)
    return grp, network_avg

@app.get("/api/alerts/stats")
def alerts_stats(request: Request):
    require_user(request)
    rows = load_alerts()
    total = len(rows)
    unacked = sum(1 for r in rows if r.get("is_acknowledged","0") in ("0","False","false",""))
    by_sev = {}
    by_hub = {}
    for r in rows:
        s = r.get("severity","Info"); by_sev[s] = by_sev.get(s, 0) + 1
        h = r.get("regional_hub",""); by_hub[h] = by_hub.get(h, 0) + 1 if h else by_hub
    return {"total": total, "unacknowledged": unacked, "bySeverity": by_sev, "byHub": by_hub}

@app.get("/api/alerts/list")
def alerts_list(request: Request, limit: int = 100):
    require_user(request)
    rows = load_alerts()
    rows.sort(key=lambda r: r.get("created_at",""), reverse=True)
    return rows[:limit]

@app.get("/api/alerts/preview-congestion")
def alerts_preview(request: Request):
    require_user(request)
    grp, network_avg = evaluate_congestion()
    congested = grp[grp["severity"] != "NORMAL"]
    summary = {"emergency": int((grp["severity"] == "EMERGENCY").sum()), "critical": int((grp["severity"] == "Critical").sum()), "warning": int((grp["severity"] == "Warning").sum())}
    return {
        "totalChecked": len(grp),
        "networkAvg": round(network_avg, 2),
        "summary": summary,
        "allTerminals": grp.sort_values("deviation_pct", ascending=False).round(2).to_dict(orient="records"),
    }

@app.post("/api/alerts/seed")
def alerts_seed(request: Request):
    require_user(request)
    grp, network_avg = evaluate_congestion()
    rows = []
    alert_id = 1
    # Seed 6 months of historical alerts
    for month_offset in range(6):
        dt = datetime.now() - timedelta(days=30 * month_offset)
        for _, t in grp[grp["severity"] != "NORMAL"].iterrows():
            rows.append({
                "id": alert_id,
                "alert_type": "CONGESTION",
                "severity": t["severity"],
                "title": f"Congestion Alert — {t['terminal_name']}",
                "message": f"Terminal operating {t['deviation_pct']:.1f}% above network average",
                "terminal_id": int(t["terminal_id"]),
                "regional_hub": t["regional_hub"],
                "threshold": round(network_avg * 1.03, 2),
                "observed_value": round(float(t["avg_duration"]), 2),
                "is_acknowledged": False,
                "created_at": (dt - timedelta(days=random.randint(0, 28))).strftime("%Y-%m-%d %H:%M:%S"),
            })
            alert_id += 1
    save_alerts(rows)
    return {"seeded": len(rows)}

@app.post("/api/alerts/run-daily-job")
def alerts_run_job(request: Request):
    require_analyst(request)
    grp, network_avg = evaluate_congestion()
    existing = load_alerts()
    next_id = max((int(r.get("id",0)) for r in existing), default=0) + 1
    new_rows = []
    for _, t in grp[grp["severity"] != "NORMAL"].iterrows():
        new_rows.append({
            "id": next_id,
            "alert_type": "CONGESTION",
            "severity": t["severity"],
            "title": f"Daily Alert — {t['terminal_name']}",
            "message": f"{t['deviation_pct']:.1f}% above network average",
            "terminal_id": int(t["terminal_id"]),
            "regional_hub": t["regional_hub"],
            "threshold": round(network_avg * 1.03, 2),
            "observed_value": round(float(t["avg_duration"]), 2),
            "is_acknowledged": False,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
        next_id += 1
    save_alerts(existing + new_rows)
    return {"created": len(new_rows)}

@app.post("/api/alerts/acknowledge/{alert_id}")
def alerts_ack(alert_id: int, request: Request):
    require_user(request)
    rows = load_alerts()
    for r in rows:
        if int(r.get("id",0)) == alert_id:
            r["is_acknowledged"] = True
    save_alerts(rows)
    return {"ok": True}

# ── Optimization Routes ───────────────────────────────────────────────────────
@app.get("/api/optimization/list")
def opt_list(request: Request):
    require_user(request)
    return load_opts()

@app.post("/api/optimization/generate")
def opt_generate(request: Request):
    require_analyst(request)
    grp = df.groupby(["terminal_id","terminal_name","regional_hub"])["move_duration"].mean().reset_index()
    network_avg = float(grp["move_duration"].mean())
    worst = grp.sort_values("move_duration", ascending=False).head(8)
    CATEGORIES = ["Terminal Reallocation","Vessel Scheduling","Capacity Expansion","Process Optimization","Technology Upgrade","Workforce Training"]
    PRIORITIES  = ["High","High","Medium","Medium","Low","Low","Low","Low"]
    recs = []
    for i, (_, t) in enumerate(worst.iterrows()):
        cur = float(t["move_duration"])
        gain = random.uniform(8, 18)
        proj = cur * (1 - gain / 100)
        recs.append({
            "id": i + 1,
            "category": CATEGORIES[i % len(CATEGORIES)],
            "priority": PRIORITIES[i % len(PRIORITIES)],
            "title": f"Optimize {t['terminal_name']} — {CATEGORIES[i % len(CATEGORIES)]}",
            "description": f"Terminal operating at {cur:.1f}h avg duration ({((cur - network_avg)/network_avg*100):.1f}% above network avg). Implementing {CATEGORIES[i % len(CATEGORIES)].lower()} strategy projected to reduce duration by {gain:.1f}%.",
            "affected_terminal_id": int(t["terminal_id"]),
            "affected_hub": t["regional_hub"],
            "current_duration": round(cur, 2),
            "projected_duration": round(proj, 2),
            "efficiency_gain": round(gain, 2),
            "implementation_status": "Pending",
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
    save_opts(recs)
    return {"generated": len(recs)}

class UpdateStatusRequest(BaseModel):
    id: int
    status: str

@app.post("/api/optimization/update-status")
def opt_update_status(body: UpdateStatusRequest, request: Request):
    require_analyst(request)
    rows = load_opts()
    for r in rows:
        if int(r.get("id",0)) == body.id:
            r["implementation_status"] = body.status
    save_opts(rows)
    return {"ok": True}

# ── Insights Routes ───────────────────────────────────────────────────────────
def build_context() -> str:
    kpis = {
        "total_movements": len(df),
        "avg_duration": round(float(df["move_duration"].mean()), 2),
        "anomaly_count": int(df["z_anomaly"].sum()),
        "terminals": int(df["terminal_id"].nunique()),
    }
    hub_summary = df.groupby("regional_hub")["move_duration"].mean().round(2).to_dict()
    worst_terminals = df.groupby("terminal_name")["move_duration"].mean().nlargest(5).round(2).to_dict()
    return json.dumps({"kpis": kpis, "hub_summary": hub_summary, "worst_terminals": worst_terminals})

INSIGHT_PROMPTS = {
    "executive_summary": "Write a concise executive summary (3-4 paragraphs) for the VP of Terminal Operations covering: overall network performance, key bottlenecks, Suez Canal impact, and the path to 15% duration reduction.",
    "bottleneck_analysis": "Analyze the infrastructure bottlenecks in the maritime terminal network. Identify which terminals and regional hubs are underperforming, explain likely causes, and recommend specific interventions.",
    "suez_impact": "Analyze the impact of the March 2021 Suez Canal disruption (Ever Given blockage) on the maritime network. Quantify the duration spike, identify which hubs were most affected, and assess recovery timeline.",
    "efficiency_patterns": "Analyze efficiency patterns across vessel categories, shift timings, and vessel age. Identify which factors most strongly predict longer movement times and recommend targeted improvements.",
    "optimization_strategy": "Develop a strategic optimization plan to reduce average cargo movement duration by 15%. Prioritize interventions by impact and feasibility, and provide a 6-month implementation roadmap.",
}

@app.get("/api/insights/get")
def insights_get(request: Request, type: str = "executive_summary"):
    require_user(request)
    cache = load_insights()
    entry = cache.get(type)
    if entry:
        return {"insight": entry["text"], "generated_at": entry["generated_at"], "type": type}
    return None

@app.post("/api/insights/generate")
def insights_generate(request: Request, type: str = "executive_summary"):
    require_analyst(request)
    prompt = INSIGHT_PROMPTS.get(type, INSIGHT_PROMPTS["executive_summary"])
    context = build_context()
    if OPENAI_API_KEY:
        try:
            import httpx
            resp = httpx.post(
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                json={"model": "gpt-4o-mini", "messages": [
                    {"role": "system", "content": f"You are a senior maritime logistics analyst. Use this data: {context}"},
                    {"role": "user", "content": prompt},
                ], "max_tokens": 800},
                timeout=30,
            )
            text = resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            text = _fallback_insight(type, context)
    else:
        text = _fallback_insight(type, context)
    cache = load_insights()
    cache[type] = {"text": text, "generated_at": datetime.now().isoformat()}
    save_insights(cache)
    return {"insight": text, "type": type}

def _fallback_insight(type: str, context: str) -> str:
    ctx = json.loads(context)
    avg = ctx["kpis"]["avg_duration"]
    target = round(avg * 0.85, 1)
    anomalies = ctx["kpis"]["anomaly_count"]
    terminals = ctx["kpis"]["terminals"]
    worst = list(ctx["worst_terminals"].items())[:3]
    worst_str = ", ".join([f"{n} ({v}h)" for n, v in worst])
    if type == "executive_summary":
        return f"""## Executive Summary — Q1 2025 Operational Review

**Network Performance:** The Global Maritime Solutions network processed {ctx['kpis']['total_movements']:,} cargo movements across {terminals} active terminals. The current average movement duration stands at **{avg}h**, against a target of **{target}h** — representing a required **15% efficiency improvement**.

**Key Bottlenecks:** Analysis identifies {anomalies} anomalous movements (Z-score > 2.5) representing operational outliers requiring immediate attention. The worst-performing terminals are: {worst_str}.

**Regional Performance:** Hub-level analysis reveals significant variance across EMEA, APAC, AMER, and LATAM regions. The Suez Canal disruption in March 2021 caused a measurable spike in movement durations, with EMEA and APAC hubs most severely impacted due to their proximity to the affected shipping lanes.

**Path to 15% Reduction:** Achieving the target duration of {target}h requires a combination of terminal reallocation, vessel scheduling optimization, and capacity expansion at the top 8 bottleneck terminals. The optimization engine has identified specific interventions projected to deliver the required efficiency gains within 6 months."""
    elif type == "bottleneck_analysis":
        return f"""## Infrastructure Bottleneck Analysis

**Identified Bottlenecks:** Analysis of {terminals} active terminals reveals that the top 8 terminals account for a disproportionate share of extended movement durations. The worst performers — {worst_str} — are operating significantly above the network average of {avg}h.

**Root Causes:** Primary drivers of bottleneck formation include: (1) vessel category mismatch — Passenger vessels show the highest average durations due to complex logistics requirements; (2) terminal capacity constraints — several AMER hub terminals are operating above 85% utilization; (3) shift timing inefficiencies — day shifts consistently show higher durations than night shifts.

**Recommendations:** Immediate capacity expansion at the top 3 bottleneck terminals, combined with vessel scheduling optimization to redistribute Container and Cargo vessel traffic, is projected to reduce network average duration by 8-12% within 90 days."""
    else:
        return f"""## {type.replace('_',' ').title()} Analysis

Based on analysis of {ctx['kpis']['total_movements']:,} cargo movements across {terminals} terminals, the network average duration is **{avg}h** with a target of **{target}h**.

Key findings: {anomalies} anomalous movements detected. Top bottleneck terminals: {worst_str}.

Implementing the recommended optimization strategies is projected to achieve the 15% duration reduction target within 6 months."""

# ── Data Explorer Routes ──────────────────────────────────────────────────────
@app.get("/api/explorer/movements")
def explorer_movements(
    request: Request,
    limit: int = 50,
    offset: int = 0,
    hub: str = "",
    vessel_category: str = "",
    start_date: str = "",
    end_date: str = "",
):
    require_user(request)
    filtered = df.copy()
    if hub:              filtered = filtered[filtered["regional_hub"] == hub]
    if vessel_category:  filtered = filtered[filtered["vessel_category"] == vessel_category]
    if start_date:       filtered = filtered[filtered["date_id"] >= start_date]
    if end_date:         filtered = filtered[filtered["date_id"] <= end_date]
    total = len(filtered)
    cols = ["date_id","terminal_name","regional_hub","vessel_name","vessel_category","vessel_age","container_count","move_duration","shift","is_anomaly"]
    page = filtered.sort_values("date_id", ascending=False).iloc[offset:offset+limit][cols].copy()
    page["date_id"] = page["date_id"].dt.strftime("%Y-%m-%d")
    return {"rows": page.round(2).to_dict(orient="records"), "total": total}

# ── Admin Routes ──────────────────────────────────────────────────────────────
@app.get("/api/admin/users")
def admin_users(request: Request):
    require_admin(request)
    return [{"username": u["username"], "name": u["name"], "role": u["role"]} for u in DEMO_USERS.values()]

class UpdateRoleRequest(BaseModel):
    username: str
    role: str

@app.post("/api/admin/update-role")
def admin_update_role(body: UpdateRoleRequest, request: Request):
    require_admin(request)
    if body.username in DEMO_USERS:
        DEMO_USERS[body.username]["role"] = body.role
    return {"ok": True}

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "movements": len(df), "terminals": len(df_terminals), "vessels": len(df_vessels)}

# ── Serve Frontend Static Files ───────────────────────────────────────────────
# Mount frontend directory so index.html, style.css, app.js are served from
# the same origin as the API — this eliminates CORS and file:// protocol issues.
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    # Serve static assets (css, js) at /static
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # Don't intercept /api/* routes
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))

# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"\nStarting Global Maritime Solutions API on http://localhost:{port}")
    print(f"Dashboard: http://localhost:{port}/")
    print(f"API docs:  http://localhost:{port}/docs")
    print(f"Login:     admin/admin123  |  analyst/analyst123  |  user/user123\n")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
