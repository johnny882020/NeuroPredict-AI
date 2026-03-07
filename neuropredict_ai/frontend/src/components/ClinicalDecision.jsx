import React, { useState } from 'react';

const T = {
    panel: '#141b2d', surface: '#0e1420', border: '#1e2d48',
    textPri: '#e8edf5', textSec: '#5d7a9e', textMuted: '#3a5070',
    cyan: '#06b6d4', cyanDim: '#0c4a5a',
    orange: '#f97316', orangeDim: '#7c3c0d',
    green: '#10b981', greenDim: '#064e3b',
    red: '#ef4444', redDim: '#450a0a',
    blue: '#3b82f6', blueDim: '#1e3a5f',
    yellow: '#eab308', yellowDim: '#713f12',
};

const STRENGTH_COLORS = {
    Strong:   { fg: T.orange, bg: T.orangeDim },
    Moderate: { fg: T.blue,   bg: T.blueDim   },
    Weak:     { fg: T.textSec, bg: T.surface  },
};

const DECISION_COLORS = {
    accept:   { fg: T.green,  bg: T.greenDim,  label: 'Accepted' },
    modify:   { fg: T.blue,   bg: T.blueDim,   label: 'Modified' },
    override: { fg: T.orange, bg: T.orangeDim, label: 'Overridden' },
};

/**
 * Doctor-in-the-Loop recommendation card.
 *
 * Props:
 *   synthesis     — object from /predict_risk response synthesis field
 *   onDecision    — callback(type: 'accept'|'modify'|'override', reason: string|null)
 *   decision      — null | { type, reason, timestamp }
 */
export default function ClinicalDecision({ synthesis, onDecision, decision }) {
    const [overrideMode, setOverrideMode] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');
    const [reasonError, setReasonError] = useState(false);

    if (!synthesis) return null;

    const strengthColor = STRENGTH_COLORS[synthesis.strength] || STRENGTH_COLORS.Weak;

    const handleAccept = () => {
        setOverrideMode(false);
        onDecision('accept', null);
    };

    const handleModify = () => {
        setOverrideMode(false);
        onDecision('modify', null);
    };

    const handleOverrideConfirm = () => {
        if (!overrideReason.trim()) {
            setReasonError(true);
            return;
        }
        setReasonError(false);
        onDecision('override', overrideReason.trim());
        setOverrideMode(false);
        setOverrideReason('');
    };

    // ── Decision recorded state ───────────────────────────────────────────
    if (decision) {
        const dc = DECISION_COLORS[decision.type];
        return (
            <div style={{
                background: dc.bg,
                border: `1px solid ${dc.fg}44`,
                borderRadius: 8, padding: '16px 20px',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: 10,
                }}>
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: dc.fg, marginBottom: 4 }}>
                            Physician Decision Recorded
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPri }}>
                            {dc.label}: {synthesis.recommendation}
                        </div>
                    </div>
                    <span style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: 11,
                        fontWeight: 700, background: `${dc.fg}22`, color: dc.fg,
                        border: `1px solid ${dc.fg}44`,
                    }}>{dc.label}</span>
                </div>
                {decision.reason && (
                    <div style={{
                        fontSize: 12, color: T.textSec, fontStyle: 'italic',
                        marginBottom: 8, paddingLeft: 10,
                        borderLeft: `2px solid ${dc.fg}66`,
                    }}>
                        Reason: {decision.reason}
                    </div>
                )}
                <div style={{ fontSize: 11, color: T.textMuted }}>
                    {decision.timestamp}
                </div>
                <button onClick={() => onDecision(null, null)} style={{
                    marginTop: 10, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                    background: 'transparent', border: `1px solid ${T.border}`,
                    borderRadius: 4, color: T.textSec, cursor: 'pointer',
                }}>
                    Revise Decision
                </button>
            </div>
        );
    }

    // ── Override input state ──────────────────────────────────────────────
    if (overrideMode) {
        return (
            <div style={{
                background: T.orangeDim, border: `1px solid ${T.orange}44`,
                borderRadius: 8, padding: '16px 20px',
            }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.orange, marginBottom: 12 }}>
                    Override Reason Required
                </div>
                <textarea
                    value={overrideReason}
                    onChange={e => { setOverrideReason(e.target.value); setReasonError(false); }}
                    placeholder="State your clinical reasoning for overriding this recommendation…"
                    rows={3}
                    style={{
                        width: '100%', background: T.surface, color: T.textPri,
                        border: `1px solid ${reasonError ? T.red : T.border}`,
                        borderRadius: 6, padding: '8px 10px', fontSize: 12,
                        resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                />
                {reasonError && (
                    <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>
                        A reason is required to override the system recommendation.
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={handleOverrideConfirm} style={{
                        padding: '7px 16px', fontSize: 12, fontWeight: 700,
                        background: T.orange, color: '#fff', border: 'none',
                        borderRadius: 6, cursor: 'pointer',
                    }}>
                        Confirm Override
                    </button>
                    <button onClick={() => { setOverrideMode(false); setReasonError(false); }} style={{
                        padding: '7px 16px', fontSize: 12, fontWeight: 600,
                        background: 'transparent', color: T.textSec,
                        border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer',
                    }}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // ── Pending recommendation state ──────────────────────────────────────
    return (
        <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: '16px 20px',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.textSec }}>
                    System Recommendation
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: T.blueDim, color: T.blue, border: `1px solid ${T.blue}44`,
                    }}>
                        Evidence {synthesis.evidence_level}
                    </span>
                    <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: strengthColor.bg, color: strengthColor.fg,
                    }}>
                        {synthesis.strength}
                    </span>
                </div>
            </div>

            {/* Main recommendation */}
            <div style={{
                fontSize: 16, fontWeight: 800, color: T.textPri,
                marginBottom: 14, lineHeight: 1.3,
            }}>
                ▶ {synthesis.recommendation}
            </div>

            {/* Rationale bullets */}
            <div style={{ marginBottom: 14 }}>
                {synthesis.rationale.map((item, i) => (
                    <div key={i} style={{
                        display: 'flex', gap: 8, marginBottom: 6,
                        fontSize: 12, color: T.textSec, lineHeight: 1.5,
                    }}>
                        <span style={{ color: T.cyan, flexShrink: 0, marginTop: 1 }}>•</span>
                        <span>{item}</span>
                    </div>
                ))}
            </div>

            {/* Disclaimer */}
            <div style={{
                fontSize: 11, color: T.textMuted, padding: '8px 10px',
                background: T.panel, borderRadius: 6, marginBottom: 16,
                borderLeft: `2px solid ${T.border}`,
            }}>
                ⚠ {synthesis.disclaimer}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAccept} style={{
                    flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700,
                    background: T.greenDim, color: T.green,
                    border: `1px solid ${T.green}44`, borderRadius: 6, cursor: 'pointer',
                }}>
                    ✓ Accept
                </button>
                <button onClick={handleModify} style={{
                    flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700,
                    background: T.blueDim, color: T.blue,
                    border: `1px solid ${T.blue}44`, borderRadius: 6, cursor: 'pointer',
                }}>
                    ✎ Modify
                </button>
                <button onClick={() => setOverrideMode(true)} style={{
                    flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700,
                    background: T.orangeDim, color: T.orange,
                    border: `1px solid ${T.orange}44`, borderRadius: 6, cursor: 'pointer',
                }}>
                    ✗ Override
                </button>
            </div>
        </div>
    );
}
