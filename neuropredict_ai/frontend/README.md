# NeuroPredict AI — Frontend

React 19 + Vite 7 single-page application. Served as static files by the FastAPI backend from `dist/`. No state management library — all state lives in `App.jsx` via `useState`.

---

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server on :5173 (Vite HMR; proxies API calls to :8000)
npm run build        # Production build → dist/
npm run lint         # ESLint
npx vitest run       # Run all 28 tests
```

---

## Component Inventory

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component: 5-tab layout, all state + handlers, dark/light toggle |
| `src/theme.js` | `DARK` / `LIGHT` token objects + `ThemeCtx` React context |
| `src/api.js` | Axios API layer; 503 interceptor for Render free-tier sleep message |
| `src/index.css` | Global resets, scrollbar, dark-safe form element styles |
| `src/components/DicomViewer.jsx` | Cornerstone.js 3-plane MPR viewer (lazy-loaded); accepts `.zip` or `File[]` of `.dcm` |
| `src/components/Viewer3D.jsx` | VTK.js 3D mesh rendering + per-vertex WSS heat map (lazy-loaded) |
| `src/components/ClinicalForm.jsx` | PHASES + UIATS clinical input; `disabled` prop gates submit before scan |
| `src/components/ClinicalDecision.jsx` | Doctor-in-the-loop: Accept / Modify / Override / Bypass + audit trail |
| `src/components/MARTAForm.jsx` | MARTA-EVT/NT procedural risk input form |

---

## Theme System

All components consume theme tokens from `ThemeCtx` — no hardcoded color values anywhere.

**Pattern used in every component:**
```js
import { useContext } from 'react';
import { ThemeCtx } from '../theme';   // (or './theme' from App.jsx)

function MyComponent() {
    const T = useContext(ThemeCtx);
    return <div style={{ background: T.panel, color: T.textPri }}>...</div>;
}
```

**`App.jsx` drives the theme:**
```js
const [darkMode, setDarkMode] = useState(true);
const T = darkMode ? DARK : LIGHT;
// ...
<ThemeCtx.Provider value={T}>
    {/* all tabs + components */}
</ThemeCtx.Provider>
```

### Color Tokens

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `T.bg` | `#080c14` | `#f0f4f8` | Page background |
| `T.surface` | `#0e1420` | `#ffffff` | Input backgrounds |
| `T.panel` | `#141b2d` | `#ffffff` | Card/panel backgrounds |
| `T.border` | `#1e2d48` | `#c8d8ec` | Panel borders |
| `T.textPri` | `#e8edf5` | `#0f172a` | Primary text |
| `T.textSec` | `#5d7a9e` | `#334d6a` | Secondary/label text |
| `T.cyan` | `#06b6d4` | `#0891b2` | Section titles, accents |
| `T.orange` | `#f97316` | `#ea6c00` | Critical findings |
| `T.green` | `#10b981` | `#059669` | Normal/negative findings |
| `T.red` | `#ef4444` | `#dc2626` | High-risk indicators |
| `T.purple` | `#a855f7` | `#9333ea` | EVT device highlights |
| `T.blue` | `#3b82f6` | `#2563eb` | Probability bars |

---

## Tab Navigation

| Tab key | Route | Gating |
|---------|-------|--------|
| `'dicom'` | DICOM View | None — shows placeholder without files |
| `'analysis'` | CTA Analysis | Default tab on load |
| `'risk'` | Risk & Clinical | ClinicalForm submit disabled until scan uploaded |
| `'marta'` | MARTA Assessment | Always available |
| `'treatment'` | Treatment Sim | Shows gating message until scan uploaded |

---

## API Layer (`src/api.js`)

```js
uploadScan(file)                    // POST /analyze_and_mesh
predictRisk(clinical, morph, ...)   // POST /predict_risk
simulateTreatment(type, wss, osi)   // POST /simulate_treatment
assessMARTA(martaData)              // POST /marta_assessment
```

**503 interceptor** — Render free tier spins down after 15 min idle. On 503, the error message is replaced with: *"Server is starting up — please wait 30 seconds and try again."*

---

## Bundle Splitting

| Chunk | Gzip | Loaded when |
|-------|------|-------------|
| `index.js` | ~88 KB | Always |
| `vtk.js` | ~102 KB | First visit to CTA Analysis tab |
| `cornerstone.js` | ~859 KB | First visit to DICOM View tab |
| `cornerstone-loader.js` | ~73 KB | First visit to DICOM View tab |

Configured in `vite.config.js` via `build.rollupOptions.output.manualChunks`.

---

## Tests

28 tests across 3 files using Vitest + React Testing Library:

| File | Tests | What's covered |
|------|-------|----------------|
| `src/App.test.jsx` | 10 | Tab navigation, upload button state, disabled form, DICOM placeholder, header/footer regression |
| `src/components/ClinicalDecision.test.jsx` | 9 | Accept/override/bypass workflow, null synthesis guard |
| `src/components/ClinicalForm.test.jsx` | 9 | Field rendering, scan data pre-fill, submit callback, disabled state |

```bash
npx vitest run                                              # all 28
npx vitest run src/App.test.jsx                             # 10 tests
npx vitest run src/components/ClinicalForm.test.jsx         # 9 tests
npx vitest run src/components/ClinicalDecision.test.jsx     # 9 tests
```
