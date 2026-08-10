# Clipflow

Clipflow is a private, single-owner operations dashboard for running a small stable of faceless-style Instagram accounts.

It exists to answer one question at a glance: **which accounts are about to run out of source clips, and what work is still open?**

## What it does

- **Clip inventory** - each account maps to a Google Drive folder of unedited source clips; Clipflow reads Drive metadata only (never file content) to count how many clips are left and how many days of coverage that represents against the account's daily posting target.
- **Work board** - a kanban board (Backlog - In Progress - Review - Done) for tracking editing/campaign tasks per account, with drag-and-drop, notes, and a quick-view popup per task.
- **Active campaigns** - tracks requirements, submission links, platform, budget, and deadlines for brand/creator campaigns tied to one or more accounts. Only non-ended campaigns show in the active list; Requirements and Submission each get their own link button when the field holds a real URL, or plain text when it doesn't.
- **Subscriptions** - a recurring-cost tracker for the clipping stack (editing tools, stock footage, VPNs, etc.), with weekly/monthly/quarterly/yearly billing cycles normalized into a single "Monthly spend" figure, and a renewal-date badge that glows as a due date approaches.
- **Prompts** - a reusable prompt library for the clipping workflow, with one-click copy-to-clipboard and a maximize toggle for editing longer prompts.
- **Resources** - a link library for clipping tools and references (name + URL), one click away from the site itself.
- **Archives** - nothing is ever hard-deleted. Every "Archive" action just hides a row; the Archives view lists everything currently archived across accounts, campaigns, subscriptions, prompts, and resources, with a one-click Restore.
- **Personalization** - the dropdown choices for clip target and low-stock-day thresholds are editable lists managed in Settings, not hardcoded values.
- **Warm-up tally** - a manual daily counter for the multi-day account warm-up process (likes/comments/reposts/follows against day-specific targets), gated by a "watch reels between actions" pacing rule.
- **Google Drive sync** - a resumable, rate-limited background sync job (plus a manual trigger) that keeps clip counts current without ever touching file contents or any social platform's API.

## Auth

Clipflow is single-owner and gated by a plain username/password login (Supabase Auth). The username is a display-only alias resolved server-side to the real account email before authenticating - the email itself never reaches the browser. This is unrelated to the Google Drive connection, which uses its own separate OAuth flow scoped to read-only Drive metadata.

## What it deliberately does not do

No social-platform APIs, no scraping, no auto-posting, no automated engagement. Every interaction with Instagram itself is manual - Clipflow only tracks state you report to it or read-only metadata from your own Google Drive.

## Stack

Next.js (App Router) - React - TypeScript - Tailwind CSS - shadcn/ui - Supabase (Postgres, Auth, RLS) - Google Drive API (OAuth, metadata-only scope).
