import pytest
from core.marta_score import (
    MARTAScoreCalculator,
    MARTAPatientData,
    MARTAAneurysmData,
    MARTAInput,
    AneurysmLocation,
    AneurysmSize,
    AneurysmMorphology,
    NeckGeometry,
    NeckSurface,
    EVTApproach,
    _categorize_risk,
)

calc = MARTAScoreCalculator()


def _make_patient(**overrides) -> MARTAPatientData:
    defaults = dict(
        age=55, sex="F", smoking=False, hypertension=False,
        dyslipidemia=False, cerebrovascular_disease=False,
        family_history_sah=False, baseline_mrs=0,
    )
    defaults.update(overrides)
    return MARTAPatientData(**defaults)


def _make_aneurysm(**overrides) -> MARTAAneurysmData:
    defaults = dict(
        location=AneurysmLocation.MCA,
        size=AneurysmSize.SMALL,
        morphology=AneurysmMorphology.REGULAR_SACCULAR,
        neck_geometry=NeckGeometry.SIDEWALL,
        neck_surface=NeckSurface.LESS_THAN_HALF,
        sac_wall_calcification=False,
        intraluminal_thrombus=False,
        dissecting_etiology=False,
        parent_artery_focal_stenosis=False,
        collateral_branch_from_sac=False,
        collateral_branch_from_neck=False,
        evt_approach=EVTApproach.COILING_BAC,
    )
    defaults.update(overrides)
    return MARTAAneurysmData(**defaults)


class TestRiskCategorization:
    def test_low_risk(self):
        assert _categorize_risk(0.01) == "Low"
        assert _categorize_risk(0.049) == "Low"

    def test_moderate_risk(self):
        assert _categorize_risk(0.05) == "Moderate"
        assert _categorize_risk(0.10) == "Moderate"
        assert _categorize_risk(0.149) == "Moderate"

    def test_high_risk(self):
        assert _categorize_risk(0.15) == "High"
        assert _categorize_risk(0.50) == "High"
        assert _categorize_risk(0.99) == "High"


class TestLowRiskProfile:
    """A young, healthy patient with a small MCA sidewall aneurysm should be low risk."""

    def test_evt_low_risk(self):
        patient = _make_patient(age=40, sex="F")
        aneurysm = _make_aneurysm()
        prob = calc.calculate_evt_risk(patient, aneurysm)
        assert 0.0 < prob < 0.10
        assert prob == round(prob, 4)

    def test_nt_low_risk(self):
        patient = _make_patient(age=40, sex="F")
        aneurysm = _make_aneurysm()
        prob = calc.calculate_nt_risk(patient, aneurysm)
        assert 0.0 < prob < 0.10
        assert prob == round(prob, 4)


class TestHighRiskProfile:
    """Elderly patient with multiple comorbidities, giant BA fusiform aneurysm."""

    def setup_method(self):
        self.patient = _make_patient(
            age=80, sex="M", smoking=True, hypertension=True,
            cerebrovascular_disease=True, baseline_mrs=3,
        )
        self.aneurysm = _make_aneurysm(
            location=AneurysmLocation.BA,
            size=AneurysmSize.GIANT,
            morphology=AneurysmMorphology.FUSIFORM,
            neck_geometry=NeckGeometry.BIFURCATION_WIDE_NECK,
            neck_surface=NeckSurface.HALF_OR_MORE,
            intraluminal_thrombus=True,
            dissecting_etiology=True,
            collateral_branch_from_sac=True,
        )

    def test_evt_high_risk(self):
        prob = calc.calculate_evt_risk(self.patient, self.aneurysm)
        assert prob > 0.15

    def test_nt_high_risk(self):
        prob = calc.calculate_nt_risk(self.patient, self.aneurysm)
        assert prob > 0.15

    def test_nt_higher_than_evt_for_posterior(self):
        """Posterior circulation (BA) should carry higher surgical risk."""
        evt = calc.calculate_evt_risk(self.patient, self.aneurysm)
        nt = calc.calculate_nt_risk(self.patient, self.aneurysm)
        assert nt > evt


class TestLocationEffects:
    """Different locations should produce different risk profiles."""

    def test_posterior_higher_nt_risk(self):
        patient = _make_patient()
        ba = _make_aneurysm(location=AneurysmLocation.BA)
        mca = _make_aneurysm(location=AneurysmLocation.MCA)
        assert calc.calculate_nt_risk(patient, ba) > calc.calculate_nt_risk(patient, mca)

    def test_mca_lowest_nt_risk_among_locations(self):
        """MCA has the most negative NT coefficient, so it should have the
        lowest neurosurgical risk compared to other locations."""
        patient = _make_patient()
        mca_nt = calc.calculate_nt_risk(patient, _make_aneurysm(location=AneurysmLocation.MCA))
        for loc in AneurysmLocation:
            if loc == AneurysmLocation.MCA:
                continue
            other_nt = calc.calculate_nt_risk(patient, _make_aneurysm(location=loc))
            assert mca_nt <= other_nt, f"MCA NT risk should be <= {loc.value} NT risk"

    def test_all_locations_produce_valid_probabilities(self):
        patient = _make_patient()
        for loc in AneurysmLocation:
            aneurysm = _make_aneurysm(location=loc)
            evt = calc.calculate_evt_risk(patient, aneurysm)
            nt = calc.calculate_nt_risk(patient, aneurysm)
            assert 0.0 < evt < 1.0, f"EVT out of range for {loc}"
            assert 0.0 < nt < 1.0, f"NT out of range for {loc}"


class TestSizeEffects:
    def test_larger_size_higher_risk(self):
        patient = _make_patient()
        sizes = [AneurysmSize.SMALL, AneurysmSize.MEDIUM, AneurysmSize.LARGE, AneurysmSize.GIANT]
        evt_probs = [calc.calculate_evt_risk(patient, _make_aneurysm(size=s)) for s in sizes]
        nt_probs = [calc.calculate_nt_risk(patient, _make_aneurysm(size=s)) for s in sizes]
        # Probabilities should increase with size
        for i in range(len(sizes) - 1):
            assert evt_probs[i] < evt_probs[i + 1]
            assert nt_probs[i] < nt_probs[i + 1]


class TestMorphologyEffects:
    def test_fusiform_higher_than_regular(self):
        patient = _make_patient()
        regular = _make_aneurysm(morphology=AneurysmMorphology.REGULAR_SACCULAR)
        fusiform = _make_aneurysm(morphology=AneurysmMorphology.FUSIFORM)
        assert calc.calculate_evt_risk(patient, fusiform) > calc.calculate_evt_risk(patient, regular)
        assert calc.calculate_nt_risk(patient, fusiform) > calc.calculate_nt_risk(patient, regular)


class TestFullAssessment:
    def test_assess_returns_all_fields(self):
        data = MARTAInput(
            patient=_make_patient(),
            aneurysm=_make_aneurysm(),
        )
        result = calc.assess(data)
        assert 0.0 < result.evt_probability < 1.0
        assert 0.0 < result.nt_probability < 1.0
        assert result.evt_risk_category in ("Low", "Moderate", "High")
        assert result.nt_risk_category in ("Low", "Moderate", "High")
        assert len(result.recommended_treatment) > 0
        assert "evt_probability_pct" in result.details
        assert "nt_probability_pct" in result.details
        assert "best_evt_approach" in result.details
        assert "best_evt_approach_risk_pct" in result.details
        assert "evt_approach_comparison" in result.details
        approaches = result.details["evt_approach_comparison"]
        assert len(approaches) == 4
        # Should be sorted by probability ascending
        for i in range(len(approaches) - 1):
            assert approaches[i]["probability"] <= approaches[i + 1]["probability"]

    def test_recommendation_reflects_lower_risk(self):
        # MCA favors surgery (NT < EVT)
        data = MARTAInput(
            patient=_make_patient(),
            aneurysm=_make_aneurysm(location=AneurysmLocation.MCA),
        )
        result = calc.assess(data)
        if result.nt_probability < result.evt_probability:
            assert "NT" in result.recommended_treatment
        elif result.evt_probability < result.nt_probability:
            assert "EVT" in result.recommended_treatment


class TestEdgeCases:
    def test_minimum_age(self):
        patient = _make_patient(age=0)
        aneurysm = _make_aneurysm()
        prob = calc.calculate_evt_risk(patient, aneurysm)
        assert 0.0 < prob < 1.0

    def test_maximum_age(self):
        patient = _make_patient(age=120)
        aneurysm = _make_aneurysm()
        prob = calc.calculate_evt_risk(patient, aneurysm)
        assert 0.0 < prob < 1.0

    def test_all_comorbidities_on(self):
        patient = _make_patient(
            age=70, smoking=True, hypertension=True, dyslipidemia=True,
            cerebrovascular_disease=True, family_history_sah=True, baseline_mrs=5,
        )
        aneurysm = _make_aneurysm(
            size=AneurysmSize.GIANT,
            morphology=AneurysmMorphology.FUSIFORM,
            neck_geometry=NeckGeometry.BIFURCATION_WIDE_NECK,
            neck_surface=NeckSurface.HALF_OR_MORE,
            sac_wall_calcification=True,
            intraluminal_thrombus=True,
            dissecting_etiology=True,
            parent_artery_focal_stenosis=True,
            collateral_branch_from_sac=True,
            collateral_branch_from_neck=True,
        )
        evt = calc.calculate_evt_risk(patient, aneurysm)
        nt = calc.calculate_nt_risk(patient, aneurysm)
        # Should still be valid probabilities (not overflow)
        assert 0.0 < evt <= 1.0
        assert 0.0 < nt <= 1.0

    def test_all_features_off(self):
        patient = _make_patient(age=30)
        aneurysm = _make_aneurysm()
        evt = calc.calculate_evt_risk(patient, aneurysm)
        nt = calc.calculate_nt_risk(patient, aneurysm)
        assert evt < 0.10  # baseline healthy should be low
        assert nt < 0.10


class TestAPIEndpoint:
    """Test the /marta_assessment endpoint via FastAPI TestClient."""

    def test_marta_endpoint(self):
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        payload = {
            "patient": {
                "age": 60, "sex": "F", "smoking": True, "hypertension": True,
                "dyslipidemia": False, "cerebrovascular_disease": False,
                "family_history_sah": False, "baseline_mrs": 1,
            },
            "aneurysm": {
                "location": "ACoA", "size": "medium",
                "morphology": "regular_saccular", "neck_geometry": "sidewall",
                "neck_surface": "less_than_half",
                "sac_wall_calcification": False, "intraluminal_thrombus": False,
                "dissecting_etiology": False, "parent_artery_focal_stenosis": False,
                "collateral_branch_from_sac": False, "collateral_branch_from_neck": False,
                "evt_approach": "coiling_bac",
            },
        }
        response = client.post("/marta_assessment", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "evt_probability" in data
        assert "nt_probability" in data
        assert "evt_risk_category" in data
        assert "nt_risk_category" in data
        assert "recommended_treatment" in data
