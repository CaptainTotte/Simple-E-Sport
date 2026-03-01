# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (port from APP_PORT, default 3000)
npm run build        # Production build
npm run lint         # Run ESLint

npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:push      # Push schema to DB (accepts data loss — use in dev only)
npm run db:migrate   # Create and run a named migration
npm run db:seed      # Seed games catalog + default admin user
```

The app runs via Docker Compose in the canonical dev setup:
```bash
cp .env.example .env   # Edit as needed
docker compose up
```
Default admin credentials: `admin` / `password` (set in `.env`).

### Test Data Scripts

Run inside the app container with `docker compose exec app npx tsx scripts/<script>`:

```bash
# Create a test tournament (Rocket League 2v2, 4 teams) with Totte as a player
docker compose exec app npx tsx scripts/seed-test-tournament.ts

# Generate the bracket for the test tournament
docker compose exec app npx tsx scripts/generate-test-bracket.ts
```

Bracket generation automatically advances the tournament to `LIVE`.

## Architecture

**Stack:** Next.js 14 (App Router) + TypeScript + Prisma (PostgreSQL) + Tailwind CSS + Zod

This is a single-elimination e-sport tournament platform. All pages and API routes live in one Next.js app.

### Request/Response Pattern

All API routes (`src/app/api/`) follow this structure:
```typescript
export async function POST(req: Request) {
  const actor = await requireActor(prisma, req); // throws 401/403 if invalid
  const body = await parseJson(req, schema);      // Zod validation, throws 400 on failure
  const result = await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, { ... });
    return /* result */;
  });
  return NextResponse.json(result, { status: 201 });
}
// Errors bubble up and are caught by errorResponse() in lib/http.ts
```

### Auth

Sessions are HMAC-SHA256 signed tokens stored in an HTTP-only cookie (`simple_esport_session`, 7-day TTL). The payload contains `{ userId, role, exp }`.

- `src/lib/session.ts` — token creation/verification
- `src/lib/auth.ts` — `getActorFromRequest()` and `requireActor()` used in API routes
- `src/lib/account-status.ts` — timeout/ban checks on each request

**Roles:** `PLATFORM_ADMIN > TOURNAMENT_ADMIN > TEAM_CAPTAIN > PLAYER`
Permission helpers live in `src/lib/permissions.ts`.

### Database

Schema is in `prisma/schema.prisma`. Key models:
- **User / Team / TeamMember / TeamInvitation** — account and team management
- **Tournament / TournamentRuleset / TournamentRoleAssignment** — tournament config with game/mode selection
- **GameDefinition / GameModeDefinition / GameContextItemDefinition** — seeded game catalog (no hardcoded game logic)
- **Bracket / Match / MatchReport / ProofAsset** — single-elimination bracket and match reporting
- **Notification / AuditLog** — in-app notifications and sensitive-action audit trail

Match flow: `PENDING → READY → REPORTED → FINALIZED`. Reports go through `SUBMITTED → APPROVED/REJECTED` admin review.

Prisma singleton is in `src/lib/prisma.ts` (uses `globalThis` to avoid hot-reload issues in dev).

### Key Libraries

| File | Purpose |
|---|---|
| `src/lib/bracket.ts` | Single-elimination bracket generation (large, complex) |
| `src/lib/validation.ts` | All Zod schemas for API inputs |
| `src/lib/http.ts` | `parseJson()`, `errorResponse()` |
| `src/lib/scoring.ts` | 10 pts/win + tournament bonuses (10/20/30 for 4/8/16-team) |
| `src/lib/notifications.ts` | In-app notification creation |
| `src/lib/image-upload.ts` | Saves JPG/PNG/WebP (≤5MB) to `/public/uploads/` |
| `src/lib/audit.ts` | `writeAuditLog()` — call inside transactions |

### UI / Styling

Tailwind with a custom dark theme defined in `tailwind.config.ts`:
- Background: `#0E0F12`, Surface: `#181A1F`, Elevated: `#202329`
- Primary accent: `#6D5DFC` (purple)
- Text: `#E5E7EB`

The largest UI file is `src/app/tournaments/[id]/tournament-tabs.tsx` (~42KB) — the tournament detail page with all tabs.

### Environment Variables

See `.env.example`. Required vars: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, and admin seed credentials.

`next.config.mjs` uses separate build dirs (`.next-dev` / `.next-prod`) for Docker compatibility.

### Tournament Lifecycle

Status transitions are linear and enforced server-side:
```
DRAFT → REGISTRATION_OPEN → REGISTRATION_CLOSED → LIVE → COMPLETED
```
- `PATCH /api/tournaments/[id]/status` — advances one step at a time; rejects illegal jumps
- Bracket generation (`POST /api/tournaments/[id]/generate-bracket`) auto-advances to `LIVE`
- Admin UI shows a context-aware "Open Reg. / Close Reg. / Go Live / Complete" button per tournament

### Admin Actions

`PATCH /api/admin/users/[id]` handles all user moderation. Actions: `set_timeout` (3/14/30 days), `clear_timeout`, `ban`, `unban`, `set_admin`, `set_username`, `remove_avatar`. The `set_timeout` and `ban` actions accept an optional `reason` string stored in `AuditLog.metadata`.

`GET /api/admin/users/[id]` returns recent `USER_TIMEOUT` / `USER_BANNED` audit log entries for the moderation history panel.

### Registration Management

`DELETE /api/tournaments/[id]/register` — admin removes a team from a tournament (body: `{ teamId }`). Writes a `TEAM_REGISTRATION_REMOVED` audit log entry.
