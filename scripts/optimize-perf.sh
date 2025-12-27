#!/bin/bash

# Performance Optimization Script
# Identifies and fixes performance bottlenecks
# Usage: ./scripts/optimize-perf.sh [number_of_iterations] [--scope backend|frontend|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
MAX_ITERATIONS=3
TOOL="claude"
SCOPE="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    *)
      MAX_ITERATIONS="$1"
      shift
      ;;
  esac
done

echo "=================================="
echo "Performance Optimization Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Scope: $SCOPE"
echo "Will run $MAX_ITERATIONS iterations of optimizations."
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    echo "=========================================="
    echo "Iteration $i of $MAX_ITERATIONS"
    echo "=========================================="
    echo ""

    PROMPT=$(cat <<EOF
You are optimizing the performance of Clump.

## Project Context
- **Backend:** Python/FastAPI in \`backend/app/\`
- **Frontend:** React/TypeScript in \`frontend/src/\`
- **Scope for this run:** $SCOPE

## Performance Checklist

### Backend (Python/FastAPI)
- [ ] **Database queries:** N+1 problems, missing indexes, unoptimized queries
- [ ] **Async patterns:** Blocking calls in async functions, missing \`await\`
- [ ] **Memory leaks:** Objects not being cleaned up, growing caches
- [ ] **Startup time:** Slow imports, unnecessary initialization
- [ ] **API response size:** Unnecessary data in responses
- [ ] **Connection pooling:** Efficient reuse of connections

### Frontend (React)
- [ ] **Unnecessary re-renders:** Missing memo, useMemo, useCallback
- [ ] **Large bundles:** Unused imports, missing code splitting
- [ ] **State updates:** Batching, avoiding cascading updates
- [ ] **List performance:** Missing keys, virtualization for long lists
- [ ] **Network:** Caching API responses, avoiding duplicate requests
- [ ] **Images/Assets:** Proper sizing, lazy loading

## Your Task

1. **Identify ONE performance issue:**
   - Analyze the codebase within scope
   - Look for patterns from the checklist above
   - Explain what you found and why it's a problem

2. **Measure (if possible):**
   - Note the before state
   - What would you expect after optimization?

3. **Optimize:**
   - Make focused changes
   - Don't refactor unrelated code
   - Prefer simple solutions

4. **Verify:**
   - Ensure no regressions
   - Backend: \`cd backend && python -m py_compile app/main.py\`
   - Frontend: \`cd frontend && npm run build\`

5. **Commit:**
   - \`perf: [description of optimization]\`

## Examples of Good Optimizations

**Backend:**
- Add database index for frequently queried column
- Use \`select_related()\` to avoid N+1 queries
- Add response caching with appropriate TTL
- Replace synchronous file I/O with async

**Frontend:**
- Add useMemo to expensive computations
- Split large component into lazy-loaded chunks
- Add React.memo to frequently re-rendered components
- Implement virtual scrolling for long lists

## Guidelines
- One optimization per iteration
- Don't premature optimize - focus on actual bottlenecks
- Measure before and after when possible
- Document the optimization in the commit message

Begin by analyzing the codebase for performance issues.
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
