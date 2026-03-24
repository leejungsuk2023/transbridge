-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- This sets up the hospitals and sessions tables with RLS policies.

-- hospitals table
create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  plan text not null default 'free' check (plan in ('free', 'basic', 'premium')),
  created_at timestamptz not null default now()
);

-- sessions table
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references hospitals(id) on delete cascade,
  patient_lang text check (patient_lang in ('th', 'vi', 'en', 'id')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec integer
);

-- Enable RLS
alter table hospitals enable row level security;
alter table sessions enable row level security;

-- RLS policies

create policy "Users can read own hospital" on hospitals
  for select using (auth_user_id = auth.uid());

create policy "Users can read own sessions" on sessions
  for select using (hospital_id in (
    select id from hospitals where auth_user_id = auth.uid()
  ));

create policy "Users can insert own sessions" on sessions
  for insert with check (hospital_id in (
    select id from hospitals where auth_user_id = auth.uid()
  ));

create policy "Users can update own sessions" on sessions
  for update using (hospital_id in (
    select id from hospitals where auth_user_id = auth.uid()
  ));
