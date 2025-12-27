#!/bin/bash

# Issue Fixer Script
# Uses Claude Code to automatically fix GitHub issues from this project's repo
# Usage: ./scripts/fix-issues.sh [--issue NUMBER] [--label LABEL] [--max COUNT]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
ISSUE_NUMBER=""
LABEL="bug"
MAX_ISSUES=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --issue)
      ISSUE_NUMBER="$2"
      shift 2
      ;;
    --label)
      LABEL="$2"
      shift 2
      ;;
    --max)
      MAX_ISSUES="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "GitHub Issue Fixer Script"
echo "=================================="
echo "Using tool: $TOOL"
if [ -n "$ISSUE_NUMBER" ]; then
    echo "Target issue: #$ISSUE_NUMBER"
else
    echo "Label filter: $LABEL"
    echo "Max issues to fix: $MAX_ISSUES"
fi
echo ""

if [ -n "$ISSUE_NUMBER" ]; then
    ISSUE_SELECTOR="Fetch and fix issue #$ISSUE_NUMBER"
else
    ISSUE_SELECTOR="List open issues with label '$LABEL' using \`gh issue list --label \"$LABEL\" --limit $MAX_ISSUES\`. Pick the highest priority one."
fi

PROMPT=$(cat <<EOF
You are fixing GitHub issues for the Claude Code Hub project.

## Project Context
- **Backend:** Python/FastAPI in \`backend/app/\`
- **Frontend:** React/TypeScript in \`frontend/src/\`
- **GitHub repo:** Use \`gh\` CLI to interact with issues

## Your Task

1. **Get Issue Details:**
   $ISSUE_SELECTOR

   Read the full issue with \`gh issue view NUMBER\`

2. **Understand the Problem:**
   - What is the expected behavior?
   - What is the actual behavior?
   - Are there reproduction steps?
   - Are there related issues or PRs?

3. **Investigate:**
   - Search the codebase for relevant code
   - Understand the current implementation
   - Identify the root cause

4. **Implement Fix:**
   - Make the minimum changes needed
   - Follow existing code patterns
   - Add comments if logic is non-obvious

5. **Test:**
   - If tests exist, run them
   - If the fix needs tests, add them
   - Manually verify if possible

6. **Create PR:**
   - Create a branch: \`git checkout -b fix/issue-NUMBER\`
   - Commit with: \`fix: [description] (closes #NUMBER)\`
   - Push and create PR: \`gh pr create --title "Fix: [description]" --body "Closes #NUMBER\\n\\n## Changes\\n..."\`

7. **Link Issue:**
   - Add a comment to the issue explaining the fix
   - \`gh issue comment NUMBER --body "Fixed in PR #..."\`

## Guidelines
- If the issue is unclear, add a comment asking for clarification instead of guessing
- If the fix is risky or large, create a draft PR for review
- Don't close the issue manually - let "closes #N" do it

Begin by fetching issue details.
EOF
)

if [ "$TOOL" == "codex" ]; then
    codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
else
    claude --dangerously-skip-permissions -p "$PROMPT"
fi

echo ""
echo "=================================="
echo "Issue fixing complete!"
echo "=================================="
