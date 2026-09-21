"""
Pillar 5 — Cloud Computing Knowledge Check API
FastAPI backend. Owns the question bank and correct answers — the frontend
never receives a correct answer until that attempt has been submitted.

Run locally:
    uvicorn main:app --reload --port 8000

Env vars (see .env.example):
    DATABASE_URL      Supabase/Postgres connection string
    ADMIN_PASSCODE     passcode the facilitator dashboard must send
    FRONTEND_ORIGIN    the deployed frontend's origin, for CORS (comma-separated for multiple)
"""
import json
import os
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import asyncpg
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from questions import QUESTIONS, TOPIC_LABELS, TOTAL_QUESTIONS

DURATION_SECONDS = 2 * 60 * 60  # 2 hours
PASS_MARK = 80.0

DATABASE_URL = os.environ["DATABASE_URL"]
ADMIN_PASSCODE = os.environ.get("ADMIN_PASSCODE", "CloudLead2026")
FRONTEND_ORIGINS = [o.strip() for o in os.environ.get("FRONTEND_ORIGIN", "*").split(",") if o.strip()]

app = FastAPI(title="Pillar 5 Cloud Knowledge Check API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS if FRONTEND_ORIGINS != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

pool: Optional[asyncpg.Pool] = None


@app.on_event("startup")
async def on_startup():
    global pool
    # statement_cache_size=0: Supabase's transaction pooler (pgbouncer) doesn't
    # support prepared statements, which asyncpg uses by default.
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5, statement_cache_size=0)


@app.on_event("shutdown")
async def on_shutdown():
    if pool:
        await pool.close()


# ---------------------------------------------------------------- helpers

def shuffle_options() -> dict:
    """One random 4-item permutation per question, generated fresh for this attempt."""
    order = {}
    for q in QUESTIONS:
        idxs = [0, 1, 2, 3]
        random.shuffle(idxs)
        order[str(q["id"])] = idxs
    return order


def display_options(q: dict, perm: List[int]) -> List[str]:
    return [q["options"][i] for i in perm]


def correct_display_index(perm: List[int]) -> int:
    return perm.index(0)  # options[0] is always the correct one pre-shuffle


def public_question(q: dict, perm: List[int]) -> dict:
    return {
        "id": q["id"],
        "section": q["section"],
        "topic": q["topic"],
        "topic_label": TOPIC_LABELS.get(q["topic"], q["topic"]),
        "stem": q["stem"],
        "options": display_options(q, perm),
    }


def score_attempt(answers: List[Optional[int]], option_order: dict):
    correct_a = correct_b = 0
    detail = []
    for i, q in enumerate(QUESTIONS):
        perm = option_order[str(q["id"])]
        correct_idx = correct_display_index(perm)
        chosen = answers[i] if i < len(answers) else None
        opts = display_options(q, perm)
        is_correct = chosen is not None and chosen == correct_idx
        if is_correct:
            if q["section"] == "A":
                correct_a += 1
            else:
                correct_b += 1
        detail.append(
            {
                "id": q["id"],
                "section": q["section"],
                "topic": q["topic"],
                "topic_label": TOPIC_LABELS.get(q["topic"], q["topic"]),
                "your_answer": None if chosen is None else opts[chosen],
                "correct_answer": opts[correct_idx],
                "correct": is_correct,
            }
        )
    total = correct_a + correct_b
    pct = round(total / TOTAL_QUESTIONS * 1000) / 10
    return total, correct_a, correct_b, pct, pct >= PASS_MARK, detail


async def fetch_attempt_row(attempt_id: str):
    async with pool.acquire() as con:
        row = await con.fetchrow("SELECT * FROM attempts WHERE id = $1", attempt_id)
    if not row:
        raise HTTPException(404, "Attempt not found")
    return row


def check_admin(x_admin_passcode: Optional[str] = Header(default=None)):
    if not x_admin_passcode or x_admin_passcode != ADMIN_PASSCODE:
        raise HTTPException(401, "Invalid or missing facilitator passcode")
    return True


# ---------------------------------------------------------------- schemas

class CreateAttemptBody(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class AnswersBody(BaseModel):
    answers: List[Optional[int]]


# ---------------------------------------------------------------- candidate endpoints

@app.get("/api/health")
async def health():
    return {"ok": True}


@app.post("/api/attempts")
async def create_attempt(body: CreateAttemptBody):
    first = body.first_name.strip()
    last = body.last_name.strip()
    if not first or not last:
        raise HTTPException(400, "First and last name are required")

    option_order = shuffle_options()
    now = datetime.now(timezone.utc)
    deadline = now + timedelta(seconds=DURATION_SECONDS)
    answers = [None] * TOTAL_QUESTIONS

    async with pool.acquire() as con:
        row = await con.fetchrow(
            """
            INSERT INTO attempts (first_name, last_name, started_at, deadline, answers, option_order, submitted)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, false)
            RETURNING id
            """,
            first, last, now, deadline, json.dumps(answers), json.dumps(option_order),
        )

    attempt_id = str(row["id"])
    return {
        "id": attempt_id,
        "first_name": first,
        "last_name": last,
        "deadline": deadline.isoformat(),
        "submitted": False,
        "answers": answers,
        "questions": [public_question(q, option_order[str(q["id"])]) for q in QUESTIONS],
    }


@app.get("/api/attempts/{attempt_id}")
async def get_attempt(attempt_id: str):
    row = await fetch_attempt_row(attempt_id)
    option_order = json.loads(row["option_order"])
    answers = json.loads(row["answers"])
    payload = {
        "id": attempt_id,
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "deadline": row["deadline"].isoformat(),
        "submitted": row["submitted"],
        "answers": answers,
        "questions": [public_question(q, option_order[str(q["id"])]) for q in QUESTIONS],
    }
    if row["submitted"]:
        time_taken = None
        if row["finished_at"] and row["started_at"]:
            time_taken = (row["finished_at"] - row["started_at"]).total_seconds()
        payload["result"] = {
            "score_total": row["score_total"],
            "score_a": row["score_a"],
            "score_b": row["score_b"],
            "pct": float(row["pct"]) if row["pct"] is not None else None,
            "passed": row["passed"],
            "time_taken_seconds": time_taken,
        }
    return payload


@app.patch("/api/attempts/{attempt_id}/answers")
async def save_answers(attempt_id: str, body: AnswersBody):
    row = await fetch_attempt_row(attempt_id)
    if row["submitted"]:
        raise HTTPException(400, "This attempt has already been submitted")
    if len(body.answers) != TOTAL_QUESTIONS:
        raise HTTPException(400, f"Expected {TOTAL_QUESTIONS} answers")
    async with pool.acquire() as con:
        await con.execute(
            "UPDATE attempts SET answers = $1::jsonb WHERE id = $2",
            json.dumps(body.answers), attempt_id,
        )
    return {"ok": True}


@app.post("/api/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str):
    row = await fetch_attempt_row(attempt_id)
    option_order = json.loads(row["option_order"])

    if not row["submitted"]:
        answers = json.loads(row["answers"])
        total, ca, cb, pct, passed, _detail = score_attempt(answers, option_order)
        now = datetime.now(timezone.utc)
        async with pool.acquire() as con:
            await con.execute(
                """
                UPDATE attempts
                SET submitted = true, finished_at = $1,
                    score_total = $2, score_a = $3, score_b = $4, pct = $5, passed = $6
                WHERE id = $7
                """,
                now, total, ca, cb, pct, passed, attempt_id,
            )
        row = await fetch_attempt_row(attempt_id)

    answers = json.loads(row["answers"])
    total, ca, cb, pct, passed, detail = score_attempt(answers, option_order)
    time_taken = None
    if row["finished_at"] and row["started_at"]:
        time_taken = (row["finished_at"] - row["started_at"]).total_seconds()

    return {
        "score_total": total,
        "score_a": ca,
        "score_b": cb,
        "pct": pct,
        "passed": passed,
        "pass_mark": PASS_MARK,
        "time_taken_seconds": time_taken,
        "detail": detail,
    }


# ---------------------------------------------------------------- admin endpoints

@app.get("/api/admin/attempts")
async def admin_list_attempts(_: bool = Depends(check_admin)):
    async with pool.acquire() as con:
        rows = await con.fetch(
            """
            SELECT id, first_name, last_name, started_at, finished_at, submitted,
                   score_total, score_a, score_b, pct, passed
            FROM attempts
            ORDER BY started_at DESC
            """
        )
    out = []
    for r in rows:
        time_taken = None
        if r["finished_at"] and r["started_at"]:
            time_taken = (r["finished_at"] - r["started_at"]).total_seconds()
        out.append(
            {
                "id": str(r["id"]),
                "first_name": r["first_name"],
                "last_name": r["last_name"],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "finished_at": r["finished_at"].isoformat() if r["finished_at"] else None,
                "submitted": r["submitted"],
                "score_total": r["score_total"],
                "score_a": r["score_a"],
                "score_b": r["score_b"],
                "pct": float(r["pct"]) if r["pct"] is not None else None,
                "passed": r["passed"],
                "time_taken_seconds": time_taken,
            }
        )
    return out


@app.get("/api/admin/attempts/{attempt_id}/detail")
async def admin_attempt_detail(attempt_id: str, _: bool = Depends(check_admin)):
    row = await fetch_attempt_row(attempt_id)
    option_order = json.loads(row["option_order"])
    answers = json.loads(row["answers"])
    total, ca, cb, pct, passed, detail = score_attempt(answers, option_order)
    topic_stats: dict = {}
    for d in detail:
        t = topic_stats.setdefault(d["topic"], {"label": d["topic_label"], "correct": 0, "total": 0})
        t["total"] += 1
        if d["correct"]:
            t["correct"] += 1
    return {
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "submitted": row["submitted"],
        "score_total": total,
        "score_a": ca,
        "score_b": cb,
        "pct": pct,
        "passed": passed,
        "detail": detail,
        "topic_stats": topic_stats,
    }


@app.get("/api/admin/topics")
async def admin_topics(_: bool = Depends(check_admin)):
    async with pool.acquire() as con:
        rows = await con.fetch("SELECT answers, option_order FROM attempts WHERE submitted = true")
    topic_stats: dict = {}
    for r in rows:
        answers = json.loads(r["answers"])
        option_order = json.loads(r["option_order"])
        _, _, _, _, _, detail = score_attempt(answers, option_order)
        for d in detail:
            t = topic_stats.setdefault(d["topic"], {"label": d["topic_label"], "correct": 0, "total": 0})
            t["total"] += 1
            if d["correct"]:
                t["correct"] += 1
    for t in topic_stats.values():
        t["pct"] = round(t["correct"] / t["total"] * 1000) / 10 if t["total"] else 0
    return dict(sorted(topic_stats.items(), key=lambda kv: kv[1]["pct"]))
