-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).

create extension if not exists pgcrypto;

create table if not exists attempts (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  started_at    timestamptz not null default now(),
  deadline      timestamptz not null,
  finished_at   timestamptz,
  submitted     boolean not null default false,
  answers       jsonb not null default '[]'::jsonb,      -- array of 120 (index | null), the display-option index the candidate picked
  option_order  jsonb not null default '{}'::jsonb,       -- {"1": [2,0,3,1], ...} per-question shuffle, generated once at start
  score_total   int,
  score_a       int,
  score_b       int,
  pct           numeric,
  passed        boolean,
  created_at    timestamptz not null default now()
);

create index if not exists idx_attempts_submitted on attempts (submitted);
create index if not exists idx_attempts_started_at on attempts (started_at desc);

-- The backend connects with the DATABASE_URL connection string (service-role /
-- direct Postgres access), not the public anon key, so Row Level Security can
-- stay off for this table — nothing public touches Postgres directly.
