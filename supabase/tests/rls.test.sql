-- Row level security tests. Run with: npx supabase test db
-- Each check impersonates a user by switching to the `authenticated` role and setting the JWT claims,
-- which is exactly what PostgREST does for a real request.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Fixtures (inserted as the postgres superuser, so RLS doesn't apply yet)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'agent@example.com');

select is((select count(*)::int from public.profiles), 3, 'sign-up trigger creates a profile per user');

update public.profiles set role = 'agent' where id = '33333333-3333-3333-3333-333333333333';

insert into public.tickets (created_by, subject, description) values
  ('11111111-1111-1111-1111-111111111111', 'Alice cannot log in', 'Magic link expired'),
  ('22222222-2222-2222-2222-222222222222', 'Bob billing question', 'Charged twice');

insert into public.ticket_comments (ticket_id, author_id, body, is_internal)
select id, '33333333-3333-3333-3333-333333333333', 'Customer is on the legacy plan', true
from public.tickets where subject = 'Alice cannot log in';

insert into public.ticket_comments (ticket_id, author_id, body, is_internal)
select id, '33333333-3333-3333-3333-333333333333', 'Can you try again now?', false
from public.tickets where subject = 'Alice cannot log in';

-- ---------------------------------------------------------------- as Alice (customer)
set local role authenticated;
set local request.jwt.claims to '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  'select subject from public.tickets',
  $$ values ('Alice cannot log in'::text) $$,
  'a customer only sees their own tickets'
);

select results_eq(
  'select body from public.ticket_comments',
  $$ values ('Can you try again now?'::text) $$,
  'a customer does not see internal notes'
);

select is((select count(*)::int from public.profiles), 1, 'a customer only sees their own profile');

select lives_ok(
  $$ insert into public.tickets (subject, description) values ('Second issue', 'Details') $$,
  'a customer can open a ticket (created_by defaults to auth.uid())'
);

select throws_ok(
  $$ insert into public.tickets (created_by, subject, description)
     values ('22222222-2222-2222-2222-222222222222', 'Spoofed', 'As Bob') $$,
  '42501', null,
  'a customer cannot open a ticket on behalf of someone else'
);

select throws_ok(
  $$ insert into public.ticket_comments (ticket_id, body, is_internal)
     select id, 'sneaky', true from public.tickets where subject = 'Alice cannot log in' $$,
  '42501', null,
  'a customer cannot write internal notes'
);

select throws_ok(
  $$ update public.profiles set role = 'agent' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null,
  'a customer cannot promote themselves to agent'
);

select lives_ok(
  $$ update public.profiles set full_name = 'Alice Tan' where id = '11111111-1111-1111-1111-111111111111' $$,
  'a customer can change their own name'
);

-- RLS hides rows from UPDATE without an error, so check the row afterwards.
update public.tickets set status = 'closed';

-- ---------------------------------------------------------------- as the agent
set local request.jwt.claims to '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}';

select is((select count(*)::int from public.tickets), 3, 'an agent sees every ticket');

select is(
  (select status from public.tickets where subject = 'Alice cannot log in'),
  'open',
  'the customer''s update was silently filtered out by RLS'
);

select lives_ok(
  $$ update public.tickets set status = 'resolved' where subject = 'Bob billing question' $$,
  'an agent can change ticket status'
);

select * from finish();
rollback;
