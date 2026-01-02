#!/usr/bin/env python3
"""
Migrate scheduled jobs from SQLite to JSON files.

This script:
1. Reads existing scheduled jobs from SQLite databases
2. Creates JSON definition files in <REPO>/.clump/schedules/
3. Updates SQLite records to use schedule_id in the name field

Usage:
    python backend/scripts/migrate_schedules_to_json.py
"""

import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.storage import (
    load_repos,
    ScheduleDefinition,
    save_schedule_definition,
    generate_schedule_id,
    get_clump_projects_dir,
    encode_path,
)


def slugify(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    slug = name.lower().replace(" ", "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")
    return slug.strip("-") or "schedule"


def migrate_repo_schedules(repo: dict) -> int:
    """Migrate scheduled jobs for a single repo. Returns count of migrated jobs."""
    import sqlite3

    repo_path = repo["local_path"]
    repo_id = repo["id"]
    encoded = encode_path(repo_path)
    db_path = get_clump_projects_dir() / encoded / "data.db"

    if not db_path.exists():
        print(f"  No database found at {db_path}")
        return 0

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check if scheduled_jobs table exists
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_jobs'"
    )
    if not cursor.fetchone():
        print(f"  No scheduled_jobs table found")
        conn.close()
        return 0

    # Fetch all scheduled jobs
    cursor.execute("SELECT * FROM scheduled_jobs WHERE repo_id = ?", (repo_id,))
    jobs = cursor.fetchall()

    if not jobs:
        print(f"  No scheduled jobs found")
        conn.close()
        return 0

    print(f"  Found {len(jobs)} scheduled jobs")

    migrated = 0
    for job in jobs:
        job_dict = dict(job)
        job_id = job_dict["id"]
        name = job_dict["name"]

        # Generate a unique schedule ID
        schedule_id = generate_schedule_id(name, repo_path)

        # Parse allowed_tools if it's JSON
        allowed_tools = None
        if job_dict.get("allowed_tools"):
            try:
                allowed_tools = json.loads(job_dict["allowed_tools"])
            except json.JSONDecodeError:
                pass

        # Create schedule definition
        definition = ScheduleDefinition(
            id=schedule_id,
            name=name,
            description=job_dict.get("description"),
            status=job_dict.get("status", "active"),
            cron_expression=job_dict.get("cron_expression", "0 9 * * *"),
            timezone=job_dict.get("timezone", "UTC"),
            target_type=job_dict.get("target_type", "codebase"),
            filter_query=job_dict.get("filter_query"),
            command_id=job_dict.get("command_id"),
            custom_prompt=job_dict.get("custom_prompt"),
            max_items=job_dict.get("max_items", 10),
            only_new=bool(job_dict.get("only_new", False)),
            permission_mode=job_dict.get("permission_mode"),
            allowed_tools=allowed_tools,
            max_turns=job_dict.get("max_turns"),
            model=job_dict.get("model"),
        )

        # Save to JSON
        save_schedule_definition(repo_path, definition)
        print(f"    Created {repo_path}/.clump/schedules/{schedule_id}.json")

        # Update SQLite record to use schedule_id as name
        cursor.execute(
            "UPDATE scheduled_jobs SET name = ? WHERE id = ?",
            (schedule_id, job_id)
        )

        migrated += 1

    conn.commit()
    conn.close()

    return migrated


def main():
    print("Migrating scheduled jobs from SQLite to JSON...\n")

    repos = load_repos()
    if not repos:
        print("No repos found in ~/.clump/repos.json")
        return

    total_migrated = 0

    for repo in repos:
        print(f"Processing repo: {repo['local_path']}")
        try:
            count = migrate_repo_schedules(repo)
            total_migrated += count
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\nMigration complete. Migrated {total_migrated} scheduled jobs to JSON.")


if __name__ == "__main__":
    main()
