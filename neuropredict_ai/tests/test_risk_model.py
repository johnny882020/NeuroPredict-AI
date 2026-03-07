"""
End-to-end tests for core/risk_model.py:
  - calculate_phases_score   (Evidence A, Greving et al. 2014)
  - calculate_uiats_score    (Evidence B, Etminan et al. 2015)
  - synthesize_recommendation
  - heuristic_rupture_probability
"""
import pytest
from core.risk_model import (
    calculate_phases_score,
    calculate_uiats_score,
    synthesize_recommendation,
    heuristic_rupture_probability,
)


# ─── Helpers ────────────────────────────────────────────────────────────────

def _clinical(**overrides):
    """Minimal low-risk clinical dict with all required keys."""
    defaults = {
        "age": 30,
        "hypertension": False,
        "population": "other",
        "aneurysm_size_mm": 5.0,
        "aneurysm_site": "ICA",
        "earlier_sah_different_aneurysm": False,
        "smoking": False,
        "familial_sah": False,
        "previous_sah": False,
        "multiple_aneurysms": False,
        "high_risk_location": False,
    }
    return {**defaults, **overrides}


def _morph(**overrides):
    """Minimal morphology dict."""
    defaults = {
        "maximum_3d_diameter_mm": 5.0,
        "aspect_ratio_AR": 1.0,
        "size_ratio_SR": 1.5,
        "is_irregular": False,
    }
    return {**defaults, **overrides}


def _phases_dict(risk_pct=4.3, tier="High", score=9):
    return {"five_year_rupture_risk_pct": risk_pct, "risk_tier": tier, "phases_score": score}


def _uiats_dict(net=4, rec="Treatment recommended"):
    return {
        "net_score": net,
        "recommendation": rec,
        "treatment_score": max(net, 0),
        "conservative_score": 0,
    }


# ─── PHASES Score ────────────────────────────────────────────────────────────

class TestPHASESScore:

    def test_all_zero_score_returns_low_risk(self):
        result = calculate_phases_score(_clinical())
        assert result["phases_score"] == 0
        assert result["five_year_rupture_risk_pct"] == 0.4
        assert result["risk_tier"] == "Low"

    def test_finnish_japanese_population_adds_3(self):
        result = calculate_phases_score(_clinical(population="finnish_japanese"))
        assert result["phases_score"] == 3

    def test_hypertension_adds_1(self):
        result = calculate_phases_score(_clinical(hypertension=True))
        assert result["phases_score"] == 1

    def test_age_70_adds_1(self):
        result = calculate_phases_score(_clinical(age=70))
        assert result["phases_score"] == 1

    def test_age_69_does_not_add(self):
        result = calculate_phases_score(_clinical(age=69))
        assert result["phases_score"] == 0

    def test_size_tier_below_7mm_adds_0(self):
        assert calculate_phases_score(_clinical(aneurysm_size_mm=6.9))["phases_score"] == 0

    def test_size_tier_7mm_adds_3(self):
        assert calculate_phases_score(_clinical(aneurysm_size_mm=7.0))["phases_score"] == 3

    def test_size_tier_10mm_adds_6(self):
        assert calculate_phases_score(_clinical(aneurysm_size_mm=10.0))["phases_score"] == 6

    def test_size_tier_20mm_adds_10(self):
        assert calculate_phases_score(_clinical(aneurysm_size_mm=20.0))["phases_score"] == 10

    def test_earlier_sah_adds_1(self):
        result = calculate_phases_score(_clinical(earlier_sah_different_aneurysm=True))
        assert result["phases_score"] == 1

    def test_site_ica_adds_0(self):
        assert calculate_phases_score(_clinical(aneurysm_site="ICA"))["phases_score"] == 0

    def test_site_mca_adds_2(self):
        assert calculate_phases_score(_clinical(aneurysm_site="MCA"))["phases_score"] == 2

    def test_site_aca_adds_4(self):
        assert calculate_phases_score(
            _clinical(aneurysm_site="ACA_AComm_PCoA_posterior"))["phases_score"] == 4

    def test_combined_score_and_high_tier(self):
        # age≥70(+1) + hypertension(+1) + MCA(+2) + 10mm(+6) = score 10 → 5.3% → High
        result = calculate_phases_score(_clinical(
            age=70, hypertension=True, aneurysm_site="MCA", aneurysm_size_mm=10.0))
        assert result["phases_score"] == 10
        assert result["risk_tier"] == "High"
        assert result["five_year_rupture_risk_pct"] == pytest.approx(5.3)

    def test_score_capped_at_12(self):
        # Max possible: finnish(+3) + hypertension(+1) + age≥70(+1) + ≥20mm(+10) + ACA(+4) + earlierSAH(+1) = 20
        result = calculate_phases_score(_clinical(
            population="finnish_japanese", hypertension=True, age=70,
            aneurysm_size_mm=20.0, aneurysm_site="ACA_AComm_PCoA_posterior",
            earlier_sah_different_aneurysm=True))
        assert result["five_year_rupture_risk_pct"] == 17.8   # capped at 12 → table[12]
        assert result["risk_tier"] == "Very High"

    def test_evidence_level_and_citation(self):
        result = calculate_phases_score(_clinical())
        assert result["evidence_level"] == "A"
        assert "Greving" in result["citation"]


# ─── UIATS Score ─────────────────────────────────────────────────────────────

class TestUIATSScore:

    def test_conservative_for_low_risk_elderly(self):
        # age 65 → conservative +1, no treatment triggers → net = -1
        result = calculate_uiats_score(_clinical(age=65), _morph())
        assert result["conservative_score"] == 1
        assert result["treatment_score"] == 0
        assert result["net_score"] == -1
        assert "Conservative" in result["recommendation"]

    def test_treatment_recommended_for_high_signal(self):
        result = calculate_uiats_score(
            _clinical(age=35, smoking=True, familial_sah=True, previous_sah=True,
                      earlier_sah_different_aneurysm=True, multiple_aneurysms=True,
                      high_risk_location=True),
            _morph(maximum_3d_diameter_mm=14.0, aspect_ratio_AR=2.0, is_irregular=True))
        assert result["net_score"] >= 2
        assert result["recommendation"] == "Treatment recommended"

    def test_size_buckets_increase_treatment_score(self):
        base_c = _clinical(age=50)
        small = calculate_uiats_score(base_c, _morph(maximum_3d_diameter_mm=5.0))
        medium = calculate_uiats_score(base_c, _morph(maximum_3d_diameter_mm=8.0))
        large = calculate_uiats_score(base_c, _morph(maximum_3d_diameter_mm=13.0))
        assert small["treatment_score"] < medium["treatment_score"] < large["treatment_score"]

    def test_age_conservative_bucket_81(self):
        assert calculate_uiats_score(_clinical(age=81), _morph())["conservative_score"] == 3

    def test_age_conservative_bucket_75(self):
        assert calculate_uiats_score(_clinical(age=75), _morph())["conservative_score"] == 2

    def test_age_conservative_bucket_65(self):
        assert calculate_uiats_score(_clinical(age=65), _morph())["conservative_score"] == 1

    def test_age_50_no_conservative_score(self):
        assert calculate_uiats_score(_clinical(age=50), _morph())["conservative_score"] == 0

    def test_irregular_adds_treatment_points(self):
        regular = calculate_uiats_score(_clinical(age=50), _morph(is_irregular=False))
        irregular = calculate_uiats_score(_clinical(age=50), _morph(is_irregular=True))
        assert irregular["treatment_score"] > regular["treatment_score"]

    def test_aspect_ratio_above_1_6_adds_treatment_points(self):
        low_ar = calculate_uiats_score(_clinical(age=50), _morph(aspect_ratio_AR=1.5))
        high_ar = calculate_uiats_score(_clinical(age=50), _morph(aspect_ratio_AR=1.7))
        assert high_ar["treatment_score"] > low_ar["treatment_score"]

    def test_breakdown_and_evidence_fields_present(self):
        result = calculate_uiats_score(_clinical(age=50, smoking=True), _morph())
        assert "breakdown" in result
        assert result["evidence_level"] == "B"
        assert "Etminan" in result["citation"]


# ─── Synthesis ───────────────────────────────────────────────────────────────

class TestSynthesizeRecommendation:

    def test_strong_recommendation_with_all_signals(self):
        result = synthesize_recommendation(
            phases=_phases_dict(risk_pct=4.3, tier="High"),
            uiats=_uiats_dict(net=4),
            marta_evt_pct=8.5,
            marta_nt_pct=10.7,
            rsna_probability=0.82,
        )
        assert result["strength"] == "Strong"
        assert "Treatment" in result["recommendation"]
        assert len(result["rationale"]) >= 3

    def test_weak_recommendation_with_low_risk(self):
        result = synthesize_recommendation(
            phases=_phases_dict(risk_pct=0.4, tier="Low", score=0),
            uiats=_uiats_dict(net=-2, rec="Conservative management recommended"),
            marta_evt_pct=None,
            marta_nt_pct=None,
            rsna_probability=None,
        )
        assert result["strength"] == "Weak"
        assert "Conservative" in result["recommendation"]

    def test_marta_prefers_lower_evt_risk(self):
        result = synthesize_recommendation(
            phases=_phases_dict(), uiats=_uiats_dict(),
            marta_evt_pct=6.0, marta_nt_pct=12.0, rsna_probability=None,
        )
        modality = result["preferred_modality"]
        assert "EVT" in modality or "Endovascular" in modality

    def test_marta_prefers_lower_nt_risk(self):
        result = synthesize_recommendation(
            phases=_phases_dict(), uiats=_uiats_dict(),
            marta_evt_pct=14.0, marta_nt_pct=8.0, rsna_probability=None,
        )
        modality = result["preferred_modality"]
        assert "NT" in modality or "Neurosurgical" in modality

    def test_disclaimer_always_present(self):
        result = synthesize_recommendation(
            phases=_phases_dict(), uiats=_uiats_dict(),
            marta_evt_pct=None, marta_nt_pct=None, rsna_probability=None,
        )
        assert "disclaimer" in result
        assert len(result["disclaimer"]) > 10

    def test_rsna_probability_appears_in_rationale(self):
        result = synthesize_recommendation(
            phases=_phases_dict(), uiats=_uiats_dict(),
            marta_evt_pct=None, marta_nt_pct=None, rsna_probability=0.75,
        )
        rationale_text = " ".join(result["rationale"])
        assert "AI" in rationale_text or "RSNA" in rationale_text or "75" in rationale_text

    def test_no_rsna_probability_still_valid(self):
        result = synthesize_recommendation(
            phases=_phases_dict(), uiats=_uiats_dict(),
            marta_evt_pct=None, marta_nt_pct=None, rsna_probability=None,
        )
        assert "recommendation" in result
        assert "strength" in result
        assert isinstance(result["rationale"], list)


# ─── Heuristic probability ───────────────────────────────────────────────────

class TestHeuristicRuptureProbability:

    def test_returns_float_in_valid_range(self):
        prob = heuristic_rupture_probability(_clinical(), _morph())
        assert isinstance(prob, float)
        assert 0.0 <= prob <= 1.0

    def test_larger_aneurysm_higher_probability(self):
        small = heuristic_rupture_probability(_clinical(), _morph(maximum_3d_diameter_mm=5.0))
        large = heuristic_rupture_probability(_clinical(), _morph(maximum_3d_diameter_mm=18.0))
        assert large > small

    def test_more_risk_factors_higher_probability(self):
        low_risk = heuristic_rupture_probability(_clinical(), _morph())
        high_risk = heuristic_rupture_probability(
            _clinical(smoking=True, hypertension=True, familial_sah=True),
            _morph(is_irregular=True, aspect_ratio_AR=2.5))
        assert high_risk > low_risk
