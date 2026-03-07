import React, { useState } from 'react';
import { uploadScan, predictRisk, simulateTreatment, assessMARTA } from './api';
import Viewer3D from './components/Viewer3D';
import ClinicalForm from './components/ClinicalForm';
import MARTAForm from './components/MARTAForm';

// ── Design tokens (dark medical workstation) ──────────────────────────────────
const T = {
    bg:       '#080c14',
    surface:  '#0e1420',
    panel:    '#141b2d',
    border:   '#1e2d48',
    borderSub:'#162038',
    textPri:  '#e8edf5',
    textSec:  '#5d7a9e',
    textMuted:'#3a5070',
    orange:   '#f97316',
    orangeDim:'#7c3c0d',
    cyan:     '#06b6d4',
    cyanDim:  '#0c4a5a',
    blue:     '#3b82f6',
    blueDim:  '#1e3a5f',
    green:    '#10b981',
    greenDim: '#064e3b',
    red:      '#ef4444',
    redDim:   '#450a0a',
    purple:   '#a855f7',
    purpleDim:'#3b0764',
};

const RISK_COLOR = { Low: T.green, Moderate: T.orange, High: T.red };
const RISK_DIM   = { Low: T.greenDim, Moderate: T.orangeDim, High: T.redDim };

// ── Shared component styles ───────────────────────────────────────────────────
const panelStyle = {
    background: T.panel,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    marginBottom: 16,
};

const labelStyle = {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: T.textSec,
    marginBottom: 4,
    display: 'block',
};

const sectionTitle = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: T.cyan,
    margin: '0 0 14px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
};

const btnBase = {
    border: 'none',
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    padding: '8px 18px',
    transition: 'opacity 0.15s',
};

// ── Sub-components ────────────────────────────────────────────────────────────
const Dot = ({ color = T.cyan, size = 7 }) => (
    <span style={{
        display: 'inline-block',
        width: size, height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}88`,
        flexShrink: 0,
    }} />
);

const MetricPill = ({ label, value, unit, accent }) => (
    <div style={{
        background: T.surface,
        border: `1px solid ${accent ? accent + '44' : T.borderSub}`,
        borderRadius: 6,
        padding: '8px 12px',
    }}>
        <div style={{ ...labelStyle, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: accent || T.textPri, lineHeight: 1.1 }}>
            {value}
            {unit && <span style={{ fontSize: 11, fontWeight: 400, color: T.textSec, marginLeft: 3 }}>{unit}</span>}
        </div>
    </div>
);

const SectionHeader = ({ icon, title, badge }) => (
    <div style={{ ...sectionTitle }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        {title}
        {badge && (
            <span style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background: T.cyanDim,
                color: T.cyan,
                letterSpacing: '0.05em',
            }}>{badge}</span>
        )}
    </div>
);

const ProbBar = ({ label, prob, maxProb }) => {
    const pct = (prob * 100).toFixed(1);
    const relWidth = maxProb > 0 ? (prob / maxProb) * 100 : prob * 100;
    const isTop = relWidth > 80;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <span style={{
                fontSize: 11, color: isTop ? T.textPri : T.textSec,
                minWidth: 240, flexShrink: 0, fontWeight: isTop ? 600 : 400,
            }}>{label}</span>
            <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                    width: `${relWidth}%`, height: '100%',
                    background: isTop ? T.orange : T.blue,
                    borderRadius: 2,
                    transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
                }} />
            </div>
            <span style={{
                fontSize: 11, fontWeight: 700,
                color: isTop ? T.orange : T.textSec,
                minWidth: 38, textAlign: 'right',
            }}>{pct}%</span>
        </div>
    );
};

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
    const [file, setFile] = useState(null);
    const [scanData, setScanData] = useState(null);
    const [riskData, setRiskData] = useState(null);
    const [martaResult, setMartaResult] = useState(null);
    const [simulation, setSimulation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [martaLoading, setMartaLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('analysis');

    const [clinical, setClinical] = useState({
        age: 50, smoking: false, hypertension: false, previous_sah: false, familial_sah: false,
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
            const result = await predictRisk(clinical, scanData.morphology, scanData.aneurysm_probability);
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
                scanData.baseline_hemodynamics.mean_osi,
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
    const flowRisky = hemo?.flow_status?.toLowerCase().includes('risk');

    const tabs = [
        { id: 'analysis', label: 'CTA Analysis' },
        { id: 'risk',     label: 'Risk & Clinical' },
        { id: 'marta',    label: 'MARTA Assessment' },
        { id: 'treatment',label: 'Treatment Sim' },
    ];

    // sorted location probs
    const sortedLocs = scanData?.location_probabilities
        ? Object.entries(scanData.location_probabilities).sort(([, a], [, b]) => b - a)
        : [];
    const maxLocProb = sortedLocs[0]?.[1] ?? 1;

    return (
        <div style={{
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            background: T.bg,
            minHeight: '100vh',
            color: T.textPri,
        }}>
            {/* ── Top Header Bar ───────────────────────────────────────────── */}
            <header style={{
                background: T.surface,
                borderBottom: `1px solid ${T.border}`,
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                height: 52,
                gap: 16,
                position: 'sticky',
                top: 0,
                zIndex: 100,
            }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 900, color: '#fff',
                    }}>N</div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em', color: T.textPri }}>
                            NeuroPredict<span style={{ color: T.cyan }}>AI</span>
                        </div>
                        <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: -1 }}>
                            Intracranial Aneurysm Platform
                        </div>
                    </div>
                </div>

                {/* Tab navigation */}
                <nav style={{ display: 'flex', gap: 2, marginLeft: 20, flex: 1 }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            ...btnBase,
                            padding: '6px 14px',
                            background: activeTab === tab.id ? T.panel : 'transparent',
                            color: activeTab === tab.id ? T.textPri : T.textSec,
                            border: activeTab === tab.id ? `1px solid ${T.border}` : '1px solid transparent',
                            borderBottom: activeTab === tab.id ? `2px solid ${T.cyan}` : '2px solid transparent',
                            borderRadius: '6px 6px 0 0',
                            fontSize: 12,
                            marginBottom: -1,
                        }}>
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {/* Status badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <Dot color={T.green} />
                    <span style={{ fontSize: 11, color: T.textSec }}>
                        {scanData?.pipeline === 'rsna_2025' ? 'RSNA 2025 Live' : 'Fallback Mode'}
                    </span>
                    <span style={{
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 4,
                        background: T.cyanDim, color: T.cyan,
                        letterSpacing: '0.05em',
                    }}>AUC 0.916</span>
                </div>
            </header>

            {/* ── Error Banner ──────────────────────────────────────────────── */}
            {error && (
                <div style={{
                    background: T.redDim,
                    borderBottom: `1px solid ${T.red}44`,
                    padding: '10px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Dot color={T.red} />
                        <span style={{ fontSize: 12, color: '#fca5a5' }}>{error}</span>
                    </div>
                    <button onClick={() => setError(null)} style={{
                        ...btnBase, padding: '4px 10px',
                        background: 'transparent', color: '#fca5a5',
                        border: `1px solid ${T.red}44`, fontSize: 11,
                    }}>Dismiss</button>
                </div>
            )}

            {/* ── Main Content ──────────────────────────────────────────────── */}
            <div style={{ padding: 20, maxWidth: 1600, margin: '0 auto' }}>

                {/* ── TAB: CTA Analysis ──────────────────────────────────── */}
                {activeTab === 'analysis' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

                        {/* LEFT PANEL */}
                        <div>
                            {/* Upload */}
                            <div style={{ ...panelStyle, padding: 16 }}>
                                <SectionHeader icon="⬆" title="Load Study" />
                                <label style={labelStyle}>Scan File</label>
                                <input
                                    type="file"
                                    onChange={e => setFile(e.target.files[0])}
                                    accept=".zip,.nii,.nii.gz"
                                    style={{
                                        display: 'block',
                                        width: '100%', marginBottom: 8,
                                        fontSize: 12, color: T.textSec,
                                        background: T.surface,
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 6, padding: '6px 10px',
                                        boxSizing: 'border-box',
                                    }}
                                />
                                <p style={{ fontSize: 10, color: T.textMuted, margin: '0 0 12px 0' }}>
                                    .zip (DICOM series) · .nii.gz (NIfTI)
                                </p>
                                <button
                                    onClick={handleUpload}
                                    disabled={!file || loading}
                                    style={{
                                        ...btnBase,
                                        width: '100%',
                                        background: (!file || loading)
                                            ? T.border
                                            : `linear-gradient(90deg, ${T.cyan}, ${T.blue})`,
                                        color: (!file || loading) ? T.textMuted : '#fff',
                                        padding: '10px',
                                        fontSize: 12,
                                        opacity: loading ? 0.7 : 1,
                                    }}
                                >
                                    {loading ? '⚙ Processing…' : '▶  Analyze CTA Scan'}
                                </button>
                            </div>

                            {/* AI Detection Result */}
                            {scanData && (
                                <div style={{
                                    ...panelStyle,
                                    padding: 16,
                                    borderColor: scanData.aneurysm_detected ? T.orange + '88' : T.green + '44',
                                }}>
                                    <SectionHeader icon="◉" title="AI Detection" badge="RSNA 2025" />

                                    {/* Big probability display */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-end',
                                        marginBottom: 12,
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1,
                                                color: scanData.aneurysm_probability > 0.5 ? T.orange : T.green,
                                            }}>
                                                {(scanData.aneurysm_probability * 100).toFixed(1)}
                                                <span style={{ fontSize: 18, fontWeight: 600 }}>%</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>
                                                aneurysm probability
                                            </div>
                                        </div>
                                        <div style={{
                                            padding: '5px 12px',
                                            background: scanData.aneurysm_detected ? T.orangeDim : T.greenDim,
                                            border: `1px solid ${scanData.aneurysm_detected ? T.orange : T.green}55`,
                                            borderRadius: 6,
                                            fontSize: 12, fontWeight: 700,
                                            color: scanData.aneurysm_detected ? T.orange : T.green,
                                            letterSpacing: '0.06em',
                                        }}>
                                            {scanData.aneurysm_detected ? 'DETECTED' : 'NEGATIVE'}
                                        </div>
                                    </div>

                                    {/* Probability bar */}
                                    <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
                                        <div style={{
                                            width: `${scanData.aneurysm_probability * 100}%`,
                                            height: '100%',
                                            background: scanData.aneurysm_probability > 0.5
                                                ? `linear-gradient(90deg, ${T.orange}, #fb923c)`
                                                : `linear-gradient(90deg, ${T.green}, #34d399)`,
                                            borderRadius: 2,
                                            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                                        }} />
                                    </div>

                                    {/* Top location */}
                                    {scanData.top_location && (
                                        <div style={{
                                            padding: '8px 12px',
                                            background: T.surface,
                                            borderRadius: 6,
                                            border: `1px solid ${T.borderSub}`,
                                        }}>
                                            <span style={{ ...labelStyle, marginBottom: 2 }}>Primary Location</span>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: T.orange }}>
                                                {scanData.top_location}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Flow Status */}
                            {hemo && (
                                <div style={{
                                    ...panelStyle, padding: 14,
                                    borderColor: flowRisky ? T.red + '55' : T.green + '44',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                    <Dot color={flowRisky ? T.red : T.green} size={8} />
                                    <div>
                                        <div style={{ fontSize: 11, color: T.textSec }}>Hemodynamic Status</div>
                                        <div style={{
                                            fontSize: 13, fontWeight: 700,
                                            color: flowRisky ? T.red : T.green,
                                        }}>{hemo.flow_status}</div>
                                    </div>
                                </div>
                            )}

                            {/* Morphology metrics */}
                            {morph && (
                                <div style={{ ...panelStyle, padding: 16 }}>
                                    <SectionHeader icon="⬡" title="Morphology" />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <MetricPill label="Max Diameter" value={morph.maximum_3d_diameter_mm} unit="mm" accent={T.cyan} />
                                        <MetricPill label="Aspect Ratio" value={morph.aspect_ratio_AR} />
                                        <MetricPill label="Size Ratio" value={morph.size_ratio_SR} />
                                        <MetricPill label="Neck Diam" value={morph.neck_diameter_mm} unit="mm" />
                                        <MetricPill label="Volume" value={morph.volume_mm3 ?? mesh?.volume_mm3} unit="mm³" />
                                        <MetricPill label="Irregularity" value={morph.irregularity_index} />
                                    </div>
                                </div>
                            )}

                            {/* Hemodynamics metrics */}
                            {hemo && (
                                <div style={{ ...panelStyle, padding: 16 }}>
                                    <SectionHeader icon="~" title="Hemodynamics" />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <MetricPill label="Mean WSS" value={hemo.mean_wss_pa} unit="Pa" accent={T.cyan} />
                                        <MetricPill label="Max WSS" value={hemo.max_wss_pa} unit="Pa" accent={flowRisky ? T.red : undefined} />
                                        <MetricPill label="Min WSS" value={hemo.min_wss_pa} unit="Pa" />
                                        <MetricPill label="Mean OSI" value={hemo.mean_osi} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT PANEL */}
                        <div>
                            {/* 3D Viewer */}
                            <div style={{
                                ...panelStyle,
                                padding: 16,
                                minHeight: 420,
                            }}>
                                <SectionHeader icon="◈" title="3D Vessel Morphology" badge={mesh ? 'MESH READY' : 'AWAITING SCAN'} />
                                {mesh ? (
                                    <div style={{
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        border: `1px solid ${T.border}`,
                                    }}>
                                        <Viewer3D
                                            meshData={mesh}
                                            vertexWss={vertexWss}
                                            wssRange={wssRange}
                                        />
                                    </div>
                                ) : (
                                    <div style={{
                                        height: 360,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: T.surface,
                                        borderRadius: 6,
                                        border: `1px dashed ${T.border}`,
                                        gap: 12,
                                    }}>
                                        <div style={{ fontSize: 48, opacity: 0.2 }}>◈</div>
                                        <div style={{ fontSize: 13, color: T.textMuted, textAlign: 'center' }}>
                                            Upload a CTA scan to render<br />3D vessel morphology
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Location Probabilities */}
                            {sortedLocs.length > 0 && (
                                <div style={{ ...panelStyle, padding: 16 }}>
                                    <SectionHeader icon="◎" title="Vessel Location Probabilities" badge="13 LOCATIONS" />
                                    <div>
                                        {sortedLocs.slice(0, 8).map(([loc, prob]) => (
                                            <ProbBar key={loc} label={loc} prob={prob} maxProb={maxLocProb} />
                                        ))}
                                        {sortedLocs.length > 8 && (
                                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                                                + {sortedLocs.length - 8} more locations below threshold
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* No aneurysm detected */}
                            {scanData && !scanData.aneurysm_detected && (
                                <div style={{
                                    ...panelStyle,
                                    padding: 24,
                                    borderColor: T.green + '55',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: T.green }}>No Aneurysm Detected</div>
                                    <div style={{ fontSize: 13, color: T.textSec, marginTop: 6 }}>
                                        AI probability: {(scanData.aneurysm_probability * 100).toFixed(1)}%
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB: Risk & Clinical ──────────────────────────────────── */}
                {activeTab === 'risk' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                        <div style={{ ...panelStyle, padding: 20 }}>
                            <SectionHeader icon="♥" title="Clinical Risk Prediction" />
                            {scanData ? (
                                <ClinicalForm
                                    clinical={clinical}
                                    setClinical={setClinical}
                                    onSubmit={handleRiskPrediction}
                                />
                            ) : (
                                <div style={{
                                    padding: 24, textAlign: 'center',
                                    background: T.surface, borderRadius: 6,
                                    border: `1px dashed ${T.border}`,
                                }}>
                                    <div style={{ color: T.textMuted, fontSize: 13 }}>
                                        Analyze a CTA scan first to enable risk prediction
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            {riskData && (
                                <div style={{ ...panelStyle, padding: 20 }}>
                                    <SectionHeader icon="◉" title="Risk Assessment Results" />

                                    <div style={{
                                        padding: '16px 20px',
                                        background: T.surface,
                                        borderRadius: 8,
                                        border: `1px solid ${T.border}`,
                                        marginBottom: 12,
                                    }}>
                                        <div style={{ ...labelStyle }}>UIATS Score</div>
                                        <div style={{ fontSize: 36, fontWeight: 900, color: T.cyan }}>
                                            {riskData.uiats_assessment.uiats_score}
                                        </div>
                                        <div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>
                                            {riskData.uiats_assessment.uiats_recommendation}
                                        </div>
                                    </div>

                                    <div style={{
                                        padding: '16px 20px',
                                        background: T.redDim,
                                        borderRadius: 8,
                                        border: `1px solid ${T.red}44`,
                                    }}>
                                        <div style={{ ...labelStyle }}>AI Rupture Probability</div>
                                        <div style={{ fontSize: 36, fontWeight: 900, color: T.red }}>
                                            {(riskData.ai_rupture_probability * 100).toFixed(2)}%
                                        </div>
                                        <div style={{ fontSize: 11, color: T.textSec, marginTop: 4 }}>
                                            Source: {riskData.probability_source || 'heuristic'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!riskData && scanData && (
                                <div style={{
                                    ...panelStyle, padding: 24,
                                    textAlign: 'center', minHeight: 200,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 10 }}>◉</div>
                                    <div style={{ color: T.textMuted, fontSize: 13 }}>
                                        Complete the clinical form to see risk results
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB: MARTA Assessment ──────────────────────────────────── */}
                {activeTab === 'marta' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                        <div style={{ ...panelStyle, padding: 20 }}>
                            <SectionHeader icon="⚕" title="MARTA Assessment" />
                            <p style={{ fontSize: 11, color: T.textSec, margin: '0 0 16px 0' }}>
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
                                {/* EVT / NT cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    {[
                                        { key: 'evt', label: 'MARTA-EVT', pct: martaResult.details.evt_probability_pct, cat: martaResult.evt_risk_category },
                                        { key: 'nt',  label: 'MARTA-NT',  pct: martaResult.details.nt_probability_pct,  cat: martaResult.nt_risk_category  },
                                    ].map(({ key, label, pct, cat }) => (
                                        <div key={key} style={{
                                            ...panelStyle,
                                            padding: '16px 18px', marginBottom: 0,
                                            borderColor: RISK_COLOR[cat] + '44',
                                        }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: RISK_COLOR[cat], marginBottom: 4 }}>
                                                {label}
                                            </div>
                                            <div style={{ fontSize: 38, fontWeight: 900, color: RISK_COLOR[cat], lineHeight: 1 }}>
                                                {pct}<span style={{ fontSize: 18 }}>%</span>
                                            </div>
                                            <div style={{
                                                display: 'inline-block',
                                                marginTop: 8,
                                                padding: '2px 10px',
                                                background: RISK_DIM[cat],
                                                border: `1px solid ${RISK_COLOR[cat]}44`,
                                                borderRadius: 4,
                                                fontSize: 11, fontWeight: 700,
                                                color: RISK_COLOR[cat],
                                            }}>{cat} Risk</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Recommendation */}
                                <div style={{
                                    ...panelStyle, padding: 16, marginBottom: 12,
                                    borderColor: T.green + '44',
                                }}>
                                    <SectionHeader icon="✓" title="Recommended Treatment" />
                                    <p style={{ margin: 0, fontSize: 13, color: T.textPri, lineHeight: 1.6 }}>
                                        {martaResult.recommended_treatment}
                                    </p>
                                </div>

                                {/* Best EVT Device */}
                                {martaResult.details.best_evt_approach && (
                                    <div style={{ ...panelStyle, padding: 16, marginBottom: 12, borderColor: T.purple + '44' }}>
                                        <SectionHeader icon="⬡" title="Best EVT Device" />
                                        <div style={{ fontSize: 14, fontWeight: 700, color: T.purple }}>
                                            {martaResult.details.best_evt_approach}
                                        </div>
                                        <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                                            {martaResult.details.best_evt_approach_risk_pct}% complication risk
                                        </div>
                                    </div>
                                )}

                                {/* EVT Comparison Table */}
                                {martaResult.details.evt_approach_comparison && (
                                    <div style={{ ...panelStyle, padding: 16 }}>
                                        <SectionHeader icon="≡" title="EVT Approach Comparison" />
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                        {['Approach', 'Risk %', 'Category'].map(h => (
                                                            <th key={h} style={{
                                                                padding: '8px 10px', textAlign: h === 'Risk %' ? 'right' : h === 'Category' ? 'center' : 'left',
                                                                color: T.textSec, fontWeight: 600, fontSize: 10,
                                                                textTransform: 'uppercase', letterSpacing: '0.08em',
                                                            }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {martaResult.details.evt_approach_comparison.map((row, i) => (
                                                        <tr key={row.approach} style={{
                                                            borderBottom: `1px solid ${T.borderSub}`,
                                                            background: i === 0 ? T.greenDim + '88' : 'transparent',
                                                        }}>
                                                            <td style={{ padding: '8px 10px', color: i === 0 ? T.green : T.textPri, fontWeight: i === 0 ? 700 : 400 }}>
                                                                {i === 0 && <span style={{ color: T.green, marginRight: 6 }}>★</span>}{row.label}
                                                            </td>
                                                            <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 700, color: RISK_COLOR[row.risk_category] }}>
                                                                {row.probability_pct}%
                                                            </td>
                                                            <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: 4,
                                                                    background: RISK_DIM[row.risk_category],
                                                                    color: RISK_COLOR[row.risk_category],
                                                                    fontSize: 10, fontWeight: 700,
                                                                }}>{row.risk_category}</span>
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

                        {!martaResult && (
                            <div style={{
                                ...panelStyle, padding: 24,
                                textAlign: 'center',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                minHeight: 300,
                            }}>
                                <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 12 }}>⚕</div>
                                <div style={{ color: T.textMuted, fontSize: 13 }}>
                                    Complete the MARTA form to see treatment risk assessment
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: Treatment Simulation ──────────────────────────────── */}
                {activeTab === 'treatment' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
                        <div style={{ ...panelStyle, padding: 20 }}>
                            <SectionHeader icon="⚙" title="Treatment Simulation" />
                            {scanData ? (
                                <>
                                    <p style={{ fontSize: 12, color: T.textSec, margin: '0 0 16px 0' }}>
                                        Simulate post-treatment hemodynamic changes using baseline CFD values.
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <button
                                            onClick={() => handleSimulation('flow_diverter')}
                                            style={{
                                                ...btnBase, width: '100%', padding: '12px',
                                                background: `linear-gradient(90deg, ${T.purple}, #9333ea)`,
                                                color: '#fff', fontSize: 12,
                                            }}
                                        >
                                            ◈  Simulate Flow Diverter
                                        </button>
                                        <button
                                            onClick={() => handleSimulation('surgical_clip')}
                                            style={{
                                                ...btnBase, width: '100%', padding: '12px',
                                                background: `linear-gradient(90deg, ${T.green}, #059669)`,
                                                color: '#fff', fontSize: 12,
                                            }}
                                        >
                                            ✂  Simulate Surgical Clip
                                        </button>
                                    </div>

                                    {/* Baseline stats */}
                                    {hemo && (
                                        <div style={{ marginTop: 20 }}>
                                            <div style={{ ...labelStyle, marginBottom: 10 }}>Baseline Values</div>
                                            <div style={{ display: 'grid', gap: 8 }}>
                                                <MetricPill label="Mean WSS" value={hemo.mean_wss_pa} unit="Pa" accent={T.cyan} />
                                                <MetricPill label="Mean OSI" value={hemo.mean_osi} />
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{
                                    padding: 20, textAlign: 'center',
                                    background: T.surface, borderRadius: 6,
                                    border: `1px dashed ${T.border}`,
                                    color: T.textMuted, fontSize: 13,
                                }}>
                                    Analyze a CTA scan first to enable treatment simulation
                                </div>
                            )}
                        </div>

                        {simulation && (
                            <div>
                                <div style={{ ...panelStyle, padding: 20 }}>
                                    <SectionHeader icon="◉" title="Post-Treatment Hemodynamics" />

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                                        <MetricPill label="Post WSS Mean" value={simulation.mean_wss_pa} unit="Pa" accent={T.cyan} />
                                        <MetricPill label="Post WSS Max" value={simulation.max_wss_pa} unit="Pa" />
                                        <MetricPill label="Post OSI" value={simulation.mean_osi} />
                                    </div>

                                    {/* Delta indicators */}
                                    {hemo && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                                            {[
                                                { label: 'WSS Change', pre: hemo.mean_wss_pa, post: simulation.mean_wss_pa },
                                                { label: 'OSI Change', pre: hemo.mean_osi, post: simulation.mean_osi },
                                            ].map(({ label, pre, post }) => {
                                                const delta = ((post - pre) / Math.abs(pre) * 100).toFixed(1);
                                                const isDown = post < pre;
                                                return (
                                                    <div key={label} style={{
                                                        background: T.surface,
                                                        border: `1px solid ${isDown ? T.green + '44' : T.red + '44'}`,
                                                        borderRadius: 6, padding: '10px 14px',
                                                    }}>
                                                        <div style={{ ...labelStyle }}>{label}</div>
                                                        <div style={{ fontSize: 22, fontWeight: 800, color: isDown ? T.green : T.red }}>
                                                            {isDown ? '▼' : '▲'} {Math.abs(delta)}%
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div style={{
                                        padding: '14px 16px',
                                        background: T.greenDim,
                                        border: `1px solid ${T.green}44`,
                                        borderRadius: 8,
                                    }}>
                                        <div style={{ ...labelStyle, color: T.green, marginBottom: 6 }}>Clinical Outcome Prediction</div>
                                        <p style={{ margin: 0, fontSize: 13, color: '#a7f3d0', lineHeight: 1.6 }}>
                                            {simulation.clinical_outcome}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!simulation && scanData && (
                            <div style={{
                                ...panelStyle, padding: 24,
                                textAlign: 'center',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                minHeight: 300,
                            }}>
                                <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 12 }}>⚙</div>
                                <div style={{ color: T.textMuted, fontSize: 13 }}>
                                    Select a treatment type to run simulation
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <footer style={{
                borderTop: `1px solid ${T.border}`,
                padding: '12px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 20,
            }}>
                <span style={{ fontSize: 10, color: T.textMuted }}>
                    NeuroPredict AI v2.0 · RSNA 2025 Pipeline · For research use only
                </span>
                <span style={{ fontSize: 10, color: T.textMuted }}>
                    Not for clinical diagnosis
                </span>
            </footer>
        </div>
    );
}

export default App;
