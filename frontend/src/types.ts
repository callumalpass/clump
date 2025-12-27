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

export interface Session {
  id: string;
  working_dir: string;
  created_at: string;
  analysis_id: number | null;
  claude_session_id: string | null;
}

export interface Analysis {
  id: number;
  repo_id: number;
  repo_name: string | null;
  type: string;
  entity_id: string | null;
  title: string;
  prompt: string;
  transcript: string;
  summary: string | null;
  status: string;
  session_id: string | null;
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

export interface SessionCreateOptions {
  permission_mode?: PermissionMode;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  max_turns?: number;
  model?: ClaudeModel;
  resume_session?: string;
}
