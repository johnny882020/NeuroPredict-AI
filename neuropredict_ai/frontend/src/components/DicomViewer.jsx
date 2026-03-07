import { useEffect, useRef, useState, useCallback } from 'react';

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

const MEASURE_TOOLS = [
    { key: 'Length',       icon: '↔', label: 'Length' },
    { key: 'Angle',        icon: '∠', label: 'Angle'  },
    { key: 'EllipticalROI', icon: '◯', label: 'ROI'   },
    { key: 'Probe',        icon: '·', label: 'HU'     },
];

const VIEWPORT_IDS = ['axial', 'sagittal', 'coronal'];
const VIEWPORT_LABELS = { axial: 'AXIAL', sagittal: 'SAGITTAL', coronal: 'CORONAL' };

// Lazy-loaded Cornerstone modules (only imported when component mounts)
let csCore = null;
let csTools = null;
let dicomImageLoader = null;

async function loadCornerstoneModules() {
    if (csCore) return;
    [csCore, csTools, { default: dicomImageLoader }] = await Promise.all([
        import('@cornerstonejs/core'),
        import('@cornerstonejs/tools'),
        import('@cornerstonejs/dicom-image-loader'),
    ]);
}

// ── Sort raw File[] by InstanceNumber tag ────────────────────────────────────
async function sortDcmFilesByInstance(files) {
    try {
        const dicomParser = (await import('dicom-parser')).default;
        const withMeta = await Promise.all(files.map(async f => {
            try {
                const buf = await f.arrayBuffer();
                const ds = dicomParser.parseDicom(new Uint8Array(buf));
                return { file: f, instanceNumber: parseInt(ds.string('x00200013') || '0', 10) };
            } catch {
                return { file: f, instanceNumber: 0 };
            }
        }));
        withMeta.sort((a, b) => a.instanceNumber - b.instanceNumber);
        return withMeta.map(x => x.file);
    } catch {
        return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
}

// ── Resolve image IDs from source (ZIP File or DCM File[]) ──────────────────
async function resolveImageIds(source) {
    if (!source) return { ids: [], blobUrls: [] };

    const isArray = Array.isArray(source);
    const singleFile = !isArray ? source : null;

    // ZIP archive path (existing logic)
    if (singleFile?.name?.toLowerCase().endsWith('.zip')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(singleFile);
        const dcmEntries = [];

        for (const [name, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lower = name.toLowerCase();
            if (lower.endsWith('.dcm') || (!lower.includes('.') && !lower.includes('__macosx'))) {
                dcmEntries.push({ name, entry });
            }
        }
        if (dcmEntries.length === 0) return { ids: [], blobUrls: [] };

        const buffers = await Promise.all(dcmEntries.map(({ entry }) => entry.async('arraybuffer')));
        const files = buffers.map((buf, i) => {
            const blob = new Blob([buf], { type: 'application/dicom' });
            const url = URL.createObjectURL(blob);
            return { url, name: dcmEntries[i].name, buf };
        });

        // Sort by InstanceNumber
        try {
            const dicomParser = (await import('dicom-parser')).default;
            files.forEach(f => {
                try {
                    const ds = dicomParser.parseDicom(new Uint8Array(f.buf));
                    f.instanceNumber = parseInt(ds.string('x00200013') || '0', 10);
                } catch { f.instanceNumber = 0; }
            });
            files.sort((a, b) => a.instanceNumber - b.instanceNumber);
        } catch {
            files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        }

        const ids = files.map(f => `wadouri:${f.url}`);
        const blobUrls = files.map(f => f.url);
        return { ids, blobUrls };
    }

    // Individual .dcm file(s) — register with WADO-URI fileManager
    const rawFiles = isArray ? source : [singleFile];
    const sorted = await sortDcmFilesByInstance(rawFiles);
    const ids = sorted.map(f => dicomImageLoader.wadouri.fileManager.add(f));
    return { ids, blobUrls: [] }; // fileManager manages memory; no blob URLs to revoke
}

// ── Extract display metadata from first imageId ──────────────────────────────
async function extractMeta(imageId, slices) {
    if (!csCore) return { slices };
    try {
        const image = await csCore.imageLoader.loadAndCacheImage(imageId);
        const seriesModule = csCore.metaData.get('generalSeriesModule', imageId) || {};
        const imagePlane   = csCore.metaData.get('imagePlaneModule', imageId) || {};
        const pixelModule  = csCore.metaData.get('imagePixelModule', imageId) || {};
        const patientMod   = csCore.metaData.get('patientModule', imageId) || {};
        const generalStudy = csCore.metaData.get('generalStudyModule', imageId) || {};
        return {
            modality:      seriesModule.modality || 'CT',
            slices,
            rows:          image.rows || pixelModule.rows || '—',
            cols:          image.columns || pixelModule.columns || '—',
            patientName:   patientMod.patientName || '—',
            studyDate:     generalStudy.studyDate || '—',
            seriesDesc:    seriesModule.seriesDescription || '—',
            sliceThickness: imagePlane.sliceThickness ? `${imagePlane.sliceThickness.toFixed(1)} mm` : '—',
            pixelSpacing:   imagePlane.columnPixelSpacing
                ? `${imagePlane.columnPixelSpacing.toFixed(3)} mm`
                : '—',
        };
    } catch {
        // Fall back to wadors metadata (ZIP path)
        try {
            const meta = dicomImageLoader.wadors.metaDataManager.get(imageId) || {};
            return {
                modality: meta['00080060']?.Value?.[0] || 'CT',
                slices,
                rows: meta['00280010']?.Value?.[0] || '—',
                cols: meta['00280011']?.Value?.[0] || '—',
            };
        } catch {
            return { modality: 'CT', slices };
        }
    }
}

export default function DicomViewer({ source }) {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const toolGroupRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [activePreset, setActivePreset] = useState('Brain');
    const [activeTool, setActiveTool] = useState(null); // null = Navigate (W/L), or tool name
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

    // ── Measurement tool activation ─────────────────────────────────────────
    const activateMeasureTool = useCallback((toolName) => {
        if (!toolGroupRef.current || !csTools) return;
        // Restore all measure tools to passive first
        MEASURE_TOOLS.forEach(({ key }) => {
            try { toolGroupRef.current.setToolPassive(key + 'Tool'); } catch { }
        });
        // Make WindowLevel passive (free left-click for measure)
        toolGroupRef.current.setToolPassive(csTools.WindowLevelTool.toolName);
        // Activate the selected measure tool with left-click
        toolGroupRef.current.setToolActive(toolName, {
            bindings: [{ mouseButton: csTools.Enums.MouseBindings.Primary }],
        });
        setActiveTool(toolName);
    }, []);

    const activateNavigate = useCallback(() => {
        if (!toolGroupRef.current || !csTools) return;
        // Restore WindowLevel to left-click
        toolGroupRef.current.setToolActive(csTools.WindowLevelTool.toolName, {
            bindings: [{ mouseButton: csTools.Enums.MouseBindings.Primary }],
        });
        // All measure tools to passive
        MEASURE_TOOLS.forEach(({ key }) => {
            try { toolGroupRef.current.setToolPassive(key + 'Tool'); } catch { }
        });
        setActiveTool(null);
    }, []);

    const clearAnnotations = useCallback(() => {
        if (!csTools || !engineRef.current) return;
        try {
            csTools.annotation.state.removeAllAnnotations();
            engineRef.current.renderViewports(VIEWPORT_IDS);
        } catch { /* ignore */ }
    }, []);

    // ── Initialize Cornerstone ──────────────────────────────────────────────
    useEffect(() => {
        if (!source) return;

        let destroyed = false;
        const ENGINE_ID = 'neuropredict_dicom_engine';

        async function init() {
            setStatus('loading');
            setErrorMsg('');
            setMetaInfo(null);
            setActiveTool(null);

            try {
                await loadCornerstoneModules();

                await csCore.init();
                await csTools.init();

                dicomImageLoader.wadouri.register(csCore);

                // Register all tools (catch if already registered)
                const {
                    addTool, ToolGroupManager,
                    StackScrollTool, WindowLevelTool, ZoomTool, PanTool,
                    LengthTool, AngleTool, EllipticalROITool, ProbeTool,
                } = csTools;
                [StackScrollTool, WindowLevelTool, ZoomTool, PanTool,
                 LengthTool, AngleTool, EllipticalROITool, ProbeTool,
                ].forEach(Tool => { try { addTool(Tool); } catch { /* already registered */ } });

                // Resolve image IDs (handles ZIP and individual .dcm)
                const { ids, blobUrls } = await resolveImageIds(source);
                if (destroyed) return;
                if (ids.length === 0) {
                    setStatus('error');
                    setErrorMsg('No DICOM images found. Check that the file is a valid DICOM ZIP or .dcm file.');
                    return;
                }
                blobUrlsRef.current = blobUrls;

                // Destroy previous engine if any
                try { csCore.getRenderingEngine(ENGINE_ID)?.destroy(); } catch { }
                if (!containerRef.current || destroyed) return;

                const engine = new csCore.RenderingEngine(ENGINE_ID);
                engineRef.current = engine;

                // Create 3 stack viewports
                const viewportInputs = VIEWPORT_IDS.map(vpId => ({
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

                // Navigation tools
                [StackScrollTool, WindowLevelTool, ZoomTool, PanTool].forEach(Tool => {
                    toolGroup.addTool(Tool.toolName);
                });
                // Measurement tools
                [LengthTool, AngleTool, EllipticalROITool, ProbeTool].forEach(Tool => {
                    toolGroup.addTool(Tool.toolName);
                });

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
                // Measure tools start passive
                [LengthTool, AngleTool, EllipticalROITool, ProbeTool].forEach(Tool => {
                    toolGroup.setToolPassive(Tool.toolName);
                });

                // Load stacks — same series, different starting slices for each viewport
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

                // Extract DICOM metadata
                const meta = await extractMeta(ids[0], ids.length);
                if (!destroyed) setMetaInfo(meta);

                setStatus('ready');
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
            blobUrlsRef.current.forEach(url => { try { URL.revokeObjectURL(url); } catch { } });
        };
    }, [source]);

    // ── Render ──────────────────────────────────────────────────────────────
    if (!source) {
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
            {/* ── Windowing toolbar ── */}
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
                {status === 'loading' && (
                    <span style={{ fontSize: 11, color: T.cyan }}>Loading DICOM series…</span>
                )}
                {status === 'error' && (
                    <span style={{ fontSize: 11, color: T.orange }}>{errorMsg}</span>
                )}
            </div>

            {/* ── Measurement toolbar ── */}
            <div style={{
                background: T.surface, borderBottom: `1px solid ${T.border}`,
                padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.textSec, textTransform: 'uppercase', marginRight: 4 }}>
                    Measure
                </span>
                {/* Navigate (restore W/L) */}
                <button onClick={activateNavigate} style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                    border: `1px solid ${activeTool === null ? T.cyan : T.border}`,
                    background: activeTool === null ? T.cyanDim : 'transparent',
                    color: activeTool === null ? T.cyan : T.textSec,
                    cursor: 'pointer',
                }}>⊕ Navigate</button>
                {MEASURE_TOOLS.map(({ key, icon, label }) => {
                    const toolName = key + 'Tool';
                    const isActive = activeTool === toolName;
                    return (
                        <button key={key} onClick={() => activateMeasureTool(toolName)} style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                            border: `1px solid ${isActive ? T.orange : T.border}`,
                            background: isActive ? '#7c3c0d' : 'transparent',
                            color: isActive ? T.orange : T.textSec,
                            cursor: 'pointer',
                        }}>{icon} {label}</button>
                    );
                })}
                <button onClick={clearAnnotations} style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                    border: `1px solid ${T.border}`,
                    background: 'transparent', color: T.textSec,
                    cursor: 'pointer', marginLeft: 4,
                }}>✕ Clear</button>
                <div style={{ flex: 1 }} />
                {status === 'ready' && (
                    <span style={{ fontSize: 10, color: T.textMuted }}>
                        {activeTool ? 'Click to place · Esc = Navigate' : 'Left-drag: W/L · Right: Zoom · Mid: Pan · Wheel: Scroll'}
                    </span>
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
                        <div data-viewport={vpId} style={{ width: '100%', height: '100%' }} />
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
                    display: 'flex', flexDirection: 'column', gap: 8,
                    overflowY: 'auto',
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.cyan, textTransform: 'uppercase', marginBottom: 4 }}>
                        Series Info
                    </div>
                    {metaInfo ? (
                        <>
                            {metaInfo.patientName !== '—' && <InfoRow label="Patient" value={metaInfo.patientName} />}
                            {metaInfo.studyDate !== '—' && <InfoRow label="Study Date" value={metaInfo.studyDate} />}
                            <InfoRow label="Modality" value={metaInfo.modality} />
                            <InfoRow label="Slices" value={metaInfo.slices} />
                            {metaInfo.rows && metaInfo.rows !== '—' && (
                                <InfoRow label="Matrix" value={`${metaInfo.cols} × ${metaInfo.rows}`} />
                            )}
                            {metaInfo.sliceThickness !== '—' && (
                                <InfoRow label="Slice Thick." value={metaInfo.sliceThickness} />
                            )}
                            {metaInfo.pixelSpacing !== '—' && (
                                <InfoRow label="Pixel Spacing" value={metaInfo.pixelSpacing} />
                            )}
                            {metaInfo.seriesDesc !== '—' && (
                                <InfoRow label="Series" value={metaInfo.seriesDesc} />
                            )}
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: T.textMuted }}>
                            {status === 'loading' ? 'Parsing DICOM…' : status === 'error' ? errorMsg : '—'}
                        </div>
                    )}
                    <div style={{ marginTop: 'auto', borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                        <div style={{ fontSize: 9, color: T.textMuted, lineHeight: 1.6 }}>
                            Navigate: W/L · Zoom · Pan · Scroll<br />
                            Measure: Length · Angle · ROI · HU probe
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, gap: 8 }}>
            <span style={{ color: '#5d7a9e', flexShrink: 0 }}>{label}</span>
            <span style={{ color: '#e8edf5', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
        </div>
    );
}
