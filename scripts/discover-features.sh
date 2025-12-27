#!/bin/bash

# Feature Discovery & Implementation Script
# Identifies missing features by analyzing the codebase, README, and similar projects
# Then responsibly implements the most valuable additions
# Usage: ./scripts/discover-features.sh [--discover-only] [--implement N] [--iterations N]
#   --discover-only   Only discover features, don't implement
#   --implement N     Number of features to implement per iteration (default: 1)
#   --iterations N    Number of discovery+implementation cycles (default: 1)
#   --tool TOOL       Use 'claude' or 'codex' (default: claude)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
DISCOVER_ONLY=false
IMPLEMENT_COUNT=1
ITERATIONS=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --discover-only)
      DISCOVER_ONLY=true
      shift
      ;;
    --implement)
      IMPLEMENT_COUNT="$2"
      shift 2
      ;;
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "Feature Discovery Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Discovery only: $DISCOVER_ONLY"
if [ "$DISCOVER_ONLY" = false ]; then
    echo "Features to implement: $IMPLEMENT_COUNT"
    echo "Iterations: $ITERATIONS"
fi
echo ""

PROMPT=$(cat <<EOF
You are discovering and implementing missing features for Claude Code Hub.

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

## Phase 1: Feature Discovery

### 1. Analyze Current State
Read these files to understand what exists:
- \`README.md\` - Documented features
- \`backend/app/routers/\` - API capabilities
- \`frontend/src/components/\` - UI features
- \`frontend/src/App.tsx\` - Main app structure

### 2. Identify Gaps
Explore the codebase and identify features that would be natural, valuable additions.

**Discovery approach:**
- Look for incomplete UI flows or missing user feedback
- Find places where the UX could be smoother
- Identify small quality-of-life improvements
- Notice patterns that could be abstracted or enhanced
- Check for missing error states or edge case handling

**Complexity constraints - AVOID features that:**
- Require new external services (webhooks, third-party APIs)
- Need significant infrastructure (multiple accounts, OAuth flows)
- Add heavy dependencies (PDF generation, complex exports)
- Require database migrations or schema changes

**PREFER features that:**
- Improve existing functionality
- Add small UI enhancements
- Better utilize existing APIs
- Improve developer/user experience with minimal code
- Fix obvious gaps in the current flow

### 3. Prioritize
Score each potential feature:
- **Value:** How useful would this be? (1-5)
- **Effort:** How much work? (1-5, lower is easier)
- **Risk:** Could this break things? (1-5, lower is safer)
- **Priority = Value × (6 - Effort) × (6 - Risk)**

### 4. Create Feature List
Write to \`docs/features/ROADMAP.md\`:
\`\`\`markdown
# Feature Roadmap

## Discovered Features ($(date +%Y-%m-%d))

### High Priority
| Feature | Value | Effort | Risk | Score |
|---------|-------|--------|------|-------|
| ... | ... | ... | ... | ... |

### Medium Priority
...

### Future Considerations
...
\`\`\`

$([ "$DISCOVER_ONLY" = true ] && echo "
## Phase 2: Skip (Discovery Only Mode)
Stop after creating the roadmap.
" || echo "
## Phase 2: Responsible Implementation

Implement the top $IMPLEMENT_COUNT feature(s) from your prioritized list.

### Implementation Guidelines

1. **Start Small:**
   - Implement the minimal viable version first
   - Don't over-engineer or add unnecessary options

2. **Safety First:**
   - Create a feature branch: \`git checkout -b feature/NAME\`
   - Make incremental commits
   - Test each change before moving on

3. **Quality Checks:**
   - Backend: \`cd backend && python -m py_compile app/main.py\`
   - Frontend: \`cd frontend && npm run build\`

4. **Documentation:**
   - Update README.md if the feature is user-facing
   - Add inline comments for complex logic

5. **Rollback Plan:**
   - If something breaks that you can't fix, revert
   - \`git checkout -- .\` to undo uncommitted changes
   - \`git reset --hard HEAD~1\` to undo last commit

### Implementation Order
For each feature:
1. Backend changes (if needed)
2. Frontend types (if needed)
3. Frontend components
4. Integration and testing
5. Documentation
6. Commit: \`feat: Add [feature name]\`

### Stop Conditions
- If complexity exceeds estimate significantly, stop and document why
- If tests fail and fix isn't obvious, stop and document
- If feature requires breaking changes, document and get approval first
")

Begin by reading the current project state.
EOF
)

for ((i=1; i<=ITERATIONS; i++)); do
    if [ "$ITERATIONS" -gt 1 ]; then
        echo ""
        echo "=================================="
        echo "Iteration $i of $ITERATIONS"
        echo "=================================="
    fi

    if [ "$TOOL" == "codex" ]; then
        codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
    else
        claude --dangerously-skip-permissions -p "$PROMPT"
    fi
done

echo ""
echo "=================================="
echo "Feature discovery complete!"
echo "=================================="
echo "Check docs/features/ROADMAP.md for discovered features."
if [ "$DISCOVER_ONLY" = false ]; then
    echo "Completed $ITERATIONS iteration(s)."
    echo "Run 'git log --oneline -10' to see implemented features."
fi
