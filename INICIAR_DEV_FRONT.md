# INICIAR · Dev Front (frontfambus)

> **Para vos.** Este archivo es tu única fuente operativa para trabajar en el frontend único multi-tenant. Si seguís estos pasos, no rompés nada que ya esté en producción ni desincronizás con el backend.
>
> **Regla operativa.** Sos el ÚNICO rol que edita código en este repo. Backend y pipeline viven en `motoshopData` / `masvitalData` — no los toques desde acá. Para coordinar contratos con el backend, hablás con el Dev Back via PR comments o issues, no por DM.

---

## 0 · Pre-requisitos

- [ ] Acceso de write al repo [`frontfambus`](https://github.com/javierportillar/frontfambus).
- [ ] Acceso al proyecto Vercel `motoshop-web` (preview deploys con cuenta linkeada).
- [ ] Backend M1 en prod (https://api.fragloesja.uk) — verificable con `curl https://api.fragloesja.uk/health`.

---

## 1 · Contexto en 60 segundos

- **Este repo** es **el frontend único** para MotoShop + MasVital. Una sola PWA Next.js 14, multi-tenant por header `X-Tenant`.
- **Vercel auto-deploya** producción en cada push a `main`. Cada PR genera preview URL automático.
- **El backend FastAPI** vive en `motoshopData` (`motoshop-app/api/`). Vos NO lo tocás.
- **El pipeline ETL** vive en `motoshopData` (MotoShop) y `masvitalData` (MasVital). Vos NO lo tocás.
- **Stack interno:** App Router, Zustand (`auth/store.ts`, `tenant/store.ts`), SWR, Tailwind, Workbox PWA, Playwright.

---

## 2 · Setup local (primera vez)

```bash
git clone https://github.com/javierportillar/frontfambus.git
cd frontfambus
npm install
cp .env.local.example .env.local
npm run dev    # abre http://localhost:3000
```

Configurá `NEXT_PUBLIC_API_URL` en `.env.local`:
- Dev contra prod: `NEXT_PUBLIC_API_URL=https://api.fragloesja.uk`
- Dev contra backend local: `NEXT_PUBLIC_API_URL=http://localhost:8000` (necesitás el FastAPI corriendo desde `motoshopData/motoshop-app/api/`)

Si la var está ausente, el código cae a `https://api.fragloesja.uk` por fallback (ver `app/api/[...path]/route.ts`).

---

## 3 · Contrato con el backend (NO te lo inventés, leelo)

El backend M1 expone el contrato multi-tenant. Estas son las únicas verdades:

### 3.1 Login

```
POST /api/auth/login
Body: { "username": "...", "password": "..." }
Response 200: TokenPair = {
  "access_token": "<JWT>",
  "refresh_token": "<JWT>",
  "token_type": "bearer",
  "expires_in": 900
}
```

**`tenants_allowed` NO está en el body.** Está adentro del JWT como claim. Si vos lo esperás en el response, te equivocás (eso pasó una vez, ver historia del repo).

### 3.2 Me

```
GET /api/auth/me
Headers: Authorization: Bearer <access_token>
         X-Tenant: <slug>   (opcional — si falta, default "motoshop")
Response 200: {
  "username": "...",
  "email": "...",
  "role": "admin" | "gerente" | "vendedor",
  "tenants_allowed": ["motoshop", "masvital"],
  "current_tenant": "motoshop",
  "enabled_features": ["abc", "forecast", ...]
}
```

Llamás `/api/auth/me` después del login para obtener `tenants_allowed`. Si hay solo uno → auto-seleccionás. Si hay más de uno → vas a `/select-tenant`.

### 3.3 Cualquier otro endpoint

Cada request al API lleva `X-Tenant: <slug>` si hay tenant activo en el store. El backend valida que esté en `tenants_allowed` del JWT y devuelve datos de ese tenant. Sin header → default `motoshop` (backward compat).

---

## 4 · Multi-tenant — arquitectura del frontend

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Store de auth | `lib/auth/store.ts` | `user`, `role`, `accessToken`, `currentTenant`, `enabledFeatures`, `hasHydrated` |
| Store de tenant | `lib/tenant/store.ts` | `currentTenant`, `availableTenants`, `enabledFeatures` |
| Config de tenants | `lib/tenant/config.ts` | Slug → display name + logo + brand color |
| API client | `lib/api/client.ts` | Inyecta `X-Tenant` en cada fetch |
| Hook `useMe` | `lib/api/hooks.ts` | Llama `/api/auth/me`, popula store |
| Tenant picker | `app/select-tenant/page.tsx` | Cards de tenants disponibles |
| FeatureGuard | `components/ui/FeatureGuard.tsx` | Bloquea dashboards no habilitados |
| Middleware | `middleware.ts` | Redirige a `/select-tenant` si falta cookie |

**Reglas que NO se rompen:**

1. **Toda llamada al API pasa por `lib/api/client.ts`.** No hagas `fetch()` directo desde un componente — vas a saltarte el header `X-Tenant` y eso es cross-tenant leak.
2. **No hardcodees el tenant.** Siempre leelo del store. El usuario admin va a alternar.
3. **`FeatureGuard` envuelve dashboards opcionales.** Si agregás un dashboard nuevo que no aplica a todos los tenants, declarálo en `tenants.yaml` (backend) y envolvé la ruta acá con `FeatureGuard`.
4. **No metas lógica de negocio en el frontend** que el backend ya hace. Si necesitás algo nuevo, abrí un issue al Dev Back para que extienda la API.

---

## 5 · Flujo de trabajo (cada feature)

1. Branch desde `main`: `git checkout -b feat/<sprint>-<descripcion-corta>`.
2. Cambios + tests Playwright si aplica (mirá `tests/multi-tenant.spec.ts` como referencia).
3. Local: `npm run lint` + `npm run typecheck` + `npm run build` deben pasar. Si fallan, corregís ANTES de pushear (Vercel te va a rechazar igual y perdés ciclos).
4. Push branch. Abrí PR contra `main`.
5. Vercel genera preview URL automáticamente — el Reviewer la usa para validar visualmente.
6. Después de approve, merge `--no-ff` a `main`. Vercel auto-deploya prod en ~50s.
7. Verificá `app.fragloesja.uk` post-deploy. Si rompiste algo, rollback inmediato (`vercel rollback` o revert + push).

---

## 6 · Sprints (orden cronológico)

| Sprint | Descripción | Estado |
|---|---|---|
| M1 | Backend multi-tenant (`motoshopData`) | ✅ En prod |
| M2 | Frontend tenant picker + FeatureGuard + X-Tenant header | ✅ Mergeado en `main`, en prod |
| M3 | Pipeline ETL MasVital + datos en R2 | 🟡 Dev Back + Dev W |
| M4 | Trazabilidad cross-tenant (logs, briefing, audit) | ⬜ Pendiente |

M3 y M4 son sprints del Dev Back. Vos solo sabés que existen para no diseñar features que asuman cosas que todavía no están en la API.

---

## 7 · Lo que NO hacés

| ❌ | Razón |
|---|---|
| Editar código backend en otro repo | No es tu rol. Coordiná via issue/PR. |
| Pushear a `main` sin PR | Saltea revisión, rompe trazabilidad. |
| Cambiar contratos del API "porque sería más simple" | Los rompe el dev back, ahí tenés un fork de contrato que nadie sabe cuál es la verdad. |
| `vercel deploy --prod` desde local sin avisar | Vercel auto-deploya en push. Si lo hacés a mano, dejás main y prod desincronizados. Solo lo hacés en emergencia con commit en main. |
| Borrar branches sin avisar | Otros devs pueden estar viéndolas. Borralas después del merge. |
| Commitear `.env.local` o cualquier secreto | El `.gitignore` lo protege pero verificá. |

---

## 8 · Cómo cerrás cada sesión

1. Push de todos los commits relevantes.
2. Si dejás algo a medias → branch separada con prefijo `wip/`.
3. Comentá en el PR lo que falta para que el próximo Dev Front (vos en otra sesión, o tu reemplazo) sepa retomar.
4. Si rompiste algo en producción → rollback PRIMERO, después analizamos.
