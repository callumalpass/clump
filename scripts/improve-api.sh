#!/bin/bash

# API Improvement Script
# Iteratively improves API design, documentation, and consistency
# Usage: ./scripts/improve-api.sh [number_of_iterations]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
MAX_ITERATIONS=3
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
echo "API Improvement Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Will run $MAX_ITERATIONS iterations of API improvements."
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo "=========================================="
    echo "Iteration $i of $MAX_ITERATIONS"
    echo "=========================================="
    echo ""

    PROMPT=$(cat <<'EOF'
You are improving the API design of Claude Code Hub.

## Project Context
- **API Location:** `backend/app/routers/`
- **Routers:**
  - `github.py` - GitHub repository and issue endpoints
  - `sessions.py` - PTY terminal session management
  - `analyses.py` - Analysis history and search
  - `settings.py` - Application settings
  - `headless.py` - Programmatic/headless analysis
  - `tags.py` - Analysis tagging

## Improvement Areas

### 1. OpenAPI Documentation
- Add/improve docstrings on all endpoints
- Include request/response examples
- Document query parameters properly
- Add meaningful operation IDs

### 2. Response Consistency
- Ensure consistent response schemas
- Use proper Pydantic models for all responses
- Standardize error response format
- Include appropriate HTTP status codes

### 3. Input Validation
- Add Pydantic validators where missing
- Provide helpful validation error messages
- Document constraints (min/max values, patterns)

### 4. Endpoint Design
- RESTful naming conventions
- Appropriate HTTP methods
- Logical resource nesting
- Pagination on list endpoints

### 5. Type Safety
- All parameters should have type hints
- Return types should be explicit
- Use Literal types for enums

## Your Task

1. **Analyze current API:**
   - Read through `backend/app/routers/`
   - Identify ONE improvement opportunity

2. **Select & Plan:**
   - Choose one router or one specific endpoint
   - Explain what you'll improve

3. **Implement:**
   - Make focused improvements
   - Keep backward compatibility if possible
   - Update any affected frontend code if necessary

4. **Verify:**
   - Check that FastAPI still starts: `cd backend && python -c "from app.main import app"`
   - Check OpenAPI docs render correctly (manual step)

5. **Commit:**
   - `api: [description of improvement]`

## Guidelines
- One improvement per iteration
- Don't change API behavior, only improve design/docs
- If behavior change is needed, document in commit message

Begin by analyzing the current API structure.
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
echo "Start the backend and visit /docs to see OpenAPI improvements."
