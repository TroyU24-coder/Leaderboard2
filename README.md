# VICIdial Leaderboard

Live sales leaderboard pulling from VICIdial's TEXT team performance report.

## Folder structure

```
vicidial-leaderboard/
├── server.js              ← Node.js backend
├── config.local.json      ← Report URL (edit this, never commit passwords here)
├── package.json
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── data/
    └── sample-leaderboard.json   ← Fallback when VICIdial isn't reachable
```

## Requirements

- Node.js 18 or newer

## Start

```powershell
npm start
```

Then open: http://localhost:4173

The date in the report URL is updated automatically every day — no manual edits needed.

## Login

VICIdial requires authentication. Set one of these env vars before starting:

**Basic auth (username + password):**
```powershell
$env:VICIDIAL_BASIC_AUTH="username:password"
npm start
```

**Session cookie (if basic auth doesn't work):**
```powershell
$env:VICIDIAL_COOKIE="your-session-cookie"
npm start
```

Without login, VICIdial returns "Login incorrect" and the leaderboard falls back to sample data.

## What it shows

- Agent name & team
- Sales (count)
- Sales per Working Hour (ranked by this)
- Non-pause time
