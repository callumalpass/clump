"""
GitHub client service for fetching issues, PRs, and repository data.
"""

from dataclasses import dataclass
from datetime import datetime
from github import Github, Auth
from github.Issue import Issue
from github.PullRequest import PullRequest
from github.Repository import Repository

from app.config import settings


@dataclass
class IssueComment:
    id: int
    author: str
    body: str
    created_at: datetime


@dataclass
class IssueData:
    number: int
    title: str
    body: str
    state: str
    labels: list[str]
    author: str
    created_at: datetime
    updated_at: datetime
    comments_count: int
    comments: list[IssueComment] | None = None
    url: str = ""


@dataclass
class PRData:
    number: int
    title: str
    body: str
    state: str
    labels: list[str]
    author: str
    created_at: datetime
    updated_at: datetime
    head_ref: str
    base_ref: str
    additions: int
    deletions: int
    changed_files: int
    url: str = ""


class GitHubClient:
    """Client for interacting with GitHub API."""

    def __init__(self, token: str | None = None):
        self._token = token or settings.github_token
        if self._token:
            self._github = Github(auth=Auth.Token(self._token))
        else:
            self._github = Github()
        self._repo_cache: dict[str, Repository] = {}

    def get_repo(self, owner: str, name: str) -> Repository:
        """Get a repository (cached)."""
        key = f"{owner}/{name}"
        if key not in self._repo_cache:
            self._repo_cache[key] = self._github.get_repo(key)
        return self._repo_cache[key]

    def list_issues(
        self,
        owner: str,
        name: str,
        state: str = "open",
        labels: list[str] | None = None,
        search_query: str | None = None,
        sort: str = "created",
        order: str = "desc",
        page: int = 1,
        per_page: int = 30,
    ) -> tuple[list[IssueData], int]:
        """List issues for a repository with pagination.

        Args:
            owner: Repository owner
            name: Repository name
            state: Issue state - "open", "closed", or "all"
            labels: List of label names to filter by
            search_query: Text to search in issue title/body
            sort: Sort field - "created", "updated", or "comments"
            order: Sort order - "asc" or "desc"
            page: Page number (1-indexed)
            per_page: Results per page

        Returns a tuple of (issues, total_count).
        """
        # Build GitHub search query
        query = f"repo:{owner}/{name} is:issue"

        # Add state filter (skip if "all")
        if state and state != "all":
            query += f" state:{state}"

        # Add label filters
        if labels:
            for label in labels:
                # Quote labels with spaces
                if " " in label:
                    query += f' label:"{label}"'
                else:
                    query += f" label:{label}"

        # Add text search (prepend to search in title/body)
        if search_query:
            query = f"{search_query} {query}"

        # Validate sort field
        valid_sorts = {"created", "updated", "comments"}
        if sort not in valid_sorts:
            sort = "created"

        # Validate order
        if order not in {"asc", "desc"}:
            order = "desc"

        results = self._github.search_issues(query, sort=sort, order=order)

        # Get total count first (triggers the API call)
        total_count = results.totalCount

        # Get just the page we need
        start = (page - 1) * per_page
        issues = []
        for issue in results[start:start + per_page]:
            issues.append(self._issue_to_data(issue))

        return issues, total_count

    def get_issue(self, owner: str, name: str, number: int) -> IssueData:
        """Get a single issue with comments."""
        repo = self.get_repo(owner, name)
        issue = repo.get_issue(number)

        data = self._issue_to_data(issue)
        data.comments = [
            IssueComment(
                id=c.id,
                author=c.user.login if c.user else "unknown",
                body=c.body or "",
                created_at=c.created_at,
            )
            for c in issue.get_comments()
        ]

        return data

    def _issue_to_data(self, issue: Issue) -> IssueData:
        """Convert GitHub Issue to IssueData."""
        return IssueData(
            number=issue.number,
            title=issue.title,
            body=issue.body or "",
            state=issue.state,
            labels=[l.name for l in issue.labels],
            author=issue.user.login if issue.user else "unknown",
            created_at=issue.created_at,
            updated_at=issue.updated_at,
            comments_count=issue.comments,
            url=issue.html_url,
        )

    def list_prs(
        self,
        owner: str,
        name: str,
        state: str = "open",
        limit: int = 100,
    ) -> list[PRData]:
        """List pull requests for a repository."""
        repo = self.get_repo(owner, name)
        prs = []

        for pr in repo.get_pulls(state=state)[:limit]:
            prs.append(self._pr_to_data(pr))

        return prs

    def get_pr(self, owner: str, name: str, number: int) -> PRData:
        """Get a single pull request."""
        repo = self.get_repo(owner, name)
        pr = repo.get_pull(number)
        return self._pr_to_data(pr)

    def _pr_to_data(self, pr: PullRequest) -> PRData:
        """Convert GitHub PullRequest to PRData."""
        return PRData(
            number=pr.number,
            title=pr.title,
            body=pr.body or "",
            state=pr.state,
            labels=[l.name for l in pr.labels],
            author=pr.user.login if pr.user else "unknown",
            created_at=pr.created_at,
            updated_at=pr.updated_at,
            head_ref=pr.head.ref,
            base_ref=pr.base.ref,
            additions=pr.additions,
            deletions=pr.deletions,
            changed_files=pr.changed_files,
            url=pr.html_url,
        )

    def add_comment(self, owner: str, name: str, issue_number: int, body: str) -> int:
        """Add a comment to an issue or PR."""
        repo = self.get_repo(owner, name)
        issue = repo.get_issue(issue_number)
        comment = issue.create_comment(body)
        return comment.id

    def add_labels(self, owner: str, name: str, issue_number: int, labels: list[str]):
        """Add labels to an issue or PR."""
        repo = self.get_repo(owner, name)
        issue = repo.get_issue(issue_number)
        issue.add_to_labels(*labels)

    def close_issue(self, owner: str, name: str, issue_number: int):
        """Close an issue."""
        repo = self.get_repo(owner, name)
        issue = repo.get_issue(issue_number)
        issue.edit(state="closed")


# Global client instance
github_client = GitHubClient()
