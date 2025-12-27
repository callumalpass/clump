#!/bin/bash

# Feature Implementation Script
# Explores the codebase and implements valuable features autonomously
# Usage: ./scripts/discover-features.sh [--features N] [--tool TOOL]
#   --features N      Number of features to implement (default: 1)
#   --tool TOOL       Use 'claude' or 'codex' (default: claude)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
FEATURE_COUNT=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --features)
      FEATURE_COUNT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "Feature Implementation Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Features to implement: $FEATURE_COUNT"
echo ""

PROMPT=$(cat <<EOF
You are improving Claude Code Hub by implementing valuable features.

## Project Context
Claude Code Hub is a local web application for:
- Triaging GitHub issues
- Running AI analyses through Claude Code CLI
- Managing multiple terminal sessions
- Storing and searching analysis history

**Architecture:**
- Backend: Python/FastAPI (\`backend/app/\`)
- Frontend: React/TypeScript (\`frontend/src/\`)
- Database: SQLite via aiosqlite
- Terminal: xterm.js with PTY

## Your Task
Explore the codebase and implement $FEATURE_COUNT feature(s) that you think would be most valuable.

**AVOID features that:**
- Require new external services or third-party APIs
- Need database migrations or schema changes
- Add heavy new dependencies

**PREFER features that:**
- Improve existing functionality or UX
- Add small UI enhancements
- Fix obvious gaps in the current flow
- Are low-risk and self-contained

## Implementation Guidelines

1. **Explore first** - Read the codebase to understand what exists
2. **Start small** - Implement minimal viable versions
3. **Test your changes:**
   - Backend: \`cd backend && python -m py_compile app/main.py\`
   - Frontend: \`cd frontend && npm run build\`
4. **Commit each feature:** \`git commit -m "feat: Add [feature name]"\`
5. **If something breaks**, revert and try something else

Begin by exploring the codebase.
EOF
)

if [ "$TOOL" == "codex" ]; then
    codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
else
    claude --dangerously-skip-permissions -p "$PROMPT"
fi

echo ""
echo "=================================="
echo "Feature implementation complete!"
echo "=================================="
echo "Run 'git log --oneline -5' to see implemented features."
