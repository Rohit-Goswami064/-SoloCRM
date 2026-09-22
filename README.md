# SoloCRM

A simple, fast CRM for a solo agency and its calling team. Everything lives in one place:
leads, follow-ups, call notes, customers, callers, sources and categories.

Built for one workflow: **import leads → store them → assign them → call → add notes →
follow up → update status → convert to customer.**

## Who can use it

- **Admin** — you. Full access: import, export, callers, sources, categories, reports, settings.
- **Caller** — your calling staff. They see only the leads assigned to them, and only their
  own notes and follow-ups. Accounts are created by the admin; there is no public sign-up.

Access is enforced in the database (Supabase Row Level Security), not just in the interface.

## Features

- **Excel / CSV import** — upload, preview, map columns, check duplicates, import.
  Duplicate detection by phone, email and company + phone. Nothing is silently overwritten.
  Before importing you pick a default source, category and caller; any column that already
  exists in the file wins.
- **Leads** — search, filters, sorting, pagination, bulk status/category/source/caller updates,
  export, add/edit/delete with confirmation.
- **Caller "My Day"** — today's calls as large cards with big Call, WhatsApp, Note,
  Follow-up and Done buttons, designed for use on a phone.
- **Follow-ups** — date, time, note and status (Pending, Completed, Overdue, Rescheduled).
  Past dates show as Overdue automatically; history is never deleted.
- **Call notes / activity timeline** — every call and status change is recorded chronologically.
  Earlier notes are never overwritten.
- **Pipeline** — New → Contacted → Interested → Follow-up → Proposal sent → Won → Lost.
- **Customers** — convert a won lead in one click.
- **Global search** over name, company, phone and email.

## Tech stack

- React 19 + TypeScript + TanStack Start
- Tailwind CSS 4 + shadcn/ui
- Supabase — authentication, PostgreSQL, Row Level Security, Storage

## Running it locally

```sh
git clone <your repository url>
cd SoloCRM
npm install
npm run dev
```

Then open the local address it prints. The first account you create becomes the admin.

## Environment variables

Copy `.env.example` to `.env` and fill in the values from your Supabase project
(Dashboard → Project Settings → API).

| Variable | Where | What it is |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser | The publishable (anon) key |
| `VITE_SUPABASE_PROJECT_ID` | browser | Your Supabase project ref |
| `SUPABASE_URL` | server | Same project URL |
| `SUPABASE_PUBLISHABLE_KEY` | server | Same publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server | The service role key — needed for admin actions such as creating caller accounts |

Never commit the service role key. It stays on the server only.

## Deploying to Vercel

Import the repository, keep the detected framework settings, add the same variables in
**Settings → Environment Variables**, then deploy. The build switches to the Vercel preset
automatically because Vercel sets `VERCEL` during builds.
