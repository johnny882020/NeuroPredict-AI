import React, { useState } from 'react';
import { uploadScan, predictRisk, simulateTreatment, assessMARTA } from './api';
import Viewer3D from './components/Viewer3D';
import ClinicalForm from './components/ClinicalForm';
import MARTAForm from './components/MARTAForm';

const RISK_COLORS = { Low: '#16a34a', Moderate: '#d97706', High: '#dc2626' };
const RISK_BG = { Low: '#f0fdf4', Moderate: '#fffbeb', High: '#fef2f2' };
const RISK_BORDER = { Low: '#bbf7d0', Moderate: '#fde68a', High: '#fecaca' };

const CARD = {
    padding: '16px', borderRadius: '10px',
    background: '#ffffff', border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const MetricCard = ({ label, value, unit }) => (
    <div style={{
        padding: '10px 14px', background: '#f8fafc', borderRadius: 8,
        border: '1px solid #e2e8f0', minWidth: 0,
    }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
            {value}{unit && <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b', marginLeft: 2 }}>{unit}</span>}
        </div>
    </div>
);

function App() {
    const [file, setFile] = useState(null);
    const [scanData, setScanData] = useState(null);
    const [riskData, setRiskData] = useState(null);
    const [martaResult, setMartaResult] = useState(null);
    const [simulation, setSimulation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [martaLoading, setMartaLoading] = useState(false);
    const [error, setError] = useState(null);

    const [clinical, setClinical] = useState({
        age: 50, smoking: false, hypertension: false, previous_sah: false, familial_sah: false
    });

    const [martaData, setMartaData] = useState({
        patient: {
            age: 55, sex: 'F', smoking: false, hypertension: false,
            dyslipidemia: false, cerebrovascular_disease: false,
            family_history_sah: false, baseline_mrs: 0,
        },
        aneurysm: {
            location: 'MCA', size: 'small', morphology: 'regular_saccular',
            neck_geometry: 'sidewall', neck_surface: 'less_than_half',
            sac_wall_calcification: false, intraluminal_thrombus: false,
            dissecting_etiology: false, parent_artery_focal_stenosis: false,
            collateral_branch_from_sac: false, collateral_branch_from_neck: false,
            evt_approach: 'coiling_bac',
        },
    });

    const handleUpload = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await uploadScan(file);
            setScanData(result);
            setRiskData(null);
            setSimulation(null);
        } catch (err) {
            setError('Upload failed: ' + (err.response?.data?.detail || err.message));
        }
        setLoading(false);
    };

    const handleRiskPrediction = async () => {
        if (!scanData) return;
        setError(null);
        try {
            const result = await predictRisk(clinical, scanData.morphology);
            setRiskData(result);
        } catch (err) {
            setError('Risk prediction failed: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleMARTA = async () => {
        setMartaLoading(true);
        setError(null);
        try {
            const result = await assessMARTA(martaData);
            setMartaResult(result);
        } catch (err) {
            setError('MARTA assessment failed: ' + (err.response?.data?.detail || err.message));
        }
        setMartaLoading(false);
    };

    const handleSimulation = async (type) => {
        setError(null);
        try {
            const result = await simulateTreatment(
                type,
                scanData.baseline_hemodynamics.mean_wss_pa,
                scanData.baseline_hemodynamics.mean_osi
            );
            setSimulation(result);
        } catch (err) {
            setError('Simulation failed: ' + (err.response?.data?.detail || err.message));
        }
    };

    const hemo = scanData?.baseline_hemodynamics;
    const morph = scanData?.morphology;
    const mesh = scanData?.mesh;

    const vertexWss = hemo?.vertex_wss;
    const wssRange = hemo ? [hemo.min_wss_pa, hemo.max_wss_pa] : undefined;

    const flowStatusIsRisky = hemo?.flow_status?.toLowerCase().includes('risk');

    return (
        <div style={{ padding: '16px', fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: '1500px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
                <h1 style={{ margin: 0, fontSize: 'clamp(20px, 5vw, 28px)', color: '#1e293b' }}>NeuroPredict AI</h1>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Precision Prediction. Dynamic Intervention.</p>
            </div>

            {/* Error banner */}
            {error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, wordBreak: 'break-word' }}>{error}</span>
                    <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}>x</button>
                </div>
            )}

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* LEFT COLUMN: Scan Analysis + Clinical */}
                <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

                    {/* Upload Section */}
                    <div style={{ ...CARD, marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e40af' }}>1. Automated Aneurysm Analysis</h3>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input type="file" onChange={(e) => setFile(e.target.files[0])} accept="*"
                                style={{ fontSize: '14px', color: '#475569', minWidth: 0, flex: '1 1 180px' }} />
                            <button onClick={handleUpload} disabled={!file || loading}
                                style={{
                                    background: (!file || loading) ? '#94a3b8' : '#2563eb',
                                    color: '#fff', border: 'none', fontWeight: '600',
                                    padding: '8px 20px', whiteSpace: 'nowrap', width: 'auto',
                                }}>
                                {loading ? "Processing..." : "Analyze CTA Scan"}
                            </button>
                        </div>
                    </div>

                    {scanData && scanData.aneurysm_detected && (
                        <>
                            {/* 3D Viewer with WSS */}
                            <div style={{ ...CARD, marginBottom: '20px' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e40af' }}>3D Aneurysm Morphology</h3>
                                <Viewer3D
                                    meshData={mesh}
                                    vertexWss={vertexWss}
                                    wssRange={wssRange}
                                />
                            </div>

                            {/* Flow Status Banner */}
                            {hemo && (
                                <div style={{
                                    ...CARD, marginBottom: '20px',
                                    background: flowStatusIsRisky ? '#fef2f2' : '#f0fdf4',
                                    borderColor: flowStatusIsRisky ? '#fecaca' : '#bbf7d0',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                    <div style={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: flowStatusIsRisky ? '#dc2626' : '#16a34a',
                                        flexShrink: 0,
                                    }} />
                                    <span style={{
                                        fontWeight: 600, fontSize: 14,
                                        color: flowStatusIsRisky ? '#991b1b' : '#166534',
                                    }}>
                                        {hemo.flow_status}
                                    </span>
                                </div>
                            )}

                            {/* Angioarchitecture Panel */}
                            {(morph || hemo) && (
                                <div style={{ ...CARD, marginBottom: '20px' }}>
                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#1e40af' }}>Angioarchitecture</h3>

                                    {/* Morphology Metrics */}
                                    {morph && (
                                        <>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Morphology</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                                                <MetricCard label="Max Diameter" value={morph.maximum_3d_diameter_mm} unit="mm" />
                                                <MetricCard label="Volume" value={morph.volume_mm3 ?? mesh?.volume_mm3} unit="mm3" />
                                                <MetricCard label="Surface Area" value={morph.surface_area_mm2 ?? mesh?.surface_area_mm2} unit="mm2" />
                                                <MetricCard label="Aspect Ratio" value={morph.aspect_ratio_AR} />
                                                <MetricCard label="Size Ratio" value={morph.size_ratio_SR} />
                                                <MetricCard label="Neck Diameter" value={morph.neck_diameter_mm} unit="mm" />
                                                <MetricCard label="Irregularity" value={morph.irregularity_index} />
                                            </div>
                                        </>
                                    )}

                                    {/* Hemodynamics Metrics */}
                                    {hemo && (
                                        <>
                                            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hemodynamics</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                                                <MetricCard label="Mean WSS" value={hemo.mean_wss_pa} unit="Pa" />
                                                <MetricCard label="Max WSS" value={hemo.max_wss_pa} unit="Pa" />
                                                <MetricCard label="Min WSS" value={hemo.min_wss_pa} unit="Pa" />
                                                <MetricCard label="WSS Std Dev" value={hemo.wss_std_pa} unit="Pa" />
                                                <MetricCard label="Mean OSI" value={hemo.mean_osi} />
                                                <MetricCard label="Elongation" value={hemo.elongation_ratio} />
                                            </div>

                                            {hemo.flow_direction && (
                                                <div style={{ padding: '8px 12px', background: '#f0f9ff', borderRadius: 6, border: '1px solid #bae6fd', fontSize: 13, color: '#0c4a6e', wordBreak: 'break-all' }}>
                                                    <strong>Flow Direction:</strong>{' '}
                                                    [{hemo.flow_direction.map(v => v.toFixed(3)).join(', ')}]
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Clinical Risk */}
                            <div style={{ ...CARD, marginBottom: '20px' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e40af' }}>2. Clinical Data & Risk Prediction</h3>
                                <ClinicalForm
                                    clinical={clinical}
                                    setClinical={setClinical}
                                    onSubmit={handleRiskPrediction}
                                />
                            </div>

                            {riskData && (
                                <div style={{ ...CARD, marginBottom: '20px', background: '#f0f9ff', borderColor: '#bae6fd' }}>
                                    <h4 style={{ margin: '0 0 10px 0', color: '#0c4a6e' }}>Risk Assessment</h4>
                                    <p style={{ color: '#334155', fontSize: 14 }}><strong>UIATS Score:</strong> {riskData.uiats_assessment.uiats_score}</p>
                                    <p style={{ color: '#334155', fontSize: 14 }}><strong>UIATS Recommendation:</strong> {riskData.uiats_assessment.uiats_recommendation}</p>
                                    <p style={{ color: '#334155', fontSize: 14 }}><strong>AI Rupture Probability:</strong> <span style={{ fontWeight: '700', color: '#dc2626' }}>{(riskData.ai_rupture_probability * 100).toFixed(2)}%</span></p>
                                </div>
                            )}

                            {/* Treatment Simulation */}
                            <div style={{ ...CARD, marginBottom: '20px' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e40af' }}>3. Treatment Simulation</h3>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    <button onClick={() => handleSimulation('flow_diverter')}
                                        style={{ background: '#7c3aed', color: '#fff', border: 'none', fontWeight: '600', flex: '1 1 auto', minWidth: 'fit-content' }}>
                                        Simulate Flow Diverter
                                    </button>
                                    <button onClick={() => handleSimulation('surgical_clip')}
                                        style={{ background: '#059669', color: '#fff', border: 'none', fontWeight: '600', flex: '1 1 auto', minWidth: 'fit-content' }}>
                                        Simulate Surgical Clip
                                    </button>
                                </div>
                            </div>

                            {simulation && (
                                <div style={{ ...CARD, marginBottom: '20px', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                    <h4 style={{ margin: '0 0 10px 0', color: '#166534' }}>Post-Treatment Hemodynamics</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                        <p style={{ margin: 0, color: '#334155', fontSize: 14 }}><strong>Mean WSS:</strong> {simulation.mean_wss_pa} Pa</p>
                                        <p style={{ margin: 0, color: '#334155', fontSize: 14 }}><strong>Max WSS:</strong> {simulation.max_wss_pa} Pa</p>
                                        <p style={{ margin: 0, color: '#334155', fontSize: 14 }}><strong>OSI:</strong> {simulation.mean_osi}</p>
                                    </div>
                                    <p style={{ marginTop: '10px', padding: '10px', background: '#dcfce7', borderRadius: '6px', color: '#166534', fontSize: '14px' }}>
                                        <strong>Outcome:</strong> {simulation.clinical_outcome}
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {scanData && !scanData.aneurysm_detected && (
                        <div style={{ ...CARD, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                            <h3 style={{ margin: 0, color: '#166534' }}>No aneurysm detected in this scan.</h3>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: MARTA Score */}
                <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                    <div style={{ ...CARD, marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#1e40af' }}>MARTA Risk Assessment</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px 0' }}>
                            Morphological And Risk-related Treatment Assessment
                        </p>

                        <MARTAForm
                            martaData={martaData}
                            setMartaData={setMartaData}
                            onSubmit={handleMARTA}
                            loading={martaLoading}
                        />
                    </div>

                    {martaResult && (
                        <div>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#1e293b' }}>MARTA Results</h4>

                            {/* EVT vs NT */}
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                <div style={{
                                    ...CARD, flex: '1 1 140px', minWidth: 0,
                                    background: RISK_BG[martaResult.evt_risk_category],
                                    borderColor: RISK_BORDER[martaResult.evt_risk_category],
                                }}>
                                    <h5 style={{ margin: '0 0 6px 0', color: '#1e40af', fontSize: '14px' }}>MARTA-EVT</h5>
                                    <p style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: '700', margin: '4px 0', color: '#1e293b' }}>
                                        {martaResult.details.evt_probability_pct}%
                                    </p>
                                    <span style={{
                                        padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                                        background: RISK_COLORS[martaResult.evt_risk_category] + '18',
                                        color: RISK_COLORS[martaResult.evt_risk_category],
                                        border: `1px solid ${RISK_COLORS[martaResult.evt_risk_category]}40`,
                                    }}>
                                        {martaResult.evt_risk_category} Risk
                                    </span>
                                </div>

                                <div style={{
                                    ...CARD, flex: '1 1 140px', minWidth: 0,
                                    background: RISK_BG[martaResult.nt_risk_category],
                                    borderColor: RISK_BORDER[martaResult.nt_risk_category],
                                }}>
                                    <h5 style={{ margin: '0 0 6px 0', color: '#7c3aed', fontSize: '14px' }}>MARTA-NT</h5>
                                    <p style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: '700', margin: '4px 0', color: '#1e293b' }}>
                                        {martaResult.details.nt_probability_pct}%
                                    </p>
                                    <span style={{
                                        padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                                        background: RISK_COLORS[martaResult.nt_risk_category] + '18',
                                        color: RISK_COLORS[martaResult.nt_risk_category],
                                        border: `1px solid ${RISK_COLORS[martaResult.nt_risk_category]}40`,
                                    }}>
                                        {martaResult.nt_risk_category} Risk
                                    </span>
                                </div>
                            </div>

                            {/* Treatment Recommendation */}
                            <div style={{ ...CARD, marginBottom: '16px', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                <h5 style={{ margin: '0 0 8px 0', color: '#166534', fontSize: '15px' }}>Recommended Treatment Approach</h5>
                                <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>{martaResult.recommended_treatment}</p>
                            </div>

                            {/* Best EVT Device */}
                            {martaResult.details.best_evt_approach && (
                                <div style={{ ...CARD, marginBottom: '16px', background: '#f5f3ff', borderColor: '#ddd6fe' }}>
                                    <h5 style={{ margin: '0 0 8px 0', color: '#5b21b6', fontSize: '15px' }}>Recommended EVT Device</h5>
                                    <p style={{ margin: 0, fontSize: '14px', color: '#334155', wordBreak: 'break-word' }}>
                                        <strong>{martaResult.details.best_evt_approach}</strong>
                                        {' \u2014 '}
                                        <span style={{ color: RISK_COLORS[martaResult.details.evt_approach_comparison?.[0]?.risk_category || 'Moderate'] }}>
                                            {martaResult.details.best_evt_approach_risk_pct}% complication risk
                                        </span>
                                    </p>
                                </div>
                            )}

                            {/* EVT Comparison Table */}
                            {martaResult.details.evt_approach_comparison && (
                                <div style={{ ...CARD, overflow: 'hidden' }}>
                                    <h5 style={{ margin: '0 0 12px 0', color: '#1e40af', fontSize: '15px' }}>EVT Approach Comparison</h5>
                                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '300px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: '600' }}>Approach</th>
                                                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#64748b', fontWeight: '600' }}>Risk %</th>
                                                    <th style={{ textAlign: 'center', padding: '8px 10px', color: '#64748b', fontWeight: '600' }}>Category</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {martaResult.details.evt_approach_comparison.map((row, i) => (
                                                    <tr key={row.approach} style={{
                                                        borderBottom: '1px solid #f1f5f9',
                                                        background: i === 0 ? '#f0fdf4' : (i % 2 === 0 ? '#f8fafc' : '#ffffff'),
                                                    }}>
                                                        <td style={{ padding: '8px 10px', color: '#334155', fontWeight: i === 0 ? '600' : '400' }}>
                                                            {i === 0 && <span style={{ color: '#16a34a', marginRight: '4px' }}>*</span>}{row.label}
                                                        </td>
                                                        <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: '600', color: '#1e293b' }}>
                                                            {row.probability_pct}%
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                                                            <span style={{
                                                                padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                                                                background: RISK_COLORS[row.risk_category] + '15',
                                                                color: RISK_COLORS[row.risk_category],
                                                                border: `1px solid ${RISK_COLORS[row.risk_category]}30`,
                                                            }}>
                                                                {row.risk_category}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
