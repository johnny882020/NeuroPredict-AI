import { useEffect } from 'react';

const T = {
    surface: '#0e1420', panel: '#141b2d', border: '#1e2d48',
    textPri: '#e8edf5', textSec: '#5d7a9e', textMuted: '#3a5070',
    cyan: '#06b6d4', cyanDim: '#0c4a5a',
};

const inputStyle = {
    background: T.surface, color: T.textPri, border: `1px solid ${T.border}`,
    borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '80px',
    outline: 'none',
};

const selectStyle = {
    background: T.surface, color: T.textPri, border: `1px solid ${T.border}`,
    borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%',
    outline: 'none', cursor: 'pointer',
};

const labelStyle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: T.textSec,
    display: 'block', marginBottom: 5,
};

const sectionLabelStyle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: T.cyan,
    marginBottom: 10, marginTop: 16, display: 'block',
};

const checkRow = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 0', fontSize: 13, color: T.textPri, cursor: 'pointer',
};

function CheckField({ label, checked, onChange, sublabel }) {
    return (
        <label style={checkRow}>
            <input
                type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: T.cyan, cursor: 'pointer' }}
            />
            <span>
                {label}
                {sublabel && (
                    <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 5 }}>
                        ({sublabel})
                    </span>
                )}
            </span>
        </label>
    );
}

/**
 * Clinical input form for PHASES + UIATS scoring.
 *
 * Props:
 *   clinical    — state object
 *   setClinical — state setter
 *   onSubmit    — callback to trigger risk calculation
 *   scanData    — optional scan result to pre-fill aneurysm size
 */
const ClinicalForm = ({ clinical, setClinical, onSubmit, scanData }) => {
    const set = (key, val) => setClinical(prev => ({ ...prev, [key]: val }));

    // Pre-fill aneurysm size from scan morphology when scan data arrives
    useEffect(() => {
        const d = scanData?.morphology?.maximum_3d_diameter_mm;
        if (d && d > 0) set('aneurysm_size_mm', d);
    }, [scanData]);

    return (
        <div>
            {/* ── Section 1: Patient History ─────────────────────────────── */}
            <span style={sectionLabelStyle}>Patient History</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0, minWidth: 28 }}>Age</label>
                <input
                    type="number" min="0" max="120"
                    value={clinical.age}
                    onChange={e => set('age', parseInt(e.target.value) || 0)}
                    style={inputStyle}
                />
                <span style={{ fontSize: 12, color: T.textMuted }}>years</span>
            </div>

            <CheckField label="Current smoker" checked={clinical.smoking} onChange={v => set('smoking', v)} />
            <CheckField label="Hypertension" checked={clinical.hypertension} onChange={v => set('hypertension', v)} />
            <CheckField
                label="Previous SAH"
                sublabel="any aneurysm"
                checked={clinical.previous_sah}
                onChange={v => set('previous_sah', v)}
            />
            <CheckField
                label="Earlier SAH from different aneurysm"
                sublabel="PHASES E factor"
                checked={clinical.earlier_sah_different_aneurysm}
                onChange={v => set('earlier_sah_different_aneurysm', v)}
            />
            <CheckField
                label="Familial SAH / intracranial aneurysm"
                checked={clinical.familial_sah}
                onChange={v => set('familial_sah', v)}
            />

            {/* ── Section 2: Aneurysm Profile ────────────────────────────── */}
            <span style={{ ...sectionLabelStyle, marginTop: 20 }}>Aneurysm Profile</span>

            <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Maximum diameter (mm)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="number" min="0" max="60" step="0.1"
                        value={clinical.aneurysm_size_mm}
                        onChange={e => set('aneurysm_size_mm', parseFloat(e.target.value) || 0)}
                        style={{ ...inputStyle, width: 90 }}
                    />
                    <span style={{ fontSize: 11, color: T.textMuted }}>
                        {scanData?.morphology?.maximum_3d_diameter_mm ? 'pre-filled from scan' : 'enter manually'}
                    </span>
                </div>
            </div>

            <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Location group (PHASES site)</label>
                <select
                    value={clinical.aneurysm_site}
                    onChange={e => set('aneurysm_site', e.target.value)}
                    style={selectStyle}
                >
                    <option value="ICA">ICA (Internal Carotid Artery)</option>
                    <option value="MCA">MCA (Middle Cerebral Artery)</option>
                    <option value="ACA_AComm_PCoA_posterior">ACA / AComm / PCoA / Posterior</option>
                </select>
            </div>

            <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Patient population</label>
                <select
                    value={clinical.population}
                    onChange={e => set('population', e.target.value)}
                    style={selectStyle}
                >
                    <option value="other">North American / European (other)</option>
                    <option value="finnish_japanese">Finnish or Japanese (+3 pts)</option>
                </select>
            </div>

            <CheckField
                label="Multiple aneurysms"
                checked={clinical.multiple_aneurysms}
                onChange={v => set('multiple_aneurysms', v)}
            />
            <CheckField
                label="High-risk location"
                sublabel="ACoA, ACA, BA tip, or PICA"
                checked={clinical.high_risk_location}
                onChange={v => set('high_risk_location', v)}
            />

            {/* ── Submit ──────────────────────────────────────────────────── */}
            <button onClick={onSubmit} style={{
                marginTop: 18, width: '100%',
                background: `linear-gradient(135deg, ${T.cyan}, #3b82f6)`,
                color: '#fff', border: 'none', borderRadius: 6,
                fontWeight: 700, fontSize: 13, padding: '10px 0',
                cursor: 'pointer', letterSpacing: '0.04em',
            }}>
                Calculate Risk Scores
            </button>
        </div>
    );
};

export default ClinicalForm;
