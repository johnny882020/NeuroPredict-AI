# NeuroPredict AI

## Project Overview

AI prediction platform with 3D visualization capabilities.

- **Language:** Python 3.12+
- **Framework:** FastAPI
- **Auth:** TBD
- **3D Visualization:** TBD (Three.js / Plotly / VTK)

## Environment Setup

- Use a virtual environment for all development
- Store secrets in `.env` (never committed)
- Maintain `.env.example` with placeholder values in git
- Package manager: TBD (uv / poetry / pip)

## Coding Standards

- **Linter/Formatter:** ruff
- **Type hints:** Required on all function signatures
- **API schemas:** Pydantic models for all request/response bodies
- **Endpoints:** Async by default (`async def`)
- **Testing:** pytest with 80%+ coverage target
- **Imports:** Use absolute imports, group as stdlib / third-party / local

## API Conventions

- RESTful, versioned: `/api/v1/...`
- Error response format: `{"detail": "...", "code": "ERROR_CODE"}`
- Snake_case for all JSON field names
- Authentication via `Authorization: Bearer <token>` header
- Pagination: `?page=1&size=20` with response wrapper `{"items": [], "total": N}`

## ML/Data Conventions

- Models stored in `models/` directory
- Data pipelines in `data/` directory
- Pin all dependencies for reproducibility
- Seed random states for deterministic results
- Experiment tracking: TBD

## 3D Visualization Conventions

- Framework: TBD
- Use consistent color palettes across visualizations
- Define camera defaults per visualization type
- Set performance budgets for rendering (target 60fps)

## Deployment

- Docker-based containerization
- Environment-specific configuration via environment variables
- CI/CD: TBD

## Git Workflow

- Feature work uses worktrees: `claude --worktree <feature-name>`
- One Claude session per worktree
- Run 3-5 parallel sessions for independent tasks
- Always branch from `main`
- Naming: `feature-*`, `bugfix-*`, `refactor-*`

## Corrections Log

<!-- Append here when Claude makes a mistake. Format: "- Don't X, do Y instead" -->
