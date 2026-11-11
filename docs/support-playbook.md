# Supabase support playbook

Common problems Supabase users hit, how to recognise them, and where this repo shows the fix. Each one is something I deliberately handled, or tested, while building the helpdesk.

## 1. "My query returns an empty array, but the data is there"

**Symptom:** `select` returns `[]`, with no error. The rows are visible in the Table Editor (which runs as `postgres` and bypasses RLS).
**Cause:** RLS is on and no policy matches the caller. RLS filters rows silently; it doesn't raise an error.
**Check:**
```sql
select * from pg_policies where tablename = 'tickets';
-- impersonate the user, exactly like PostgREST does:
set local role authenticated;
set local request.jwt.claims to '{"sub":"<user uuid>","role":"authenticated"}';
select * from tickets;
```
**In this repo:** `supabase/tests/rls.test.sql` uses exactly this technique.

## 2. Updates "succeed" but nothing changes

**Symptom:** `update()` returns no error and `data: null`, but the row is unchanged.
**Cause:** the UPDATE policy's `using` clause matched zero rows. Postgres treats that as a successful update of 0 rows.
**Fix:** chain `.select()` and check the row count. See `TicketService.setStatus()`.

## 3. `infinite recursion detected in policy for relation "profiles"` (42P17)

**Cause:** a policy on `profiles` queries `profiles`, for example "agents can see all profiles" implemented as `exists (select 1 from profiles where role = 'agent' ...)`.
**Fix:** move the check into a `security definer` function with `set search_path = ''`. See `public.is_agent()`.

## 4. A user made themselves admin by updating their profile

**Cause:** RLS controls which **rows** a user can update, not which **columns**. "Users can update their own profile" includes the `role` column.
**Fix:** column privileges, as in the migration:
```sql
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;
```
Covered by the test "a customer cannot promote themselves to agent".

## 5. `Could not embed because more than one relationship was found` (PGRST201)

**Cause:** `tickets` has two foreign keys to `profiles` (`created_by` and `assigned_to`), so `select('*, profiles(*)')` is ambiguous.
**Fix:** name the constraint: `requester:profiles!tickets_created_by_fkey(email, full_name)`.

## 6. RLS is slow on large tables

**Causes and fixes:**
- `auth.uid()` evaluated per row. Wrap it: `(select auth.uid())`, so Postgres runs it once as an InitPlan.
- Missing index on the policy column (`created_by`). Every table here indexes its policy columns.
- `security definer` helpers like `is_agent()` wrapped in `(select ...)` for the same reason.
- Confirm with `explain analyze` while impersonating the role (see #1).

## 7. Realtime events never arrive

Checklist:
1. The table is in the publication: `alter publication supabase_realtime add table ...` (in the migration).
2. The subscriber can `select` the row. Realtime applies RLS, which is why customers never get internal notes.
3. The `filter` uses PostgREST syntax: `ticket_id=eq.42`.
4. The channel is removed on destroy, or the connection limit is hit after many page changes (`ngOnDestroy` in `TicketDetailPage`).

## 8. Magic link opens `localhost:3000` or "redirect URL not allowed"

**Cause:** `emailRedirectTo` isn't in the allow-list, so Auth falls back to the Site URL.
**Fix:** add the URL under Authentication → URL Configuration (cloud) or `additional_redirect_urls` in `supabase/config.toml` (local).

## 9. `email rate limit exceeded` (429) on sign-in

**Cause:** the built-in email service is heavily rate-limited, and only meant for testing.
**Fix:** configure custom SMTP before going live. Locally, emails go to Mailpit (port 54324) with no limit.

## 10. The app hangs after sign-in, or `getSession()` never resolves

**Cause:** awaiting another Supabase call inside `onAuthStateChange`. The callback runs while the auth client holds a lock.
**Fix:** defer the work with `setTimeout(...)`. See `AuthService`.

## 11. Edge Function returns 401 when called from a Database Webhook

**Cause:** functions verify a user JWT by default, and a webhook doesn't send one.
**Fix:** `verify_jwt = false` for that function, plus your own shared-secret check (see `config.toml` and `notify-urgent`).
