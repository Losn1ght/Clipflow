# Clipflow

Clipflow is a private, single-owner operations dashboard for running a small stable of faceless-style Instagram accounts.

It exists to answer one question at a glance: **which accounts are about to run out of source clips, and what work is still open?**

## What it does

- **Clip inventory** — each account maps to a Google Drive folder of unedited source clips; Clipflow reads Drive metadata only (never file content) to count how many clips are left and how many days of coverage that represents against the account's daily posting target.
- **Work board** — a kanban board (Backlog → In Progress → Review → Done) for tracking editing/campaign tasks per account, with drag-and-drop, notes, and a quick-view popup per task.
- **Campaigns** — tracks requirements, submission links, platform, budget, and deadlines for brand/creator campaigns tied to one or more accounts.
- **Warm-up tally** — a manual daily counter for the multi-day account warm-up process (likes/comments/reposts/follows against day-specific targets), gated by a "watch reels between actions" pacing rule.
- **Google Drive sync** — a resumable, rate-limited background sync job (plus a manual trigger) that keeps clip counts current without ever touching file contents or any social platform's API.

## What it deliberately does not do

No social-platform APIs, no scraping, no auto-posting, no automated engagement. Every interaction with Instagram itself is manual — Clipflow only tracks state you report to it or read-only metadata from your own Google Drive.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Postgres, Auth, RLS) · Google Drive API (OAuth, metadata-only scope).
