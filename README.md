# Akademi Produk LMS

MVP LMS untuk landing/catalogue, member learning, dan operasi course internal.

## Surfaces

- `akademiproduk.com`: landing and public catalogue.
- `membership.akademiproduk.com`: member authentication and learning.
- `dashboard58.akademiproduk.com`: internal admin/lecturer operations.

Member and internal surfaces must always send `X-Robots-Tag: noindex, nofollow, noarchive` and render a matching meta robots tag.

## Local setup

```bash
cp .env.example .env
# Set the generated POSTGRES_PASSWORD and JWT_SECRET. Set a non-default ADMIN_PASSWORD.
npm install
npm run build
cp infra/nginx/akademiproduk.conf /etc/nginx/sites-available/akademiproduk.conf
```

### Frontend development

To preview the landing page with hot reload, run the API on port `4000` and start the web workspace:

```bash
npm install
npm run dev --workspace=@akademi/api
# in another terminal
npm run dev --workspace=@akademi/web
```

Open `http://localhost:5173`. Requests to `/api` are proxied to `http://127.0.0.1:4000` by Vite. If the API runs elsewhere, set `VITE_API_PROXY_TARGET`, for example `VITE_API_PROXY_TARGET=http://127.0.0.1:3201 npm run dev --workspace=@akademi/web`.

Run with Docker:

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3201/api/health
```

## Deployment boundary

This compose stack only owns `akademi-produk-db`, `akademi-produk-api`, and `akademi-produk-web`; its database never exposes a public port. QRIS, subscription, invoice, and finance functions are intentionally deferred from MVP.

See `references/2026-10-01-lms-mvp-sdlc-plan.md` for scope, risks, deployment and test gates.
