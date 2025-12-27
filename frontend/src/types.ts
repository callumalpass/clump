export interface Repo {
  id: number;
  owner: string;
  name: string;
  local_path: string;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  author: string;
  created_at: string;
  updated_at: string;
  comments_count: number;
  url: string;
}

export interface IssueComment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
  description: string | null;
}

export interface IssueDetail extends Issue {
  comments: IssueComment[];
}

export interface Tag {
  id: number;
  repo_id: number;
  name: string;
  color: string | null;
  created_at: string;
}

export type IssueTagsMap = Record<number, Tag[]>;

export interface PR {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  author: string;
  created_at: string;
  updated_at: string;
  head_ref: string;
  base_ref: string;
  additions: number;
  deletions: number;
  changed_files: number;
  url: string;
}

export interface Process {
  id: string;
  working_dir: string;
  created_at: string;
  session_id: number | null;  // Links to Session (formerly Analysis) record
  claude_session_id: string | null;
}

export interface SessionEntity {
  id: number;
  kind: string;  // "issue" or "pr"
  number: number;
}

export interface Session {
  id: number;
  repo_id: number;
  repo_name: string | null;
  kind: string;
  entities: SessionEntity[];
  title: string;
  prompt: string;
  transcript: string;
  summary: string | null;
  status: string;
  process_id: string | null;
  claude_session_id?: string | null;
  created_at: string;
  completed_at: string | null;
}

export type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';
export type OutputFormat = 'text' | 'json' | 'stream-json';
export type ClaudeModel = 'sonnet' | 'opus' | 'haiku';

export interface ClaudeCodeSettings {
  permission_mode: PermissionMode;
  allowed_tools: string[];
  disallowed_tools: string[];
  max_turns: number;
  model: string;
  headless_mode: boolean;
  output_format: OutputFormat;
  mcp_github: boolean;
  default_allowed_tools: string[];
}

export interface ProcessCreateOptions {
  permission_mode?: PermissionMode;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  max_turns?: number;
  model?: ClaudeModel;
  resume_session?: string;
}

// Parsed transcript types from Claude Code JSONL files
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export interface TranscriptMessage {
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thinking?: string;
  tool_uses: ToolUse[];
  model?: string;
  usage?: TokenUsage;
}

export interface ParsedTranscript {
  session_id: string;
  messages: TranscriptMessage[];
  summary?: string;
  model?: string;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cache_read_tokens?: number;
  total_cache_creation_tokens?: number;
  start_time?: string;
  end_time?: string;
  claude_code_version?: string;
  git_branch?: string;
}

export type TranscriptResponse =
  | { type: 'parsed'; transcript: ParsedTranscript }
  | { type: 'raw'; transcript: string };
