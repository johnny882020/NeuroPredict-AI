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

export const predictRisk = async (
    clinicalData,
    morphData,
    rsnaProbability = null,
    martaEvtPct = null,
    martaNtPct = null,
) => {
    const params = new URLSearchParams();
    if (rsnaProbability !== null) params.append('rsna_probability', rsnaProbability);
    if (martaEvtPct !== null)     params.append('marta_evt_pct', martaEvtPct);
    if (martaNtPct !== null)      params.append('marta_nt_pct', martaNtPct);
    const qs = params.toString() ? `?${params}` : '';
    const response = await axios.post(`${API_BASE}/predict_risk${qs}`, {
        clinical: clinicalData,
        morph: morphData,
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
