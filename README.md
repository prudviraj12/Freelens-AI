# Freelens AI / HindsightOps

HindsightOps is a multi-tenant operations assistant for freelance agencies. It
uses PostgreSQL for accounts and authorization, Hindsight for agency knowledge,
and S3-compatible object storage for source files.

## Local services

- Web app: <http://localhost:3000>
- API and OpenAPI docs: <http://localhost:8000/docs>
- Hindsight API: <http://localhost:8888>
- Hindsight control plane: <http://localhost:9999>
- MinIO API: <http://localhost:9000>
- MinIO console: <http://localhost:9001>
- PostgreSQL: `localhost:5433` (5432 remains available to the existing local PostgreSQL service)

## First-time setup

Prerequisites: Docker Desktop, Node.js, pnpm, Python 3.12+, and uv.

1. Copy `.env.example` to `.env` and add the Groq API key. Never commit `.env`.
2. Start PostgreSQL, MinIO, and Hindsight:

   ```powershell
   docker compose up -d --build
   ```

3. Install and migrate the API:

   ```powershell
   cd apps/api
   uv sync
   uv run alembic upgrade head
   ```

4. In another terminal, install the web app:

   ```powershell
   cd apps/web
   pnpm install
   ```

## Run the project

Start the API:

```powershell
cd apps/api
uv run uvicorn freelens_api.main:app --reload --port 8000
```

Start the web app in a second terminal:

```powershell
cd apps/web
pnpm dev
```

Open <http://localhost:3000>. On a fresh database, the setup screen creates the
agency and its first owner. Use your own display name, agency name, email, and a
password of at least 12 characters.

## Checks

```powershell
cd apps/api
uv run ruff check .
uv run pytest

cd ../web
pnpm lint
pnpm build
```

## Storage environments

Development uses the local MinIO service. Production uses Cloudflare R2 by
setting `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and
`S3_BUCKET` in the API host. The application uses the same S3-compatible
interface in both environments.

`docker compose down` stops local infrastructure without deleting its data.
Do not add `-v` unless you intentionally want to erase local PostgreSQL,
Hindsight, and MinIO volumes.
