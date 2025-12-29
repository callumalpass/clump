/**
 * Shared test fixture factories for creating mock objects.
 *
 * Usage:
 *   import { createMockSession, createMockIssue } from '../test/fixtures';
 *
 *   const session = createMockSession({ is_active: true });
 *   const issue = createMockIssue({ number: 42 });
 */

import type {
  SessionSummary,
  SessionDetail,
  TranscriptMessage,
  Issue,
  PR,
  Process,
  Tag,
  CommandMetadata,
  EntityLink,
} from '../types';

/**
 * Creates a mock SessionSummary with sensible defaults.
 * All defaults can be overridden by passing partial values.
 */
export function createMockSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: 'session-1',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    repo_name: 'owner/test-repo',
    title: 'Test Session',
    model: 'claude-3-sonnet',
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    message_count: 5,
    modified_at: '2024-01-15T10:35:00Z',
    file_size: 1024,
    entities: [],
    tags: [],
    starred: false,
    is_active: false,
    ...overrides,
  };
}

/**
 * Creates a mock SessionDetail with sensible defaults.
 * Includes a basic two-message transcript by default.
 */
export function createMockSessionDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session_id: 'session-uuid-123',
    encoded_path: '-home-user-projects-test',
    repo_path: '/home/user/projects/test',
    repo_name: 'owner/test-repo',
    messages: [
      {
        uuid: 'msg-1',
        role: 'user',
        content: 'Hello Claude',
        timestamp: '2024-01-15T10:30:00Z',
        tool_uses: [],
      },
      {
        uuid: 'msg-2',
        role: 'assistant',
        content: 'Hello! How can I help you today?',
        timestamp: '2024-01-15T10:30:05Z',
        tool_uses: [],
      },
    ] as TranscriptMessage[],
    summary: 'Test session summary',
    model: 'claude-3-sonnet',
    total_input_tokens: 100,
    total_output_tokens: 200,
    total_cache_read_tokens: 50,
    total_cache_creation_tokens: 25,
    start_time: '2024-01-15T10:30:00Z',
    end_time: '2024-01-15T10:35:00Z',
    claude_code_version: '1.0.0',
    git_branch: 'main',
    metadata: {
      session_id: 'session-uuid-123',
      title: 'Test Session',
      summary: 'Test session summary',
      repo_path: '/home/user/projects/test',
      entities: [],
      tags: [],
      starred: false,
    },
    is_active: false,
    ...overrides,
  };
}

/**
 * Creates a mock Issue with sensible defaults.
 */
export function createMockIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    number: 1,
    title: 'Test Issue',
    body: 'Issue body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    comments_count: 0,
    url: 'https://github.com/test/repo/issues/1',
    ...overrides,
  };
}

/**
 * Creates a mock PR with sensible defaults.
 */
export function createMockPR(overrides: Partial<PR> = {}): PR {
  return {
    number: 1,
    title: 'Test PR',
    body: 'PR body',
    state: 'open',
    labels: [],
    author: 'testuser',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    head_ref: 'feature-branch',
    base_ref: 'main',
    additions: 10,
    deletions: 5,
    changed_files: 2,
    comments_count: 0,
    url: 'https://github.com/test/repo/pull/1',
    ...overrides,
  };
}

/**
 * Creates a mock Process with sensible defaults.
 */
export function createMockProcess(overrides: Partial<Process> = {}): Process {
  return {
    id: 'process-1',
    working_dir: '/home/user/projects/test',
    created_at: '2024-01-15T10:30:00Z',
    session_id: null,
    claude_session_id: null,
    ...overrides,
  };
}

/**
 * Creates a mock Tag with sensible defaults.
 */
export function createMockTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    repo_id: 1,
    name: 'bug',
    color: '#ff0000',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a mock CommandMetadata with sensible defaults.
 */
export function createMockCommand(overrides: Partial<CommandMetadata> = {}): CommandMetadata {
  return {
    id: 'cmd-1',
    name: 'Fix Issue',
    shortName: 'Fix',
    description: 'Fix this issue',
    category: 'issue',
    template: 'Fix issue #{{number}}',
    source: 'builtin',
    ...overrides,
  };
}

/**
 * Creates a mock EntityLink with sensible defaults.
 */
export function createMockEntityLink(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    kind: 'issue',
    number: 1,
    ...overrides,
  };
}

/**
 * Creates a mock TranscriptMessage with sensible defaults.
 */
export function createMockTranscriptMessage(
  overrides: Partial<TranscriptMessage> = {}
): TranscriptMessage {
  return {
    uuid: 'msg-1',
    role: 'user',
    content: 'Test message',
    timestamp: '2024-01-15T10:30:00Z',
    tool_uses: [],
    ...overrides,
  };
}
