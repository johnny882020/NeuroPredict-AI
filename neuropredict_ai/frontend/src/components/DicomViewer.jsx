import React, { useEffect, useRef, useState, useCallback } from 'react';

// Design tokens (matches App.jsx T object)
const T = {
    bg: '#080c14', surface: '#0e1420', panel: '#141b2d',
    border: '#1e2d48', textPri: '#e8edf5', textSec: '#5d7a9e',
    textMuted: '#3a5070', cyan: '#06b6d4', cyanDim: '#0c4a5a',
    orange: '#f97316',
};

const WINDOWING_PRESETS = {
    Brain:  { ww: 80,   wl: 40  },
    Stroke: { ww: 40,   wl: 40  },
    Bone:   { ww: 2000, wl: 400 },
    CTA:    { ww: 700,  wl: 150 },
};

const VIEWPORT_IDS = ['axial', 'sagittal', 'coronal'];
const VIEWPORT_LABELS = { axial: 'AXIAL', sagittal: 'SAGITTAL', coronal: 'CORONAL' };

// Lazy-loaded Cornerstone modules (only imported when component mounts)
let csCore = null;
let csTools = null;
let dicomImageLoader = null;

async function loadCornerstoneModules() {
    if (csCore) return; // already loaded
    [csCore, csTools, { default: dicomImageLoader }] = await Promise.all([
        import('@cornerstonejs/core'),
        import('@cornerstonejs/tools'),
        import('@cornerstonejs/dicom-image-loader'),
    ]);
}

async function extractDicomFiles(file) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const dcmEntries = [];

    for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = name.toLowerCase();
        // Accept .dcm files or files with no extension (common in DICOM exports)
        if (lower.endsWith('.dcm') || (!lower.includes('.') && !lower.includes('__macosx'))) {
            dcmEntries.push({ name, entry });
        }
    }

    if (dcmEntries.length === 0) return [];

    // Extract all as ArrayBuffers in parallel
    const buffers = await Promise.all(
        dcmEntries.map(({ entry }) => entry.async('arraybuffer'))
    );

    // Create blob URLs and parse InstanceNumber for sorting
    const files = buffers.map((buf, i) => {
        const blob = new Blob([buf], { type: 'application/dicom' });
        const url = URL.createObjectURL(blob);
        return { url, name: dcmEntries[i].name, buf };
    });

    // Sort by InstanceNumber if parseable (fallback: filename sort)
    try {
        const dicomParser = (await import('dicom-parser')).default;
        files.forEach(f => {
            try {
                const ds = dicomParser.parseDicom(new Uint8Array(f.buf));
                f.instanceNumber = parseInt(ds.string('x00200013') || '0', 10);
            } catch {
                f.instanceNumber = 0;
            }
        });
        files.sort((a, b) => a.instanceNumber - b.instanceNumber);
    } catch {
        // dicom-parser not available — sort by filename
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }

    return files.map(f => `wadouri:${f.url}`);
}

export default function DicomViewer({ file }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const toolGroupRef = useRef(null);
    const [status, setStatus] = useState('idle'); // idle | loading | ready | error
    const [errorMsg, setErrorMsg] = useState('');
    const [imageIds, setImageIds] = useState([]);
    const [currentSlice, setCurrentSlice] = useState(0);
    const [totalSlices, setTotalSlices] = useState(0);
    const [activePreset, setActivePreset] = useState('Brain');
    const [metaInfo, setMetaInfo] = useState(null);
    const blobUrlsRef = useRef([]);

    // ── Apply windowing preset ──────────────────────────────────────────────
    const applyPreset = useCallback((presetName) => {
        if (!engineRef.current || !csCore) return;
        const { ww, wl } = WINDOWING_PRESETS[presetName];
        for (const vpId of VIEWPORT_IDS) {
            try {
                const vp = engineRef.current.getViewport(vpId);
                if (vp) {
                    vp.setProperties({ voiRange: csCore.utilities.windowLevel.toLowHighRange(ww, wl) });
                    vp.render();
                }
            } catch { /* viewport may not exist yet */ }
        }
        setActivePreset(presetName);
    }, []);

    // ── Initialize Cornerstone ──────────────────────────────────────────────
    useEffect(() => {
        if (!file) return;

        let destroyed = false;
        const ENGINE_ID = 'neuropredict_dicom_engine';

        async function init() {
            setStatus('loading');
            setErrorMsg('');

            try {
                await loadCornerstoneModules();

                // Init core + tools
                await csCore.init();
                await csTools.init();

                // Configure image loader
                dicomImageLoader.configure({
                    useWebWorkers: true,
                    decodeConfig: { usePDFJS: false },
                });
                dicomImageLoader.wadouri.register(csCore);

                // Register tools
                const { addTool, ToolGroupManager, StackScrollTool, WindowLevelTool, ZoomTool, PanTool } = csTools;
                [StackScrollTool, WindowLevelTool, ZoomTool, PanTool].forEach(T => {
                    try { addTool(T); } catch { /* already registered */ }
                });

                // Extract DICOM files from ZIP
                const ids = await extractDicomFiles(file);
                if (destroyed) return;
                if (ids.length === 0) {
                    setStatus('error');
                    setErrorMsg('No DICOM files found in ZIP archive.');
                    return;
                }
                setImageIds(ids);
                setTotalSlices(ids.length);
                blobUrlsRef.current = ids.map(id => id.replace('wadouri:', ''));

                // Destroy previous engine if any
                try { csCore.getRenderingEngine(ENGINE_ID)?.destroy(); } catch { }

                if (!containerRef.current || destroyed) return;

                const engine = new csCore.RenderingEngine(ENGINE_ID);
                engineRef.current = engine;

                // Create 3 stack viewports
                const viewportInputs = VIEWPORT_IDS.map((vpId, i) => ({
                    viewportId: vpId,
                    type: csCore.Enums.ViewportType.STACK,
                    element: containerRef.current.querySelector(`[data-viewport="${vpId}"]`),
                }));
                engine.setViewports(viewportInputs);

                // Tool group
                const tgId = 'neuropredict_tg';
                try { ToolGroupManager.destroyToolGroup(tgId); } catch { }
                const toolGroup = ToolGroupManager.createToolGroup(tgId);
                toolGroupRef.current = toolGroup;
                VIEWPORT_IDS.forEach(vpId => toolGroup.addViewport(vpId, ENGINE_ID));

                toolGroup.addTool(StackScrollTool.toolName);
                toolGroup.addTool(WindowLevelTool.toolName);
                toolGroup.addTool(ZoomTool.toolName);
                toolGroup.addTool(PanTool.toolName);
                toolGroup.setToolActive(StackScrollTool.toolName, {
                    bindings: [{ mouseButton: csTools.Enums.MouseBindings.Wheel }],
                });
                toolGroup.setToolActive(WindowLevelTool.toolName, {
                    bindings: [{ mouseButton: csTools.Enums.MouseBindings.Primary }],
                });
                toolGroup.setToolActive(PanTool.toolName, {
                    bindings: [{ mouseButton: csTools.Enums.MouseBindings.Auxiliary }],
                });
                toolGroup.setToolActive(ZoomTool.toolName, {
                    bindings: [{ mouseButton: csTools.Enums.MouseBindings.Secondary }],
                });

                // Load image stacks — each viewport shows the same series, different fractions
                const mid = Math.floor(ids.length / 2);
                const offsets = [mid, Math.floor(ids.length * 0.3), Math.floor(ids.length * 0.6)];
                for (let i = 0; i < VIEWPORT_IDS.length; i++) {
                    const vp = engine.getViewport(VIEWPORT_IDS[i]);
                    await vp.setStack(ids, offsets[i]);
                }

                engine.renderViewports(VIEWPORT_IDS);

                // Apply default windowing preset
                const { ww, wl } = WINDOWING_PRESETS['Brain'];
                for (const vpId of VIEWPORT_IDS) {
                    const vp = engine.getViewport(vpId);
                    vp.setProperties({ voiRange: csCore.utilities.windowLevel.toLowHighRange(ww, wl) });
                    vp.render();
                }

                // Read metadata from first image
                try {
                    const meta = dicomImageLoader.wadors.metaDataManager.get(ids[0]) || {};
                    setMetaInfo({
                        modality: meta['00080060']?.Value?.[0] || 'CT',
                        rows: meta['00280010']?.Value?.[0] || '—',
                        cols: meta['00280011']?.Value?.[0] || '—',
                        slices: ids.length,
                    });
                } catch {
                    setMetaInfo({ modality: 'CT', slices: ids.length });
                }

                setStatus('ready');
                setCurrentSlice(mid + 1);
            } catch (err) {
                if (!destroyed) {
                    setStatus('error');
                    setErrorMsg(err.message || 'Failed to initialize DICOM viewer.');
                }
            }
        }

        init();

        return () => {
            destroyed = true;
            try { engineRef.current?.destroy(); } catch { }
            // Revoke blob URLs
            blobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url); } catch { } });
        };
    }, [file]);

    // ── Render ──────────────────────────────────────────────────────────────
    if (!file) {
        return (
            <div style={{
                background: T.panel, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: 40,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                minHeight: 400, color: T.textMuted, textAlign: 'center',
            }}>
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>⬜</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textSec }}>
                    Upload a DICOM ZIP to view slices
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>
                    Axial · Sagittal · Coronal multi-planar reconstruction
                </div>
            </div>
        );
    }

    return (
        <div style={{ background: T.bg, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            {/* ── Toolbar ── */}
            <div style={{
                background: T.surface, borderBottom: `1px solid ${T.border}`,
                padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.textSec, textTransform: 'uppercase', marginRight: 4 }}>
                    Window
                </span>
                {Object.keys(WINDOWING_PRESETS).map(name => (
                    <button key={name} onClick={() => applyPreset(name)} style={{
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                        border: `1px solid ${activePreset === name ? T.cyan : T.border}`,
                        background: activePreset === name ? T.cyanDim : 'transparent',
                        color: activePreset === name ? T.cyan : T.textSec,
                        cursor: 'pointer', letterSpacing: '0.04em',
                    }}>{name}</button>
                ))}
                <div style={{ flex: 1 }} />
                {status === 'ready' && (
                    <span style={{ fontSize: 11, color: T.textSec }}>
                        Scroll to navigate · Left-drag: W/L · Right-drag: Zoom · Middle: Pan
                    </span>
                )}
                {status === 'loading' && (
                    <span style={{ fontSize: 11, color: T.cyan }}>Loading DICOM series…</span>
                )}
                {status === 'error' && (
                    <span style={{ fontSize: 11, color: T.orange }}>{errorMsg}</span>
                )}
            </div>

            {/* ── Viewport grid ── */}
            <div ref={containerRef} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                gap: 2,
                background: '#000',
                height: 520,
            }}>
                {VIEWPORT_IDS.map(vpId => (
                    <div key={vpId} style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>
                        {/* The actual Cornerstone canvas target */}
                        <div
                            data-viewport={vpId}
                            style={{ width: '100%', height: '100%' }}
                        />
                        {/* Viewport label overlay */}
                        <div style={{
                            position: 'absolute', top: 6, left: 8,
                            fontSize: 10, fontWeight: 700,
                            color: T.cyan, letterSpacing: '0.1em',
                            pointerEvents: 'none',
                            textShadow: '0 1px 4px #000',
                        }}>
                            {VIEWPORT_LABELS[vpId]}
                        </div>
                    </div>
                ))}

                {/* ── Info panel (4th cell) ── */}
                <div style={{
                    background: T.panel, padding: 16,
                    display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.cyan, textTransform: 'uppercase', marginBottom: 4 }}>
                        Series Info
                    </div>
                    {metaInfo ? (
                        <>
                            <InfoRow label="Modality" value={metaInfo.modality} />
                            <InfoRow label="Slices" value={metaInfo.slices} />
                            {metaInfo.rows && <InfoRow label="Matrix" value={`${metaInfo.cols} × ${metaInfo.rows}`} />}
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: T.textMuted }}>
                            {status === 'loading' ? 'Parsing DICOM…' : status === 'error' ? errorMsg : '—'}
                        </div>
                    )}
                    <div style={{ marginTop: 'auto', borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                        <div style={{ fontSize: 9, color: T.textMuted, lineHeight: 1.5 }}>
                            Left-click drag: Window/Level<br />
                            Right-click drag: Zoom<br />
                            Middle-click drag: Pan<br />
                            Mouse wheel: Scroll slices
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#5d7a9e' }}>{label}</span>
            <span style={{ color: '#e8edf5', fontWeight: 600 }}>{value}</span>
        </div>
    );
}
