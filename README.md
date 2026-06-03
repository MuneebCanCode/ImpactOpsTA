# Impact Operations TA

> Admin Organization Dashboard — Technical Assessment for the Impact Operations Internship Program.

A full-stack web application for managing organizations and their members. Admins can create organizations, invite members via email, and manage membership. Invited users sign up, auto-accept their invitation, and land on a role-scoped member profile page.

---

## Live Demo

| Environment | URL |
|---|---|
| Production (`main`) | https://impact-ops-ta.vercel.app |
| Preview (`development`) | https://impact-ops-gjefzcuoz-muhammad-muneebs-projects-2d740be9.vercel.app |

### Demo Credentials

Use the following admin account to log in without signing up:

| Field | Value |
|---|---|
| **Email** | `admin.test3@gmail.com` |
| **Password** | `admintest3` |

> This account has pre-existing organizations and members. Sign in at the Production URL above.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite (SWC) |
| Styling | Tailwind CSS + shadcn/ui + next-themes |
| Forms & Validation | React Hook Form + Zod |
| Data Fetching | TanStack React Query v5 |
| Backend / DB | Supabase (Postgres + Row Level Security) |
| Auth | Supabase Auth (email/password) |
| Edge Functions | Supabase Deno Edge Functions |
| Deployment | Vercel |
| Testing | Vitest + Testing Library + fast-check (property-based) |

---

## Features

- **Authentication** — Sign up, sign in, sign out with session persistence
- **Role-based routing** — Admins land on the organization directory; members land on their profile page
- **Organization directory** — List, search, and filter organizations by type (school, nonprofit, government, business)
- **Create organization** — Dialog form with type-driven conditional fields (school requires district)
- **Member management** — Invite members by email via a Supabase Edge Function
- **Invitation acceptance** — Auto-fires on sign-in when a pending invite exists; redirects appropriately
- **Member profile** — Shows org name, type, status, email, and join date (no admin actions)
- **Dark / light theme** — Persisted toggle via next-themes
- **Row Level Security** — All data access enforced at the database level
- **Mobile responsive** — Fully usable on mobile, tablet, and desktop

---

## Project Structure

```
src/
├── components/
│   ├── layout/        # ProtectedLayout (route guard + app chrome)
│   ├── state/         # QueryState (loading/error/empty/data pattern)
│   ├── theme/         # ThemeToggle
│   └── ui/            # shadcn/ui primitives
├── features/
│   ├── auth/          # SignInPage, SignUpPage, hooks, schemas
│   ├── invitations/   # AcceptInvitePage, hooks
│   ├── members/       # MembersList, InviteMemberForm, MemberProfilePage, hooks
│   └── organizations/ # DirectoryPage, OrgDetailPage, CreateOrgDialog, hooks
├── lib/               # supabase client, react-query client, utils
├── providers/         # AuthProvider, ThemeProvider
├── types/             # TypeScript types mirroring the DB schema
└── test/              # Vitest global setup

supabase/
├── functions/
│   └── invite-member/ # Deno Edge Function — JWT auth + service-role insert
└── migrations/        # 0001–0009 SQL migrations (schema, RLS, triggers)
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for running migrations and deploying Edge Functions)
- A [Supabase](https://supabase.com/) project
- A [Vercel](https://vercel.com/) account (for deployment)

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/MuneebCanCode/ImpactOpsTA.git
cd ImpactOpsTA
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your Supabase project values:

```bash
cp .env.example .env
```

```env
# Base URL of your Supabase project
VITE_SUPABASE_URL=https://your-project-ref.supabase.co

# Supabase public anon key (safe to expose in client bundle)
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these values in your Supabase dashboard under **Project Settings → API**.

> **Never commit your `.env` file.** It is listed in `.gitignore`. Only `.env.example` (with empty values) is committed.

### 4. Apply database migrations

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

See the [Database Setup](#database-setup) section for a full breakdown of what each migration does.

### 5. Deploy the Edge Function

```bash
npx supabase functions deploy invite-member
```

Then set the service-role secret (required by the function — never expose this client-side):

```bash
npx supabase secrets set SERVICE_ROLE_KEY=your-service-role-key
```

Find the service-role key in your Supabase dashboard under **Project Settings → API → service_role key**.

### 6. Start the development server

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

---

## Database Setup

All migrations live in `supabase/migrations/` and are applied in order via `supabase db push`. Here is what each one does and how to recreate the full schema from scratch against a fresh Supabase project.

### Recreate schema on a fresh project

A single consolidated script — `supabase/DbSetup.sql` — combines all 9 migrations into one idempotent file. Run it once and the entire schema, RLS policies, triggers, and helper functions are created.

**Option A — Supabase SQL Editor (easiest, no CLI needed):**

1. Open your Supabase project → **SQL Editor**
2. Copy the contents of `supabase/DbSetup.sql`
3. Paste and click **Run**

**Option B — Supabase CLI:**

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Log in and link your project
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

# 3. Run the single consolidated schema script
psql "$DATABASE_URL" -f supabase/DbSetup.sql

# 4. Deploy the Edge Function
npx supabase functions deploy invite-member

# 5. Set the service-role secret for the Edge Function
npx supabase secrets set SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# 6. (Optional) Disable email confirmation in Supabase Auth
#    Dashboard → Authentication → Settings → Enable email confirmations → OFF
#    This speeds up testing by skipping the confirmation email step.
```

> The individual numbered migration files (`0001` – `0009`) are also in `supabase/migrations/` for reference and version history.

### Migration breakdown

> All of the below are consolidated into `supabase/DbSetup.sql` — you only need to run that one file.

| File | Purpose |
|---|---|
| `0001_init_schema.sql` | Enums (`org_type`, `member_status`, `member_role`), tables (`profiles`, `organizations`, `organization_members`), constraints, indexes |
| `0002_rls_policies.sql` | Enable RLS on all tables; owner-scoped SELECT/INSERT/UPDATE/DELETE policies for `organizations` and `organization_members`; self-scoped policies for `profiles` |
| `0003_profile_trigger.sql` | `SECURITY DEFINER` trigger that auto-creates a `profiles` row on every new `auth.users` insert; sets `is_admin = true` |
| `0004_invite_acceptance_rls.sql` | Allows an invited user to SELECT and UPDATE their own pending invitation row (matched by email) |
| `0005_fix_invite_update_rls.sql` | Simplifies the invite UPDATE `WITH CHECK` to `id = id` to avoid subquery re-evaluation blocking acceptance |
| `0006_member_profile_flag.sql` | `SECURITY DEFINER` trigger that sets `is_admin = false` when `user_id` is set on an `organization_members` row (acceptance moment); adds `organizations_select_as_member` policy |
| `0007_backfill_member_is_admin.sql` | One-time backfill: sets `is_admin = false` for users who accepted invitations before migration 0006 existed |
| `0008_fix_org_member_rls_recursion.sql` | Fixes circular RLS recursion between `organizations` and `organization_members` by splitting policies |
| `0009_fix_recursion_with_function.sql` | Final recursion fix: introduces `is_active_member_of(org_id)` `SECURITY DEFINER` function that bypasses RLS to break the cycle cleanly; consolidates member SELECT policies |

### RLS policy summary

Every table has RLS enabled. The policies enforce:

- **Admins** see and mutate only rows they own (`owner_id = auth.uid()` on organizations; transitive ownership on members)
- **Members** can read their own invitation row and the organization they belong to
- **Profiles** are readable/updatable only by their owner; inserts are trigger-only (no client insert policy)
- The `invite-member` Edge Function uses the **service-role key** which bypasses RLS — it performs its own explicit ownership check before any write

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Run TypeScript compiler check only |
| `npm run lint` | Run ESLint |
| `npm test` | Run all Vitest tests (unit + property-based) |

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `SERVICE_ROLE_KEY` | Edge Function only | Supabase service-role key — set as a Supabase secret, never in `.env` |

See `.env.example` for a fully commented template.

---

## Deployment (Vercel)

The repo includes a `vercel.json` that configures the Vite build and SPA rewrites so React Router deep links work correctly on Vercel.

### Deploy via Vercel CLI

```bash
# Link to your Vercel project (first time only)
npx vercel link

# Production deployment (from main branch)
git checkout main
npx vercel --prod

# Preview deployment (from development branch)
git checkout development
npx vercel
```

### Set environment variables on Vercel

```bash
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
```

Then redeploy:

```bash
npx vercel --prod
```

---

## Branching Strategy

This project follows a **GitHub Flow** branching model — simple, linear, and well-suited for a small team or solo development:

```
main           ← always deployable, production
development    ← integration branch, maps to preview deployment
 └── feature/<short-description>   e.g. feature/invite-member-form
 └── fix/<short-description>       e.g. fix/rls-recursion
 └── chore/<short-description>     e.g. chore/update-dependencies
```

### Rules

| Branch | Purpose | Direct push? |
|---|---|---|
| `main` | Always deployable production code | No — PRs only |
| `development` | Integration / preview branch | No — PRs only |
| `feature/*` | New features | Yes, then open a PR into `development` |
| `fix/*` | Bug fixes | Yes, then open a PR into `development` |
| `chore/*` | Dependency updates, config, tooling | Yes, then open a PR into `development` |

### Workflow

1. Branch off `development`: `git checkout -b feature/my-feature`
2. Make changes, commit with descriptive messages
3. Push branch: `git push -u origin feature/my-feature`
4. Open a Pull Request into `development`
5. Once validated, open a PR from `development` into `main`
6. Merge and delete the feature branch

### Commit Message Convention

```
feat:   new feature
fix:    bug fix
perf:   performance improvement
chore:  tooling, deps, config
test:   adding or updating tests
docs:   documentation only
```

---

## Testing

123 tests across unit, integration, and property-based suites:

```bash
npm test
```

Property-based tests use [fast-check](https://github.com/dubzzz/fast-check) to verify 19 correctness properties covering schema validation, component state patterns, and data invariants.

---

## Reflection

### What I'd do with another day

- **Pagination** — The organization directory and members list currently load all rows. Adding cursor-based pagination to both would make the app production-ready for large datasets.
- **Real email delivery** — The Edge Function has an email integration point but it isn't wired to a provider (Resend/SendGrid). With another day I'd complete that integration so invitations actually arrive in inboxes.
- **Organization editing and deletion** — Admins can create organizations but not rename or remove them. Full CRUD would be the next logical step.
- **Profile management** — Admins can't update their full name or password from the UI. A simple settings page would round out the user experience.
- **CI/CD pipeline** — Add a GitHub Actions workflow to run `npm test` and `npm run build` on every PR before merge, replacing the current manual verification step.

### Shortcuts taken

- **No email sending in the invite flow** — The Edge Function inserts the member row and returns success, but does not actually dispatch an email. In production this would use a transactional email provider. For the assessment the invite URL is constructed manually or surfaced via the Supabase dashboard.
- **Email confirmation disabled** — Supabase email confirmation is turned off in the Auth settings to avoid rate-limit friction during testing. A production deployment would re-enable this and configure a custom SMTP provider.
- **No rate limiting on the Edge Function** — The `invite-member` function has no per-user rate limit. A production API would add this to prevent abuse.
- **Vitest only, no Playwright** — E2E tests are scaffolded in `package.json` but not implemented. The test suite is unit and property-based only.

### Tradeoffs made

- **Two-step member query vs. join** — `MemberProfilePage` fetches the member row and then the organization row separately rather than using a Postgres join. This avoids the circular RLS subquery issue (organizations ↔ organization_members) at the cost of one extra round trip. The `SECURITY DEFINER` function in migration 0009 handles the recursion for the admin path; the member path uses the simpler two-step approach as a deliberate tradeoff of simplicity over efficiency.
- **`is_admin` flag vs. separate roles table** — Role is stored as a boolean (`is_admin`) on the `profiles` table for simplicity. A more scalable design would use a separate roles table or a `member_role` enum on profiles. For a two-role system this is sufficient and avoids over-engineering.
- **Client-side filtering vs. server-side** — Search and type filtering are passed as query parameters to Supabase (`ilike`, `eq`) so filtering is server-side. This is correct for large datasets. The tradeoff is that every keystroke triggers a debounce-less re-query — adding debounce to the search input would reduce load in production.
- **Tailwind + shadcn/ui vs. a component library** — Using utility-first CSS with unstyled Radix primitives gives full control over accessibility and styling without fighting a component library's opinions. The tradeoff is more upfront markup per component compared to using a pre-built library like MUI or Chakra.

---

## License

Private — Technical Assessment submission.
