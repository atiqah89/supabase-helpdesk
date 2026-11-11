# Supabase Helpdesk

[![CI](https://github.com/atiqah89/supabase-helpdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/atiqah89/supabase-helpdesk/actions/workflows/ci.yml)

A small support-ticket app built with **Supabase** and **Angular**. Customers open tickets and reply; agents see the whole queue, change status and leave internal notes customers can't see.

The front end talks to Postgres directly, so all access control is **row level security**, and the policies are covered by **pgTAP tests in CI**.

| | |
|---|---|
| Auth | Magic-link email sign-in, profile row created by a trigger |
| Data | Postgres with RLS on every table; customer/agent roles; column-level grants |
| Realtime | New replies appear live; RLS also applies to the socket |
| Edge Function | `notify-urgent` posts urgent tickets to Slack via a Database Webhook |
| Front end | Angular 21: standalone components, signals, zoneless, new control flow |
| Tests | 12 pgTAP checks for the security model, run against a real Supabase Postgres in GitHub Actions |
| Docs | [Support playbook](docs/support-playbook.md): 11 common Supabase issues, how to diagnose them, and where this repo handles each |

## Access model

| | Customer | Agent |
|---|---|---|
| See tickets | own | all |
| Open a ticket | for themselves only | for themselves only |
| Change status | no | yes |
| See internal notes | **no** (also not via Realtime) | yes |
| Write internal notes | no | yes |
| Change own `role` | **no** (column grant) | no |

Every row in this table is a test in [`supabase/tests/rls.test.sql`](supabase/tests/rls.test.sql).

## Run it locally

You need Node.js and Docker Desktop (for the local Supabase stack).

```bash
npm install
npx supabase start     # Postgres, Auth, Realtime, Studio, Mailpit. Applies the migration.
npx supabase test db   # runs the RLS tests
```

Copy the **Publishable key** (or **anon key**) that `supabase start` prints into `src/environments/environment.ts`, then:

```bash
npm start              # http://localhost:4200
```

Sign in with any email address. The magic link arrives in Mailpit at http://127.0.0.1:54324.

To try the agent view, open Studio (http://127.0.0.1:54323), go to the SQL editor and run:

```sql
update public.profiles set role = 'agent' where email = 'you@example.com';
```

Use a second browser profile as a customer to watch replies arrive in real time.

### Without Docker

Create a free project at supabase.com, then:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

Put the project URL and publishable key in `environment.ts`, and add `http://localhost:4200` under Authentication → URL Configuration → Redirect URLs.

## Urgent ticket alerts (Edge Function)

```bash
npx supabase functions deploy notify-urgent
npx supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 24) SLACK_WEBHOOK_URL=https://hooks.slack.com/... APP_URL=https://your-app
```

Then go to Database → Webhooks → Create: table `tickets`, event `INSERT`, type Supabase Edge Function `notify-urgent`, and add the HTTP header `x-webhook-secret` with the same value. Without `SLACK_WEBHOOK_URL`, the function only logs what it would have sent.

## Project layout

```
supabase/
  migrations/…_helpdesk.sql   schema, RLS policies, triggers, realtime publication
  tests/rls.test.sql          pgTAP: 12 checks that impersonate customers and agents
  functions/notify-urgent/    Deno Edge Function with shared-secret auth
  config.toml                 redirect allow-list, function settings
src/app/
  core/supabase.ts            client + error unwrapping that keeps PostgREST error codes
  core/auth.ts                session/profile signals, magic link, route guard
  core/tickets.ts             queries (explicit FK embeds), realtime subscription
  pages/                      login, list, new ticket, ticket detail
docs/support-playbook.md
```

## License

MIT
