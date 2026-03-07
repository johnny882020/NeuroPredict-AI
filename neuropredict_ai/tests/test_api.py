import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# ── Shared payload ───────────────────────────────────────────────────────────

_CLINICAL = {
    "age": 65,
    "smoking": False,
    "hypertension": True,
    "previous_sah": False,
    "familial_sah": False,
    "population": "other",
    "earlier_sah_different_aneurysm": False,
    "aneurysm_site": "MCA",
    "aneurysm_size_mm": 8.5,
    "multiple_aneurysms": False,
    "high_risk_location": False,
}

_MORPH = {
    "maximum_3d_diameter_mm": 8.5,
    "aspect_ratio_AR": 1.7,
    "size_ratio_SR": 2.0,
    "is_irregular": True,
}

_RISK_PAYLOAD = {"clinical": _CLINICAL, "morph": _MORPH}


# ── /health ──────────────────────────────────────────────────────────────────

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "rsna_pipeline" in data


# ── /predict_risk ────────────────────────────────────────────────────────────

def test_predict_risk_full_schema():
    resp = client.post("/predict_risk", json=_RISK_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()

    # PHASES block
    assert "phases" in data
    assert "phases_score" in data["phases"]
    assert "five_year_rupture_risk_pct" in data["phases"]
    assert "risk_tier" in data["phases"]
    assert "evidence_level" in data["phases"]

    # UIATS block
    assert "uiats" in data
    assert "net_score" in data["uiats"]
    assert "treatment_score" in data["uiats"]
    assert "conservative_score" in data["uiats"]
    assert "recommendation" in data["uiats"]

    # Synthesis block
    assert "synthesis" in data
    assert "recommendation" in data["synthesis"]
    assert "strength" in data["synthesis"]
    assert "rationale" in data["synthesis"]
    assert isinstance(data["synthesis"]["rationale"], list)

    # AI probability
    assert "ai_rupture_probability" in data
    assert 0.0 <= data["ai_rupture_probability"] <= 1.0
    assert data["probability_source"] == "heuristic"


def test_predict_risk_with_rsna_probability():
    resp = client.post("/predict_risk?rsna_probability=0.85", json=_RISK_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    assert data["probability_source"] == "rsna_2025"
    assert data["ai_rupture_probability"] == pytest.approx(0.85)


def test_predict_risk_with_marta_params_in_synthesis():
    resp = client.post(
        "/predict_risk?marta_evt_pct=7.5&marta_nt_pct=12.0",
        json=_RISK_PAYLOAD)
    assert resp.status_code == 200
    data = resp.json()
    # MARTA info should appear in synthesis rationale
    rationale = " ".join(data["synthesis"]["rationale"])
    assert "EVT" in rationale or "NT" in rationale or "MARTA" in rationale


def test_predict_risk_missing_required_field_returns_422():
    resp = client.post("/predict_risk", json={"clinical": {"age": 50}, "morph": {}})
    assert resp.status_code == 422


def test_predict_risk_phases_score_correct():
    # age 65 + hypertension + MCA site + 8.5mm (7–9mm = +3) = H(+1)+MCA(+2)+size(+3) = 6
    resp = client.post("/predict_risk", json=_RISK_PAYLOAD)
    data = resp.json()
    assert data["phases"]["phases_score"] == 6
    assert data["phases"]["five_year_rupture_risk_pct"] == pytest.approx(1.7)


def test_predict_risk_uiats_net_score_correct():
    # treatment: size 7-11mm(+2), AR>1.6(+2), irregular(+2) = 6
    # conservative: age 61-70 = +1
    # net = 5
    resp = client.post("/predict_risk", json=_RISK_PAYLOAD)
    data = resp.json()
    assert data["uiats"]["net_score"] == 5
    assert data["uiats"]["recommendation"] == "Treatment recommended"


# ── /simulate_treatment ──────────────────────────────────────────────────────

def test_simulate_treatment_flow_diverter():
    resp = client.post(
        "/simulate_treatment"
        "?treatment_type=flow_diverter&baseline_wss_pa=3.5&baseline_osi=0.22")
    assert resp.status_code == 200
    data = resp.json()
    assert "mean_wss_pa" in data
    assert "mean_osi" in data
    # Flow diverter should reduce WSS below baseline
    assert data["mean_wss_pa"] < 3.5


def test_simulate_treatment_surgical_clip():
    resp = client.post(
        "/simulate_treatment"
        "?treatment_type=surgical_clip&baseline_wss_pa=4.0&baseline_osi=0.30")
    assert resp.status_code == 200
    data = resp.json()
    assert "mean_wss_pa" in data
    assert "mean_osi" in data
    assert "clinical_outcome" in data
