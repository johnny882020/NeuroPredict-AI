import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const uploadScan = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE}/analyze_and_mesh`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const predictRisk = async (clinicalData, morphData, rsnaProbability = null) => {
    const params = rsnaProbability !== null ? `?rsna_probability=${rsnaProbability}` : '';
    const response = await axios.post(`${API_BASE}/predict_risk${params}`, {
        clinical: clinicalData,
        morph: morphData
    });
    return response.data;
};

export const simulateTreatment = async (treatmentType, baselineWSS, baselineOSI) => {
    const response = await axios.post(`${API_BASE}/simulate_treatment?treatment_type=${treatmentType}&baseline_wss_pa=${baselineWSS}&baseline_osi=${baselineOSI}`);
    return response.data;
};

export const assessMARTA = async (martaData) => {
    const response = await axios.post(`${API_BASE}/marta_assessment`, martaData);
    return response.data;
};
