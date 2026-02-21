import numpy as np

class UIATSCalculator:
    """
    Unruptured Intracranial Aneurysm Treatment Score (UIATS) calculator.
    Provides a standardized recommendation for treatment vs. conservative management.
    """
    def calculate_score(self, clinical_data: dict, morphology_data: dict) -> dict:
        score = 0

        # Age factor
        age = clinical_data.get("age", 50)
        if age < 40:
            score += 2
        elif age > 70:
            score -= 2

        # Risk factors
        if clinical_data.get("smoking", False):
            score += 1
        if clinical_data.get("hypertension", False):
            score += 1
        if clinical_data.get("previous_sah", False):
            score += 3
        if clinical_data.get("familial_sah", False):
            score += 2

        # Morphology factors
        diameter = morphology_data.get("maximum_3d_diameter_mm", 0)
        if diameter >= 7.0:
            score += 3
        elif diameter >= 5.0:
            score += 1

        if morphology_data.get("aspect_ratio_AR", 0) > 1.6:
            score += 2

        if morphology_data.get("is_irregular", False):
            score += 2

        # Recommendation
        if score >= 5:
            recommendation = "Treatment recommended"
        elif score >= 2:
            recommendation = "Consider treatment - close monitoring advised"
        else:
            recommendation = "Conservative management recommended"

        return {
            "uiats_score": score,
            "uiats_recommendation": recommendation
        }


class MLRupturePredictor:
    """
    ML-based rupture probability predictor.
    Placeholder using a logistic-like heuristic until a trained model is available.
    """
    def predict_risk(self, clinical_data: dict, morphology_data: dict) -> float:
        risk = 0.05  # Base risk

        # Clinical factors
        if clinical_data.get("smoking", False):
            risk += 0.08
        if clinical_data.get("hypertension", False):
            risk += 0.10
        if clinical_data.get("previous_sah", False):
            risk += 0.20
        if clinical_data.get("familial_sah", False):
            risk += 0.12

        # Morphology factors
        diameter = morphology_data.get("maximum_3d_diameter_mm", 0)
        risk += min(diameter * 0.02, 0.30)

        ar = morphology_data.get("aspect_ratio_AR", 1.0)
        if ar > 1.6:
            risk += 0.15

        if morphology_data.get("is_irregular", False):
            risk += 0.10

        return round(min(risk, 0.95), 4)


# Singleton instances
uiats_calc = UIATSCalculator()
ml_predictor = MLRupturePredictor()
