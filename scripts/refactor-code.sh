#!/bin/bash

# Code Refactoring Script
# Runs Claude Code to identify and fix technical debt iteratively
# Usage: ./scripts/refactor-code.sh [number_of_iterations] [--tool claude|codex]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
MAX_ITERATIONS=5
TOOL="claude"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    *)
      MAX_ITERATIONS="$1"
      shift
      ;;
  esac
done

echo "=================================="
echo "Code Refactoring Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Will run $MAX_ITERATIONS iterations of code improvements."
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo "=========================================="
    echo "Iteration $i of $MAX_ITERATIONS"
    echo "=========================================="
    echo ""

    PROMPT=$(cat <<'EOF'
Your goal is to pay down technical debt by refactoring code to be cleaner, safer, and more idiomatic.

## Project Context
This is Claude Code Hub - a web app with:
- **Backend:** Python/FastAPI in `backend/app/`
- **Frontend:** React/TypeScript in `frontend/src/`

## Your Task

1. **Hunt for Code Smells:**
   Scan the codebase for *one* specific issue to fix. Good targets include:

   **Python (backend/app/):**
   - Missing type hints on function parameters/returns
   - Long functions (>50 lines) that should be split
   - Duplicate code across routers
   - Missing error handling or overly broad exception catching
   - Inconsistent naming conventions
   - Magic strings or numbers

   **TypeScript (frontend/src/):**
   - Usage of `any` types or `// @ts-ignore`
   - Components over 200 lines that should be split
   - Missing prop type definitions
   - Duplicate logic between components
   - Inconsistent state management patterns
   - Legacy patterns that could be modernized

2. **Select & Plan:**
   - Choose **one** file and **one** specific problem
   - Small, atomic refactors are best
   - Explain your choice (e.g., "Refactoring `backend/app/routers/sessions.py` to add type hints")

3. **Refactor:**
   - Apply your changes
   - Preserve the *behavior* of the code
   - Improve names, types, and structure where possible

4. **Verify:**
   - For Python: Run `cd backend && python -m py_compile app/main.py` to check syntax
   - For TypeScript: Run `cd frontend && npm run build` to check types
   - If you break something, fix it or revert

5. **Commit:**
   - Stage changes: `git add .`
   - Commit with: `refactor: [description]`

## Guidelines
- **Safety First:** If unsure what code does, leave it alone or add tests first
- **Atomic Commits:** One improvement per iteration
- **Do not** change business logic or features, only internal structure/quality

Begin by scanning the codebase for candidates.
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
