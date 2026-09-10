# Gillco RWA Attendance App

A beautiful, full-stack attendance app for the Gillco RWA — admin-managed members &
attendance, with a public flat-attendance view that highlights flats below a configurable
threshold in red.

**Stack:** Node.js + Express, MongoDB, vanilla HTML/CSS/JS (no frontend framework).

**App Creator:** Ishwar Singh

---

## Features

- **Admin sign-in** required to add members and record attendance.
- **Admin credentials stored on first run** in `config/admin.json` (auto-generated
  username + random password, printed to the console).
- **Member fields:** Name, Member ID, Age, Flat Number, Onboarded Date.
- **Auto Member ID** with prefix `MEM` + a sequence starting at `YYYYMM01`
  (current year, current month, day `01`). e.g. `MEM20260901`, `MEM20260902`…
- **Same-flat grouping:** when 2+ members share a flat number, all their names
  show together on one row, separated by commas.
- **Attendance marking page** (admin only) with Present / Absent buttons — blank
  by default; load an existing sheet to edit; bulk-mark all present/absent.
- **Public attendance view** (no login) showing per-flat attendance %.
  Rows below the threshold are highlighted **red**, at-or-above are **green**.
- **Configurable minimum attendance threshold** — admin sets it under the
  *Settings* tab (default 70%). Stored in MongoDB (`settings` collection).
- **CSV export** — download all members and all attendance records as CSV
  (Settings tab → Export Data).
- **Members Directory** — wider card, vertically scrollable, with a **search by
  flat number** filter.
- **Public View link** in the admin nav opens in a **new browser tab**.
- **Material-responsive** layout across desktop, tablet, and mobile.
- **Disclaimer modal** shown on first browser load — user must read and agree
  before continuing. Stored in `localStorage` so it won't repeat.
- **App Creator** credit (Ishwar Singh) shown in the footer of every page.
- Sessions persisted in MongoDB via `connect-mongo`.

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org) 18+
- A running MongoDB instance (local or Atlas)

### 2. Install & configure
```bash
cd gillco-rwa-attendance
npm install
cp .env.example .env   # then edit .env if needed
```

`.env` defaults:
```
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017
DB_NAME=gillco_rwa
SESSION_SECRET=
```

### 3. Run
```bash
npm start
```

On **first run** the server prints admin credentials to the console and writes
them to `config/admin.json`.

### 4. Use it
- **Public attendance view:** http://localhost:3000/
- **Admin sign-in:**        http://localhost:3000/login.html
- **Admin dashboard:**      http://localhost:3000/admin.html  (after sign-in)

---

## Admin Dashboard tabs

| Tab         | What it does                                                        |
|-------------|---------------------------------------------------------------------|
| Members     | Add members; search the directory by flat number; delete members    |
| Attendance  | Mark Present/Absent per date; load existing sheets; save; view log  |
| Settings    | Set minimum attendance % threshold; export members/attendance CSV   |

---

## API Reference

| Method | Path                        | Auth   | Description                          |
|--------|-----------------------------|--------|--------------------------------------|
| POST   | `/api/login`                | —      | Sign in (username, password)         |
| POST   | `/api/logout`               | —      | Sign out                             |
| GET    | `/api/me`                   | —      | Current session                      |
| GET    | `/api/settings`             | public | Get attendance threshold             |
| POST   | `/api/settings`             | admin  | Set attendance threshold             |
| GET    | `/api/members`              | public | List all members                     |
| POST   | `/api/members`              | admin  | Add a member (auto ID)               |
| DELETE | `/api/members/:memberId`    | admin  | Delete a member                      |
| GET    | `/api/attendance`           | public | All attendance sheets               |
| GET    | `/api/attendance/summary`   | public | Per-flat %, red/green status         |
| GET    | `/api/attendance/mark-list` | admin  | Members list for marking             |
| POST   | `/api/attendance`           | admin  | Create/replace a date's sheet        |
| GET    | `/api/export/members`       | admin  | Download members CSV                 |
| GET    | `/api/export/attendance`    | admin  | Download attendance CSV              |

---

## Project Structure
```
gillco-rwa-attendance/
├── server.js              # Express app: auth, settings, member & attendance APIs, CSV export
├── package.json
├── .env.example
├── config/
│   └── admin.json         # generated on first run (gitignored)
└── public/
    ├── index.html         # public attendance view (with disclaimer modal + footer)
    ├── login.html         # admin sign-in
    ├── admin.html         # admin dashboard (members + attendance + settings tabs)
    ├── css/style.css      # design system
    └── js/
        ├── app.js         # shared utils (api, toast, nav)
        ├── disclaimer.js  # first-visit disclaimer modal
        ├── login.js
        ├── admin.js       # member CRUD, attendance marking, settings, search
        └── members.js     # public summary + date sheets
```

---

## Notes
- The attendance threshold is stored in MongoDB (`settings` collection, `_id: "attendance"`).
  Default is 70% until the admin changes it.
- Attendance % per flat = (present records for that flat across all dates) ÷
  (total records for that flat across all dates) × 100.
- Member names from the same flat are joined with `, ` in the public summary.
- The disclaimer agreement is stored in the browser's `localStorage` under
  `gillco_disclaimer_accepted`. Clearing site data will show it again.
