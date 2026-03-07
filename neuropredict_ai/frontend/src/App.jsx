import { useState, useEffect, Suspense, lazy, useContext } from 'react';
import { DARK, LIGHT, ThemeCtx } from './theme';
import { uploadScan, predictRisk, simulateTreatment, assessMARTA } from './api';
const Viewer3D = lazy(() => import('./components/Viewer3D'));
const DicomViewer = lazy(() => import('./components/DicomViewer'));
import ClinicalForm from './components/ClinicalForm';
import MARTAForm from './components/MARTAForm';
import ClinicalDecision from './components/ClinicalDecision';

// ── Shared component styles (theme-independent) ───────────────────────────────

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

// ── Sub-components (read theme from context) ──────────────────────────────────
const Dot = ({ color = DARK.cyan, size = 7 }) => (
    <span style={{
        display: 'inline-block',
        width: size, height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}88`,
        flexShrink: 0,
    }} />
);

const MetricPill = ({ label, value, unit, accent }) => {
    const T = useContext(ThemeCtx);
    const labelStyle = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSec, marginBottom: 2, display: 'block' };
    return (
        <div style={{
            background: T.surface,
            border: `1px solid ${accent ? accent + '44' : T.borderSub}`,
            borderRadius: 6,
            padding: '8px 12px',
        }}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: accent || T.textPri, lineHeight: 1.1 }}>
                {value}
                {unit && <span style={{ fontSize: 11, fontWeight: 400, color: T.textSec, marginLeft: 3 }}>{unit}</span>}
            </div>
        </div>
    );
};

const SectionHeader = ({ icon, title, badge }) => {
    const T = useContext(ThemeCtx);
    return (
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.cyan, margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
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
};

const ProbBar = ({ label, prob, maxProb }) => {
    const T = useContext(ThemeCtx);
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
    const [darkMode, setDarkMode] = useState(true);
    const T = darkMode ? DARK : LIGHT;

    useEffect(() => {
        document.body.style.backgroundColor = T.bg;
        document.body.style.color = T.textPri;
    }, [T.bg, T.textPri]);

    // Theme-dependent style objects (recomputed on theme change)
    const panelStyle = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16 };
    const labelStyle = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSec, marginBottom: 4, display: 'block' };
    const RISK_COLOR = { Low: T.green, Moderate: T.orange, High: T.red };
    const RISK_DIM   = { Low: T.greenDim, Moderate: T.orangeDim, High: T.redDim };

    const [file, setFile] = useState(null);
    const [dicomFiles, setDicomFiles] = useState(null);
    const [scanData, setScanData] = useState(null);
    const [riskData, setRiskData] = useState(null);
    const [martaResult, setMartaResult] = useState(null);
    const [simulation, setSimulation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [riskLoading, setRiskLoading] = useState(false);
    const [simLoading, setSimLoading] = useState(false);
    const [martaLoading, setMartaLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('analysis');

    const [doctorDecision, setDoctorDecision] = useState(null);

    const [clinical, setClinical] = useState({
        age: 50, smoking: false, hypertension: false,
        previous_sah: false, familial_sah: false,
        // PHASES
        population: 'other',
        earlier_sah_different_aneurysm: false,
        aneurysm_site: 'MCA',
        aneurysm_size_mm: 7.0,
        // UIATS
        multiple_aneurysms: false,
        high_risk_location: false,
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
            if (err.code === 'ECONNABORTED') {
                setError('Analysis timed out. Try a smaller .zip or convert to .nii.gz first.');
            } else {
                setError('Upload failed: ' + (err.response?.data?.detail || err.message));
            }
        }
        setLoading(false);
    };

    const handleRiskPrediction = async () => {
        if (!scanData) return;
        setError(null);
        setDoctorDecision(null);
        setRiskLoading(true);
        try {
            const result = await predictRisk(
                clinical,
                scanData.morphology || { maximum_3d_diameter_mm: clinical.aneurysm_size_mm, aspect_ratio_AR: 1.0, size_ratio_SR: 1.0, is_irregular: false },
                scanData.aneurysm_probability,
                martaResult?.details?.evt_probability_pct ?? null,
                martaResult?.details?.nt_probability_pct ?? null,
            );
            setRiskData(result);
        } catch (err) {
            setError('Risk prediction failed: ' + (err.response?.data?.detail || err.message));
        }
        setRiskLoading(false);
    };

    const handleDoctorDecision = (type, reason) => {
        if (type === null) { setDoctorDecision(null); return; }
        setDoctorDecision({
            type,
            reason,
            timestamp: new Date().toLocaleString(),
        });
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
        setSimLoading(true);
        try {
            const result = await simulateTreatment(
                type,
                scanData.baseline_hemodynamics?.mean_wss_pa ?? 4.5,
                scanData.baseline_hemodynamics?.mean_osi ?? 0.1,
            );
            setSimulation(result);
        } catch (err) {
            setError('Simulation failed: ' + (err.response?.data?.detail || err.message));
        }
        setSimLoading(false);
    };

    const hemo = scanData?.baseline_hemodynamics;
    const morph = scanData?.morphology;
    const mesh = scanData?.mesh;
    const vertexWss = hemo?.vertex_wss;
    const wssRange = hemo ? [hemo.min_wss_pa, hemo.max_wss_pa] : undefined;
    const flowRisky = hemo?.flow_status?.toLowerCase().includes('risk');

    const tabs = [
        { id: 'dicom',    label: 'DICOM View' },
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
        <ThemeCtx.Provider value={T}>
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
                            We find the aneurysm before it finds you.
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

                {/* Theme toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setDarkMode(d => !d)} style={{
                        ...btnBase, padding: '4px 10px',
                        background: 'transparent',
                        border: `1px solid ${T.border}`,
                        color: T.textSec, fontSize: 11, fontWeight: 600,
                    }}>
                        {darkMode ? '○ Light' : '◑ Dark'}
                    </button>
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

                {/* ── TAB: DICOM View ────────────────────────────────────── */}
                {activeTab === 'dicom' && (() => {
                    const dicomSource = dicomFiles
                        ?? (file?.name?.toLowerCase().endsWith('.zip') ? file : null);
                    return (
                        <div>
                            <div style={{ ...panelStyle, padding: 16, marginBottom: 16 }}>
                                <SectionHeader icon="⬜" title="DICOM Viewer" badge="MPR" />
                                <p style={{ fontSize: 11, color: T.textSec, margin: '0 0 12px 0' }}>
                                    Multi-planar reconstruction · Window/Level · Zoom · Pan · Scroll · Measurements
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                        <label style={labelStyle}>Load DICOM Files</label>
                                        <input
                                            type="file"
                                            multiple
                                            accept=".dcm,.zip"
                                            onChange={e => setDicomFiles(e.target.files.length > 0 ? Array.from(e.target.files) : null)}
                                            style={{
                                                fontSize: 12, color: T.textSec,
                                                background: T.surface, border: `1px solid ${T.border}`,
                                                borderRadius: 6, padding: '5px 10px',
                                            }}
                                        />
                                        <p style={{ fontSize: 10, color: T.textMuted, margin: '4px 0 0 0' }}>
                                            Single .dcm · Multiple .dcm (series) · .zip (DICOM archive)
                                        </p>
                                    </div>
                                    {dicomFiles && (
                                        <button onClick={() => setDicomFiles(null)} style={{
                                            padding: '5px 12px', fontSize: 11, borderRadius: 4,
                                            border: `1px solid ${T.border}`, background: 'transparent',
                                            color: T.textSec, cursor: 'pointer', marginTop: 16,
                                        }}>✕ Clear</button>
                                    )}
                                </div>
                                {!dicomSource && (
                                    <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                                        No file loaded — use the uploader above or analyze a .zip in the CTA Analysis tab.
                                    </div>
                                )}
                            </div>
                            <Suspense fallback={
                                <div style={{ ...panelStyle, padding: 40, textAlign: 'center', color: T.textMuted }}>
                                    Loading DICOM viewer…
                                </div>
                            }>
                                <DicomViewer source={dicomSource} />
                            </Suspense>
                        </div>
                    );
                })()}

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
                                    .zip (DICOM series) · .nii.gz / .nii (NIfTI) — for AI analysis. Use the DICOM View tab to load individual .dcm files.
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
                                    {loading ? '⚙ Analyzing — may take 30–60 s…' : '▶  Analyze CTA Scan'}
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
                                <SectionHeader icon="◈" title="3D Vessel Morphology" badge={scanData ? (mesh?.vertices?.length > 0 ? 'MESH READY' : 'SCAN READY') : 'AWAITING SCAN'} />
                                {mesh?.vertices?.length > 0 ? (
                                    <div style={{
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        border: `1px solid ${T.border}`,
                                    }}>
                                        <Suspense fallback={<div style={{height:400,display:'flex',alignItems:'center',justifyContent:'center',color:T.textSec}}>Loading 3D viewer…</div>}>
                                        <Viewer3D
                                            meshData={mesh}
                                            vertexWss={vertexWss}
                                            wssRange={wssRange}
                                        />
                                        </Suspense>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
                        {/* LEFT — form */}
                        <div style={{ ...panelStyle, padding: 20 }}>
                            <SectionHeader icon="♥" title="Clinical Risk Prediction" />
                            <ClinicalForm
                                clinical={clinical}
                                setClinical={setClinical}
                                onSubmit={handleRiskPrediction}
                                scanData={scanData}
                                disabled={!scanData}
                            />
                        </div>

                        {/* RIGHT — results */}
                        <div>
                            {riskLoading && (
                                <div style={{
                                    ...panelStyle, padding: 40, textAlign: 'center',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200,
                                }}>
                                    <div style={{ fontSize: 28, color: T.cyan, marginBottom: 12, animation: 'spin 1s linear infinite' }}>⟳</div>
                                    <div style={{ color: T.textSec, fontSize: 13 }}>Calculating PHASES · UIATS · Synthesis…</div>
                                </div>
                            )}

                            {riskData && !riskLoading && (() => {
                                const ph = riskData.phases;
                                const ui = riskData.uiats;
                                const tierColor = { Low: T.green, Moderate: T.orange, High: T.red, 'Very High': T.red }[ph.risk_tier] || T.textSec;
                                const tierDim   = { Low: T.greenDim, Moderate: T.orangeDim, High: T.redDim, 'Very High': T.redDim }[ph.risk_tier] || T.surface;
                                const tierDesc  = {
                                    Low: 'Annual rupture risk <0.5%. Conservative management appropriate if no high-risk features.',
                                    Moderate: 'Annual rupture risk 0.5–1.5%. Individualized decision required — consider patient age, comorbidities, and aneurysm morphology.',
                                    High: 'Annual rupture risk >1.5%. Treatment should be seriously considered. Discuss multidisciplinary team review.',
                                    'Very High': 'Annual rupture risk >5%. Urgent treatment evaluation indicated.',
                                }[ph.risk_tier] || '';
                                const netColor = ui.net_score >= 2 ? T.orange : ui.net_score >= 0 ? T.cyan : T.green;
                                // PHASES score bar (12 segments)
                                const cappedScore = Math.min(ph.phases_score, 12);
                                return (
                                    <>
                                        {/* ── PHASES Card ── */}
                                        <div style={{ ...panelStyle, padding: 20, borderColor: tierColor + '55', marginBottom: 12 }}>
                                            <SectionHeader icon="◎" title="PHASES Score" badge="Evidence A · Greving 2014" />
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 14 }}>
                                                <div>
                                                    <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: tierColor }}>
                                                        {ph.five_year_rupture_risk_pct}
                                                        <span style={{ fontSize: 22, fontWeight: 600 }}>%</span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: T.textSec, marginTop: 3 }}>5-year rupture risk</div>
                                                </div>
                                                <div style={{ paddingBottom: 4 }}>
                                                    <div style={{
                                                        display: 'inline-block', padding: '5px 16px',
                                                        background: tierDim, borderRadius: 6,
                                                        border: `1px solid ${tierColor}55`,
                                                        fontSize: 14, fontWeight: 800, color: tierColor, marginBottom: 6,
                                                    }}>{ph.risk_tier}</div>
                                                    <div style={{ fontSize: 11, color: T.textMuted }}>
                                                        Score: <strong style={{ color: T.textPri }}>{ph.phases_score}</strong> / 12
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Score bar */}
                                            <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                                                {Array.from({ length: 12 }).map((_, i) => {
                                                    const filled = i < cappedScore;
                                                    const seg = i < 3 ? T.green : i < 6 ? T.orange : T.red;
                                                    return (
                                                        <div key={i} style={{
                                                            flex: 1, height: 6, borderRadius: 2,
                                                            background: filled ? seg : T.surface,
                                                            border: `1px solid ${filled ? seg + '88' : T.border}`,
                                                        }} />
                                                    );
                                                })}
                                            </div>
                                            <div style={{ fontSize: 11, color: T.textSec, marginBottom: 8, lineHeight: 1.5 }}>
                                                {tierDesc}
                                            </div>
                                            <div style={{ fontSize: 10, color: T.textMuted }}>{ph.citation}</div>
                                        </div>

                                        {/* ── UIATS Card ── */}
                                        <div style={{ ...panelStyle, padding: 20, marginBottom: 12 }}>
                                            <SectionHeader icon="⊕" title="UIATS Score" badge="Evidence B · Etminan 2015" />
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                                                <div style={{ background: T.greenDim, borderRadius: 6, padding: '10px 14px', border: `1px solid ${T.green}33` }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.green, marginBottom: 4 }}>Treatment pts</div>
                                                    <div style={{ fontSize: 32, fontWeight: 900, color: T.green }}>{ui.treatment_score}</div>
                                                </div>
                                                <div style={{ background: T.blueDim, borderRadius: 6, padding: '10px 14px', border: `1px solid ${T.blue}33` }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.blue, marginBottom: 4 }}>Conservative pts</div>
                                                    <div style={{ fontSize: 32, fontWeight: 900, color: T.blue }}>{ui.conservative_score}</div>
                                                </div>
                                                <div style={{ background: T.surface, borderRadius: 6, padding: '10px 14px', border: `1px solid ${netColor}55` }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSec, marginBottom: 4 }}>Net Score</div>
                                                    <div style={{ fontSize: 32, fontWeight: 900, color: netColor }}>
                                                        {ui.net_score >= 0 ? '+' : ''}{ui.net_score}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{
                                                fontSize: 13, fontWeight: 600, color: netColor,
                                                marginBottom: 6, padding: '6px 10px',
                                                background: netColor + '15', borderRadius: 4,
                                                border: `1px solid ${netColor}33`,
                                            }}>
                                                {ui.recommendation}
                                            </div>
                                            {/* UIATS factor breakdown */}
                                            {ui.breakdown && Object.keys(ui.breakdown).length > 0 && (
                                                <div style={{ marginTop: 10 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSec, marginBottom: 6 }}>
                                                        Contributing Factors
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                        {Object.entries(ui.breakdown).map(([key, pts]) => {
                                                            if (pts === 0) return null;
                                                            const isTreat = pts > 0;
                                                            const label = key.replace(/_/g, ' ');
                                                            return (
                                                                <span key={key} style={{
                                                                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                                    background: isTreat ? T.greenDim : T.blueDim,
                                                                    color: isTreat ? T.green : T.blue,
                                                                    border: `1px solid ${isTreat ? T.green : T.blue}33`,
                                                                }}>
                                                                    {isTreat ? '+' : ''}{pts} {label}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 8 }}>
                                                Net ≥ +2 → treatment · −1 to +1 → individualized · ≤ −2 → conservative
                                            </div>
                                        </div>

                                        {/* ── AI Probability ── */}
                                        <div style={{ ...panelStyle, padding: '14px 20px', marginBottom: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <div>
                                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textSec, marginBottom: 2 }}>
                                                        AI Rupture Probability
                                                    </div>
                                                    <div style={{ fontSize: 30, fontWeight: 900, color: riskData.ai_rupture_probability > 0.5 ? T.red : T.orange }}>
                                                        {(riskData.ai_rupture_probability * 100).toFixed(1)}%
                                                    </div>
                                                </div>
                                                {riskData.synthesis?.preferred_modality && (
                                                    <div style={{
                                                        marginLeft: 'auto', padding: '6px 14px', borderRadius: 6,
                                                        background: T.purpleDim, border: `1px solid ${T.purple}44`,
                                                        textAlign: 'center',
                                                    }}>
                                                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.purple, marginBottom: 2 }}>
                                                            Preferred Modality
                                                        </div>
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: T.purple }}>
                                                            {riskData.synthesis.preferred_modality}
                                                        </div>
                                                    </div>
                                                )}
                                                <span style={{
                                                    marginLeft: riskData.synthesis?.preferred_modality ? 0 : 'auto',
                                                    padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                    background: riskData.probability_source === 'rsna_2025' ? T.cyanDim : T.surface,
                                                    color: riskData.probability_source === 'rsna_2025' ? T.cyan : T.textMuted,
                                                    border: `1px solid ${riskData.probability_source === 'rsna_2025' ? T.cyan + '44' : T.border}`,
                                                }}>
                                                    {riskData.probability_source === 'rsna_2025' ? 'RSNA 2025 · AUC 0.916' : 'Heuristic estimate'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* ── Clinical Decision (doctor-in-the-loop) ── */}
                                        <ClinicalDecision
                                            synthesis={riskData.synthesis}
                                            decision={doctorDecision}
                                            onDecision={handleDoctorDecision}
                                        />
                                    </>
                                );
                            })()}

                            {!riskData && !riskLoading && !scanData && (
                                <div style={{
                                    ...panelStyle, padding: 40,
                                    textAlign: 'center', minHeight: 300,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ fontSize: 36, opacity: 0.15, marginBottom: 16 }}>⬆</div>
                                    <div style={{ color: T.textSec, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                                        No Scan Loaded
                                    </div>
                                    <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.7, maxWidth: 340 }}>
                                        Go to <strong style={{ color: T.cyan }}>CTA Analysis</strong> and upload a .zip DICOM series or .nii.gz file first, then return here to compute risk scores.
                                    </div>
                                </div>
                            )}

                            {!riskData && !riskLoading && scanData && (
                                <div style={{
                                    ...panelStyle, padding: 40,
                                    textAlign: 'center', minHeight: 300,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ fontSize: 36, opacity: 0.15, marginBottom: 16 }}>◎</div>
                                    <div style={{ color: T.textSec, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                                        Scan Ready — Calculate Risk
                                    </div>
                                    <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.7, maxWidth: 340 }}>
                                        Fill the clinical form and click <strong style={{ color: T.cyan }}>Calculate Risk Scores</strong>
                                        {' '}to compute PHASES (Evidence A) and UIATS (Evidence B) scores with an integrated AI recommendation.
                                        {!martaResult && (
                                            <div style={{ marginTop: 10, padding: '8px 12px', background: T.surface, borderRadius: 6, border: `1px solid ${T.border}` }}>
                                                Tip: Complete the MARTA Assessment first to include procedural risk in the synthesis.
                                            </div>
                                        )}
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
                    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
                        {/* LEFT — device selection */}
                        <div>
                            <div style={{ ...panelStyle, padding: 20 }}>
                                <SectionHeader icon="⚙" title="Treatment Simulation" />
                                {scanData ? (
                                    <>
                                        <p style={{ fontSize: 12, color: T.textSec, margin: '0 0 14px 0', lineHeight: 1.6 }}>
                                            Hemodynamic flow proxy estimating post-device WSS and OSI changes.
                                        </p>

                                        {/* Device cards */}
                                        {[
                                            {
                                                type: 'flow_diverter',
                                                icon: '◈',
                                                name: 'Flow Diverter',
                                                desc: 'PED / FRED / SILK — endoluminal mesh device reducing intra-aneurysmal flow by 60–80%. First-line for large/giant aneurysms.',
                                                accent: T.purple,
                                                accentDim: T.purpleDim,
                                            },
                                            {
                                                type: 'surgical_clip',
                                                icon: '✂',
                                                name: 'Surgical Clip',
                                                desc: 'Microsurgical clipping — direct neck occlusion. Definitive treatment with immediate aneurysm exclusion. Preferred for MCA and complex morphology.',
                                                accent: T.green,
                                                accentDim: T.greenDim,
                                            },
                                        ].map(({ type, icon, name, desc, accent, accentDim }) => (
                                            <button
                                                key={type}
                                                onClick={() => handleSimulation(type)}
                                                disabled={simLoading}
                                                style={{
                                                    width: '100%', marginBottom: 10,
                                                    background: accentDim, border: `1px solid ${accent}44`,
                                                    borderRadius: 8, padding: '12px 14px',
                                                    cursor: simLoading ? 'not-allowed' : 'pointer',
                                                    textAlign: 'left', opacity: simLoading ? 0.6 : 1,
                                                    transition: 'border-color 0.15s',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                                    <span style={{ fontSize: 16, color: accent }}>{icon}</span>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                                                        {simLoading ? '⟳ Simulating…' : name}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>{desc}</div>
                                            </button>
                                        ))}

                                        <div style={{
                                            marginTop: 4, padding: '7px 10px', borderRadius: 6,
                                            background: T.surface, border: `1px solid ${T.border}`,
                                            fontSize: 10, color: T.textMuted, lineHeight: 1.6,
                                        }}>
                                            ⚠ WSS/OSI values are geometry-based proxies, not patient-specific CFD.
                                            For research and planning support only — not for standalone clinical decisions.
                                        </div>
                                    </>
                                ) : (
                                    <div style={{
                                        padding: 24, textAlign: 'center',
                                        background: T.surface, borderRadius: 6,
                                        border: `1px dashed ${T.border}`,
                                        color: T.textMuted, fontSize: 13,
                                    }}>
                                        Analyze a CTA scan first to enable treatment simulation
                                    </div>
                                )}
                            </div>

                            {/* Baseline hemodynamics */}
                            {hemo && (
                                <div style={{ ...panelStyle, padding: 16 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.textSec, marginBottom: 12 }}>
                                        Baseline Hemodynamics
                                    </div>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <MetricPill label="Mean WSS" value={hemo.mean_wss_pa} unit="Pa" accent={T.cyan} />
                                        <MetricPill label="Max WSS" value={hemo.max_wss_pa} unit="Pa" accent={hemo.max_wss_pa > 10 ? T.red : undefined} />
                                        <MetricPill label="Min WSS" value={hemo.min_wss_pa} unit="Pa" />
                                        <MetricPill label="Mean OSI" value={hemo.mean_osi} />
                                    </div>
                                    {/* WSS reference guide */}
                                    <div style={{ marginTop: 12, fontSize: 10, color: T.textMuted, lineHeight: 1.7 }}>
                                        <div style={{ fontWeight: 700, color: T.textSec, marginBottom: 3 }}>WSS Reference (aneurysm sac)</div>
                                        <div><span style={{ color: T.green }}>●</span> &lt; 2 Pa — Low (low-flow aneurysm)</div>
                                        <div><span style={{ color: T.cyan }}>●</span> 2–10 Pa — Physiologic range</div>
                                        <div><span style={{ color: T.orange }}>●</span> &gt; 10 Pa — High (rupture-associated)</div>
                                        <div style={{ marginTop: 4 }}>OSI &gt; 0.3 → oscillatory shear stress risk</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT — simulation results */}
                        {simLoading && (
                            <div style={{
                                ...panelStyle, padding: 40, textAlign: 'center',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300,
                            }}>
                                <div style={{ fontSize: 28, color: T.cyan, marginBottom: 12 }}>⟳</div>
                                <div style={{ color: T.textSec, fontSize: 13 }}>Running hemodynamic simulation…</div>
                            </div>
                        )}

                        {simulation && !simLoading && (
                            <div>
                                <div style={{ ...panelStyle, padding: 20, marginBottom: 12 }}>
                                    <SectionHeader icon="◉" title="Post-Treatment Flow Estimate" />

                                    {/* Pre / Post comparison table */}
                                    {hemo && (
                                        <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                                        {['Metric', 'Baseline', 'Post-Treatment', 'Change'].map(h => (
                                                            <th key={h} style={{
                                                                padding: '7px 10px', textAlign: h === 'Baseline' || h === 'Post-Treatment' || h === 'Change' ? 'right' : 'left',
                                                                color: T.textSec, fontWeight: 600, fontSize: 10,
                                                                textTransform: 'uppercase', letterSpacing: '0.08em',
                                                            }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {[
                                                        { label: 'Mean WSS (Pa)', pre: hemo.mean_wss_pa, post: simulation.mean_wss_pa },
                                                        { label: 'Max WSS (Pa)', pre: hemo.max_wss_pa, post: simulation.max_wss_pa },
                                                        { label: 'Mean OSI', pre: hemo.mean_osi, post: simulation.mean_osi },
                                                    ].map(({ label, pre, post }) => {
                                                        const delta = ((post - pre) / Math.abs(pre || 1) * 100).toFixed(1);
                                                        const isDown = post < pre;
                                                        // For WSS, down is good; for OSI, down is also good
                                                        const changeColor = isDown ? T.green : T.red;
                                                        return (
                                                            <tr key={label} style={{ borderBottom: `1px solid ${T.borderSub}` }}>
                                                                <td style={{ padding: '9px 10px', color: T.textSec }}>{label}</td>
                                                                <td style={{ padding: '9px 10px', textAlign: 'right', color: T.textPri, fontWeight: 600 }}>
                                                                    {typeof pre === 'number' ? pre.toFixed(3) : pre}
                                                                </td>
                                                                <td style={{ padding: '9px 10px', textAlign: 'right', color: T.cyan, fontWeight: 700 }}>
                                                                    {typeof post === 'number' ? post.toFixed(3) : post}
                                                                </td>
                                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: changeColor }}>
                                                                    {isDown ? '▼' : '▲'} {Math.abs(delta)}%
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Post-treatment metrics pills */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                                        <MetricPill label="Post WSS Mean" value={simulation.mean_wss_pa} unit="Pa" accent={T.cyan} />
                                        <MetricPill label="Post WSS Max" value={simulation.max_wss_pa} unit="Pa" accent={simulation.max_wss_pa > 10 ? T.red : undefined} />
                                        <MetricPill label="Post OSI" value={simulation.mean_osi} accent={simulation.mean_osi > 0.3 ? T.orange : undefined} />
                                    </div>

                                    {/* Clinical outcome */}
                                    <div style={{
                                        padding: '14px 16px',
                                        background: T.greenDim,
                                        border: `1px solid ${T.green}44`,
                                        borderRadius: 8,
                                    }}>
                                        <div style={{ ...labelStyle, color: T.green, marginBottom: 6 }}>
                                            Clinical Outcome Prediction
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: '#a7f3d0', lineHeight: 1.6 }}>
                                            {simulation.clinical_outcome}
                                        </p>
                                        <p style={{ margin: '10px 0 0 0', fontSize: 10, color: T.textMuted, lineHeight: 1.5 }}>
                                            Outcome based on published device efficacy data. Individual results vary by aneurysm morphology,
                                            device sizing, and operator experience. Not a substitute for multidisciplinary case review.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!simulation && !simLoading && scanData && (
                            <div style={{
                                ...panelStyle, padding: 40,
                                textAlign: 'center',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                minHeight: 300,
                            }}>
                                <div style={{ fontSize: 40, opacity: 0.15, marginBottom: 16 }}>⚙</div>
                                <div style={{ color: T.textSec, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                                    Select a Treatment Device
                                </div>
                                <div style={{ color: T.textMuted, fontSize: 12, lineHeight: 1.6, maxWidth: 320 }}>
                                    Choose Flow Diverter or Surgical Clip to estimate post-treatment hemodynamic changes based on the baseline scan analysis.
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
                    © 2026 NeuroPredict AI · For research use only
                </span>
                <span style={{ fontSize: 10, color: T.textMuted }}>
                    v2.1 · Not for clinical diagnosis
                </span>
            </footer>
        </div>
        </ThemeCtx.Provider>
    );
}

export default App;
