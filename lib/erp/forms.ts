/**
 * Estado de formulario y builders de payload de la UI de maestros.
 *
 * Todo lo que hay acá es lógica pura (sin React): el estado que viven los
 * inputs, la traducción desde la fila que devuelve la API y el armado del
 * body que espera `TerceroCreate` / `TerceroUpdate` / `ProductCreate` /
 * `ProductUpdate`.
 *
 * Reglas del contrato (spec erp-masters-write, `erp/masters/schemas.py`):
 * - `extra="forbid"`: sólo se mandan campos que el schema conoce.
 * - La identidad no se edita: `nitter`/`tipnit`/`digter` (tercero) y
 *   `codprod`/`codmed`/`valmed` (producto) no viajan en el PATCH.
 * - Los importes son `Decimal` del backend: se mandan como texto decimal
 *   (`"1500.5"`, nunca `1500.5` en coma flotante).
 * - Los sub-colecciones (`units`, `barcodes`, `prices`) conservan el ORDEN
 *   de las filas del formulario: el índice que el backend reporta en un 422
 *   (`prices[0].pvconi`) tiene que seguir apuntando a la misma fila.
 */

import { toDecimalString, toNumber, terceroEmailList } from "./normalize";
import type {
  BarcodeEntry,
  ProductCreatePayload,
  ProductPriceEntry,
  ProductUpdatePayload,
  Producto,
  ProductoPrice,
  Tercero,
  TerceroCreatePayload,
  TerceroUpdatePayload,
  UnitEntry,
} from "./types";
import type {
  PriceRowValues,
  ProductoFormValues,
  TerceroFormValues,
} from "./validation";

/** Tasa de IVA por defecto (tarifa general Colombia) usada sólo como semilla. */
export const DEFAULT_IVA_RATE = "19";

/** Fila de precio editable: hereda `PriceRowValues` y suma la trazabilidad. */
export interface PriceFormRow extends PriceRowValues {
  /**
   * `false` cuando la API no devolvió la tasa (el repo real no la expone):
   * la UI la muestra como "a confirmar" en vez de callar el dato.
   */
  ivaRateKnown: boolean;
}

/** Fila de unidad de venta editable (`produndmeds`). */
export interface UnitFormRow {
  codmed: string;
  divmul: "M" | "D";
  facumed: string;
  pventa: string;
  tipovc: string;
}

/** Fila de código de barras editable (`prodcodbars`). */
export interface BarcodeFormRow {
  codbar: string;
}

/** Estado completo del formulario de producto. */
export interface ProductoFormState {
  values: ProductoFormValues;
  prices: PriceFormRow[];
  units: UnitFormRow[];
  barcodes: BarcodeFormRow[];
}

// ── Terceros ────────────────────────────────────────────────────────────────

/** Valores vacíos del formulario de tercero (altas). */
export function emptyTerceroValues(): TerceroFormValues {
  return {
    nitter: "",
    tipnit: "N",
    digter: "",
    perjur: "N",
    apeter: "",
    apeter2: "",
    nomter: "",
    nomter2: "",
    razsoc: "",
    nomcom: "",
    dirter: "",
    telter: "",
    movter: "",
    codciu: "",
    codzon: "",
    codlis: "",
    cupblo: "R",
    inater: "NO",
    emails: [],
  };
}

/** Traduce la fila de la API al estado del formulario (modo edición). */
export function terceroValuesFromRecord(tercero: Tercero): TerceroFormValues {
  return {
    nitter: tercero.nitter ?? "",
    tipnit: tercero.tipnit ?? "N",
    digter: tercero.digter ?? "",
    perjur: tercero.perjur ?? "N",
    apeter: tercero.apeter ?? "",
    apeter2: tercero.apeter2 ?? "",
    nomter: tercero.nomter ?? "",
    nomter2: tercero.nomter2 ?? "",
    razsoc: tercero.razsoc ?? "",
    nomcom: tercero.nomcom ?? "",
    dirter: tercero.dirter ?? "",
    telter: tercero.telter ?? "",
    movter: tercero.movter ?? "",
    codciu: tercero.codciu ?? "",
    codzon: tercero.codzon ?? "",
    codlis: tercero.codlis ?? "",
    cupblo: (tercero.cupblo ?? "R").toUpperCase(),
    inater: (tercero.inater ?? "NO").toUpperCase(),
    emails: terceroEmailList(tercero.emails),
  };
}

function trimmed(value: string | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

function emailList(emails: string[]): string[] {
  return emails
    .map((email) => email.trim())
    .filter((email) => email.length > 0)
    .slice(0, 10);
}

/** Arma el body de alta de tercero (`TerceroCreate`). */
export function buildTerceroCreatePayload(
  values: TerceroFormValues,
): TerceroCreatePayload {
  const payload: TerceroCreatePayload = {
    nitter: values.nitter.trim(),
    tipnit: values.tipnit === "C" ? "C" : "N",
    dirter: values.dirter.trim(),
    telter: values.telter.trim(),
    perjur: values.perjur === "S" ? "S" : "N",
    cupblo: values.cupblo === "B" ? "B" : "R",
    inater: values.inater === "SI" ? "SI" : "NO",
    emails: emailList(values.emails),
  };

  const digter = trimmed(values.digter);
  if (digter) payload.digter = digter;
  const apeter = trimmed(values.apeter);
  if (apeter) payload.apeter = apeter;
  const apeter2 = trimmed(values.apeter2);
  if (apeter2) payload.apeter2 = apeter2;
  const nomter = trimmed(values.nomter);
  if (nomter) payload.nomter = nomter;
  const nomter2 = trimmed(values.nomter2);
  if (nomter2) payload.nomter2 = nomter2;
  const razsoc = trimmed(values.razsoc);
  if (razsoc) payload.razsoc = razsoc;
  const nomcom = trimmed(values.nomcom);
  if (nomcom) payload.nomcom = nomcom;
  const movter = trimmed(values.movter);
  if (movter) payload.movter = movter;
  const codciu = trimmed(values.codciu);
  if (codciu) payload.codciu = codciu;
  const codzon = trimmed(values.codzon);
  if (codzon) payload.codzon = codzon;
  const codlis = trimmed(values.codlis);
  if (codlis) payload.codlis = codlis;

  return payload;
}

/**
 * Arma el body de edición de tercero (`TerceroUpdate`).
 *
 * La identidad (`nitter`, `tipnit`, `digter`) y los campos que el schema de
 * edición no declara (`apeter2`, `nomter2`, `codzon`, `perjur`) NO viajan:
 * el backend los rechaza con 422 (`extra="forbid"`).
 */
export function buildTerceroUpdatePayload(
  values: TerceroFormValues,
): TerceroUpdatePayload {
  const payload: TerceroUpdatePayload = {
    dirter: values.dirter.trim(),
    telter: values.telter.trim(),
    cupblo: values.cupblo === "B" ? "B" : "R",
    inater: values.inater === "SI" ? "SI" : "NO",
    emails: emailList(values.emails),
  };

  const apeter = trimmed(values.apeter);
  if (apeter) payload.apeter = apeter;
  const nomter = trimmed(values.nomter);
  if (nomter) payload.nomter = nomter;
  const razsoc = trimmed(values.razsoc);
  if (razsoc) payload.razsoc = razsoc;
  const nomcom = trimmed(values.nomcom);
  if (nomcom) payload.nomcom = nomcom;
  const movter = trimmed(values.movter);
  if (movter) payload.movter = movter;
  const codciu = trimmed(values.codciu);
  if (codciu) payload.codciu = codciu;
  const codlis = trimmed(values.codlis);
  if (codlis) payload.codlis = codlis;

  return payload;
}

// ── Productos ──────────────────────────────────────────────────────────────

/** Fila de precio vacía (con la lista sugerida). */
export function emptyPriceRow(codlis = ""): PriceFormRow {
  return { codlis, modo: "1", precio: "", ivaRate: DEFAULT_IVA_RATE, ivaRateKnown: false };
}

/** Fila de unidad de venta vacía. */
export function emptyUnitRow(codmed = ""): UnitFormRow {
  return { codmed, divmul: "M", facumed: "", pventa: "", tipovc: "0" };
}

/** Fila de código de barras vacía. */
export function emptyBarcodeRow(codbar = ""): BarcodeFormRow {
  return { codbar };
}

/** Estado vacío del formulario de producto (alta). */
export function emptyProductoForm(): ProductoFormState {
  return {
    values: {
      codprod: "",
      nomprod: "",
      codbar: "",
      codmed: "",
      valmed: "1",
      codlin1: "",
      actprod: "A",
      stockmin: "0",
      stockmax: "0",
      desprod: "",
    },
    prices: [],
    units: [],
    barcodes: [],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Precio editable de una fila de `preciosxpro`.
 *
 * El repo real devuelve `venprod` (exclusivo) + `veniva` (monto del IVA);
 * el repo fake devuelve el par `pvsini`/`pvconi` y la tasa. Según el modo
 * (`pvtipo`) se muestra el lado autoritativo: exclusivo (`1`) o incluido (`2`).
 */
export function priceRowFromPrice(price: ProductoPrice): PriceFormRow {
  const modo: "1" | "2" = price.pvtipo === "2" ? "2" : "1";
  const exclusive =
    price.pvsini != null && price.pvsini !== ""
      ? toNumber(price.pvsini)
      : toNumber(price.venprod);
  const inclusive =
    price.pvconi != null && price.pvconi !== ""
      ? toNumber(price.pvconi)
      : round2(exclusive + toNumber(price.veniva));
  const known = price.iva_rate != null && price.iva_rate !== "";

  return {
    codlis: (price.codlis ?? "").trim(),
    modo,
    precio: toDecimalString(modo === "2" ? inclusive : exclusive),
    ivaRate: known ? toDecimalString(price.iva_rate) : DEFAULT_IVA_RATE,
    ivaRateKnown: known,
  };
}

/** Traduce la fila de producto de la API al estado del formulario. */
export function productoFormFromRecord(producto: Producto): ProductoFormState {
  return {
    values: {
      codprod: producto.codprod ?? "",
      nomprod: producto.nomprod ?? "",
      codbar: producto.codbar ?? "",
      codmed: producto.codmed ?? "",
      valmed: toDecimalString(producto.valmed) || "1",
      codlin1: producto.codlin1 ?? "",
      actprod: (producto.actprod ?? "A").toUpperCase(),
      stockmin: toDecimalString(producto.stockmin) || "0",
      stockmax: toDecimalString(producto.stockmax) || "0",
      desprod: producto.desprod ?? "",
    },
    prices: (producto.prices ?? []).map(priceRowFromPrice),
    units: (producto.units ?? []).map((unit) => ({
      codmed: (unit.codmed ?? "").trim(),
      divmul: unit.divmul === "D" ? "D" : "M",
      facumed: toDecimalString(unit.facumed),
      pventa: toDecimalString(unit.pventa),
      tipovc: (unit.tipovc ?? "0").trim() || "0",
    })),
    barcodes: (producto.barcodes ?? []).map((barcode) => ({
      codbar: (barcode.codbar ?? "").trim(),
    })),
  };
}

/** Body de una fila de precio (`ProductPriceEntry`). */
export function buildPriceEntry(row: PriceFormRow): ProductPriceEntry {
  const entry: ProductPriceEntry = {
    codlis: row.codlis.trim().toUpperCase(),
    pvtipo: row.modo === "2" ? "2" : "1",
  };
  const precio = row.precio.trim();
  if (precio) {
    if (row.modo === "2") entry.pvconi = precio;
    else entry.pvsini = precio;
  }
  const rate = row.ivaRate.trim();
  if (rate) entry.iva_rate = rate;
  return entry;
}

/** Body de una fila de unidad de venta (`UnitEntry`). */
export function buildUnitEntry(row: UnitFormRow): UnitEntry {
  const entry: UnitEntry = {
    codmed: row.codmed.trim().toUpperCase(),
    divmul: row.divmul === "D" ? "D" : "M",
  };
  const facumed = row.facumed.trim();
  if (facumed) entry.facumed = facumed;
  const pventa = row.pventa.trim();
  if (pventa) entry.pventa = pventa;
  const tipovc = row.tipovc.trim();
  if (tipovc) entry.tipovc = tipovc;
  return entry;
}

/** Body de una fila de código de barras (`BarcodeEntry`). */
export function buildBarcodeEntry(row: BarcodeFormRow): BarcodeEntry {
  return { codbar: row.codbar.trim() };
}

/**
 * Body de alta de producto (`ProductCreate`).
 *
 * `codmed` y `valmed` son la unidad base: en la edición no se pueden tocar
 * (el schema de `ProductUpdate` no los declara).
 */
export function buildProductoCreatePayload(
  state: ProductoFormState,
): ProductCreatePayload {
  const v = state.values;
  const payload: ProductCreatePayload = {
    codprod: v.codprod.trim(),
    codmed: v.codmed.trim().toUpperCase(),
    units: state.units.map(buildUnitEntry),
    barcodes: state.barcodes.map(buildBarcodeEntry),
    prices: state.prices.map(buildPriceEntry),
  };

  const nomprod = trimmed(v.nomprod);
  if (nomprod) payload.nomprod = nomprod;
  const codbar = trimmed(v.codbar);
  if (codbar) payload.codbar = codbar;
  const valmed = trimmed(v.valmed);
  if (valmed) payload.valmed = valmed;
  const codlin1 = trimmed(v.codlin1);
  if (codlin1) payload.codlin1 = codlin1.toUpperCase();
  const actprod = v.actprod.trim().toUpperCase();
  if (actprod) payload.actprod = actprod as ProductCreatePayload["actprod"];
  const stockmin = trimmed(v.stockmin);
  if (stockmin) payload.stockmin = stockmin;
  const stockmax = trimmed(v.stockmax);
  if (stockmax) payload.stockmax = stockmax;
  const desprod = trimmed(v.desprod);
  if (desprod) payload.desprod = desprod;

  return payload;
}

/** Body de edición de producto (`ProductUpdate`) — sin identidad. */
export function buildProductoUpdatePayload(
  state: ProductoFormState,
): ProductUpdatePayload {
  const v = state.values;
  const payload: ProductUpdatePayload = {
    units: state.units.map(buildUnitEntry),
    barcodes: state.barcodes.map(buildBarcodeEntry),
    prices: state.prices.map(buildPriceEntry),
  };

  const nomprod = trimmed(v.nomprod);
  if (nomprod) payload.nomprod = nomprod;
  const codbar = trimmed(v.codbar);
  if (codbar) payload.codbar = codbar;
  const codlin1 = trimmed(v.codlin1);
  if (codlin1) payload.codlin1 = codlin1.toUpperCase();
  const actprod = v.actprod.trim().toUpperCase();
  if (actprod) payload.actprod = actprod as ProductUpdatePayload["actprod"];
  const stockmin = trimmed(v.stockmin);
  if (stockmin) payload.stockmin = stockmin;
  const stockmax = trimmed(v.stockmax);
  if (stockmax) payload.stockmax = stockmax;
  const desprod = trimmed(v.desprod);
  if (desprod) payload.desprod = desprod;

  return payload;
}
