#!/bin/bash

# Batch Issue Analysis Script
# Analyzes multiple GitHub issues using Claude Code's headless mode
# Usage: ./scripts/batch-analyze.sh --repo owner/name [--label LABEL] [--limit N] [--prompt "custom prompt"]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
REPO=""
LABEL=""
LIMIT=5
CUSTOM_PROMPT=""
OUTPUT_DIR="analyses"

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
    --label)
      LABEL="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --prompt)
      CUSTOM_PROMPT="$2"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$REPO" ]; then
    echo "Usage: ./scripts/batch-analyze.sh --repo owner/name [options]"
    echo ""
    echo "Options:"
    echo "  --repo OWNER/NAME   GitHub repository (required)"
    echo "  --label LABEL       Filter issues by label"
    echo "  --limit N           Max issues to analyze (default: 5)"
    echo "  --prompt TEXT       Custom analysis prompt"
    echo "  --output DIR        Output directory (default: analyses)"
    echo ""
    echo "Examples:"
    echo "  ./scripts/batch-analyze.sh --repo anthropics/claude-code --label bug --limit 10"
    echo "  ./scripts/batch-analyze.sh --repo myorg/myapp --prompt 'Estimate complexity and suggest implementation approach'"
    exit 1
fi

echo "=================================="
echo "Batch Issue Analysis Script"
echo "=================================="
echo "Repository: $REPO"
echo "Label filter: ${LABEL:-none}"
echo "Issue limit: $LIMIT"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build gh command
GH_CMD="gh issue list --repo $REPO --state open --limit $LIMIT --json number,title,body,labels"
if [ -n "$LABEL" ]; then
    GH_CMD="$GH_CMD --label \"$LABEL\""
fi

echo "Fetching issues from GitHub..."
ISSUES=$($GH_CMD 2>/dev/null || echo "[]")

if [ "$ISSUES" = "[]" ]; then
    echo "No issues found matching criteria."
    exit 0
fi

ISSUE_COUNT=$(echo "$ISSUES" | jq length)
echo "Found $ISSUE_COUNT issues to analyze."
echo ""

# Default analysis prompt
if [ -z "$CUSTOM_PROMPT" ]; then
    CUSTOM_PROMPT="Analyze this GitHub issue and provide:
1. Summary of the problem
2. Potential root causes
3. Files likely involved
4. Suggested fix approach
5. Estimated complexity (Low/Medium/High)
6. Any clarifying questions needed"
fi

# Process each issue
echo "$ISSUES" | jq -c '.[]' | while read -r issue; do
    NUMBER=$(echo "$issue" | jq -r '.number')
    TITLE=$(echo "$issue" | jq -r '.title')
    BODY=$(echo "$issue" | jq -r '.body // "No description provided."')
    LABELS=$(echo "$issue" | jq -r '[.labels[].name] | join(", ")')

    echo "=========================================="
    echo "Analyzing Issue #$NUMBER: $TITLE"
    echo "Labels: ${LABELS:-none}"
    echo "=========================================="

    OUTPUT_FILE="$OUTPUT_DIR/issue-$NUMBER-analysis.md"

    # Create the analysis prompt
    PROMPT=$(cat <<EOF
Analyze the following GitHub issue from repository $REPO.

## Issue #$NUMBER: $TITLE

**Labels:** ${LABELS:-none}

**Description:**
$BODY

---

$CUSTOM_PROMPT

Write your analysis in a structured format.
EOF
)

    # Run Claude in headless mode
    echo "Running analysis..."
    if [ "$TOOL" == "codex" ]; then
        ANALYSIS=$(codex -p "$PROMPT" 2>&1) || true
    else
        ANALYSIS=$(claude -p "$PROMPT" --output-format text 2>&1) || true
    fi

    # Save the analysis
    cat > "$OUTPUT_FILE" <<EOF
# Analysis: Issue #$NUMBER

**Repository:** $REPO
**Issue:** $TITLE
**Labels:** ${LABELS:-none}
**Analyzed:** $(date +"%Y-%m-%d %H:%M:%S")

---

$ANALYSIS
EOF

    echo "✓ Analysis saved to $OUTPUT_FILE"
    echo ""
done

echo "=================================="
echo "Batch analysis complete!"
echo "=================================="
echo "Results saved to $OUTPUT_DIR/"
echo ""
echo "Summary:"
ls -la "$OUTPUT_DIR"/issue-*-analysis.md 2>/dev/null | wc -l
echo "analyses created."
