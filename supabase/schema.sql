-- MockRoom schema. Run in Supabase -> SQL Editor on a fresh project.
-- Any Google account can sign in; students must submit name + SAP ID and be approved.
-- Resumes and answers never reach the database; only summary results do.

drop table if exists public.interview_details, public.resumes, public.allowed_domains cascade;

create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('your.email@gmail.com') on conflict do nothing;

create table if not exists public.roster (
  sap_id text primary key check (sap_id ~ '^\d{11}$'),
  full_name text
);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text check (full_name is null or char_length(full_name) between 2 and 80),
  sap_id text unique check (sap_id is null or sap_id ~ '^\d{11}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  role_title text, focus text, difficulty text, mode text, model text,
  score int check (score between 0 and 100),
  verdict text, questions int, answered int, wpm int, avg_seconds int,
  dims jsonb, summary jsonb
);
create index if not exists interviews_user_created on public.interviews (user_id, created_at desc);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

-- New sign-in: create the profile. Admins are approved immediately.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          case when exists (select 1 from public.admins where lower(email) = lower(new.email)) then 'approved' else 'pending' end);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Students can't approve themselves. Approved details are locked.
-- Editing details after rejection resubmits for review. Roster matches are auto-approved.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    if new.status is distinct from old.status then new.reviewed_at := now(); end if;
    return new;
  end if;
  new.id := old.id; new.email := old.email; new.review_note := old.review_note; new.reviewed_at := old.reviewed_at;
  if old.status = 'approved' then
    new.full_name := old.full_name; new.sap_id := old.sap_id; new.status := 'approved';
    return new;
  end if;
  new.status := 'pending';
  if new.sap_id is not null and exists (select 1 from public.roster where sap_id = new.sap_id) then
    new.status := 'approved'; new.reviewed_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

alter table public.admins enable row level security;
alter table public.roster enable row level security;
alter table public.profiles enable row level security;
alter table public.interviews enable row level security;

drop policy if exists "admins see own row" on public.admins;
create policy "admins see own row" on public.admins for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "roster admin only" on public.roster;
create policy "roster admin only" on public.roster for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin" on public.profiles for update
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "interviews read own or admin" on public.interviews;
create policy "interviews read own or admin" on public.interviews for select
  using ((user_id = auth.uid() and public.is_approved()) or public.is_admin());
drop policy if exists "interviews insert approved" on public.interviews;
create policy "interviews insert approved" on public.interviews for insert
  with check (user_id = auth.uid() and public.is_approved());
drop policy if exists "interviews delete own" on public.interviews;
create policy "interviews delete own" on public.interviews for delete
  using (user_id = auth.uid());
