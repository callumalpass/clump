# Feature Roadmap

## Discovered Features (2025-12-27)

Based on a comprehensive analysis of the codebase, the following potential features have been identified.

### High Priority

| Feature | Value | Effort | Risk | Score | Description |
|---------|-------|--------|------|-------|-------------|
| Session Tab Names from Analysis Title | 5 | 1 | 1 | 125 | Session tabs show raw session IDs instead of meaningful titles. The analysis title is already available. |
| Keyboard Shortcut: Close Session | 4 | 1 | 1 | 100 | No keyboard shortcut to close terminal (Ctrl+D/Ctrl+W). Improves power user workflow. |
| Copy Session ID Button | 4 | 1 | 1 | 100 | Terminal header shows session ID but can't be copied. Useful for debugging/support. |
| Analysis Status Filter | 4 | 2 | 1 | 80 | Analysis list has no status filter (running/completed/failed). Already have the data. |
| Refresh Issues Button | 4 | 1 | 2 | 64 | No manual refresh for issues list. Only auto-refresh on filter change. |
| Empty Terminal State | 4 | 2 | 1 | 80 | When no session is active but sessions exist, no guidance shown. |
| Repo Delete Confirmation | 4 | 1 | 2 | 64 | RepoSelector has no way to delete repos. API exists but UI doesn't. |

### Medium Priority

| Feature | Value | Effort | Risk | Score | Description |
|---------|-------|--------|------|-------|-------------|
| Analysis Type Filter | 3 | 2 | 1 | 60 | Filter analyses by type (issue/custom/codebase). Backend already supports this. |
| Session Count Badge | 3 | 1 | 1 | 75 | Show running session count per issue in the list (already shows dot indicator). |
| Timestamp in Session Tabs | 3 | 1 | 1 | 75 | Show relative time (e.g., "5m ago") in session tabs for context. |
| Terminal Clear Button | 3 | 2 | 2 | 48 | No way to clear terminal output without restarting session. |
| Issue Link in Session Header | 3 | 1 | 1 | 75 | Terminal header could link back to the issue being analyzed. |
| Collapsible Comments | 3 | 2 | 1 | 60 | Long comment threads are hard to navigate in IssueDetail. |

### Lower Priority

| Feature | Value | Effort | Risk | Score | Description |
|---------|-------|--------|------|-------|-------------|
| PR Tab Implementation | 4 | 4 | 2 | 32 | PRs tab shows "coming soon". Needs PR-specific analysis prompts. |
| Dark/Light Theme Toggle | 2 | 3 | 2 | 16 | Single dark theme. Most dev tools are dark, low priority. |
| Analysis Export | 3 | 3 | 2 | 24 | Export analysis transcript to file (markdown/text). |
| Bulk Tag Operations | 2 | 3 | 2 | 16 | Apply/remove tags to multiple issues at once. |

### Future Considerations (Not Recommended Now)

| Feature | Why Not Now |
|---------|-------------|
| Webhook Integration | Requires external service setup, infra complexity |
| Multi-repo Analysis | Significant schema/UI changes needed |
| Custom Analysis Templates | Need to understand user patterns first |
| OAuth Login | Single-user app, PAT works fine |
| Real-time Collaboration | Adds significant complexity, single-user focus |

---

## Priority Scoring Formula

**Score = Value × (6 - Effort) × (6 - Risk)**

- **Value (1-5)**: How useful is this feature for typical workflows?
- **Effort (1-5)**: How much work to implement? (1=trivial, 5=major)
- **Risk (1-5)**: Could this break existing functionality? (1=safe, 5=risky)

---

## Implementation Notes

### Session Tab Names (Score: 125) - TOP PRIORITY

**Current State:**
- `SessionTabs.tsx` displays raw `session.id` (e.g., "abc123")
- Analysis title is available but not passed to SessionTabs
- Sessions have `analysis_id` which links to Analysis with `title`

**Proposed Solution:**
1. Modify `useSessions` to include analysis data or pass analyses to SessionTabs
2. Look up analysis title from session's `analysis_id`
3. Display truncated title with tooltip for full title
4. Fallback to "New Session" or session ID if no analysis linked

**Files to Change:**
- `frontend/src/components/SessionTabs.tsx`
- `frontend/src/App.tsx` (pass additional data)

**Estimated Changes:** ~20 lines

---

## Selected for Implementation

Based on the scoring and complexity analysis, the following feature will be implemented:

1. **Session Tab Names from Analysis Title** (Score: 125)
   - Highest value-to-effort ratio
   - Zero risk (purely additive UI change)
   - Improves usability significantly
