/**
 * Contrato de tipos de la escritura de maestros (spec erp-masters-write).
 *
 * Espejo de `motoshop_api/erp/masters/schemas.py` (payloads) y de las filas
 * que devuelve `repo.get` / `repo.list` (respuestas).
 *
 * Los importes llegan de dos formas distintas:
 * - los endpoints JSON: FastAPI serializa `Decimal` con `jsonable_encoder`
 *   → `number`;
 * - los snapshots de auditoría: `_jsonify` deja `Decimal` como `str`.
 *
 * Por eso los importes se tipan como `number | string` y se normalizan con
 * `toNumber` (ver `lib/erp/normalize.ts`).
 */

/** Importe heredado (legacy varchar numérico) — nunca float en el backend. */
export type ErpMoney = number | string;

/** Cantidad heredada (legacy varchar numérico). */
export type ErpQty = number | string;

/** Tipo de identificación: `N` = NIT (verifica dígito), `C` = cédula. */
export type TerceroTipoNit = "N" | "C";

/** Persona jurídica: `S` = sí, `N` = no. */
export type TerceroPersonaJuridica = "S" | "N";

/** Bloqueo por cartera: `R` = normal, `B` = bloqueado. */
export type TerceroEstadoCartera = "R" | "B";

/** Estado de tercero: `NO` = vigente, `SI` = inactivo. */
export type TerceroEstadoActivo = "NO" | "SI";

/** Estado de producto: `A` = activo, `I` = inactivo, `S` = suspendido. */
export type ProductoEstado = "A" | "I" | "S";

/** Modo de precio por lista: `1` = sin IVA (exclusivo), `2` = con IVA incluido. */
export type ProductoModoPrecio = "1" | "2";

/** Divisor/multiplicador de unidad de venta: `M` = multiplica, `D` = divide. */
export type ProductoDivMul = "M" | "D";

/** Fila de `tercecorreo` tal como la devuelve la API real. */
export interface TerceroEmail {
  nitter: string;
  corele: string;
}

/** Body de alta de tercero (`TerceroCreate`). */
export interface TerceroCreatePayload {
  nitter: string;
  tipnit: TerceroTipoNit | string;
  digter?: string;
  perjur?: TerceroPersonaJuridica;
  apeter?: string;
  apeter2?: string;
  nomter?: string;
  nomter2?: string;
  razsoc?: string;
  nomcom?: string;
  dirter: string;
  telter: string;
  movter?: string;
  codciu?: string;
  codzon?: string;
  codlis?: string;
  cupblo?: TerceroEstadoCartera | string;
  inater?: TerceroEstadoActivo | string;
  emails?: string[];
}

/** Body de edición de tercero (`TerceroUpdate` — identidad inmutable). */
export interface TerceroUpdatePayload {
  apeter?: string;
  nomter?: string;
  razsoc?: string;
  nomcom?: string;
  dirter?: string;
  telter?: string;
  movter?: string;
  codciu?: string;
  codlis?: string;
  cupblo?: TerceroEstadoCartera | string;
  inater?: TerceroEstadoActivo | string;
  emails?: string[];
}

/** Fila de tercero devuelta por la API (lectura). */
export interface Tercero {
  nitter: string;
  tipnit: string;
  digter?: string | null;
  perjur?: string | null;
  nomter?: string | null;
  nomter2?: string | null;
  apeter?: string | null;
  apeter2?: string | null;
  razsoc?: string | null;
  nomcom?: string | null;
  dirter?: string | null;
  telter?: string | null;
  movter?: string | null;
  codciu?: string | null;
  codzon?: string | null;
  codlis?: string | null;
  cupblo?: string | null;
  inater?: string | null;
  regven?: string | null;
  feccrea?: string | null;
  /**
   * El repo fake devuelve `string[]` y el real `[{nitter, corele}]`:
   * se normaliza con `terceroEmailList`.
   */
  emails?: Array<string | TerceroEmail> | null;
}

/** Unidad de venta (`produndmeds`). */
export interface ProductoUnit {
  codprod?: string;
  codmed: string;
  divmul: ProductoDivMul | string;
  facumed: ErpQty;
  pventa: ErpMoney;
  tipovc: string;
}

/** Código de barras adicional (`prodcodbars`). */
export interface ProductoBarcode {
  codprod?: string;
  codbar: string;
}

/** Precio por lista (`preciosxpro`). */
export interface ProductoPrice {
  codprod?: string;
  codlis: string;
  pvtipo: ProductoModoPrecio | string;
  /** Precio de venta exclusivo (sin IVA). */
  venprod?: ErpMoney;
  /** Monto del IVA (incluido − exclusivo). */
  veniva?: ErpMoney;
  /** Utilidad objetiva recomputada por el backend. */
  porutil?: ErpMoney;
  actupr?: string;
  /** Tasa de IVA — solo la devuelve el repo fake. */
  iva_rate?: ErpQty;
  /** Precio exclusivo — solo el devuelve el repo fake. */
  pvsini?: ErpMoney;
  /** Precio con IVA — solo el devuelve el repo fake. */
  pvconi?: ErpMoney;
}

/** Fila de producto devuelta por la API (lectura). */
export interface Producto {
  codprod: string;
  nomprod?: string | null;
  codbar?: string | null;
  codmed?: string | null;
  valmed?: ErpQty | null;
  codlin1?: string | null;
  actprod?: ProductoEstado | string | null;
  stockmin?: ErpQty | null;
  stockmax?: ErpQty | null;
  desprod?: string | null;
  /** Precio base exclusivo del maestro. */
  pvsini?: ErpMoney | null;
  /** Precio base con IVA del maestro. */
  pvconi?: ErpMoney | null;
  pvtipo?: ProductoModoPrecio | string | null;
  units?: ProductoUnit[] | null;
  barcodes?: ProductoBarcode[] | null;
  prices?: ProductoPrice[] | null;
}

/** Entrada de precio en el body de escritura (`ProductPriceEntry`). */
export interface ProductPriceEntry {
  codlis: string;
  pvtipo: ProductoModoPrecio;
  pvsini?: string;
  pvconi?: string;
  iva_rate: string;
}

/** Unidad de venta en el body de escritura (`UnitEntry`). */
export interface UnitEntry {
  codmed: string;
  divmul: ProductoDivMul;
  facumed: string;
  pventa: string;
  tipovc: string;
}

/** Código de barras en el body de escritura (`BarcodeEntry`). */
export interface BarcodeEntry {
  codbar: string;
}

/** Body de alta de producto (`ProductCreate`). */
export interface ProductCreatePayload {
  codprod: string;
  nomprod?: string;
  codbar?: string;
  codmed: string;
  valmed?: string;
  codlin1?: string;
  actprod?: ProductoEstado;
  stockmin?: string;
  stockmax?: string;
  desprod?: string;
  units?: UnitEntry[];
  barcodes?: BarcodeEntry[];
  prices?: ProductPriceEntry[];
}

/** Body de edición de producto (`ProductUpdate` — el código es inmutable). */
export interface ProductUpdatePayload {
  nomprod?: string;
  codbar?: string;
  codlin1?: string;
  actprod?: ProductoEstado;
  stockmin?: string;
  stockmax?: string;
  desprod?: string;
  units?: UnitEntry[];
  barcodes?: BarcodeEntry[];
  prices?: ProductPriceEntry[];
}
