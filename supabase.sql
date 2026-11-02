-- Run once in the Supabase SQL editor. Stores phone subscriptions for Raceplan reminders.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  tz text not null default 'UTC',
  remind_time text not null default '07:00',
  days jsonb not null default '{}'::jsonb,
  last_sent_date text,
  updated_at timestamptz not null default now()
);

-- Only the server (service role key) may read or write this table. No public policies.
alter table public.push_subscriptions enable row level security;

-- Accounts: one row per username (no passwords). Each user's plan, check-ins and coach chats live in "data".
create table if not exists public.app_users (
  username text primary key,          -- lowercase, used for matching
  display text not null,              -- how the name was first typed, e.g. Anthony
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default 0,       -- time of the last change (ms), used to keep the newest copy
  updated_at timestamptz not null default now()
);

-- Only the server (service role key) may read or write this table. No public policies.
alter table public.app_users enable row level security;
