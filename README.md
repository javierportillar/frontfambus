# frontfambus — Frontend multi-tenant MotoShop + MasVital

PWA Next.js 14 (App Router) que sirve los tenants MotoShop y MasVital sobre el mismo backend FastAPI (`api.fragloesja.uk`).

> **Historia.** Este repo se separó de [`motoshopData/motoshop-app/web/`](https://github.com/javierportillar/motoshopData) preservando el historial completo (autores, fechas, blames). El último commit del monorepo en `main` fue `a3b5e90`. Desde ahí, el frontend evoluciona acá; el backend y los pipelines siguen en `motoshopData` y `masvitalData`.

---

## 1 · Requisitos

- Node 18.18+ (recomendado: Node 22, igual que CI)
- npm

---

## 2 · Setup local

```bash
git clone https://github.com/javierportillar/frontfambus.git
cd frontfambus
npm install
cp .env.local.example .env.local
npm run dev
```

Abrir http://localhost:3000.

Variables clave de `.env.local` (ver `.env.local.example` para el listado completo):

| Variable | Valor típico |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.fragloesja.uk` (prod) o `http://localhost:8000` (dev) |
| `JWT_SECRET` | Mismo que el backend para verificar cookie HttpOnly |

---

## 3 · Scripts

- `npm run dev` — servidor de desarrollo (puerto 3000)
- `npm run build` — build de producción
- `npm run start` — servir el build
- `npm run lint` — ESLint
- `npm run test` — Playwright E2E (incluye `tests/multi-tenant.spec.ts`)

---

## 4 · Deploy

**Vercel auto-deploy desde `main`** vía la integración nativa de Vercel con GitHub.

- Project: `motoshop-web` (heredado del monorepo, nombre se mantiene)
- Root directory: **raíz del repo** (ya no es `motoshop-app/web/`)
- Custom domain: `app.fragloesja.uk` (MotoShop), eventualmente `app.masvital.fragloesja.uk` (MasVital)
- Preview: cada PR genera URL temporal

Para deploy manual desde local:

```bash
npx vercel deploy --prod
```

---

## 5 · Multi-tenant en el frontend

El backend define el contrato; el frontend lo consume. Resumen:

1. `POST /api/auth/login` → response `TokenPair` (`access_token`, `refresh_token`, …). El JWT lleva el claim `tenants_allowed` adentro.
2. `GET /api/auth/me` con `Authorization: Bearer <access_token>` → devuelve `{ username, role, tenants_allowed, current_tenant, enabled_features }`. El frontend popula el store de Zustand con esto.
3. Si `tenants_allowed.length > 1` → redirige a `/select-tenant`. Si solo hay uno, auto-selecciona y va a `/`.
4. A partir de ahí, **cada request al API lleva header `X-Tenant: <slug>`**. El backend valida que el tenant pedido esté en `tenants_allowed` del JWT y abre `/tmp/<tenant>_gold.duckdb`.
5. `FeatureGuard` envuelve dashboards opcionales; si la feature no está en `enabled_features` del tenant activo, muestra "No disponible aún".

Componentes clave:
- `lib/auth/store.ts` — Zustand: `user`, `role`, `accessToken`
- `lib/tenant/store.ts` — Zustand: `currentTenant`, `availableTenants`, `enabledFeatures`
- `lib/tenant/config.ts` — Mapping de slug → display name + logo path
- `lib/api/client.ts` — Inyecta `X-Tenant` en cada request si hay `currentTenant`
- `lib/api/hooks.ts` — `useMe()` llama `/api/auth/me` con el tenant activo
- `app/select-tenant/page.tsx` — Tenant picker
- `components/ui/FeatureGuard.tsx` — Gate por feature
- `middleware.ts` — Redirige a `/select-tenant` si no hay cookie `motoshop_tenant`

---

## 6 · Branches activas

- `main` — producción
- `feat/m2-tenant-picker` — Sprint M2 (tenant picker + FeatureGuard + tests Playwright). **Pendiente PR.**

---

## 7 · Repos hermanos

| Repo | Qué vive ahí |
|---|---|
| [`motoshopData`](https://github.com/javierportillar/motoshopData) | Backend FastAPI (`motoshop-app/api/`), pipeline ETL MotoShop, infra Windows |
| [`masvitalData`](https://github.com/javierportillar/masvitalData) | Pipeline ETL MasVital + infra Windows del PC MasVital |
| `frontfambus` (este repo) | Frontend único multi-tenant |

> **Importante para Dev W:** este repo NO necesita ser clonado en los PCs Windows. El frontend vive en Vercel (cloud); los Windows solo corren el backend y el pipeline (`motoshopData` y `masvitalData`).
