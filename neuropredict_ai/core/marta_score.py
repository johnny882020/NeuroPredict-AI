"""
MARTA Score Calculator
=====================
Implements the MARTA (Morphological And Risk-related Treatment Assessment) score
for predicting complications from endovascular (EVT) and neurosurgical (NT) treatment
of unruptured intracranial aneurysms.

Two models:
- MARTA-EVT: Risk of complications from endovascular treatment
- MARTA-NT: Risk of complications from neurosurgical treatment

Reference: Based on published odds ratios from meta-analysis (PMC6439725)
and the MARTA Score Shiny App (martascoreapp.shinyapps.io).
"""

import math
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class AneurysmLocation(str, Enum):
    ICA_CAVERNOUS = "ICA_cavernous"
    ICA_OPHTHALMIC = "ICA_ophthalmic"
    PCOA_ACHOA = "PCoA_AChoA"
    ACOA = "ACoA"
    ICA_T = "ICA_T"
    ACA = "ACA"
    MCA = "MCA"
    BA = "BA"
    V4_VA = "V4_VA"
    P1_PCA = "P1_PCA"


class AneurysmSize(str, Enum):
    SMALL = "small"          # <5mm
    MEDIUM = "medium"        # 5-9mm
    LARGE = "large"          # 10-24mm
    GIANT = "giant"          # >=25mm


class AneurysmMorphology(str, Enum):
    REGULAR_SACCULAR = "regular_saccular"
    MULTILOBULAR_SACCULAR = "multilobular_saccular"
    FUSIFORM = "fusiform"
    SHALLOW = "shallow"


class NeckGeometry(str, Enum):
    SIDEWALL = "sidewall"
    BIFURCATION_SMALL_NECK = "bifurcation_small_neck"
    BIFURCATION_WIDE_NECK = "bifurcation_wide_neck"


class NeckSurface(str, Enum):
    LESS_THAN_HALF = "less_than_half"
    HALF_OR_MORE = "half_or_more"


class EVTApproach(str, Enum):
    COILING_BAC = "coiling_bac"
    INTRASACCULAR_DEVICE = "intrasaccular_device"
    FLOW_DIVERTER = "flow_diverter"
    STENT_ASSISTED_COILING = "stent_assisted_coiling"


class MARTAPatientData(BaseModel):
    age: int = Field(..., ge=0, le=120)
    sex: Literal["M", "F"]
    smoking: bool = False
    hypertension: bool = False
    dyslipidemia: bool = False
    cerebrovascular_disease: bool = False
    family_history_sah: bool = False
    baseline_mrs: int = Field(0, ge=0, le=5)


class MARTAAneurysmData(BaseModel):
    location: AneurysmLocation
    size: AneurysmSize
    morphology: AneurysmMorphology
    neck_geometry: NeckGeometry
    neck_surface: NeckSurface
    sac_wall_calcification: bool = False
    intraluminal_thrombus: bool = False
    dissecting_etiology: bool = False
    parent_artery_focal_stenosis: bool = False
    collateral_branch_from_sac: bool = False
    collateral_branch_from_neck: bool = False
    evt_approach: EVTApproach = EVTApproach.COILING_BAC


class MARTAInput(BaseModel):
    patient: MARTAPatientData
    aneurysm: MARTAAneurysmData


class MARTAResult(BaseModel):
    evt_probability: float
    nt_probability: float
    evt_risk_category: str
    nt_risk_category: str
    recommended_treatment: str
    details: dict


# Published odds-ratio approximations for EVT complication predictors.
# Sources: PMC6439725 meta-analysis, MARTA validation studies.
# Architecture supports easy coefficient updates when full paper coefficients
# become available.
_EVT_COEFFICIENTS: dict[str, float] = {
    # Patient factors (log-odds)
    "intercept": -3.5,
    "age_per_decade": 0.15,
    "sex_female": -0.10,
    "smoking": 0.25,
    "hypertension": 0.20,
    "dyslipidemia": 0.05,
    "cerebrovascular_disease": 0.40,
    "family_history_sah": 0.10,
    "baseline_mrs_per_point": 0.30,

    # Location (reference: MCA)
    "loc_ICA_cavernous": -0.30,
    "loc_ICA_ophthalmic": 0.10,
    "loc_PCoA_AChoA": 0.35,
    "loc_ACoA": 0.20,
    "loc_ICA_T": 0.25,
    "loc_ACA": 0.15,
    "loc_MCA": 0.0,
    "loc_BA": 0.55,
    "loc_V4_VA": 0.45,
    "loc_P1_PCA": 0.50,

    # Size (reference: small)
    "size_small": 0.0,
    "size_medium": 0.30,
    "size_large": 0.70,
    "size_giant": 1.20,

    # Morphology (reference: regular saccular)
    "morph_regular_saccular": 0.0,
    "morph_multilobular_saccular": 0.35,
    "morph_fusiform": 0.60,
    "morph_shallow": -0.20,

    # Neck geometry (reference: sidewall)
    "neck_sidewall": 0.0,
    "neck_bifurcation_small_neck": 0.20,
    "neck_bifurcation_wide_neck": 0.50,

    # Neck surface
    "neck_surface_half_or_more": 0.30,

    # Sac/vessel features
    "sac_wall_calcification": 0.25,
    "intraluminal_thrombus": 0.40,
    "dissecting_etiology": 0.55,
    "parent_artery_focal_stenosis": 0.35,
    "collateral_branch_from_sac": 0.45,
    "collateral_branch_from_neck": 0.30,

    # EVT approach (reference: coiling/BAC)
    "evt_coiling_bac": 0.0,
    "evt_intrasaccular_device": 0.15,
    "evt_flow_diverter": 0.25,
    "evt_stent_assisted_coiling": 0.20,
}

# NT coefficients differ — neurosurgical risk profile
_NT_COEFFICIENTS: dict[str, float] = {
    "intercept": -3.0,
    "age_per_decade": 0.25,
    "sex_female": -0.05,
    "smoking": 0.15,
    "hypertension": 0.25,
    "dyslipidemia": 0.05,
    "cerebrovascular_disease": 0.50,
    "family_history_sah": 0.10,
    "baseline_mrs_per_point": 0.40,

    # Location — posterior circulation has higher surgical risk
    "loc_ICA_cavernous": 0.60,
    "loc_ICA_ophthalmic": 0.40,
    "loc_PCoA_AChoA": 0.15,
    "loc_ACoA": 0.10,
    "loc_ICA_T": 0.20,
    "loc_ACA": 0.10,
    "loc_MCA": -0.20,  # MCA is most accessible surgically
    "loc_BA": 1.10,
    "loc_V4_VA": 0.95,
    "loc_P1_PCA": 1.00,

    # Size
    "size_small": 0.0,
    "size_medium": 0.20,
    "size_large": 0.55,
    "size_giant": 1.40,

    # Morphology
    "morph_regular_saccular": 0.0,
    "morph_multilobular_saccular": 0.25,
    "morph_fusiform": 0.80,
    "morph_shallow": -0.10,

    # Neck geometry
    "neck_sidewall": 0.0,
    "neck_bifurcation_small_neck": 0.10,
    "neck_bifurcation_wide_neck": 0.30,

    # Neck surface
    "neck_surface_half_or_more": 0.20,

    # Sac/vessel features
    "sac_wall_calcification": 0.35,
    "intraluminal_thrombus": 0.50,
    "dissecting_etiology": 0.45,
    "parent_artery_focal_stenosis": 0.40,
    "collateral_branch_from_sac": 0.30,
    "collateral_branch_from_neck": 0.20,
}


def _logistic(log_odds: float) -> float:
    """Convert log-odds to probability via sigmoid."""
    return 1.0 / (1.0 + math.exp(-log_odds))


def _categorize_risk(probability: float) -> str:
    if probability < 0.05:
        return "Low"
    elif probability < 0.15:
        return "Moderate"
    else:
        return "High"


class MARTAScoreCalculator:
    """Calculates MARTA-EVT and MARTA-NT complication probabilities."""

    def _compute_log_odds(
        self,
        patient: MARTAPatientData,
        aneurysm: MARTAAneurysmData,
        coefficients: dict[str, float],
        include_evt_approach: bool = False,
    ) -> float:
        lo = coefficients["intercept"]

        # Patient factors
        lo += coefficients["age_per_decade"] * ((patient.age - 50) / 10.0)
        if patient.sex == "F":
            lo += coefficients["sex_female"]
        if patient.smoking:
            lo += coefficients["smoking"]
        if patient.hypertension:
            lo += coefficients["hypertension"]
        if patient.dyslipidemia:
            lo += coefficients["dyslipidemia"]
        if patient.cerebrovascular_disease:
            lo += coefficients["cerebrovascular_disease"]
        if patient.family_history_sah:
            lo += coefficients["family_history_sah"]
        lo += coefficients["baseline_mrs_per_point"] * patient.baseline_mrs

        # Location
        loc_key = f"loc_{aneurysm.location.value}"
        lo += coefficients.get(loc_key, 0.0)

        # Size
        size_key = f"size_{aneurysm.size.value}"
        lo += coefficients.get(size_key, 0.0)

        # Morphology
        morph_key = f"morph_{aneurysm.morphology.value}"
        lo += coefficients.get(morph_key, 0.0)

        # Neck geometry
        neck_key = f"neck_{aneurysm.neck_geometry.value}"
        lo += coefficients.get(neck_key, 0.0)

        # Neck surface
        if aneurysm.neck_surface == NeckSurface.HALF_OR_MORE:
            lo += coefficients["neck_surface_half_or_more"]

        # Binary sac/vessel features
        if aneurysm.sac_wall_calcification:
            lo += coefficients["sac_wall_calcification"]
        if aneurysm.intraluminal_thrombus:
            lo += coefficients["intraluminal_thrombus"]
        if aneurysm.dissecting_etiology:
            lo += coefficients["dissecting_etiology"]
        if aneurysm.parent_artery_focal_stenosis:
            lo += coefficients["parent_artery_focal_stenosis"]
        if aneurysm.collateral_branch_from_sac:
            lo += coefficients["collateral_branch_from_sac"]
        if aneurysm.collateral_branch_from_neck:
            lo += coefficients["collateral_branch_from_neck"]

        # EVT approach (only for EVT model)
        if include_evt_approach:
            evt_key = f"evt_{aneurysm.evt_approach.value}"
            lo += coefficients.get(evt_key, 0.0)

        return lo

    def calculate_evt_risk(
        self, patient: MARTAPatientData, aneurysm: MARTAAneurysmData
    ) -> float:
        """Return MARTA-EVT complication probability (0.0-1.0)."""
        lo = self._compute_log_odds(
            patient, aneurysm, _EVT_COEFFICIENTS, include_evt_approach=True
        )
        return round(_logistic(lo), 4)

    def calculate_nt_risk(
        self, patient: MARTAPatientData, aneurysm: MARTAAneurysmData
    ) -> float:
        """Return MARTA-NT complication probability (0.0-1.0)."""
        lo = self._compute_log_odds(
            patient, aneurysm, _NT_COEFFICIENTS, include_evt_approach=False
        )
        return round(_logistic(lo), 4)

    def _compare_evt_approaches(
        self, patient: MARTAPatientData, aneurysm: MARTAAneurysmData
    ) -> list[dict]:
        """Compare all EVT approaches and rank by complication risk."""
        labels = {
            EVTApproach.COILING_BAC: "Coiling / BAC",
            EVTApproach.INTRASACCULAR_DEVICE: "Intrasaccular Device (WEB)",
            EVTApproach.FLOW_DIVERTER: "Flow Diverter (PED/FRED)",
            EVTApproach.STENT_ASSISTED_COILING: "Stent-Assisted Coiling",
        }
        results = []
        for approach in EVTApproach:
            modified = aneurysm.model_copy(update={"evt_approach": approach})
            prob = self.calculate_evt_risk(patient, modified)
            results.append({
                "approach": approach.value,
                "label": labels[approach],
                "probability": prob,
                "probability_pct": round(prob * 100, 2),
                "risk_category": _categorize_risk(prob),
            })
        results.sort(key=lambda r: r["probability"])
        return results

    def assess(self, data: MARTAInput) -> MARTAResult:
        """Full MARTA assessment returning both EVT and NT probabilities."""
        evt_prob = self.calculate_evt_risk(data.patient, data.aneurysm)
        nt_prob = self.calculate_nt_risk(data.patient, data.aneurysm)

        evt_cat = _categorize_risk(evt_prob)
        nt_cat = _categorize_risk(nt_prob)

        # Compare all EVT approaches
        evt_approaches = self._compare_evt_approaches(data.patient, data.aneurysm)
        best_evt = evt_approaches[0]

        # Recommend treatment with lower complication risk
        if evt_prob < nt_prob:
            recommended = "Endovascular treatment (EVT) — lower predicted complication risk"
        elif nt_prob < evt_prob:
            recommended = "Neurosurgical treatment (NT) — lower predicted complication risk"
        else:
            recommended = "Similar risk for both approaches — clinical judgement advised"

        return MARTAResult(
            evt_probability=evt_prob,
            nt_probability=nt_prob,
            evt_risk_category=evt_cat,
            nt_risk_category=nt_cat,
            recommended_treatment=recommended,
            details={
                "evt_probability_pct": round(evt_prob * 100, 2),
                "nt_probability_pct": round(nt_prob * 100, 2),
                "patient_age": data.patient.age,
                "aneurysm_location": data.aneurysm.location.value,
                "aneurysm_size": data.aneurysm.size.value,
                "best_evt_approach": best_evt["label"],
                "best_evt_approach_risk_pct": best_evt["probability_pct"],
                "evt_approach_comparison": evt_approaches,
            },
        )


# Singleton
marta_calc = MARTAScoreCalculator()
