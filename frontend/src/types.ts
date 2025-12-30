export interface Repo {
  id: number;
  owner: string;
  name: string;
  local_path: string;
}

export interface RepoSessionCount {
  repo_id: number;
  total: number;
  active: number;
}

export interface SessionCountsResponse {
  counts: RepoSessionCount[];
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

// Issue metadata (sidecar files written by Claude)
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueDifficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'complex';
export type IssueRisk = 'low' | 'medium' | 'high';
export type IssueType = 'bug' | 'feature' | 'refactor' | 'docs' | 'chore' | 'question';

export interface IssueMetadata {
  issue_number: number;

  // Assessments
  priority?: IssuePriority | null;
  difficulty?: IssueDifficulty | null;
  risk?: IssueRisk | null;

  // Categorical
  type?: IssueType | null;
  affected_areas?: string[];

  // Analysis content
  ai_summary?: string | null;
  notes?: string | null;
  root_cause?: string | null;
  suggested_fix?: string | null;

  // Meta
  analyzed_at?: string | null;
  analyzed_by?: string | null;
}

export type IssueMetadataMap = Record<number, IssueMetadata>;

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
  comments_count: number;
  url: string;
}

export interface PRComment {
  id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface PRDetail extends PR {
  comments: PRComment[];
}

// PR metadata (sidecar files written by Claude)
export type PRRisk = 'low' | 'medium' | 'high';
export type PRComplexity = 'trivial' | 'simple' | 'moderate' | 'complex';
export type PRReviewPriority = 'critical' | 'high' | 'medium' | 'low';
export type PRTestCoverage = 'good' | 'partial' | 'missing';
export type PRChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore';

export interface PRMetadata {
  pr_number: number;

  // Assessments
  risk?: PRRisk | null;
  complexity?: PRComplexity | null;
  review_priority?: PRReviewPriority | null;

  // Review findings
  security_concerns?: string[];
  test_coverage?: PRTestCoverage | null;
  breaking_changes?: boolean;

  // Categorical
  change_type?: PRChangeType | null;
  affected_areas?: string[];

  // Analysis content
  ai_summary?: string | null;
  review_notes?: string | null;
  suggested_improvements?: string | null;

  // Meta
  analyzed_at?: string | null;
  analyzed_by?: string | null;
}

export type PRMetadataMap = Record<number, PRMetadata>;

export interface Process {
  id: string;
  working_dir: string;
  created_at: string;
  session_id: number | null;  // Legacy - may be null in new model
  claude_session_id: string | null;
  mode: 'pty' | 'headless';  // PTY for interactive, headless for issue/PR sessions
}

// ==========================================
// Session types (transcript-first model)
// ==========================================

export type EntityKind = 'issue' | 'pr';

export interface EntityLink {
  kind: EntityKind;
  number: number;
}

export interface SessionMetadata {
  session_id: string;
  title?: string | null;
  summary?: string | null;
  repo_path?: string | null;
  entities: EntityLink[];
  tags: string[];
  starred: boolean;
  created_at?: string | null;
  scheduled_job_id?: number | null;  // ID of schedule that created this session
}

export interface SessionSummary {
  session_id: string;  // UUID from filename
  encoded_path: string;  // Directory name (encoded working directory)
  repo_path: string;  // Decoded working directory path
  repo_name?: string | null;  // owner/name if matched to known repo

  // From transcript parsing
  title?: string | null;
  model?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  duration_seconds?: number | null;  // Session duration in seconds (null if active)
  message_count: number;

  // File info
  modified_at: string;
  file_size: number;

  // From sidecar metadata
  entities: EntityLink[];
  tags: string[];
  starred: boolean;
  scheduled_job_id?: number | null;  // ID of schedule that created this session

  // Status
  is_active: boolean;
}

export interface SessionDetail {
  session_id: string;
  encoded_path: string;
  repo_path: string;
  repo_name?: string | null;

  // Transcript data
  messages: TranscriptMessage[];
  summary?: string | null;
  model?: string | null;

  // Token totals
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;

  // Timestamps
  start_time?: string | null;
  end_time?: string | null;
  duration_seconds?: number | null;  // Session duration in seconds (null if active)

  // Version info
  claude_code_version?: string | null;
  git_branch?: string | null;

  // Sidecar metadata
  metadata: SessionMetadata;

  // Status
  is_active: boolean;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
  total: number;
}

// Bulk operation types
export interface BulkOperationResultItem {
  session_id: string;
  success: boolean;
  error?: string | null;
}

export interface BulkOperationResult {
  deleted?: number;
  updated?: number;
  failed: number;
  results: BulkOperationResultItem[];
}

// Legacy Session type for backwards compatibility
export interface Session {
  id: number;
  repo_id: number;
  repo_name: string | null;
  kind: string;
  entities: EntityLink[];
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
  spawned_agent_id?: string | null;  // Agent ID if this tool spawned a subsession
  result?: string | null;  // Tool result content
  result_is_error?: boolean;  // Whether the result was an error
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

// Subsession (spawned agent) detail
export interface SubsessionDetail {
  agent_id: string;  // The 7-char hex ID
  parent_session_id: string;  // The parent session UUID
  encoded_path: string;
  repo_path: string;

  // Transcript data
  messages: TranscriptMessage[];
  summary?: string | null;
  model?: string | null;

  // Token totals
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_creation_tokens: number;

  // Timestamps
  start_time?: string | null;
  end_time?: string | null;
}

export type TranscriptResponse =
  | { type: 'parsed'; transcript: ParsedTranscript }
  | { type: 'raw'; transcript: string };

// Slash Commands (loaded from .claude/commands/)
export interface CommandMetadata {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: 'issue' | 'pr' | 'general';
  template: string;
  source: 'builtin' | 'user' | 'repo';
}

export interface CommandCreate {
  name: string;
  shortName: string;
  description: string;
  template: string;
}

export interface CommandsResponse {
  issue: CommandMetadata[];
  pr: CommandMetadata[];
  general: CommandMetadata[];
}

// Scheduled Jobs
export type ScheduledJobStatus = 'active' | 'paused' | 'disabled';
export type ScheduledJobTargetType = 'issues' | 'prs' | 'codebase' | 'custom';

export interface ScheduledJob {
  id: number;
  name: string;
  description: string | null;
  status: ScheduledJobStatus;
  cron_expression: string;
  timezone: string;
  target_type: ScheduledJobTargetType;
  filter_query: string | null;
  command_id: string | null;
  custom_prompt: string | null;
  max_items: number;
  only_new: boolean;
  permission_mode: string | null;
  allowed_tools: string[] | null;
  max_turns: number | null;
  model: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduledJobRun {
  id: number;
  job_id: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_found: number;
  items_processed: number;
  items_skipped: number;
  items_failed: number;
  error_message: string | null;
  session_ids: string[] | null;
}

export interface ScheduledJobRunsResponse {
  runs: ScheduledJobRun[];
  total: number;
}

export interface ScheduledJobCreate {
  name: string;
  description?: string;
  cron_expression: string;
  timezone?: string;
  target_type: ScheduledJobTargetType;
  filter_query?: string;
  command_id?: string;
  custom_prompt?: string;
  max_items?: number;
  only_new?: boolean;
  permission_mode?: string;
  allowed_tools?: string[];
  max_turns?: number;
  model?: string;
}

export interface ScheduledJobUpdate {
  name?: string;
  description?: string;
  cron_expression?: string;
  timezone?: string;
  target_type?: ScheduledJobTargetType;
  filter_query?: string;
  command_id?: string | null;  // null to clear, undefined to leave unchanged
  custom_prompt?: string;
  max_items?: number;
  only_new?: boolean;
  permission_mode?: string;
  allowed_tools?: string[];
  max_turns?: number;
  model?: string;
}

// ==========================================
// Stats types (usage analytics)
// ==========================================

export interface DailyActivity {
  date: string;
  message_count: number;
  session_count: number;
  tool_call_count: number;
}

export interface DailyModelTokens {
  date: string;
  tokens_by_model: Record<string, number>;
}

export interface ModelUsage {
  model: string;
  display_name: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_cost_usd: number;
}

export interface HourlyDistribution {
  hour: number;  // 0-23
  count: number;
}

export interface StatsResponse {
  last_computed_date: string;
  total_sessions: number;
  total_messages: number;
  first_session_date?: string | null;
  longest_session_minutes?: number | null;
  daily_activity: DailyActivity[];
  daily_model_tokens: DailyModelTokens[];
  model_usage: ModelUsage[];
  hourly_distribution: HourlyDistribution[];
  today_stats?: DailyActivity | null;
  week_stats: DailyActivity;
  total_estimated_cost_usd: number;
}
