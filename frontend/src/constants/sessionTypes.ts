export interface SessionTypeConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  buildPrompt: (issue: { number: number; title: string; body: string }) => string;
}

export const SESSION_TYPES: SessionTypeConfig[] = [
  {
    id: 'fix-suggestion',
    name: 'Fix Suggestion',
    shortName: 'Fix',
    description: 'Analyze root cause and suggest a fix approach',
    buildPrompt: (issue) => `Please analyze this GitHub issue and suggest a fix approach:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Identify the root cause
2. Suggest a fix approach
3. Identify relevant files that may need to be changed`,
  },
  {
    id: 'search-related',
    name: 'Search Related Issues',
    shortName: 'Related',
    description: 'Find similar issues and patterns in the codebase',
    buildPrompt: (issue) => `Please search for related issues and context for this GitHub issue:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Search the codebase for similar patterns, error messages, or functionality
2. Look for any existing tests or documentation related to this area
3. Identify if there are similar past issues or recurring patterns
4. Summarize any related context that would help understand this issue`,
  },
  {
    id: 'explain-implementation',
    name: 'Explain Existing Implementation',
    shortName: 'Explain',
    description: 'Check if the feature already exists and explain current behavior',
    buildPrompt: (issue) => `Please analyze if the functionality described in this issue already exists:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Search the codebase for existing implementations of this functionality
2. If it exists, explain how the current implementation works
3. If it partially exists, describe what's implemented vs what's missing
4. Draft a comment explaining your findings (whether it exists, where to find it, or confirming it needs to be built)`,
  },
  {
    id: 'root-cause',
    name: 'Root Cause Analysis',
    shortName: 'Root Cause',
    description: 'Deep investigation into the underlying cause of a bug',
    buildPrompt: (issue) => `Please perform a deep root cause analysis for this bug:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Trace through the code paths that could lead to this behavior
2. Identify the root cause (not just symptoms)
3. Explain the chain of events that leads to the bug
4. Note any related issues this root cause might also affect
5. Suggest the minimal fix that addresses the root cause`,
  },
  {
    id: 'impact-assessment',
    name: 'Impact Assessment',
    shortName: 'Impact',
    description: 'Evaluate the scope and risk of changes needed',
    buildPrompt: (issue) => `Please assess the impact of addressing this issue:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Identify all files and components that would need to be changed
2. Assess the risk level of changes (low/medium/high) and why
3. Identify potential side effects or breaking changes
4. Note any tests that would need to be added or updated
5. Estimate the complexity (small/medium/large) with reasoning`,
  },
  {
    id: 'implementation-plan',
    name: 'Implementation Plan',
    shortName: 'Plan',
    description: 'Create a detailed step-by-step implementation plan',
    buildPrompt: (issue) => `Please create a detailed implementation plan for this issue:

Issue #${issue.number}: ${issue.title}

${issue.body}

Please:
1. Break down the work into specific, actionable steps
2. Order the steps logically (dependencies first)
3. For each step, identify the files to modify and what changes to make
4. Note any prerequisites or setup needed
5. Include testing steps and acceptance criteria`,
  },
];

export const DEFAULT_SESSION_TYPE: SessionTypeConfig = SESSION_TYPES[0]!;

export function getSessionType(id: string): SessionTypeConfig | undefined {
  return SESSION_TYPES.find(t => t.id === id);
}
