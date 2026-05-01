# Crucible Balancer

Back-office for managing heroes, cards, and balance for **Crucible of Ascension** (real-time PvP).

Stack: Vite · React 18 · TypeScript · Tailwind · Supabase (auth + Postgres + RLS) · Vercel.

> Architecture, conventions, and phase plan: see [CLAUDE.md](./CLAUDE.md).

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and paste in the project's URL + anon key (Settings → API).

### 3. Run the migrations

In the Supabase SQL Editor, run each file in `supabase/migrations/` in order:

1. `0001_init.sql` — schema
2. `0002_rls.sql` — RLS policies
3. `0003_seed.sql` — dev / staging / prod environments + GDD coefficients + 5 starter heroes

(Or use `supabase db push` if you have the CLI linked.)

### 4. Create your first user

Supabase Studio → Authentication → Users → "Add user". Then in the SQL Editor:

```sql
insert into user_roles (user_id, role) values
  ('<your-auth-user-id>', 'admin');
```

Roles are `admin` | `designer` | `viewer`.

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:5173>. Sign in. You should see Anaitis, Darius, Dawar, Ishaa, and Tayfan in the dev environment, with computed Mastery Score and Balance Power.

---

## Phase 1 — what's working

- Auth (email + password) with role-based UI gating
- Environment switcher (dev / staging / prod), persisted
- Heroes CRUD with live, computed Mastery Score and Balance Power
- Admin coefficients editor (attribute → stat conversions, MS/BP weights)
- 5 starter heroes seeded with their GDD attribute values
- Audit trail via `change_log` (populated by Postgres triggers on every write)

## Phases ahead

| Phase | Scope |
|------:|-------|
| 2 | Cards CRUD with effects + computed Card Power |
| 3 | Deck builder (5 role-specific + 5 general) + hero BP including deck |
| 4 | Balance budgets per (combat_role × mastery_rank) + violation flags |
| 5 | Pairwise simulator + nightly balance report |

See [CLAUDE.md](./CLAUDE.md) for the full architecture rationale.
