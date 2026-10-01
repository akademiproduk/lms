# Akademi Produk LMS MVP — SDLC Execution Plan

**Goal:** Launch the first usable Akademi Produk learning platform: public catalogue, member learning area, and internal course operations.

**Approved scope:** Landing and catalogue; member registration/login, dashboard, course player, progress and multiple-choice quiz; staff course/lesson administration. Payments, subscriptions, QRIS, refund and ledger remain out of this MVP because merchant/provider and finance decisions are not finalized.

## Fase 0 — Infrastruktur Dasar

- Repository: `github.com/akademiproduk/lms`, local: `/home/ubuntu/akademi-produk`.
- Application services: React web, Express TypeScript API, PostgreSQL, private MinIO-ready boundary.
- Domains: `akademiproduk.com` (public), `membership.akademiproduk.com` (member), `dashboard58.akademiproduk.com` (internal).
- Deployment boundary: only new LMS containers, a dedicated PostgreSQL volume, and dedicated Nginx vhosts. No unrelated service, database, container, or vhost is modified.
- Member/internal surfaces emit meta and HTTP `X-Robots-Tag: noindex, nofollow, noarchive`.

## Fase 1 — Planning

- Risk: Cloudflare token/DNS was not locally discoverable; public DNS is also not resolving at kickoff. DNS creation is therefore a bounded production-release dependency.
- Risk: QRIS and subscription policies are undecided; excluded from this release.
- Delivery: Docker Compose images using non-root Node runtime; PostgreSQL remains Docker-internal.

## Fase 2 — Requirements

### Functional requirements
- FR-01: Public users can browse published courses and a course detail page.
- FR-02: Members can register, log in, see assigned/enrolled courses, consume lessons, save progress, and submit a quiz.
- FR-03: Admins and lecturers can create courses/modules/lessons; only admins publish.
- FR-04: API enforces authentication, role and course ownership.
- FR-05: Member and internal UI cannot be indexed by crawlers.

### Non-functional requirements
- NFR-01: Passwords use bcrypt hashes; JWT signing key is runtime-only.
- NFR-02: Course HTML is escaped/sanitized before rendering.
- NFR-03: API exposes health endpoint and database schema initialization is repeatable.
- NFR-04: Docker images build reproducibly and persistent state is volume-backed.

## Fase 3 — System Design

```text
Public/member/internal React SPA → Nginx → Express API → PostgreSQL
                                            └→ private media integration boundary
```

Core entities: users, courses, modules, lessons, enrollments, lesson_progress, assessments, attempts. RBAC: member, lecturer, admin.

## Fase 4 — Implementation

1. Workspace and Compose scaffolding.
2. Database schema, seed, authentication middleware and role policy.
3. Catalogue/course administration APIs.
4. Enrollment, progress and assessment APIs.
5. Host-aware React public, member and staff UI.
6. Nginx routes, robot exclusion and Cloudflare DNS deployment.

## Fase 5 — Testing

- Unit: role authorization and completion/quiz scoring helpers.
- Integration: auth, protected API, course visibility, progress and quiz submit.
- Build: API TypeScript compilation and Vite production bundle.
- Deployment smoke: API health, public catalogue, authenticated member/admin APIs, actual `X-Robots-Tag` headers.

## Fase 6 — Deployment

- Build images; start only `lms-db`, `lms-api`, `lms-web`.
- Validate container health before adding Nginx configuration.
- Add only `akademiproduk` server configuration, validate with `nginx -t`, reload Nginx.
- Create/read Cloudflare records and purge only Akademi Produk zone cache.
- Rollback: remove LMS vhost symlink then reload Nginx; stop only LMS containers. Postgres volume remains intact.

## Fase 7 — Maintenance

- Health: `/api/health`; Docker health checks.
- Review errors, auth abuse, database backup health, asset storage capacity, and course publish audit logs.
- Deferred backlog: MinIO direct multipart uploads, email verification/reset, QRIS, subscription lifecycle, invoice/ledger/reconciliation.

## Sign-off

| Function | Status |
|---|---|
| Product owner | Scope approved for MVP execution |
| Tech lead | Pending post-build verification |
| QA | Pending test evidence |
| Finance | Not in current MVP scope |
