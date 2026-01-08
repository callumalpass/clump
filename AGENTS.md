# Repository Guidelines

## Project Structure & Module Organization
- `backend/` holds the FastAPI service. Core code lives in `backend/app/`, with tests in `backend/tests/`.
- `frontend/` contains the React + Vite app. Source files are in `frontend/src/`, unit tests use `*.test.ts`, and Playwright specs live in `frontend/e2e/`.
- `docs/` stores documentation assets such as screenshots in `docs/images/`.
- `scripts/` contains helper scripts; see `run.sh` for the default dev workflow.

## Build, Test, and Development Commands
- `./run.sh` starts both backend (uvicorn on `:8000`) and frontend (Vite on `:5173`).
- `cd backend && python -m venv venv && source venv/bin/activate && pip install -e ".[dev]"` installs backend deps.
- `cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000` runs the API server directly.
- `cd frontend && npm install` installs frontend deps.
- `cd frontend && npm run dev` runs the UI locally.
- `cd frontend && npm run build` builds the production bundle.

## Coding Style & Naming Conventions
- Python: follow Ruff defaults with `line-length = 100` and Python 3.11 targets (`backend/pyproject.toml`).
- Tests: Python files use `test_*.py`; frontend unit tests use `*.test.ts`.
- TypeScript/React: match existing patterns in `frontend/src/` (functional components, hooks, and module-local helpers).

## Testing Guidelines
- Backend: `cd backend && pytest` (pytest + pytest-asyncio).
- Frontend unit tests: `cd frontend && npm test` or `npm run test:run`.
- Coverage: `cd frontend && npm run test:coverage`.
- E2E: `cd frontend && npm run e2e` (Playwright).

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (e.g., `feat: ...`, `fix: ...`, `refactor: ...`).
- PRs should include: a clear description, linked issue/PR if applicable, and screenshots for UI changes.
- Call out test results (or explain why tests were skipped).

## Configuration & Secrets
- Backend config lives in `backend/.env` (e.g., `GITHUB_TOKEN`, CLI command paths).
- Local data is stored under `~/.clump/` (SQLite DBs and session transcripts).
