#!/bin/bash

# Security Audit Script
# Performs comprehensive security analysis of the codebase
# Usage: ./scripts/security-audit.sh [--fix] [--scope backend|frontend|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Default values
TOOL="claude"
FIX_ISSUES=false
SCOPE="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --fix)
      FIX_ISSUES=true
      shift
      ;;
    --scope)
      SCOPE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "=================================="
echo "Security Audit Script"
echo "=================================="
echo "Using tool: $TOOL"
echo "Scope: $SCOPE"
echo "Auto-fix enabled: $FIX_ISSUES"
echo ""

PROMPT=$(cat <<EOF
You are performing a security audit of Clump.

## Project Context
- **Backend:** Python/FastAPI in \`backend/app/\`
- **Frontend:** React/TypeScript in \`frontend/src/\`
- **Scope:** $SCOPE
- **Auto-fix mode:** $FIX_ISSUES

## Security Audit Checklist

### Authentication & Authorization
- [ ] All sensitive endpoints require authentication
- [ ] GitHub tokens are stored securely
- [ ] No credentials in source code or logs
- [ ] Proper session management

### Input Validation
- [ ] All user inputs are validated
- [ ] Path traversal protection on file operations
- [ ] SQL injection prevention (parameterized queries)
- [ ] Command injection prevention
- [ ] XSS prevention in frontend

### API Security
- [ ] CORS configured correctly (not too permissive)
- [ ] Rate limiting consideration
- [ ] Proper error messages (no sensitive info leakage)
- [ ] Request size limits

### Data Security
- [ ] Sensitive data not logged
- [ ] Database has proper access controls
- [ ] No sensitive data in error responses

### Dependency Security
- [ ] Check for known vulnerabilities in dependencies
- [ ] Python: \`pip-audit\` or \`safety check\`
- [ ] Node.js: \`npm audit\`

### Process Security (PTY/Shell)
- [ ] Command execution is properly sandboxed
- [ ] No shell injection via user input
- [ ] Environment variables are sanitized

## Your Task

1. **Scan the codebase** for security issues
2. **Run dependency audits:**
   - \`cd backend && pip-audit 2>/dev/null || pip install pip-audit && pip-audit\`
   - \`cd frontend && npm audit\`
3. **Create a security report** at \`docs/security/audit-\$(date +%Y%m%d).md\`
4. **For each issue found:**
   - Severity: Critical / High / Medium / Low
   - OWASP category (if applicable)
   - Location: File and line number
   - Description: What's vulnerable
   - Exploitation: How it could be exploited
   - Remediation: How to fix it
   - Status: Open / Fixed (if --fix was used)

$([ "$FIX_ISSUES" = true ] && echo "
5. **Fix Critical and High severity issues:**
   - Apply fixes directly
   - Document what was changed
   - Commit with: \`security: Fix [vulnerability type]\`
")

6. **Summary section** with:
   - Total vulnerabilities by severity
   - Dependency audit results
   - Overall security posture assessment
   - Recommendations for future hardening

Create the docs/security/ directory if needed.

Begin the audit now.
EOF
)

if [ "$TOOL" == "codex" ]; then
    codex --dangerously-bypass-approvals-and-sandbox "$PROMPT"
else
    claude --dangerously-skip-permissions -p "$PROMPT"
fi

echo ""
echo "=================================="
echo "Security audit complete!"
echo "=================================="
echo "Check docs/security/ for the audit report."
