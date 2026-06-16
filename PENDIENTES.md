# PENDIENTES · `frontfambus`

> Estado vivo del frontend. Cada entrada vive hasta que se cierra con un PR mergeado o un ADR archivado.

---

## 🟢 En prod (no requieren acción)

### Infraestructura

- [x] **Split del frontend** (2026-06-14). El frontend se separó de `motoshopData/motoshop-app/web/` con historial preservado. Vercel `motoshop-web` linkeado a este repo, auto-deploy nativo activo. Primer deploy desde acá verificado en `app.fragloesja.uk`.

### Multi-tenant

- [x] **Sprint M2 — Tenant picker** (2026-06-14). `/select-tenant`, `FeatureGuard`, header `X-Tenant`, store de tenant, tests Playwright. Mergeado en `main`, deploy en producción.
- [x] **Branding por tenant** (2026-06-14). `components/TenantTheme.tsx` aplica CSS variables del tenant activo (`--color-primary`, `--color-accent`, etc.). `Logo` y `LogoMark` leen el logo del tenant del store. Logo real de MasVital agregado (`public/tenants/masvital/logo.png`). Paleta MasVital extraída del logo real (`#1F4E2A` verde forestal + `#84A33B` verde lima).
- [x] **Fix proxy X-Tenant** (2026-06-15). El proxy en `app/api/[...path]/route.ts` descartaba el header `X-Tenant`. Resultado: el backend nunca lo veía y MasVital + MotoShop devolvían los mismos datos. Fix: reenviar el header del cliente al backend.
- [x] **Fix SWR stale al cambiar tenant** (2026-06-16). La cache key de SWR era solo la URL, sin el tenant. Al cambiar de negocio, SWR devolvía el response cacheado del anterior por ~2 min. Fix: cache key como tupla `[tenant, url]` en todos los hooks (`useMetrics`, `useProducts`, `useStock`, `useForecast`, `useAlerts`, `useForecastNarrative`) + `keepPreviousData: false`. Refetch inmediato al cambiar.
- [x] **Switcher de negocio en mobile** (2026-06-16). El sidebar con "Cambiar negocio" era `lg:` only — mobile no tenía la opción. Fix: agregar bloque "Cuenta" al pie del modal "Más" del bottom nav con tenant activo + botón cambiar + botón salir.

### Ventas — V1.9 (sprint enriquecimiento UX)

- [x] **V1.9 Tab Mensual extendida** (2026-06-15). Card "Productos más vendidos del mes (top 10)" con barras de intensidad y % del ingreso. 4 stats nuevos: margen bruto + %, mejor día, peor día, top vendedor. Card forma de pago con barras. Card vendedores top con tabla. Cards aceleradores/frenadores (productos que más crecieron/cayeron vs mes anterior).
- [x] **V1.9 Tab Diaria con calendario interactivo** (2026-06-15). Reemplaza la tabla plana por `components/ui/Calendar.tsx`: grid del mes con celdas que muestran día + ventas + facturas + ticket + mini-bar de intensidad relativo al mejor día. Fines de semana atenuados. Hoy marcado.
- [x] **V1.9.2 Página dedicada del día** (2026-06-15). Ruta `/dashboards/ventas/dia/[date]` reemplaza el modal popup. Al click en una celda del calendario navega a esta página. Tiene:
  - 4 KPIs + insight box hora pico
  - Bar chart distribución horaria
  - Collapsible "Todos los productos vendidos" (con búsqueda interna, sin LIMIT — ordenados de más a menos)
  - Collapsible "Facturas del día con sus productos" (filtros por forma de pago, cada factura como sub-collapsable con sus items)
  - Collapsibles laterales: vendedores + forma de pago (donut)
  - Card comparativas vs semana/mes/año pasado
- [x] **V1.9.1 Tab Caja (Z-report)** (2026-06-15). Cierre del día con desglose por forma de pago, lista de facturas filterable, top facturas grandes, tendencia histórica stacked bar 12 meses, variación del mix vs hace 6 meses. Heads-up sobre limitación (sgHermes guarda 1 sola forma de pago por factura).

### Formato y limpieza

- [x] **Formato monetario exacto** (2026-06-16). `formatMoneyFull` ($1.300.000) reemplaza `formatMoney` ($1.3M) en celdas del calendario, KPIs, tablas, home dashboard, página del día y tab Caja. La versión abreviada queda solo en ejes Y de gráficos por espacio.

---

## 🟡 En curso / requieren coordinación con otros repos

### Sprint M3 / M4 — UX para MasVital con datos reales

Estado de los pre-requisitos:
- ✅ Backend M1 multi-tenant en `api.fragloesja.uk`
- ✅ Frontend M2 tenant picker en `app.fragloesja.uk`
- ✅ Pipeline parametrizado MasVital (M3.3) en `masvitalData/main`
- ✅ Dev W setup PC Windows MasVital — primera corrida exitosa, DuckDB de 14 MB en R2 con datos reales (verificado 2026-06-15)
- ✅ Backend ahora sirve datos correctos por tenant (fix `_make_db_path` + `config.duckdb_path` empty default)
- ⬜ Sprint M4 trazabilidad cross-tenant — Dev Back, en `motoshopData`

**De tu lado (Dev Front), no hay bloqueante.** Validación visual ya hecha en el primer round (15/jun): MasVital muestra $3.242.500 ventas mes, 510 productos, top SKU "CHORIZO PARRILLERO P.B 250g".

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

### Vista de tendencia histórica multi-año

**Por qué:** el usuario pidió foco en Diaria primero (✅ hecho). La tab Histórica sigue mostrando el gráfico simple del original.

**Esfuerzo:** ~2h. Línea multi-año (24-36 meses), tabla yoy (mes vs mes, año vs año), día/mes histórico récord, tendencia de margen en el tiempo, crecimiento acumulado.

### Pagos partidos (multi-medio por factura)

**Por qué:** sgHermes registra UN solo `codpag` por factura. Si el cajero divide $80K efectivo + $70K tarjeta en una venta de $150K, la POS elige uno solo y el cierre de Caja tiene un delta vs caja física.

**Investigación previa:** confirmar con Dev W si hay tabla `recibos_caja`, `cobrosdetalle` o similar en MySQL de sgHermes con el desglose real por medio.

**Si existe:** Dev Back la trae a bronze → silver → un endpoint `cash-closure` enriquecido con desglose multi-medio. Esfuerzo backend ~2h, frontend ~1h.

**Si no existe:** dejar la limitación documentada (ya hay heads-up amarillo en la tab Caja) y educar al cajero a clasificar siempre.

### Logos de tenant

✅ MasVital — logo real ya integrado (628x506, extraído de `masvitalData/logo.heic`).
⬜ MotoShop — sigue con el logo genérico viejo (`/public/logo.png`). Reemplazar cuando el PO entregue un PNG limpio para `public/tenants/motoshop/logo.png`.

### Detalle por bodega/sucursal en página del día

**Cuándo:** cuando MotoShop o MasVital abran una segunda bodega. Hoy ambas operan con 1 sola (`BD01 BODEGA PRINCIPAL`), no aporta.

### Cliente del ticket grande

**Esfuerzo:** ~30min. Mostrar nombre del cliente del ticket más alto del día como parte del KPI "Top factura" — útil para identificar clientes B2B importantes.

---

## ⚪ Histórico (cerrado)

- 2026-06-14 — Bug `useMemo` condicional en `app/(authenticated)/layout.tsx` cazado por Vercel build post-merge M2. Fix: subir el `useMemo` antes del guard clause. Commit `0559cb3`.
- 2026-06-14 — Type error `me.tenants_allowed[0]` por `noUncheckedIndexedAccess`. Fix: destructuring + narrow con `if`. Commit `bcbb7f1`.
- 2026-06-15 — Bug catastrófico: TODOS los endpoints `/api/metrics/*` devolvían 500 para ambos tenants. Diagnóstico: `DUCKDB_PATH` hardcoded en `render.yaml`, archivo viejo en `/tmp` de Render. Fix: removida env var + redeploy + cambiar config.py default a empty string. Resuelto en `motoshopData` commits `e6ab761` + `3c01162`.
- 2026-06-15 — DayDetailModal (popup del calendario) eliminado en commit `2c6ac582`. Reemplazado por la página dedicada `/dashboards/ventas/dia/[date]`.
