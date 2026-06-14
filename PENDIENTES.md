# PENDIENTES · `frontfambus`

> Estado vivo del frontend. Cada entrada vive hasta que se cierra con un PR mergeado o un ADR archivado.

---

## 🟢 En prod (no requieren acción)

- [x] **Split del frontend** (2026-06-14). El frontend se separó de `motoshopData/motoshop-app/web/` con historial preservado. Vercel `motoshop-web` linkeado a este repo, auto-deploy nativo activo. Primer deploy desde acá verificado en `app.fragloesja.uk`.
- [x] **Sprint M2 — Tenant picker** (2026-06-14). `/select-tenant`, `FeatureGuard`, header `X-Tenant`, store de tenant, tests Playwright. Mergeado en `main`, deploy en producción.

---

## 🟡 En curso / requieren coordinación con otros repos

### Sprint M3 — UX para MasVital con datos reales

**Bloqueado por:** `masvitalData` Dev Back debe terminar M3.3 (pipeline parametrizado) y Dev W debe instalar el PC MasVital. Hasta que `masvital_gold.duckdb` exista en R2, los dashboards MasVital van a renderizar "Sin datos".

**De tu lado (Dev Front), nada bloqueante.** Cuando el Dev Back te avise que MasVital tiene datos, validás manualmente:
- [ ] Login admin → MasVital → KPIs cargan con datos reales
- [ ] Chat IA con `X-Tenant: masvital` responde sobre SKUs MasVital
- [ ] Network: `X-Tenant: masvital` en todas las queries

---

## 🔵 Backlog (sin prioridad asignada)

### Renombrar cookie `motoshop_tenant` → `current_tenant` (cosmético)

**Por qué:** la cookie se llama `motoshop_tenant` por nombre histórico. Cuando un usuario de MasVital abra DevTools y vea `motoshop_tenant: masvital` en sus cookies se va a confundir.

**Esfuerzo:** ~1 h. Cambio de string en:
- `middleware.ts`
- `app/api/auth/login/route.ts` (Set-Cookie)
- `app/api/auth/logout/route.ts` (Clear-Cookie)
- `lib/auth/store.ts` o donde se lea client-side

**Cuándo:** cuando haya un sprint de housekeeping, no bloquea nada.

### Logos reales de tenants

Hoy `public/tenants/motoshop/logo.png` y `public/tenants/masvital/logo.png` son placeholders binarios chicos (~290 B). Reemplazarlos por logos reales cuando el PO los entregue.

---

## ⚪ Histórico (cerrado)

- 2026-06-14 — Bug `useMemo` condicional en `app/(authenticated)/layout.tsx` cazado por Vercel build post-merge M2. Fix: subir el `useMemo` antes del guard clause. Commit `0559cb3`.
- 2026-06-14 — Type error `me.tenants_allowed[0]` por `noUncheckedIndexedAccess`. Fix: destructuring + narrow con `if`. Commit `bcbb7f1`.
