# UW-Madison-Study-Hub (UWStudyHub)

This project is an upgraded productized build from your UWStudyHub prototype:
- React + Vite frontend
- Express backend API
- JSON file persistence (local database-like storage)
- Global search across tasks/exams/planner
- Quick Add (task/exam) from the top navigation
- Sync Center for Canvas ICS auto-sync (no Canvas developer API required)

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start both backend and frontend:

```bash
npm run dev:full
```

Frontend: `http://localhost:5173`  
Backend health check: `http://localhost:4000/api/health`

## Local production deployment

One-command local deployment (single server, single port):

```bash
npm run deploy:local
```

Open:

`http://localhost:4000`

Useful commands:

```bash
npm run status:local
npm run stop:local
```

### DeepSeek setup for MyUW AI exam import

Create `.env.local` in the project root:

```bash
cp .env.local.example .env.local
```

Then set:

```env
DEEPSEEK_API_KEY=your_real_key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_API_BASE=https://api.deepseek.com
```

After that, run:

```bash
npm run deploy:local
```

## Data persistence

All app data is persisted in:

`server/data/store.json`

This includes tasks, exams, planner custom items, and reminder settings.

## Canvas auto-sync without API

1. Open the app and go to `Sync`.
2. Add your Canvas calendar feed URL (ICS).
3. Click `Run All Sync Now`.

The backend will also auto-run sync in intervals (default: every 15 minutes).

## Fallback import (when ICS fails)

If your Canvas feed cannot sync (permissions/network), use Sync Center manual JSON import:

1. Open `Sync` page.
2. Click `Copy Canvas Bookmarklet` and run it on Canvas assignment pages.
3. Paste copied JSON into `Canvas Task JSON`.
4. Click `Import Canvas Tasks`.

## MyUW exams import (AI, paste-only)

1. Open `Sync` page.
2. Paste copied exam text from MyUW into `MyUW Exam Text`.
3. Click `AI Parse and Import Exams`.
4. Exams will be parsed by DeepSeek and imported automatically.
