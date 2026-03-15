# UW-Madison-Study-Hub (UWStudyHub)

UWStudyHub is a local-first academic planning platform designed for UW-Madison students.
It consolidates assignment tracking, exam planning, and weekly scheduling into one app,
with sync flows tailored for real student workflows (Canvas ICS, MyUW exam text, and manual fallback imports).

## What This Project Does

- Builds a unified task and exam workspace across multiple course tools.
- Keeps dates and deadlines consistent in the user's local timezone.
- Syncs Canvas tasks through ICS feeds without requiring Canvas developer API access.
- Imports MyUW exam information from pasted text with parser guardrails and smart merge.
- Provides a planner view and dashboard summary to support weekly execution.

## Core Features

- `Tasks`: Upcoming-first to-do list, past tasks separated, status and reminder support.
- `Exams`: MyUW-based exam records with upcoming section, detail, and reminder actions.
- `Planner`: Week-based timeline combining tasks, exams, and custom items.
- `Sync Center`: Canvas ICS sync, Canvas JSON fallback, MyUW text parsing/import.
- `Search`: Global search across tasks, exams, planner items, and course metadata.

## Tech Stack

- Frontend: React + Vite + TypeScript UI components
- Backend: Express (Node.js)
- Data Store: local JSON persistence (`server/data/store.json`)
- Parsing: `node-ical` (Canvas ICS) + local/AI-assisted MyUW text parsing

## Project Structure

- `src/`: frontend application
- `server/`: API server, sync pipeline, parser logic, tests
- `scripts/`: local deploy, stop, and status helpers
- `server/data/store.example.json`: clean data shape reference

## Prerequisites

- Node.js 18+
- npm 9+

## Development Run

Install dependencies:

```bash
npm install
```

Run frontend and backend together in development mode:

```bash
npm run dev:full
```

Endpoints:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

## Local Production Run

Build and launch production server locally:

```bash
npm run deploy:local
```

Open:

- App: `http://localhost:4000`

Operational commands:

```bash
npm run status:local
npm run stop:local
```

## Environment Configuration

Copy example env file:

```bash
cp .env.local.example .env.local
```

Set your values:

```env
DEEPSEEK_API_KEY=your_real_key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_API_BASE=https://api.deepseek.com
```

Notes:

- If `DEEPSEEK_API_KEY` is missing, MyUW import falls back to local parser behavior.
- `.env.local` is ignored by git for security.

## Data Model and Persistence

Primary data file:

- `server/data/store.json`

Stored entities:

- `tasks`
- `exams`
- `customItems`
- `syncSources`

All data is local and can be reset/reseeded as needed.

## Sync and Import Workflows

### Canvas Task Sync (ICS)

1. Open `Sync` page.
2. Add Canvas Calendar Feed URL (`.ics`).
3. Run sync (`Run All Sync`).

Behavior:

- Assignment-like events are imported into `Tasks`.
- Office-hour/meeting noise is filtered out.
- Time fields are normalized for local rendering consistency.

### Canvas JSON Fallback

Use when ICS is unavailable:

1. Click `Copy Canvas Bookmarklet`.
2. Run bookmarklet on Canvas page.
3. Paste JSON into `Canvas Task JSON`.
4. Click `Import Canvas Tasks`.

### MyUW Exam Import (Text Paste)

Supported inputs:

- Short syntax: `cs 400 3.17 midterm`
- Structured schedule text copied from MyUW course/exam sections
- Explicit year/time form: `CS 400 2026-03-17 7:00 PM midterm`

Import rules:

- Default year inference uses current term year.
- If month/day is already past and year is omitted, import is rejected with guidance.
- Missing time or location defaults to `TBA`.
- Smart merge updates existing exams by stable key (`courseCode + type + startsAtUtc`).

## Testing

Run time and parser contract tests:

```bash
npm run test:time
```

Coverage includes:

- timezone conversion integrity
- all-day handling
- DST edge cases
- short-text MyUW parsing
- smart merge behavior

## Available Scripts

- `npm run dev`: frontend dev server
- `npm run dev:server`: backend dev server
- `npm run dev:full`: run frontend + backend together
- `npm run build`: frontend production build
- `npm run start`: start backend in production mode
- `npm run deploy:local`: local production deploy helper
- `npm run stop:local`: stop local deployed process
- `npm run status:local`: check deployed process status
- `npm run test:time`: run parser/time contract tests

## Repository Hygiene

- Sensitive files are excluded (`.env*`, logs, local pids, runtime store data).
- Use `server/data/store.example.json` as template when onboarding a clean environment.
