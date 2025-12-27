#!/bin/bash

# Type Synchronization Script
# Ensures frontend TypeScript types match backend Pydantic models
# Usage: ./scripts/sync-types.sh [--generate] [--check]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
MODE="check"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --generate)
      MODE="generate"
      shift
      ;;
    --check)
      MODE="check"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "Type Synchronization Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Mode: $MODE"
echo ""

PROMPT=$(cat <<EOF
You are synchronizing types between the backend and frontend of Claude Code Hub.

## Project Context
- **Backend models:** \`backend/app/models.py\` (SQLAlchemy/Pydantic)
- **Backend routers:** \`backend/app/routers/*.py\` (response schemas)
- **Frontend types:** \`frontend/src/types.ts\`
- **Mode:** $MODE

## Your Task

### If mode is "check":
1. Read \`backend/app/models.py\` to understand database models
2. Read each router in \`backend/app/routers/\` to find response schemas
3. Read \`frontend/src/types.ts\` to see current frontend types
4. **Compare and identify mismatches:**
   - Missing types in frontend
   - Extra/unused types in frontend
   - Field name mismatches (snake_case vs camelCase)
   - Type mismatches (string vs number, etc.)
   - Optional vs required differences
5. **Generate a report** listing all discrepancies
6. Don't make any changes in check mode

### If mode is "generate":
1. Analyze backend models and API responses
2. **Generate updated \`frontend/src/types.ts\`** that matches backend exactly
3. **Naming conventions:**
   - Backend uses snake_case
   - Frontend should match (React typically uses camelCase, but matching backend avoids transformation)
   - Or add transformation utilities if the project uses camelCase
4. **Type mappings:**
   - Python \`str\` → TypeScript \`string\`
   - Python \`int\`/\`float\` → TypeScript \`number\`
   - Python \`bool\` → TypeScript \`boolean\`
   - Python \`Optional[X]\` → TypeScript \`X | null\`
   - Python \`list[X]\` → TypeScript \`X[]\`
   - Python \`dict\` → TypeScript \`Record<string, unknown>\`
   - Python \`datetime\` → TypeScript \`string\` (ISO format)
5. **Verify frontend still builds:** \`cd frontend && npm run build\`
6. **Commit:** \`chore: Sync frontend types with backend models\`

## Type Categories to Check

1. **Repository types** - Repo, RepoCreate, RepoWithStats
2. **Issue types** - Issue, IssueDetail, Comment
3. **Session types** - Session, SessionCreate
4. **Analysis types** - Analysis, AnalysisCreate, AnalysisUpdate
5. **Settings types** - Settings, SettingsUpdate
6. **Tag types** - Tag, TagCreate

## Guidelines
- Prefer keeping types in sync over having separate schemas
- If transformation is needed, do it at the API boundary
- Document any intentional differences with comments
- Include JSDoc comments for complex types

Begin by reading the backend models and routers.
EOF
)

if [ "$TOOL" == "codex" ]; then
    codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
else
    claude --dangerously-skip-permissions -p "$PROMPT"
fi

echo ""
echo "=================================="
echo "Type synchronization complete!"
echo "=================================="
