# Clump

A local web application for triaging GitHub issues and running AI analyses through Claude Code.

## Features

- **Issue Browser**: View and triage GitHub issues with full comment threads
- **Multiple Terminal Sessions**: Run parallel Claude Code sessions for different analyses
- **Embedded Terminal**: xterm.js-based terminal with full Claude Code interactivity
- **Analysis History**: Search and browse past analyses with full transcripts
- **GitHub Integration**: Comment, label, and close issues directly

### Claude Code Integration

This hub deeply integrates with Claude Code CLI using its official features:

- **Fine-grained Permissions**: Uses `--allowedTools` and `--permission-mode` instead of blanket `--dangerously-skip-permissions`
- **Session Resumption**: Tracks Claude Code session IDs for continuing previous conversations
- **Headless Mode**: Optional `-p` flag mode for programmatic analysis with structured JSON output
- **Streaming Output**: Real-time `stream-json` format for progressive UI updates
- **Max Turns Control**: Configurable `--max-turns` to limit agentic execution depth
- **Model Selection**: Choose between sonnet, opus, or haiku models
- **MCP Integration**: Optional GitHub MCP server for direct Claude-to-GitHub interaction

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
