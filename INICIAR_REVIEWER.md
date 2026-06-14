# INICIAR · Reviewer (frontend `frontfambus`)

> **Para vos.** Auditás el frontend único multi-tenant. Tu pareja en `motoshopData` valida backend/pipeline; tu pareja en `masvitalData` valida pipeline MasVital + Windows. Acá te enfocás en UX, contrato con API, seguridad client-side y que el deploy de Vercel no rompa nada que ya funcionaba.
>
> Para el gate cross-cutting del programa multi-tenant (M1/M2/M3/M4) la referencia única es [`masvitalData/INICIAR_REVIEWER.md`](https://github.com/javierportillar/masvitalData/blob/main/INICIAR_REVIEWER.md). Este archivo es el complemento que cubre **solo el frontend**.

---

## 1 · Qué validás en cada PR del Dev Front

### 1.1 Contrato con el backend

- [ ] Toda llamada al API pasa por `lib/api/client.ts` (no hay `fetch()` directo). `rg -n "fetch\(" app/ components/ lib/ | rg -v "lib/api/"` debe estar vacío (o solo casos justificados en el comentario).
- [ ] Header `X-Tenant` se inyecta automáticamente cuando hay tenant activo.
- [ ] Si el PR agrega un endpoint nuevo, el contrato del response coincide con el OpenAPI del backend (`https://api.fragloesja.uk/openapi.json`). No inventar campos.

### 1.2 Multi-tenant

- [ ] Ningún componente hardcodea `motoshop` o `masvital` como slug. Siempre leer del store.
- [ ] Dashboards opcionales envueltos en `<FeatureGuard feature="...">`. Si la feature no está habilitada para el tenant activo, muestra "No disponible aún", **no** renderiza datos.
- [ ] La cookie `motoshop_tenant` (nombre histórico, no preocuparse por renombrar) se setea HttpOnly y SameSite=Lax. Vercel/Next setea esto via Set-Cookie del route handler de login.

### 1.3 Seguridad client-side

- [ ] No hay tokens ni passwords en localStorage que no estén también en cookie HttpOnly.
- [ ] `accessToken` puede vivir en Zustand persistido si es necesario para llamadas client-side, pero la verdad está en la cookie.
- [ ] No hay `dangerouslySetInnerHTML` con contenido que venga del usuario o de la API.
- [ ] CSP / next.config.mjs no afloja headers que el browser ya impone.

### 1.4 Build / CI

- [ ] El PR generó preview URL en Vercel (revisar comments del PR). Si el preview falló, el PR no entra a main.
- [ ] `npm run lint` (warnings OK, **errors no**).
- [ ] `npm run typecheck` clean.
- [ ] `npm run build` exitoso.
- [ ] Tests Playwright relevantes pasan (mínimo el `tests/multi-tenant.spec.ts`).

---

## 2 · Cómo validás el Gate M2 (frontend multi-tenant en prod)

El gate cross-cutting vive en [`masvitalData/INICIAR_REVIEWER.md` §1 Gate M2](https://github.com/javierportillar/masvitalData/blob/main/INICIAR_REVIEWER.md). Resumido para vos:

1. Abrir `https://app.fragloesja.uk` en navegador limpio (incógnito).
2. Login `admin / FG28` → redirige a `/select-tenant`.
3. `/select-tenant` muestra 2 cards (MotoShop, MasVital).
4. Clic MotoShop → home con todos los dashboards.
5. Botón "Cambiar negocio" en sidebar → vuelve al picker.
6. Clic MasVital → home con dashboards reducidos (productos, stock, ventas, inventario, chat).
7. DevTools Network: cada request lleva `X-Tenant`.
8. Refresh manual a `/dashboards/abc` con tenant MasVital → "No disponible aún" (FeatureGuard).
9. Logout → cookie `motoshop_tenant` borrada; relogin vuelve al picker.

Si algo falla → ❌ NO-GO, devolvés con detalle al Dev Front.

---

## 3 · Cómo validás el Gate M3 (cuando MasVital tenga datos reales)

Esto pasa cuando el Dev Back terminó M3.3 (`pipeline/` parametrizado en `masvitalData`) y el Dev W instaló MasVital en el PC Windows. La validación del frontend desde tu lado:

- [ ] Login admin → MasVital → KPIs cargan con datos reales (no vacíos).
- [ ] Chat IA con tenant MasVital responde sobre SKUs MasVital, cero menciones a SKUs MotoShop.
- [ ] Network: `X-Tenant: masvital` en todas las queries.

---

## 4 · Qué NO hacés

| ❌ | Razón |
|---|---|
| Editar código del frontend | Sos auditor, no implementador. |
| Mergear PRs ajenos | El Dev Front mergea sus propios PRs después de tu approve. |
| Aprobar el PR si el preview de Vercel falló | El preview = la verdad mínima. Sin preview verde no hay GO. |
| Aprobar cambios de contrato sin OpenAPI del backend actualizado | Eso desincroniza front/back. Coordiná con tu pareja Reviewer de `motoshopData`. |

---

## 5 · Cómo rechazás un PR del Dev Front

```
❌ NO MERGE

Razón técnica concreta:
- archivo:linea — qué falla — qué esperarías

Ejemplo:
- lib/api/client.ts:42 — uso de fetch() directo en lugar de apiClient.
  Eso saltea el X-Tenant. MasVital va a ver datos de MotoShop.
  Reemplazar por apiClient.get('/api/metrics/foo').

Acción:
- Dev Front: fix + push + re-request review.
```

---

## 6 · Cómo aprobás un PR del Dev Front

```
✅ APPROVED

Validado:
- preview URL: https://motoshop-XYZ-javierportillars-projects.vercel.app
- multi-tenant.spec.ts pasa
- visual check: tenant picker OK, FeatureGuard OK
- Network: X-Tenant inyectado

Notas:
- [observaciones para prod, si hay]
```

---

## 7 · Repos hermanos

| Repo | Tu pareja Reviewer valida |
|---|---|
| [`motoshopData`](https://github.com/javierportillar/motoshopData) | Backend FastAPI, pipeline ETL MotoShop, infra Windows MotoShop |
| [`masvitalData`](https://github.com/javierportillar/masvitalData) | Pipeline ETL MasVital, infra Windows MasVital, **gate cross-cutting M1/M2/M3/M4** |
| `frontfambus` (acá) | Frontend único multi-tenant |
