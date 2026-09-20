# Pillar 5 — Cloud Computing Knowledge Check

A 120-question, 2-hour timed multiple-choice test for the Cloud Intern (WIL) cohort, with a
facilitator dashboard that shows live results — including who's currently mid-test — pulled
straight from the database.

```
pillar5-cloud-test/
├── backend/     FastAPI (Python) — owns the question bank + correct answers, scores every
│                attempt server-side, talks to Postgres
├── frontend/    Next.js (React/TypeScript) — name entry → instructions → timed test →
│                results, plus the passcode-gated /admin dashboard
├── render.yaml  Render Blueprint (optional one-click deploy for both services)
└── README.md    this file
```

**Why a backend at all, vs. the single-file version:** the question bank and correct answers
now live only on the server — the browser never receives an answer key, even in view-source.
Scoring happens server-side too. And because every attempt is a row in a real database, the
facilitator dashboard can show attempts that are still in progress, not just ones that have
finished and been uploaded — which a purely static page can't do.

---

## 1. Set up Supabase (the database)

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty for this).
2. Open **SQL Editor → New query**, paste in the contents of `backend/schema.sql`, and run it.
   This creates the one `attempts` table the whole app uses.
3. Go to **Project Settings → Database → Connection string → URI**. Copy the **Transaction
   pooler** URI (recommended for Render's free tier — a normal direct connection works too,
   just uses port `5432` instead of `6543`). You'll paste this into the backend's
   `DATABASE_URL`.

## 2. Deploy the backend to Render

1. Push this project to a GitHub repo (or GitLab/Bitbucket).
2. In Render: **New → Web Service**, point it at the repo, set:
   - **Root directory:** `backend`
   - **Runtime:** Python 3
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Add environment variables (see `backend/.env.example`):
   - `DATABASE_URL` — the Supabase connection string from step 1
   - `ADMIN_PASSCODE` — whatever you want the facilitator dashboard passcode to be
   - `FRONTEND_ORIGIN` — leave this blank for now, you'll fill it in after step 3 once you
     know the frontend's URL (or set it to `*` temporarily to unblock yourself, then tighten
     it up once the frontend is live)
4. Deploy. Once it's up, visit `https://<your-backend>.onrender.com/api/health` — it should
   return `{"ok": true}`. `/docs` gives you interactive Swagger docs for every endpoint.

## 3. Deploy the frontend to Render

1. In Render: **New → Web Service**, same repo, set:
   - **Root directory:** `frontend`
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
2. Add environment variable:
   - `NEXT_PUBLIC_API_URL` — the backend URL from step 2 (no trailing slash)
3. Deploy. Once it's live, go back to the **backend** service on Render and set
   `FRONTEND_ORIGIN` to this frontend's URL, then redeploy the backend so CORS allows it.

That's it — share the frontend URL with your interns, and use `<frontend-url>/admin` yourself
(passcode from `ADMIN_PASSCODE`) to watch results come in.

*(`render.yaml` in the repo root lets you do steps 2–3 as one Render "Blueprint" instead, if
you'd rather — New → Blueprint → point at the repo. You'll still fill in the env vars above
afterward.)*

---

## Local development

**Backend** (needs Python 3.11+ and a Postgres database — Supabase works fine locally too):
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL etc.
export $(cat .env | xargs)
uvicorn main:app --reload --port 8000
```

**Frontend** (needs Node 18+):
```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```
Then open `http://localhost:3000`.

---

## How it works

- **Starting a test** (`POST /api/attempts`) shuffles each question's 4 options fresh (a true
  random shuffle per candidate, not just a fixed reorder), stores that shuffle server-side, sets
  a server-computed deadline (now + 2 hours), and returns the questions **without** which
  option is correct.
- **Answering** (`PATCH /api/attempts/{id}/answers`) saves the whole answers array on every
  click — the frontend also caches it in `localStorage` so a refresh mid-test resumes instantly
  while the server copy syncs in the background.
- **Submitting** (`POST /api/attempts/{id}/submit`) is what actually scores the attempt — this
  only ever happens server-side, comparing stored answers to the real answer key. It's
  idempotent: calling it again (e.g. the results page re-confirming on load) just returns the
  same stored result.
- **The pass mark is 80%**, hardcoded as `PASS_MARK` near the top of `backend/main.py` — change
  it there if that ever needs to move.
- **The admin dashboard** polls `GET /api/admin/attempts` every 20 seconds (and on demand via
  the Refresh button), so you can genuinely watch the cohort's "in progress" count tick down as
  people finish — something the single-file version couldn't do.
- The **question bank** lives in `backend/questions.py`. It was generated from the original
  120-question set — edit it directly if a question needs fixing; no separate regeneration step
  needed.

## Changing things

- **Duration / pass mark:** `DURATION_SECONDS` and `PASS_MARK` in `backend/main.py`.
- **Admin passcode:** `ADMIN_PASSCODE` env var (defaults to `CloudLead2026` if unset — set it
  explicitly in production).
- **Colors / branding:** `frontend/app/globals.css` — the CSS custom properties at the top of
  the file (`--accent`, `--bg`, etc.) drive the whole palette. `frontend/public/pillar5-logo.png`
  and `frontend/public/pillar-pattern.svg` are the logo and the watermark pattern.
- **Question wording:** `backend/questions.py` — each entry is `{id, section, topic, stem,
  options}`, where `options[0]` is always the correct answer (the backend shuffles display
  order per attempt, so this stays simple).
