#!/bin/bash

# End-to-End Test Script
# Creates and runs E2E tests for critical user journeys
# Usage: ./scripts/e2e-test.sh [number_of_iterations] [--setup]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
MAX_ITERATIONS=3
TOOL="claude"
SETUP_ONLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --setup)
      SETUP_ONLY=true
      shift
      ;;
    *)
      MAX_ITERATIONS="$1"
      shift
      ;;
  esac
done

echo "=================================="
echo "End-to-End Test Script"
echo "=================================="
echo "Using tool: $TOOL"
if [ "$SETUP_ONLY" = true ]; then
    echo "Mode: Setup only"
else
    echo "Will run $MAX_ITERATIONS iterations of E2E test creation."
fi
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo "=========================================="
    echo "Iteration $i of $MAX_ITERATIONS"
    echo "=========================================="
    echo ""

    PROMPT=$(cat <<EOF
You are creating end-to-end tests for Claude Code Hub.

## Project Context
- **Backend:** Python/FastAPI at http://localhost:8000
- **Frontend:** React at http://localhost:5173
- **Test Framework:** Playwright (recommended) or Cypress

## Setup Mode: $SETUP_ONLY

$([ "$SETUP_ONLY" = true ] && echo "
### First-Time Setup
1. Install Playwright in frontend:
   \`\`\`bash
   cd frontend
   npm install -D @playwright/test
   npx playwright install
   \`\`\`

2. Create \`frontend/playwright.config.ts\`

3. Create \`frontend/e2e/\` directory structure

4. Add npm scripts to package.json:
   - \`\"test:e2e\": \"playwright test\"\`
   - \`\"test:e2e:ui\": \"playwright test --ui\"\`

5. Create a sample test to verify setup works

Then stop - don't create more tests in setup mode.
" || echo "
### Test Creation
1. Check what E2E tests already exist in \`frontend/e2e/\`
2. Identify the next critical user journey to test
")

## Critical User Journeys (priority order)
1. **Repository Setup Flow**
   - Add a new repository
   - See repository in list
   - Select repository

2. **Issue Browsing Flow**
   - Navigate to issues tab
   - Filter issues by label/state
   - View issue details
   - See comment thread

3. **Analysis Session Flow**
   - Start analysis on an issue
   - See terminal appear
   - Type in terminal
   - View analysis history

4. **Multi-Session Flow**
   - Create multiple terminal sessions
   - Switch between tabs
   - Close a session

5. **Settings Flow**
   - Access settings
   - Modify a setting
   - Verify persistence

## Your Task

$([ "$SETUP_ONLY" = true ] && echo "
Set up Playwright testing infrastructure only.
" || echo "
1. **Check existing tests** in \`frontend/e2e/\`
2. **Choose the next journey** to test
3. **Write comprehensive test:**
   - Test happy path
   - Test error states
   - Test loading states
   - Use proper selectors (data-testid preferred)
4. **Run the test** (may need services running)
5. **Commit:** \`test(e2e): Add [journey] test\`
")

## Guidelines
- Tests should be independent and repeatable
- Use meaningful test descriptions
- Add data-testid attributes to components if needed
- Mock external services when appropriate

Begin now.
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

    if [ "$SETUP_ONLY" = true ]; then
        break
    fi

    echo ""
    echo "----------------------------------------"

done

echo ""
echo "=================================="
echo "E2E test creation complete!"
echo "=================================="
echo "Run 'cd frontend && npm run test:e2e' to run E2E tests."
