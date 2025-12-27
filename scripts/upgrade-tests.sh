#!/bin/bash

# Test Suite Upgrade Script
# Runs Claude Code to improve test coverage iteratively
# Usage: ./scripts/upgrade-tests.sh [number_of_iterations] [--tool claude|codex] [--target backend|frontend]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
MAX_ITERATIONS=5
TOOL="claude"
TARGET="both"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    *)
      MAX_ITERATIONS="$1"
      shift
      ;;
  esac
done

echo "=================================="
echo "Test Suite Upgrade Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Target: $TARGET"
echo "Will run $MAX_ITERATIONS iterations of test improvements."
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo "=========================================="
    echo "Iteration $i of $MAX_ITERATIONS"
    echo "=========================================="
    echo ""

    PROMPT=$(cat <<EOF
You are an expert QA Engineer tasked with improving the test suite of Clump.

## Project Context
- **Backend:** Python/FastAPI in \`backend/app/\`
- **Frontend:** React/TypeScript in \`frontend/src/\`
- **Target for this run:** $TARGET

## Your Task

1. **Analyze Current State:**
   - Check if test directories exist (\`backend/tests/\`, \`frontend/src/__tests__/\`)
   - If no tests exist, create the test infrastructure first
   - Identify high-value untested components

2. **Select ONE Target:**
   Choose a specific file to test. Priority order:

   **Backend priorities:**
   - \`backend/app/services/\` - Core business logic
   - \`backend/app/routers/\` - API endpoints
   - \`backend/app/database.py\` - Data layer

   **Frontend priorities:**
   - \`frontend/src/hooks/\` - Custom React hooks
   - \`frontend/src/components/\` - UI components
   - API integration functions

3. **Create or Improve Tests:**

   **For Python (pytest):**
   - Create \`backend/tests/\` if needed
   - Add \`backend/tests/conftest.py\` with fixtures
   - Write tests in \`backend/tests/test_{module}.py\`
   - Use \`pytest-asyncio\` for async tests

   **For TypeScript (Vitest recommended):**
   - Set up Vitest if not present
   - Write tests covering happy paths, edge cases, and error handling
   - Mock external dependencies

4. **Bug Handling:**
   If tests reveal bugs in source code:
   - Verify the test is correct
   - Fix the bug in the source
   - Validate the fix with tests

5. **Verify:**
   - Python: \`cd backend && pytest\` (or install pytest first)
   - TypeScript: \`cd frontend && npm test\`

6. **Commit:**
   - \`test: Add tests for [component]\`
   - If bug fixed: \`fix: [description]\` with test info in body

## Guidelines
- Fix bugs when found - don't just skip failing tests
- Verification is mandatory before committing
- Start with the test infrastructure if it doesn't exist

Begin by checking what test infrastructure exists.
EOF
)

    if [ "$TOOL" == "codex" ]; then
        SUCCESS=0
        codex --dangerously-bypass-approvals-and-sandbox "$PROMPT" || SUCCESS=$?
    else
        SUCCESS=0
        claude --dangerously-skip-permissions -p "$PROMPT" || SUCCESS=$?
    fi

    if [ $SUCCESS -eq 0 ]; then
        echo ""
        echo "✓ Completed iteration $i"
    else
        EXIT_CODE=$SUCCESS
        echo ""
        echo "✗ Error in iteration $i (exit code: $EXIT_CODE)"
        if [ $EXIT_CODE -eq 130 ]; then
            echo "  Interrupted by user. Stopping."
            exit 130
        fi
        echo "  Continuing with next iteration..."
    fi

    echo ""
    echo "----------------------------------------"

done

echo ""
echo "=================================="
echo "All iterations complete!"
echo "=================================="
echo "Run 'git log --oneline -$MAX_ITERATIONS' to see recent commits."
