# Clump

A web UI for triaging GitHub issues with Claude Code.

## What it does

- Browse GitHub issues and comment threads
- Run Claude Code sessions in embedded terminals
- Keep multiple sessions open at once
- Save and search past analyses

## Claude Code flags used

- `--allowedTools` and `--permission-mode` for permissions
- `--session-id` / `--resume` for continuing conversations
- `-p` for headless mode with JSON output
- `--max-turns` to limit execution depth
- `--model` for model selection
- MCP GitHub server (optional)

## Requirements

- Python 3.11+
- Node.js 18+
- Claude Code CLI installed and authenticated
- GitHub personal access token (for private repos)

## Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -e .

# Copy and configure environment
cp .env.example .env
# Edit .env with your GitHub token

# Run the server
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

1. **Add a Repository**: Click "+" in the repo selector, enter owner/name and local path
2. **Browse Issues**: Select "Issues" tab to see open issues
3. **Analyze Issue**: Click "Analyze" on any issue to start a Claude Code session
4. **Interact**: Type in the terminal to chat with Claude about the issue
5. **Multiple Sessions**: Click "+" in session tabs to run parallel analyses
6. **Search Analyses**: Use the Analyses tab to search past sessions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + xterm.js)                                 │
│  - Issue list / detail view                                 │
│  - Multiple terminal tabs                                   │
│  - Analysis history                                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP + WebSocket
┌─────────────────────────▼───────────────────────────────────┐
│  Backend (FastAPI)                                          │
│  - GitHub API proxy                                         │
│  - PTY session manager (spawns claude CLI)                  │
│  - SQLite for analyses/repos                                │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### GitHub
- `GET /api/repos` - List configured repositories
- `POST /api/repos` - Add a repository
- `GET /api/repos/:id/issues` - List issues
- `GET /api/repos/:id/issues/:num` - Issue with comments

### Interactive Sessions (PTY-based)
- `POST /api/sessions` - Create terminal session with Claude Code options
- `GET /api/sessions` - List active sessions
- `DELETE /api/sessions/:id` - Kill a session
- `WS /api/sessions/:id/ws` - Terminal WebSocket for real-time I/O

### Headless Analysis (programmatic)
- `POST /api/headless/analyze` - Run analysis and wait for complete result
- `POST /api/headless/analyze/stream` - Run analysis with streaming NDJSON output
- `GET /api/headless/running` - List running headless analyses
- `DELETE /api/headless/:id` - Cancel a running analysis

### Analyses
- `GET /api/analyses` - Search past analyses
- `GET /api/analyses/:id` - Get analysis details
- `PATCH /api/analyses/:id` - Update analysis summary/status

## Configuration

Configure Claude Code behavior via environment variables in `backend/.env`:

```bash
# Permission mode: "default", "plan", "acceptEdits", "bypassPermissions"
CLAUDE_PERMISSION_MODE=acceptEdits

# Auto-approved tools (comma-separated)
CLAUDE_ALLOWED_TOOLS=Read,Glob,Grep,Bash(git:*)

# Max agentic turns (0 = unlimited)
CLAUDE_MAX_TURNS=10

# Model selection
CLAUDE_MODEL=sonnet

# Enable headless mode by default
CLAUDE_HEADLESS_MODE=false

# Enable GitHub MCP server
CLAUDE_MCP_GITHUB=false
```

See `backend/.env.example` for all available options.
