# Impact Operations TA

> Admin Organization Dashboard — Technical Assessment for the Impact Operations Internship Program.

A full-stack web application for managing organizations and their members. Admins can create organizations, invite members via email, and manage membership. Invited users sign up, auto-accept their invitation, and land on a role-scoped member profile page.

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
└── migrations/        # Numbered SQL migrations (not committed — apply via Supabase CLI)
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

Migrations are numbered `0001` through `0009` and cover the full schema, RLS policies, profile trigger, invite acceptance, and recursion fixes.

### 5. Deploy the Edge Function

```bash
npx supabase functions deploy invite-member
```

Then set the service-role secret (required by the function — never expose this client-side):

```bash
npx supabase secrets set SERVICE_ROLE_KEY=your-service-role-key
```

### 6. Start the development server

```bash
npm run dev
```

The app runs at `http://localhost:5173`.

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

The repo includes a `vercel.json` that configures the Vite build and SPA rewrites so React Router deep links work correctly.

### Deploy via Vercel CLI

```bash
npx vercel        # preview deployment
npx vercel --prod # production deployment
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
main
 └── feature/<short-description>   e.g. feature/invite-member-form
 └── fix/<short-description>       e.g. fix/rls-recursion
 └── chore/<short-description>     e.g. chore/update-dependencies
```

### Rules

| Branch | Purpose | Direct push? |
|---|---|---|
| `main` | Always deployable production code | No — PRs only |
| `feature/*` | New features | Yes, then open a PR |
| `fix/*` | Bug fixes | Yes, then open a PR |
| `chore/*` | Dependency updates, config, tooling | Yes, then open a PR |

### Workflow

1. Branch off `main`: `git checkout -b feature/my-feature`
2. Make changes, commit with descriptive messages
3. Push branch: `git push -u origin feature/my-feature`
4. Open a Pull Request into `main`
5. Merge after review — delete the branch

### Commit Message Convention

```
<type>: <short description>

feat:   new feature
fix:    bug fix
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

## License

Private — Technical Assessment submission.
