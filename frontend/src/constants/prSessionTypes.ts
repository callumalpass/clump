export interface PRSessionTypeConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  buildPrompt: (pr: { number: number; title: string; body: string; head_ref: string; base_ref: string }) => string;
}

export const PR_SESSION_TYPES: PRSessionTypeConfig[] = [
  {
    id: 'review-changes',
    name: 'Review Changes',
    shortName: 'Review',
    description: 'Review the code changes and provide feedback',
    buildPrompt: (pr) => `Please review this pull request:

PR #${pr.number}: ${pr.title}
Branch: ${pr.head_ref} -> ${pr.base_ref}

${pr.body || 'No description provided.'}

Please:
1. Examine the code changes in this PR
2. Look for potential bugs, security issues, or code quality problems
3. Check if the changes follow the codebase patterns and conventions
4. Provide constructive feedback on the implementation
5. Suggest any improvements or alternative approaches`,
  },
  {
    id: 'test-coverage',
    name: 'Test Coverage',
    shortName: 'Tests',
    description: 'Analyze test coverage and suggest missing tests',
    buildPrompt: (pr) => `Please analyze test coverage for this pull request:

PR #${pr.number}: ${pr.title}
Branch: ${pr.head_ref} -> ${pr.base_ref}

${pr.body || 'No description provided.'}

Please:
1. Identify what code changes are being made
2. Check if there are corresponding test changes
3. Identify any untested code paths or edge cases
4. Suggest specific tests that should be added
5. Check if existing tests might be affected by these changes`,
  },
  {
    id: 'security-review',
    name: 'Security Review',
    shortName: 'Security',
    description: 'Check for security vulnerabilities and risks',
    buildPrompt: (pr) => `Please perform a security review of this pull request:

PR #${pr.number}: ${pr.title}
Branch: ${pr.head_ref} -> ${pr.base_ref}

${pr.body || 'No description provided.'}

Please:
1. Look for common security vulnerabilities (injection, XSS, CSRF, etc.)
2. Check for exposed secrets, hardcoded credentials, or sensitive data
3. Review authentication and authorization changes
4. Identify any insecure configurations or dependencies
5. Provide specific recommendations to address any issues found`,
  },
  {
    id: 'understand-changes',
    name: 'Understand Changes',
    shortName: 'Explain',
    description: 'Explain what the PR changes and why',
    buildPrompt: (pr) => `Please help me understand this pull request:

PR #${pr.number}: ${pr.title}
Branch: ${pr.head_ref} -> ${pr.base_ref}

${pr.body || 'No description provided.'}

Please:
1. Summarize the main changes in this PR
2. Explain the purpose and motivation behind the changes
3. Describe how the changes affect the overall system
4. Highlight any breaking changes or important considerations
5. Create a clear explanation suitable for code review`,
  },
  {
    id: 'merge',
    name: 'Merge PR',
    shortName: 'Merge',
    description: 'Prepare and merge this pull request',
    buildPrompt: (pr) => `Please help me merge this pull request:

PR #${pr.number}: ${pr.title}
Branch: ${pr.head_ref} -> ${pr.base_ref}

${pr.body || 'No description provided.'}

Please:
1. Check out the PR branch and ensure it's up to date
2. Check for any merge conflicts with the base branch
3. If there are conflicts, resolve them appropriately
4. Verify the build passes and tests succeed
5. Merge the PR into ${pr.base_ref}`,
  },
];

export const DEFAULT_PR_SESSION_TYPE: PRSessionTypeConfig = PR_SESSION_TYPES[0]!;

export function getPRSessionType(id: string): PRSessionTypeConfig | undefined {
  return PR_SESSION_TYPES.find(t => t.id === id);
}
