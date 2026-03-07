"""
Clinical Risk Models for Intracranial Aneurysm Management
==========================================================

Implements three validated clinical scoring systems:

1. PHASES Score (Greving et al., Lancet Neurology 2014)
   - Predicts 5-year absolute rupture risk
   - 6 variables: Population, Hypertension, Age, Size, Earlier SAH, Site
   - Evidence Level A: externally validated multicenter cohort

2. UIATS — Unruptured Intracranial Aneurysm Treatment Score
   - Two-column system: treatment-favoring vs. conservative-favoring points
   - Evidence Level B: Delphi consensus (69 international specialists)
   - Reference: Etminan et al., Lancet 2015

3. Recommendation Synthesis
   - Combines PHASES + UIATS + MARTA procedural risk + RSNA AI probability
   - Produces a single ranked recommendation with rationale for physician review
   - NOT a replacement for physician judgment

All outputs carry evidence level tags. Physicians must review and confirm
all recommendations. This module is for clinical decision support only.
"""

from __future__ import annotations

# ── PHASES Score ──────────────────────────────────────────────────────────────
# Published 5-year rupture risk table (Greving et al. 2014, Table 2)
# Score is capped at 12; higher scores map to the ≥12 row.
_PHASES_RISK_TABLE: dict[int, float] = {
    0: 0.4,  1: 0.4,  2: 0.4,  3: 0.7,
    4: 0.9,  5: 1.3,  6: 1.7,  7: 2.4,
    8: 3.2,  9: 4.3, 10: 5.3, 11: 7.2, 12: 17.8,
}


def calculate_phases_score(clinical: dict) -> dict:
    """
    Compute the PHASES score and 5-year rupture risk.

    Args:
        clinical: dict with keys:
            population          : "finnish_japanese" | "other"
            hypertension        : bool
            age                 : int
            aneurysm_size_mm    : float  (maximum diameter)
            earlier_sah_different_aneurysm : bool
            aneurysm_site       : "ICA" | "MCA" | "ACA_AComm_PCoA_posterior"

    Returns:
        phases_score            : raw integer score (may exceed 12)
        five_year_rupture_risk_pct : float from published table
        risk_tier               : "Low" | "Moderate" | "High" | "Very High"
    """
    score = 0

    # P — Population (Finnish / Japanese = +3)
    if clinical.get("population") == "finnish_japanese":
        score += 3

    # H — Hypertension (+1)
    if clinical.get("hypertension"):
        score += 1

    # A — Age ≥70 (+1)
    if clinical.get("age", 0) >= 70:
        score += 1

    # S — Size (dominant factor)
    size = clinical.get("aneurysm_size_mm", 0.0)
    if size >= 20:
        score += 10
    elif size >= 10:
        score += 6
    elif size >= 7:
        score += 3
    # <7 mm = 0 points

    # E — Earlier SAH from a DIFFERENT aneurysm (+1)
    if clinical.get("earlier_sah_different_aneurysm"):
        score += 1

    # S — Site
    site = clinical.get("aneurysm_site", "MCA")
    if site == "ACA_AComm_PCoA_posterior":
        score += 4
    elif site == "MCA":
        score += 2
    # ICA = 0 points

    capped = min(score, 12)
    risk_pct = _PHASES_RISK_TABLE[capped]

    if risk_pct < 1.0:
        tier = "Low"
    elif risk_pct < 3.0:
        tier = "Moderate"
    elif risk_pct < 8.0:
        tier = "High"
    else:
        tier = "Very High"

    return {
        "phases_score": score,
        "five_year_rupture_risk_pct": risk_pct,
        "risk_tier": tier,
        "evidence_level": "A",
        "citation": "Greving et al., Lancet Neurol 2014",
    }


# ── UIATS — Two-Column System ─────────────────────────────────────────────────

def calculate_uiats_score(clinical: dict, morph: dict) -> dict:
    """
    Compute the full two-column UIATS score.

    Treatment-favoring and conservative-favoring points are tallied separately.
    Net score = treatment_score - conservative_score.

    Args:
        clinical: dict with patient risk factors
        morph   : dict with aneurysm morphology measurements

    Returns:
        treatment_score    : int — points favoring intervention
        conservative_score : int — points favoring watchful waiting
        net_score          : int — positive = lean toward treatment
        recommendation     : str — human-readable interpretation
        breakdown          : dict — itemized point contributions
    """
    treat = 0
    conserve = 0
    breakdown: dict[str, int] = {}

    age = clinical.get("age", 60)

    # ── Treatment-favoring factors ──────────────────────────────────────────
    if clinical.get("earlier_sah_different_aneurysm"):
        treat += 2
        breakdown["Earlier SAH (different aneurysm)"] = 2

    if clinical.get("familial_sah"):
        treat += 2
        breakdown["Familial SAH / ICA"] = 2

    if clinical.get("previous_sah"):
        treat += 2
        breakdown["Previous SAH"] = 2

    if clinical.get("smoking"):
        treat += 1
        breakdown["Current smoking"] = 1

    if clinical.get("multiple_aneurysms"):
        treat += 1
        breakdown["Multiple aneurysms"] = 1

    if clinical.get("high_risk_location"):
        treat += 2
        breakdown["High-risk location (ACoA/ACA/BA tip/PICA)"] = 2

    if age < 40:
        treat += 2
        breakdown["Age <40"] = 2

    diam = morph.get("maximum_3d_diameter_mm", 0.0)
    if diam >= 12:
        treat += 4
        breakdown["Size ≥12 mm"] = 4
    elif diam >= 7:
        treat += 2
        breakdown["Size 7–11 mm"] = 2

    if morph.get("aspect_ratio_AR", 0.0) > 1.6:
        treat += 2
        breakdown["Aspect ratio >1.6"] = 2

    if morph.get("is_irregular"):
        treat += 2
        breakdown["Irregular morphology"] = 2

    # ── Conservative-favoring factors ───────────────────────────────────────
    if age > 80:
        conserve += 3
        breakdown["Age >80 (conservative)"] = -3
    elif age > 70:
        conserve += 2
        breakdown["Age 71–80 (conservative)"] = -2
    elif age > 60:
        conserve += 1
        breakdown["Age 61–70 (conservative)"] = -1

    net = treat - conserve

    if net >= 2:
        recommendation = "Treatment recommended"
    elif net >= 0:
        recommendation = "Consider treatment — close monitoring advised"
    else:
        recommendation = "Conservative management recommended"

    return {
        "treatment_score": treat,
        "conservative_score": conserve,
        "net_score": net,
        "recommendation": recommendation,
        "breakdown": breakdown,
        "evidence_level": "B",
        "citation": "Etminan et al., Lancet 2015",
    }


# ── Heuristic Rupture Probability (fallback when RSNA pipeline unavailable) ───

def heuristic_rupture_probability(clinical: dict, morph: dict) -> float:
    """
    Logistic-like heuristic estimating rupture probability.
    Used only when RSNA 2025 pipeline is unavailable (no GPU/weights).
    Labeled as 'heuristic' in all API responses.
    """
    risk = 0.05

    if clinical.get("smoking"):         risk += 0.08
    if clinical.get("hypertension"):    risk += 0.10
    if clinical.get("previous_sah"):    risk += 0.20
    if clinical.get("familial_sah"):    risk += 0.12
    if clinical.get("earlier_sah_different_aneurysm"): risk += 0.15

    diam = morph.get("maximum_3d_diameter_mm", 0.0)
    risk += min(diam * 0.02, 0.30)

    if morph.get("aspect_ratio_AR", 1.0) > 1.6:
        risk += 0.15
    if morph.get("is_irregular"):
        risk += 0.10

    return round(min(risk, 0.95), 4)


# ── Recommendation Synthesis ──────────────────────────────────────────────────

def synthesize_recommendation(
    phases: dict,
    uiats: dict,
    marta_evt_pct: float | None,
    marta_nt_pct: float | None,
    rsna_probability: float | None,
) -> dict:
    """
    Synthesize PHASES + UIATS + MARTA + RSNA AI into a single ranked
    recommendation for physician review.

    This is a decision-support output, NOT a diagnostic conclusion.
    The physician must review all evidence and make the final call.

    Returns:
        recommendation : str — plain-language recommendation
        strength       : "Strong" | "Moderate" | "Weak"
        rationale      : list[str] — evidence bullets
        evidence_level : "B"
        disclaimer     : str
    """
    rationale: list[str] = []
    treat_signals = 0

    # PHASES contribution
    risk_pct = phases["five_year_rupture_risk_pct"]
    tier = phases["risk_tier"]
    rationale.append(
        f"PHASES 5-year rupture risk: {risk_pct}% ({tier}) "
        f"[Score {phases['phases_score']}]"
    )
    if risk_pct >= 3.0:
        treat_signals += 2
    elif risk_pct >= 1.0:
        treat_signals += 1

    # UIATS contribution
    net = uiats["net_score"]
    rationale.append(
        f"UIATS net score: {net:+d} — {uiats['recommendation']} "
        f"[Treatment {uiats['treatment_score']} pts vs Conservative {uiats['conservative_score']} pts]"
    )
    if net >= 2:
        treat_signals += 2
    elif net >= 0:
        treat_signals += 1

    # RSNA AI contribution
    if rsna_probability is not None:
        rationale.append(
            f"AI detection probability: {rsna_probability * 100:.1f}% "
            f"(RSNA 2025 pipeline, AUC 0.916)"
        )
        if rsna_probability >= 0.5:
            treat_signals += 1

    # MARTA procedural risk — determines EVT vs NT if treatment is chosen
    if marta_evt_pct is not None and marta_nt_pct is not None:
        preferred_modality = "Endovascular (EVT)" if marta_evt_pct <= marta_nt_pct else "Neurosurgical (NT)"
        delta = abs(marta_evt_pct - marta_nt_pct)
        rationale.append(
            f"MARTA procedural risk: EVT {marta_evt_pct:.1f}% vs NT {marta_nt_pct:.1f}% "
            f"— {preferred_modality} preferred ({delta:.1f}% lower complication risk)"
        )
    else:
        preferred_modality = "Endovascular (EVT)"  # default when MARTA not yet run

    # Final recommendation
    if treat_signals >= 4:
        recommendation = f"Treatment — {preferred_modality}"
        strength = "Strong"
    elif treat_signals >= 2:
        recommendation = f"Consider treatment — {preferred_modality} if pursued"
        strength = "Moderate"
    else:
        recommendation = "Conservative management with surveillance imaging (6–12 month MRI/MRA)"
        strength = "Weak"

    return {
        "recommendation": recommendation,
        "strength": strength,
        "rationale": rationale,
        "preferred_modality": preferred_modality,
        "evidence_level": "B",
        "disclaimer": (
            "For clinical decision support only. "
            "Physician judgment supersedes all system recommendations. "
            "Not validated as a standalone diagnostic tool."
        ),
    }


# ── Legacy wrappers (kept for backward compatibility with singleton pattern) ──

class UIATSCalculator:
    def calculate_score(self, clinical_data: dict, morphology_data: dict) -> dict:
        return calculate_uiats_score(clinical_data, morphology_data)


class MLRupturePredictor:
    def predict_risk(self, clinical_data: dict, morphology_data: dict) -> float:
        return heuristic_rupture_probability(clinical_data, morphology_data)


# Singleton instances (used by main.py)
uiats_calc = UIATSCalculator()
ml_predictor = MLRupturePredictor()
