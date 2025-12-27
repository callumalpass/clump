#!/bin/bash

# Code Review Script
# Runs Claude Code to perform comprehensive code review and generate reports
# Usage: ./scripts/review-code.sh [--file path] [--scope backend|frontend|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
SCOPE="all"
TARGET_FILE=""

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
    --file)
      TARGET_FILE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "Code Review Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Scope: $SCOPE"
if [ -n "$TARGET_FILE" ]; then
    echo "Target file: $TARGET_FILE"
fi
echo ""

PROMPT=$(cat <<EOF
You are performing a comprehensive code review of Clump.

## Project Context
- **Backend:** Python/FastAPI in \`backend/app/\`
- **Frontend:** React/TypeScript in \`frontend/src/\`
- **Review scope:** $SCOPE
$([ -n "$TARGET_FILE" ] && echo "- **Specific file:** $TARGET_FILE")

## Review Checklist

### Security
- [ ] No hardcoded secrets or API keys
- [ ] Input validation on all endpoints
- [ ] Proper authentication/authorization checks
- [ ] No SQL injection vulnerabilities (parameterized queries)
- [ ] No XSS vulnerabilities (proper escaping)
- [ ] CORS configured appropriately

### Code Quality
- [ ] Functions are focused and not too long
- [ ] Clear naming conventions
- [ ] Appropriate error handling
- [ ] No dead code or unused imports
- [ ] Consistent code style

### Architecture
- [ ] Clear separation of concerns
- [ ] Appropriate abstraction levels
- [ ] No circular dependencies
- [ ] Efficient data flow

### Performance
- [ ] No N+1 query patterns
- [ ] Appropriate caching opportunities
- [ ] No unnecessary re-renders (React)
- [ ] Efficient async patterns

### Documentation
- [ ] Complex logic has comments
- [ ] Public APIs are documented
- [ ] README is up to date

## Your Task

1. **Scan the codebase** within the specified scope
2. **Create a review report** at \`docs/reviews/code-review-\$(date +%Y%m%d).md\`
3. **For each issue found:**
   - Severity: Critical / High / Medium / Low
   - Category: Security / Quality / Performance / etc.
   - Location: File and line number
   - Description: What's wrong
   - Recommendation: How to fix it

4. **Summary section** with:
   - Total issues by severity
   - Top 3 priority items
   - Overall health assessment

5. **Optionally fix** any Critical or High severity issues found
6. **Commit** with: \`docs: Add code review for $(date +%Y-%m-%d)\`

Create the docs/reviews/ directory if needed.

Begin the review now.
EOF
)

if [ "$TOOL" == "codex" ]; then
    codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
else
    claude --dangerously-skip-permissions -p "$PROMPT"
fi

echo ""
echo "=================================="
echo "Code review complete!"
echo "=================================="
echo "Check docs/reviews/ for the review report."
