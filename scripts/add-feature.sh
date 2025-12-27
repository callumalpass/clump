#!/bin/bash

# Feature Addition Script
# Guided feature implementation with planning and review phases
# Usage: ./scripts/add-feature.sh "feature description"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
FEATURE_DESC=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    *)
      FEATURE_DESC="$1"
      shift
      ;;
  esac
done

if [ -z "$FEATURE_DESC" ]; then
    echo "Usage: ./scripts/add-feature.sh \"feature description\""
    echo ""
    echo "Example:"
    echo "  ./scripts/add-feature.sh \"Add dark mode toggle to the UI\""
    echo "  ./scripts/add-feature.sh \"Add rate limiting to API endpoints\""
    exit 1
fi

echo "=================================="
echo "Feature Addition Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Feature: $FEATURE_DESC"
echo ""

PROMPT=$(cat <<EOF
You are implementing a new feature for Clump.

## Feature Request
$FEATURE_DESC

## Project Context
- **Backend:** Python/FastAPI in \`backend/app/\`
  - Routers: \`backend/app/routers/\` - API endpoints
  - Services: \`backend/app/services/\` - Business logic
  - Models: \`backend/app/models.py\` - Database models
  - Database: SQLite via aiosqlite

- **Frontend:** React/TypeScript in \`frontend/src/\`
  - Components: \`frontend/src/components/\`
  - Hooks: \`frontend/src/hooks/\`
  - Types: \`frontend/src/types.ts\`

## Implementation Process

### Phase 1: Research & Plan
1. **Understand the request** - What exactly is being asked?
2. **Explore the codebase** - Find related existing code
3. **Identify changes needed:**
   - New files to create
   - Existing files to modify
   - API changes
   - Database schema changes
4. **Write a plan** - Create \`docs/features/$(echo "$FEATURE_DESC" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 30).md\`

### Phase 2: Implementation
1. **Backend first** (if needed):
   - Add any new models
   - Create/update services
   - Add/update API endpoints

2. **Frontend second** (if needed):
   - Add types for new data
   - Create/update components
   - Add/update hooks
   - Update App.tsx if needed

3. **Integration:**
   - Ensure frontend calls correct endpoints
   - Handle loading and error states
   - Add appropriate UI feedback

### Phase 3: Testing & Verification
1. **Test the feature manually** if possible
2. **Add automated tests** for critical paths
3. **Run existing tests** to check for regressions

### Phase 4: Documentation & Commit
1. **Update README.md** if needed
2. **Create feature branch:** \`git checkout -b feature/$(echo "$FEATURE_DESC" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | head -c 20)\`
3. **Commit with:** \`feat: $FEATURE_DESC\`
4. **Create PR** if on a branch

## Guidelines
- Follow existing code patterns
- Keep changes focused on the feature
- Don't refactor unrelated code
- Add comments for complex logic
- Consider error handling and edge cases

Begin by exploring the codebase to understand where changes are needed.
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
echo "Run 'git log --oneline -5' to see recent commits."
echo "Run 'git status' to see any uncommitted changes."
