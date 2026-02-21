import React from 'react';

const LABEL_STYLE = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 8px',
    fontSize: '14px',
    cursor: 'pointer',
    color: '#334155',
    borderRadius: '4px',
};

const ClinicalForm = ({ clinical, setClinical, onSubmit }) => {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '5px 0' }}>
                <span style={{ fontSize: '14px', color: '#475569', fontWeight: '500' }}>Age</span>
                <input
                    type="number"
                    value={clinical.age}
                    onChange={e => setClinical({ ...clinical, age: parseInt(e.target.value) || 0 })}
                    style={{
                        padding: '7px 10px', borderRadius: '6px',
                        border: '1px solid #cbd5e1', background: '#ffffff',
                        color: '#1e293b', fontSize: '14px', width: '80px',
                    }}
                />
            </div>
            <label style={LABEL_STYLE}>
                <input type="checkbox" checked={clinical.smoking}
                    onChange={e => setClinical({ ...clinical, smoking: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                Smoker
            </label>
            <label style={LABEL_STYLE}>
                <input type="checkbox" checked={clinical.hypertension}
                    onChange={e => setClinical({ ...clinical, hypertension: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                Hypertension
            </label>
            <label style={LABEL_STYLE}>
                <input type="checkbox" checked={clinical.previous_sah}
                    onChange={e => setClinical({ ...clinical, previous_sah: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                Previous SAH
            </label>
            <label style={LABEL_STYLE}>
                <input type="checkbox" checked={clinical.familial_sah}
                    onChange={e => setClinical({ ...clinical, familial_sah: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                Familial SAH
            </label>
            <button onClick={onSubmit} style={{
                marginTop: '10px', background: '#2563eb', color: '#fff',
                border: 'none', fontWeight: '600', padding: '8px 20px',
            }}>
                Calculate Rupture Risk
            </button>
        </div>
    );
};

export default ClinicalForm;
