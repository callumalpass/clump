#!/bin/bash

# Auto-Triage Script
# Automatically triages GitHub issues by analyzing and labeling them
# Usage: ./scripts/auto-triage.sh --repo owner/name [--limit N] [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
REPO=""
LIMIT=10
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$REPO" ]; then
    echo "Usage: ./scripts/auto-triage.sh --repo owner/name [options]"
    echo ""
    echo "Options:"
    echo "  --repo OWNER/NAME   GitHub repository (required)"
    echo "  --limit N           Max issues to triage (default: 10)"
    echo "  --dry-run           Analyze but don't apply labels"
    echo ""
    echo "This script analyzes unlabeled issues and suggests/applies labels."
    exit 1
fi

echo "=================================="
echo "Auto-Triage Script"
echo "=================================="
echo "Repository: $REPO"
echo "Issue limit: $LIMIT"
echo "Dry run: $DRY_RUN"
echo ""

PROMPT=$(cat <<EOF
You are triaging GitHub issues for repository: $REPO

## Your Task

1. **Fetch unlabeled issues:**
   \`gh issue list --repo $REPO --state open --limit $LIMIT --json number,title,body,labels | jq '[.[] | select(.labels | length == 0)]'\`

2. **For each unlabeled issue, analyze and classify:**

   **Type labels (pick one):**
   - \`bug\` - Something isn't working correctly
   - \`enhancement\` - New feature or improvement request
   - \`question\` - Support/usage question
   - \`documentation\` - Docs need updating
   - \`chore\` - Maintenance, dependencies, tooling

   **Priority labels (pick one if clear):**
   - \`priority: critical\` - System down, data loss, security issue
   - \`priority: high\` - Major functionality broken
   - \`priority: medium\` - Important but not urgent
   - \`priority: low\` - Nice to have

   **Complexity labels (pick one if clear):**
   - \`good first issue\` - Simple, well-scoped, good for newcomers
   - \`help wanted\` - Could use community contribution
   - \`complex\` - Requires significant investigation/work

   **Area labels (pick any that apply):**
   - \`frontend\` - React/UI related
   - \`backend\` - Python/API related
   - \`performance\` - Speed/efficiency issue
   - \`security\` - Security related

3. **Apply labels:**
   $([ "$DRY_RUN" = true ] && echo "
   DRY RUN MODE: Don't actually apply labels. Just output what you would do in format:
   Issue #N: [label1, label2, ...]
   " || echo "
   For each issue, run:
   \`gh issue edit NUMBER --repo $REPO --add-label \"label1,label2\"\`
   ")

4. **Add triage comment (optional):**
   If the issue is unclear or needs more info:
   \`gh issue comment NUMBER --repo $REPO --body \"@author Could you provide more details about...\"\`

## Guidelines
- Be conservative with priority labels - only use critical/high if truly warranted
- \`good first issue\` should only be used for truly simple, well-documented tasks
- If you can't determine the type confidently, leave it unlabeled for human review
- Don't over-label - fewer, accurate labels are better than many guesses

Begin by fetching unlabeled issues.
EOF
)

if [ "$TOOL" == "codex" ]; then
    codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
else
    claude --dangerously-skip-permissions -p "$PROMPT"
fi

echo ""
echo "=================================="
echo "Auto-triage complete!"
echo "=================================="
