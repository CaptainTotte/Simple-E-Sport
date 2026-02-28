# Simple E-Sport

Dark-themed MVP for configurable e-sport tournaments with:

- Database-driven game definitions (no per-game hardcoded logic)
- Mode/team-size validation
- Single elimination bracket generation
- Match reporting with image proof URL
- Admin approval and bracket advancement
- Audit logging for sensitive actions
- Login + registration with session cookies
- Landing page listing active tournaments with game cover images

## Quick Start (Docker Compose)

1. Ensure Docker is running.
2. From this project root:

```bash
docker compose up --build
```

3. Open:
- App: http://localhost:3001
- Admin Console: http://localhost:3001/admin
- Login: http://localhost:3001/login

If you want other host ports, set in `.env`:
- `APP_PORT` for web (for example `APP_PORT=3010`)
- `DB_PORT` for Postgres (default `5433` to avoid conflicts with local Postgres on `5432`)

The app container runs:

- `prisma generate`
- `prisma db push`
- seed script for games + default admin user
- `next dev`

## Environment

The project includes `.env` and `.env.example`:

```env
POSTGRES_USER=esport
POSTGRES_PASSWORD=esport
POSTGRES_DB=esport
DATABASE_URL=postgresql://esport:esport@db:5432/esport?schema=public
APP_PORT=3001
DB_PORT=5433
NEXT_PUBLIC_APP_URL=http://localhost:3001
AUTH_SECRET=dev-super-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password
ADMIN_NAME=Admin
```

## Auth (MVP)

The app includes login and registration pages.

Default admin credentials (seeded on startup):

- Username: `admin`
- Password: `password`

Those defaults are defined in `docker-compose.yml` via `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

## Core API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/seed-games`
- `GET /api/games`
- `GET /api/tournaments`
- `POST /api/tournaments`
- `GET /api/tournaments/:id`
- `POST /api/tournaments/:id/ruleset`
- `POST /api/tournaments/:id/register`
- `POST /api/tournaments/:id/generate-bracket`
- `POST /api/matches/:id/report`
- `POST /api/reports/:id/approve`

## Local (without Docker)

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```
