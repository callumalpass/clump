# Claude Code Hub

A local web application for triaging GitHub issues and running AI analyses through Claude Code.

## Features

- **Issue Browser**: View and triage GitHub issues with full comment threads
- **Multiple Terminal Sessions**: Run parallel Claude Code sessions for different analyses
- **Embedded Terminal**: xterm.js-based terminal with full Claude Code interactivity
- **Analysis History**: Search and browse past analyses with full transcripts
- **GitHub Integration**: Comment, label, and close issues directly

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

- `GET /api/repos` - List configured repositories
- `POST /api/repos` - Add a repository
- `GET /api/repos/:id/issues` - List issues
- `GET /api/repos/:id/issues/:num` - Issue with comments
- `POST /api/sessions` - Create terminal session
- `GET /api/sessions` - List active sessions
- `WS /api/sessions/:id/ws` - Terminal WebSocket
- `GET /api/analyses` - Search past analyses
