import React from 'react';

const SELECT_STYLE = {
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#1e293b',
    width: '100%',
    fontSize: '14px',
    outline: 'none',
};

const INPUT_STYLE = {
    ...SELECT_STYLE,
    width: '80px',
};

const CHECKBOX_LABEL = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 8px',
    fontSize: '14px',
    cursor: 'pointer',
    borderRadius: '4px',
    color: '#334155',
};

const SECTION_STYLE = {
    marginBottom: '16px',
    padding: '16px',
    background: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const SECTION_TITLE = {
    margin: '0 0 12px 0',
    fontSize: '15px',
    fontWeight: '600',
    color: '#1e40af',
    borderBottom: '2px solid #dbeafe',
    paddingBottom: '8px',
};

const FIELD_ROW = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 0',
    gap: '12px',
};

const LOCATIONS = [
    { value: 'ICA_cavernous', label: 'ICA Cavernous' },
    { value: 'ICA_ophthalmic', label: 'ICA Ophthalmic' },
    { value: 'PCoA_AChoA', label: 'PCoA / AChoA' },
    { value: 'ACoA', label: 'ACoA' },
    { value: 'ICA_T', label: 'ICA-T' },
    { value: 'ACA', label: 'ACA' },
    { value: 'MCA', label: 'MCA' },
    { value: 'BA', label: 'Basilar Artery (BA)' },
    { value: 'V4_VA', label: 'V4 (VA)' },
    { value: 'P1_PCA', label: 'P1 (PCA)' },
];

const SIZES = [
    { value: 'small', label: 'Small (<5mm)' },
    { value: 'medium', label: 'Medium (5-9mm)' },
    { value: 'large', label: 'Large (10-24mm)' },
    { value: 'giant', label: 'Giant (>=25mm)' },
];

const MORPHOLOGIES = [
    { value: 'regular_saccular', label: 'Regular Saccular' },
    { value: 'multilobular_saccular', label: 'Multilobular Saccular' },
    { value: 'fusiform', label: 'Fusiform' },
    { value: 'shallow', label: 'Shallow' },
];

const NECK_GEOMETRIES = [
    { value: 'sidewall', label: 'Sidewall' },
    { value: 'bifurcation_small_neck', label: 'Bifurcation - Small Neck' },
    { value: 'bifurcation_wide_neck', label: 'Bifurcation - Wide Neck' },
];

const NECK_SURFACES = [
    { value: 'less_than_half', label: '<1/2 Parent Artery' },
    { value: 'half_or_more', label: '>=1/2 Parent Artery' },
];

const EVT_APPROACHES = [
    { value: 'coiling_bac', label: 'Coiling / BAC' },
    { value: 'intrasaccular_device', label: 'Intrasaccular Device' },
    { value: 'flow_diverter', label: 'Flow Diverter' },
    { value: 'stent_assisted_coiling', label: 'Stent-Assisted Coiling' },
];

const Checkbox = ({ checked, onChange, label }) => (
    <label style={CHECKBOX_LABEL}>
        <input type="checkbox" checked={checked} onChange={onChange} style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
        {label}
    </label>
);

const SelectField = ({ label, value, onChange, options }) => (
    <div style={FIELD_ROW}>
        <span style={{ minWidth: '140px', fontSize: '14px', color: '#475569', fontWeight: '500' }}>{label}</span>
        <select style={SELECT_STYLE} value={value} onChange={onChange}>
            {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    </div>
);

const MARTAForm = ({ martaData, setMartaData, onSubmit, loading }) => {
    const { patient, aneurysm } = martaData;

    const updatePatient = (field, value) => {
        setMartaData({
            ...martaData,
            patient: { ...patient, [field]: value },
        });
    };

    const updateAneurysm = (field, value) => {
        setMartaData({
            ...martaData,
            aneurysm: { ...aneurysm, [field]: value },
        });
    };

    return (
        <div style={{ maxWidth: '520px' }}>
            {/* Patient / Baseline */}
            <div style={SECTION_STYLE}>
                <h4 style={SECTION_TITLE}>Patient / Baseline</h4>

                <div style={FIELD_ROW}>
                    <span style={{ fontSize: '14px', color: '#475569', fontWeight: '500' }}>Age</span>
                    <input
                        type="number"
                        style={INPUT_STYLE}
                        value={patient.age}
                        min={0}
                        max={120}
                        onChange={e => updatePatient('age', parseInt(e.target.value) || 0)}
                    />
                </div>

                <div style={FIELD_ROW}>
                    <span style={{ fontSize: '14px', color: '#475569', fontWeight: '500' }}>Sex</span>
                    <select
                        style={{ ...SELECT_STYLE, width: '100px' }}
                        value={patient.sex}
                        onChange={e => updatePatient('sex', e.target.value)}
                    >
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                    </select>
                </div>

                <div style={{ marginTop: '8px' }}>
                    <Checkbox checked={patient.smoking} onChange={e => updatePatient('smoking', e.target.checked)} label="Smoking" />
                    <Checkbox checked={patient.hypertension} onChange={e => updatePatient('hypertension', e.target.checked)} label="Hypertension" />
                    <Checkbox checked={patient.dyslipidemia} onChange={e => updatePatient('dyslipidemia', e.target.checked)} label="Dyslipidemia" />
                    <Checkbox checked={patient.cerebrovascular_disease} onChange={e => updatePatient('cerebrovascular_disease', e.target.checked)} label="Cerebrovascular Disease" />
                    <Checkbox checked={patient.family_history_sah} onChange={e => updatePatient('family_history_sah', e.target.checked)} label="Family History of SAH" />
                </div>

                <div style={{ ...FIELD_ROW, marginTop: '8px' }}>
                    <span style={{ fontSize: '14px', color: '#475569', fontWeight: '500' }}>Baseline mRS (0-5)</span>
                    <select
                        style={{ ...SELECT_STYLE, width: '80px' }}
                        value={patient.baseline_mrs}
                        onChange={e => updatePatient('baseline_mrs', parseInt(e.target.value))}
                    >
                        {[0, 1, 2, 3, 4, 5].map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Aneurysm Anatomy */}
            <div style={SECTION_STYLE}>
                <h4 style={{ ...SECTION_TITLE, color: '#7c3aed', borderBottomColor: '#ede9fe' }}>Aneurysm Anatomy</h4>

                <SelectField label="Location" value={aneurysm.location} onChange={e => updateAneurysm('location', e.target.value)} options={LOCATIONS} />
                <SelectField label="Size" value={aneurysm.size} onChange={e => updateAneurysm('size', e.target.value)} options={SIZES} />
                <SelectField label="Morphology" value={aneurysm.morphology} onChange={e => updateAneurysm('morphology', e.target.value)} options={MORPHOLOGIES} />
                <SelectField label="Neck Geometry" value={aneurysm.neck_geometry} onChange={e => updateAneurysm('neck_geometry', e.target.value)} options={NECK_GEOMETRIES} />
                <SelectField label="Neck Surface" value={aneurysm.neck_surface} onChange={e => updateAneurysm('neck_surface', e.target.value)} options={NECK_SURFACES} />

                <div style={{ marginTop: '8px' }}>
                    <Checkbox checked={aneurysm.sac_wall_calcification} onChange={e => updateAneurysm('sac_wall_calcification', e.target.checked)} label="Sac Wall Calcification" />
                    <Checkbox checked={aneurysm.intraluminal_thrombus} onChange={e => updateAneurysm('intraluminal_thrombus', e.target.checked)} label="Intraluminal Thrombus" />
                    <Checkbox checked={aneurysm.dissecting_etiology} onChange={e => updateAneurysm('dissecting_etiology', e.target.checked)} label="Dissecting Etiology" />
                    <Checkbox checked={aneurysm.parent_artery_focal_stenosis} onChange={e => updateAneurysm('parent_artery_focal_stenosis', e.target.checked)} label="Parent Artery Focal Stenosis" />
                    <Checkbox checked={aneurysm.collateral_branch_from_sac} onChange={e => updateAneurysm('collateral_branch_from_sac', e.target.checked)} label="Collateral Branch from Sac" />
                    <Checkbox checked={aneurysm.collateral_branch_from_neck} onChange={e => updateAneurysm('collateral_branch_from_neck', e.target.checked)} label="Collateral Branch from Neck" />
                </div>
            </div>

            {/* Treatment Planning */}
            <div style={SECTION_STYLE}>
                <h4 style={{ ...SECTION_TITLE, color: '#059669', borderBottomColor: '#d1fae5' }}>Treatment Planning (EVT)</h4>
                <SelectField label="EVT Approach" value={aneurysm.evt_approach} onChange={e => updateAneurysm('evt_approach', e.target.value)} options={EVT_APPROACHES} />
            </div>

            <button
                onClick={onSubmit}
                disabled={loading}
                style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '16px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: 'none',
                    background: loading ? '#94a3b8' : '#2563eb',
                    color: '#ffffff',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginTop: '4px',
                    boxShadow: loading ? 'none' : '0 2px 8px rgba(37,99,235,0.3)',
                    transition: 'all 0.2s ease',
                }}
            >
                {loading ? 'Calculating...' : 'Calculate MARTA Score'}
            </button>
        </div>
    );
};

export default MARTAForm;
