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

    def get_repo(self, owner: str, name: str) -> Repository:
        """Get a repository."""
        return self._github.get_repo(f"{owner}/{name}")

    def list_issues(
        self,
        owner: str,
        name: str,
        state: str = "open",
        labels: list[str] | None = None,
        page: int = 1,
        per_page: int = 30,
    ) -> tuple[list[IssueData], int]:
        """List issues for a repository with pagination.

        Returns a tuple of (issues, total_count).
        """
        repo = self.get_repo(owner, name)

        kwargs = {"state": state}
        if labels:
            kwargs["labels"] = labels

        all_issues = repo.get_issues(**kwargs)
        total_count = all_issues.totalCount

        # Calculate start/end indices for pagination
        start = (page - 1) * per_page
        end = start + per_page

        issues = []
        for issue in all_issues[start:end]:
            # Skip pull requests (GitHub API returns them as issues)
            if issue.pull_request:
                continue
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
