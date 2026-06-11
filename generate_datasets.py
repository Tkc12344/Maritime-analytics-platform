"""
Generate all CSV datasets for the Global Maritime Solutions Analytics Platform.
Run once: python generate_datasets.py
Produces: terminals.csv, vessels.csv, cargo_movements.csv, alerts.csv, optimization_recs.csv
"""
import random, math, csv, os
from datetime import date, timedelta, datetime

random.seed(42)
BASE_DIR = os.path.dirname(__file__)

# ── 1. Terminals ─────────────────────────────────────────────────────────────
HUBS = {
    "EMEA":  ["Rotterdam", "Hamburg", "Antwerp", "Felixstowe", "Algeciras", "Piraeus",
               "Valencia", "Genoa", "Marseille", "Tanger Med", "Dakar", "Mombasa"],
    "APAC":  ["Shanghai", "Singapore", "Busan", "Hong Kong", "Ningbo", "Guangzhou",
               "Port Klang", "Laem Chabang", "Colombo", "Tanjung Pelepas", "Jakarta", "Manila"],
    "AMER":  ["Los Angeles", "Long Beach", "New York", "Houston", "Savannah",
               "Seattle", "Miami", "Baltimore", "Charleston", "Vancouver"],
    "LATAM": ["Santos", "Cartagena", "Callao", "Buenos Aires", "Manzanillo",
               "Colon", "Valparaiso", "Guayaquil", "Montevideo", "Itapoa", "Paranagua", "Barranquilla"],
}
terminals = []
tid = 1
for hub, names in HUBS.items():
    for name in names:
        capacity = random.randint(8000, 35000)
        terminals.append({
            "terminal_id": tid,
            "terminal_name": f"{name} Terminal",
            "regional_hub": hub,
            "capacity": capacity,
            "max_berths": random.randint(4, 18),
            "country": name,
        })
        tid += 1

with open(os.path.join(BASE_DIR, "terminals.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=terminals[0].keys())
    w.writeheader(); w.writerows(terminals)
print(f"terminals.csv: {len(terminals)} rows")

# ── 2. Vessels ────────────────────────────────────────────────────────────────
CATEGORIES = ["Container", "Tanker", "Cargo", "Passenger"]
VESSEL_NAMES = {
    "Container": ["Ever Given", "MSC Gülsün", "HMM Algeciras", "OOCL Hong Kong", "Madrid Maersk",
                  "CMA CGM Antoine", "Cosco Shipping", "Yang Ming", "Evergreen", "Hapag Lloyd"],
    "Tanker":    ["Seawise Giant", "Jahre Viking", "TI Europe", "Knock Nevis", "Batillus",
                  "Prairial", "Esso Atlantic", "Berge Emperor", "Nai Superba", "Stena Immortal"],
    "Cargo":     ["BBC Steinburg", "Beluga Fascination", "Hansa Lübeck", "Svenja", "Thorco Cloud",
                  "Anangel Courage", "Bulk Juliana", "Pacific Basin", "Star Bulk", "Golden Ocean"],
    "Passenger": ["Symphony of Seas", "Wonder of Seas", "Oasis of Seas", "Harmony of Seas",
                  "Allure of Seas", "MSC Grandiosa", "Costa Smeralda", "Iona", "Mardi Gras", "Scarlet Lady"],
}
vessels = []
vid = 1
for cat in CATEGORIES:
    count = 200 if cat == "Container" else 150 if cat == "Tanker" else 180 if cat == "Cargo" else 106
    for i in range(count):
        base_name = VESSEL_NAMES[cat][i % len(VESSEL_NAMES[cat])]
        vessels.append({
            "vessel_id": vid,
            "vessel_name": f"{base_name} {i+1:03d}",
            "vessel_category": cat,
            "vessel_age": random.randint(1, 55),
            "efficiency_score": round(random.uniform(0.6, 1.0), 3),
        })
        vid += 1

with open(os.path.join(BASE_DIR, "vessels.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=vessels[0].keys())
    w.writeheader(); w.writerows(vessels)
print(f"vessels.csv: {len(vessels)} rows")

# ── 3. Cargo Movements ────────────────────────────────────────────────────────
CARGO_TYPES = ["Electronics", "Chemicals", "Food", "Machinery", "Textiles", "Vehicles", "Raw Materials"]
SHIFTS = ["Day", "Night"]
start_date = date(2020, 1, 1)
end_date   = date(2024, 12, 31)
total_days = (end_date - start_date).days + 1

# Pre-index for speed
terminal_hub = {t["terminal_id"]: t["regional_hub"] for t in terminals}

movements = []
mid = 1
current = start_date
while current <= end_date:
    # Suez disruption: March 23–29, 2021 → duration spike
    is_suez = date(2021, 3, 23) <= current <= date(2021, 3, 29)
    is_recovery = date(2021, 3, 30) <= current <= date(2021, 6, 30)
    daily_count = random.randint(6, 12)
    for _ in range(daily_count):
        terminal = random.choice(terminals)
        vessel   = random.choice(vessels)
        shift    = random.choice(SHIFTS)
        cargo    = random.choice(CARGO_TYPES)
        containers = random.randint(100, 1500)

        # Base duration by vessel category
        base = {"Container": 490, "Tanker": 505, "Cargo": 500, "Passenger": 520}.get(vessel["vessel_category"], 500)
        # Age effect
        base += vessel["vessel_age"] * 0.15
        # Hub effect
        hub_eff = {"LATAM": -5, "APAC": -1, "EMEA": 2, "AMER": 6}.get(terminal["regional_hub"], 0)
        base += hub_eff
        # Shift effect
        base += 5 if shift == "Day" else -4
        # Container volume effect
        base += (containers - 500) * 0.01
        # Suez disruption
        if is_suez:
            base *= 1.45
        elif is_recovery:
            base *= 1.10
        # Random noise
        base += random.gauss(0, 50)
        duration = max(50, round(base, 2))

        # Anomaly: 5% of movements
        is_anomaly = 1 if random.random() < 0.05 else 0
        if is_anomaly:
            duration = duration * random.uniform(2.0, 3.5)

        movements.append({
            "movement_id": mid,
            "date_id": current.isoformat(),
            "terminal_id": terminal["terminal_id"],
            "vessel_id": vessel["vessel_id"],
            "cargo_type": cargo,
            "container_count": containers,
            "move_duration": round(duration, 2),
            "shift": shift,
            "is_anomaly": is_anomaly,
            "anomaly_score": round(random.uniform(0.7, 1.0), 3) if is_anomaly else round(random.uniform(0.0, 0.3), 3),
        })
        mid += 1
    current += timedelta(days=1)

with open(os.path.join(BASE_DIR, "cargo_movements.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=movements[0].keys())
    w.writeheader(); w.writerows(movements)
print(f"cargo_movements.csv: {len(movements)} rows")

# ── 4. Alerts (empty placeholder — seeded by the API) ─────────────────────────
with open(os.path.join(BASE_DIR, "alerts.csv"), "w", newline="") as f:
    f.write("id,alert_type,severity,title,message,terminal_id,regional_hub,threshold,observed_value,is_acknowledged,created_at\n")
print("alerts.csv: 0 rows (seed via POST /api/alerts/seed)")

# ── 5. Optimization Recs (empty placeholder) ─────────────────────────────────
with open(os.path.join(BASE_DIR, "optimization_recs.csv"), "w", newline="") as f:
    f.write("id,category,priority,title,description,affected_terminal_id,affected_hub,current_duration,projected_duration,efficiency_gain,implementation_status,generated_at\n")
print("optimization_recs.csv: 0 rows (generate via POST /api/optimization/generate)")

print("\nAll datasets ready.")
