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
  created_at: string;
  completed_at: string | null;
}
