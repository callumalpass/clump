#!/bin/bash

# Feature Implementation Script
# Explores the codebase and implements valuable features autonomously
# Usage: ./scripts/discover-features.sh [--features N] [--tool TOOL]
#   --features N      Number of features to implement (default: 1)
#   --tool TOOL       Use 'claude' or 'codex' (default: claude)

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
You are improving Clump by implementing valuable features.

## Project Context
Clump is a local web application for:
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
Explore the codebase and implement 1 feature that you think would be most valuable.

**AVOID features that:**
- Require new external services or third-party APIs
- Need database migrations or schema changes
- Add heavy new dependencies

**PREFER features that:**
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

for i in $(seq 1 $FEATURE_COUNT); do
    echo "----------------------------------"
    echo "Feature pass $i of $FEATURE_COUNT"
    echo "----------------------------------"
    echo ""

    if [ "$TOOL" == "codex" ]; then
        SUCCESS=0
        codex --dangerously-bypass-approvals-and-sandbox "$PROMPT" || SUCCESS=$?
    else
        SUCCESS=0
        claude --dangerously-skip-permissions -p "$PROMPT" || SUCCESS=$?
    fi

    if [ $SUCCESS -eq 0 ]; then
        echo ""
        echo "✓ Completed pass $i"
    else
        EXIT_CODE=$SUCCESS
        echo ""
        echo "✗ Error in pass $i (exit code: $EXIT_CODE)"
        if [ $EXIT_CODE -eq 130 ]; then
            echo "  Interrupted by user. Stopping."
            exit 130
        fi
        echo "  Continuing with next pass..."
    fi

    echo ""
done

echo ""
echo "=================================="
echo "All $FEATURE_COUNT feature pass(es) complete!"
echo "=================================="
echo "Run 'git log --oneline -$((FEATURE_COUNT + 2))' to see implemented features."
