-- Helpdesk schema: customers raise tickets, agents work them.
-- Every table has row level security; the policies below are the whole access model,
-- because the browser talks to the database directly with the public (anon/publishable) key.

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, created by a trigger on sign-up.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'customer' check (role in ('customer', 'agent')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Policies on other tables need to ask "is the current user an agent?".
-- Querying profiles from inside a profiles policy would recurse (error 42P17),
-- so the check lives in a SECURITY DEFINER function that bypasses RLS.
create function public.is_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'agent'
  );
$$;

-- `(select auth.uid())` instead of `auth.uid()`: Postgres evaluates it once per query
-- instead of once per row, which matters on big tables.
create policy "Users see their own profile; agents see everyone"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_agent()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- RLS decides WHICH ROWS a user can update, not which columns. Without this, any customer
-- could run `update profiles set role = 'agent'` on their own row and promote themselves.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create table public.tickets (
  id           bigint generated always as identity primary key,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  assigned_to  uuid references public.profiles (id) on delete set null,
  subject      text not null check (char_length(subject) between 3 and 200),
  description  text not null check (char_length(description) <= 10000),
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status       text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Columns used in policies and filters need indexes, or RLS turns every query into a full scan.
create index tickets_created_by_idx on public.tickets (created_by);
create index tickets_assigned_to_idx on public.tickets (assigned_to);
create index tickets_status_updated_idx on public.tickets (status, updated_at desc);

alter table public.tickets enable row level security;

create policy "Customers see their own tickets; agents see all"
  on public.tickets for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_agent()));

create policy "Customers open tickets for themselves"
  on public.tickets for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'open' and assigned_to is null);

create policy "Agents update tickets"
  on public.tickets for update to authenticated
  using ((select public.is_agent()))
  with check ((select public.is_agent()));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Comments: public replies and agent-only internal notes
-- ---------------------------------------------------------------------------
create table public.ticket_comments (
  id           bigint generated always as identity primary key,
  ticket_id    bigint not null references public.tickets (id) on delete cascade,
  author_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 10000),
  is_internal  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index ticket_comments_ticket_idx on public.ticket_comments (ticket_id, created_at);
create index ticket_comments_author_idx on public.ticket_comments (author_id);

alter table public.ticket_comments enable row level security;

create policy "Read: agents all, customers public replies on own tickets"
  on public.ticket_comments for select to authenticated
  using (
    (select public.is_agent())
    or (
      not is_internal
      and exists (
        select 1 from public.tickets t
        where t.id = ticket_id and t.created_by = (select auth.uid())
      )
    )
  );

create policy "Write: agents anywhere, customers public replies on own"
  on public.ticket_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (select public.is_agent())
      or (
        not is_internal
        and exists (
          select 1 from public.tickets t
          where t.id = ticket_id and t.created_by = (select auth.uid())
        )
      )
    )
  );

-- A reply bumps the ticket so the queue sorts by latest activity.
create function public.bump_ticket_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

create trigger ticket_comments_bump_ticket
  after insert on public.ticket_comments
  for each row execute function public.bump_ticket_on_comment();

-- Realtime: new comments appear without refreshing. Realtime applies the SELECT policies
-- above, so customers never receive internal notes over the socket either.
alter publication supabase_realtime add table public.ticket_comments;
