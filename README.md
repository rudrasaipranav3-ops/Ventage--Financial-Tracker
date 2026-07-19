# Vantage — Backend Scaffold

Server-side companion to the Vantage frontend dashboard: a Node/Express API backed
by PostgreSQL (via Prisma), a Python/FastAPI microservice for forecasting and RFM
segmentation, and the Docker/CI plumbing to run all of it together.

This is a **working scaffold**, not a deployed product — it hasn't run against a
live database or been through `npm install` in this environment (no network
access here). Every file has been syntax-checked, and the structure and logic
follow standard, well-tested patterns, but budget time for the normal first-run
issues (migrations, missing env vars, dependency versions) when you bring it up
in your own environment.

---

## 1. Architecture

```
                        ┌─────────────────────┐
                        │   Frontend (Vite)    │  Vercel
                        │   React dashboard     │
                        └──────────┬───────────┘
                                   │ HTTPS / JSON
                                   ▼
                        ┌─────────────────────┐
                        │  nginx (reverse proxy)│
                        └──────────┬───────────┘
                                   ▼
                        ┌─────────────────────┐
                        │  Node/Express API     │  Render / Docker
                        │  (JWT auth, RBAC,     │
                        │   CRUD, exports, AI)  │
                        └──┬────────────────┬──┘
                           │                │
                 Prisma ORM│                │ REST (axios)
                           ▼                ▼
                 ┌───────────────┐  ┌──────────────────────┐
                 │  PostgreSQL    │  │  Python/FastAPI        │
                 │                │  │  Prophet forecasting +  │
                 │                │  │  pandas RFM segmentation│
                 └───────────────┘  └──────────────────────┘
```

The Node API is the only service the frontend talks to directly. It proxies
forecasting requests to the Python service and never exposes it publicly.

---

## 2. Repository structure

```
vantage-backend/
├── docker-compose.yml        Orchestrates postgres + backend + python-service + nginx
├── .env.example               Root env vars consumed by docker-compose
├── nginx/nginx.conf           Reverse proxy in front of the API
├── .github/workflows/
│   ├── ci.yml                 Lint/test on push & PR
│   └── deploy.yml             Deploy hooks for Render (backend) + Vercel (frontend)
│
├── backend/                   Node/Express API
│   ├── prisma/schema.prisma   Database models
│   ├── prisma/seed.js         Demo data seeder
│   ├── src/
│   │   ├── server.js / app.js
│   │   ├── config/            env, Prisma client, Passport strategy
│   │   ├── middleware/        auth (JWT), RBAC, upload, error handling
│   │   ├── routes/            one file per resource
│   │   ├── controllers/       business logic
│   │   └── services/          aiService (OpenAI/Gemini/Claude), etc.
│   └── tests/
│
└── python-service/            FastAPI microservice
    ├── main.py
    ├── models/schemas.py      Pydantic request/response models
    ├── services/
    │   ├── forecasting.py     Prophet-based revenue/expense forecasting
    │   └── analytics.py       pandas RFM customer segmentation
    └── tests/
```

---

## 3. Quick start (Docker)

```bash
git clone <your-repo-url> vantage-backend
cd vantage-backend
cp .env.example .env          # fill in JWT secrets at minimum
docker compose up --build
```

Then, in a separate terminal, run migrations and seed demo data:

```bash
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

- API: `http://localhost/api` (via nginx) or `http://localhost:4000/api` directly
- Forecasting service: `http://localhost:8000` (internal — not exposed through nginx)
- Demo login: `admin@vantage-demo.io` / `Password123!`

## 4. Manual local dev (no Docker)

```bash
# Postgres — use a local install or `docker run -p 5432:5432 postgres:16-alpine`

cd backend
cp .env.example .env          # point DATABASE_URL at your local Postgres
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev                   # nodemon on :4000

# In a second terminal
cd python-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## 5. Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | backend | Sign/verify JWTs — set these to long random strings |
| `JWT_ACCESS_EXPIRES_IN` | backend | Access token lifetime (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | backend | Refresh token lifetime (default `30`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | backend | Google OAuth app credentials |
| `GOOGLE_CALLBACK_URL` | backend | Must match the redirect URI registered with Google |
| `FRONTEND_URL` | backend | CORS origin + OAuth redirect target |
| `FORECAST_SERVICE_URL` | backend | Where the Python service is reachable |
| `AI_PROVIDER` | backend | Default provider for `/api/ai/*`: `openai` \| `gemini` \| `claude` |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | backend | Only the key for your chosen `AI_PROVIDER` is required |

## 6. API reference

All routes are prefixed with `/api` and (except `/auth/*`) require
`Authorization: Bearer <accessToken>`.

| Method | Path | Role required | Purpose |
|---|---|---|---|
| POST | `/auth/register` | — | Create an account (email/password) |
| POST | `/auth/login` | — | Get an access + refresh token pair |
| POST | `/auth/refresh` | — | Rotate a refresh token |
| POST | `/auth/logout` | — | Revoke a refresh token |
| GET | `/auth/me` | any | Current user profile |
| GET | `/auth/google` → `/auth/google/callback` | — | Google OAuth flow |
| GET | `/revenue/summary` | any | Totals + margin for the filtered period |
| GET | `/revenue/trend` | any | Monthly revenue/expense/profit series |
| GET | `/revenue/by-region` | any | Revenue grouped by region |
| GET \| POST | `/revenue` | any \| ANALYST | List / create transactions |
| GET | `/customers/segments` | any | Segment counts + LTV totals |
| GET | `/customers/top` | any | Top customers by lifetime value |
| GET | `/customers/churn` | any | Churn rate |
| GET | `/products/top` | any | Top products by revenue |
| GET \| POST | `/products` | any \| ANALYST | List / create products |
| POST | `/forecast` | ANALYST | Generate a forecast via the Python service |
| GET | `/forecast` | any | List past forecasts |
| GET | `/reports/export/pdf` | ANALYST | Download a PDF summary |
| GET | `/reports/export/excel` | ANALYST | Download an Excel transaction export |
| POST | `/upload` (multipart `file`) | ANALYST | Import a CSV of transactions |
| POST | `/ai/report` | any | Generate the executive AI report |
| POST | `/ai/ask` | any | Natural-language Q&A over a data summary |
| GET | `/users` | ADMIN | List all users |
| PATCH | `/users/:id/role` | ADMIN | Change a user's role |

Roles rank `VIEWER < ANALYST < MANAGER < ADMIN`; `requireRole("ANALYST")` also
allows MANAGER and ADMIN.

---

## 7. Connecting the frontend dashboard to this backend

The interactive dashboard delivered earlier in this conversation (`VantageDashboard.jsx`)
is a **self-contained claude.ai artifact**. Its "AI Insights" panel and chat widget
call `https://api.anthropic.com/v1/messages` directly from the browser with no API
key — that only works inside claude.ai's artifact runtime, which handles auth for
you. It will **not** work if you copy that file into a standalone Vite app and
deploy it.

To wire the same UI to this real backend:

1. Replace the `callClaude()` calls in the artifact with `fetch` calls to your own
   API: `POST /api/ai/report` and `POST /api/ai/ask`, sending the same JSON body
   shape (`{ summary }` / `{ question, context }`) plus an `Authorization` header.
2. Set `AI_PROVIDER` and the matching API key in the backend's `.env` — the AI
   logic (prompts, JSON schema) is already duplicated server-side in
   `src/controllers/ai.controller.js` so the response shape matches what the
   frontend expects.
3. Replace the client-side mock dataset (`generateDataset`) with real fetches to
   `/api/revenue/*`, `/api/customers/*`, `/api/products/*`, and `/api/forecast`.
4. Swap the artifact's login-less demo state for real calls to `/api/auth/login`
   and store the returned tokens (in memory or an httpOnly cookie set by your own
   BFF layer — not localStorage, which the artifact environment disallows and
   which is also not ideal for token storage in a real app).

## 8. What's genuinely functional vs. stubbed

**Fully implemented:** JWT auth (register/login/refresh/logout), Google OAuth,
RBAC middleware, Prisma schema + seed data, revenue/customer/product analytics
queries, CSV upload & bulk insert, PDF/Excel export, the Prophet forecasting
endpoint, pandas RFM segmentation, the multi-provider AI service.

**You'll need to add before production:** input validation with the included
`zod` dependency (schemas aren't wired into routes yet), automated DB migrations
in CI, a test database for the CI test job (currently only smoke-tests config
loading), rate-limit tuning, structured logging/observability, and a proper
secrets manager instead of `.env` files.

## 9. Testing

```bash
cd backend && npm test              # Node's built-in test runner
cd python-service && pip install pytest && pytest
```

## 10. Deployment notes

- **Backend → Render**: point a Render Web Service at `backend/` with the
  included Dockerfile, add a managed Postgres instance, and set the env vars
  from the table above. Add the resulting deploy hook URL as the
  `RENDER_DEPLOY_HOOK_URL` repo secret to enable `.github/workflows/deploy.yml`.
- **Python service → Render** (or any container host): same Dockerfile
  approach; set `BACKEND_URL` to the deployed backend's origin for CORS.
- **Frontend → Vercel**: standard Vite deploy; set `VITE_API_URL` (or your
  equivalent) to the deployed backend's `/api` origin.
