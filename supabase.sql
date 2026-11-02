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
