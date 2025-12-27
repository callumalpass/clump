#!/bin/bash

# UI/UX Refinement Script
# Explores the frontend and implements UI/UX improvements autonomously
# Usage: ./scripts/refine-ui.sh [--passes N] [--tool TOOL]
#   --passes N        Number of refinement passes (default: 1)
#   --tool TOOL       Use 'claude' or 'codex' (default: claude)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
PASS_COUNT=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --passes)
      PASS_COUNT="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "UI/UX Refinement Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Refinement passes: $PASS_COUNT"
echo ""

PROMPT=$(cat <<EOF
You are improving Clump's user interface and experience.

## Project Context
Clump is a local web application for:
- Triaging GitHub issues
- Running AI analyses through Claude Code CLI
- Managing multiple terminal sessions
- Storing and searching analysis history

**Frontend Stack:**
- React 18 with TypeScript
- Tailwind CSS for styling
- Radix UI primitives
- xterm.js for terminal emulation

**Key Frontend Files:**
- \`frontend/src/App.tsx\` - Main layout and routing
- \`frontend/src/components/\` - React components
- \`frontend/src/types.ts\` - TypeScript interfaces

## Your Task
Explore the frontend codebase and implement 1 UI/UX improvement.

**Focus Areas:**
- Visual consistency and polish
- Better loading states and feedback
- Improved empty states
- Clearer visual hierarchy
- Better use of spacing and typography
- Subtle animations or transitions
- Accessibility improvements
- Responsive design fixes

**AVOID changes that:**
- Require new npm dependencies
- Change backend APIs
- Alter core functionality
- Add complex new features

**PREFER changes that:**
- Use existing Tailwind utilities
- Improve visual consistency
- Add micro-interactions
- Fix obvious UI rough edges
- Enhance existing components

## Implementation Guidelines

1. **Explore first** - Read components to understand the current UI patterns
2. **Stay consistent** - Match existing styles and conventions
3. **Test your changes:**
   - Run: \`cd frontend && npm run build\`
4. **Commit each improvement:** \`git commit -m "ui: [description]"\`
5. **If the build fails**, revert and try something else

Begin by exploring the frontend components.
EOF
)

for i in $(seq 1 $PASS_COUNT); do
    echo "----------------------------------"
    echo "Refinement pass $i of $PASS_COUNT"
    echo "----------------------------------"
    echo ""

    if [ "$TOOL" == "codex" ]; then
        codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
    else
        claude --dangerously-skip-permissions -p "$PROMPT"
    fi

    echo ""
    echo "Pass $i complete!"
    echo ""
done

echo ""
echo "=================================="
echo "All $PASS_COUNT refinement pass(es) complete!"
echo "=================================="
echo "Run 'git log --oneline -$((PASS_COUNT + 2))' to see UI improvements."
