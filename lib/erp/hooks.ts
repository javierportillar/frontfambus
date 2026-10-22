"use client";

import useSWR from "swr";
import { useAuthStore } from "@/lib/auth/store";
import {
  getProducto,
  getTercero,
  listProductos,
  listTerceros,
  type MastersListParams,
} from "./client";
import {
  getBankSyncStatus,
  listBankMovements,
  type BankMovimiento,
  type BankSyncStatus,
  type ListBankMovementsParams,
} from "./bank";
import type { Producto, Tercero } from "./types";

const DEDUPING_INTERVAL = 30_000;

function useTenantKey(): string {
  return useAuthStore((state) => state.currentTenant) ?? "_no_tenant";
}

/** Lista de terceros del tenant activo. */
export function useTerceros(params: MastersListParams) {
  const tenant = useTenantKey();
  const key = [
    "erp-terceros",
    tenant,
    params.search ?? "",
    params.limit ?? 50,
    params.offset ?? 0,
  ] as const;

  return useSWR<Tercero[]>(
    key,
    () =>
      listTerceros({
        search: params.search,
        limit: params.limit,
        offset: params.offset,
      }),
    {
      revalidateOnFocus: false,
      dedupingInterval: DEDUPING_INTERVAL,
      keepPreviousData: false,
    },
  );
}

/** Detalle de un tercero (`null` desactiva la consulta). */
export function useTercero(nitter: string | null) {
  const tenant = useTenantKey();
  const key = nitter ? (["erp-tercero", tenant, nitter] as const) : null;

  return useSWR<Tercero>(
    key,
    ([, , id]: readonly [string, string, string]) => getTercero(id),
    {
      revalidateOnFocus: false,
      dedupingInterval: DEDUPING_INTERVAL,
      keepPreviousData: false,
    },
  );
}

/** Lista de productos del tenant activo. */
export function useProductos(params: MastersListParams) {
  const tenant = useTenantKey();
  const key = [
    "erp-productos",
    tenant,
    params.search ?? "",
    params.limit ?? 50,
    params.offset ?? 0,
  ] as const;

  return useSWR<Producto[]>(
    key,
    () =>
      listProductos({
        search: params.search,
        limit: params.limit,
        offset: params.offset,
      }),
    {
      revalidateOnFocus: false,
      dedupingInterval: DEDUPING_INTERVAL,
      keepPreviousData: false,
    },
  );
}

/** Detalle de un producto (`null` desactiva la consulta). */
export function useProducto(codprod: string | null) {
  const tenant = useTenantKey();
  const key = codprod ? (["erp-producto", tenant, codprod] as const) : null;

  return useSWR<Producto>(
    key,
    ([, , id]: readonly [string, string, string]) => getProducto(id),
    {
      revalidateOnFocus: false,
      dedupingInterval: DEDUPING_INTERVAL,
      keepPreviousData: false,
    },
  );
}

/**
 * Movimientos bancarios del tenant activo.
 *
 * La clave de SWR incluye el tenant: al cambiar de tenant se vuelve a pedir
 * la lista en vez de mostrar la del tenant anterior.
 */
export function useBankMovements(params: ListBankMovementsParams = {}) {
  const tenant = useTenantKey();
  const key = [
    "erp-bank-movements",
    tenant,
    params.estado ?? "",
    params.desde ?? "",
    params.hasta ?? "",
  ] as const;

  return useSWR<BankMovimiento[]>(
    key,
    () =>
      listBankMovements({
        estado: params.estado,
        desde: params.desde,
        hasta: params.hasta,
      }),
    {
      revalidateOnFocus: false,
      dedupingInterval: DEDUPING_INTERVAL,
      keepPreviousData: true,
    },
  );
}

/** Estado de sincronización del nodo para el tenant activo. */
export function useBankSyncStatus() {
  const tenant = useTenantKey();
  const key = ["erp-bank-sync-status", tenant] as const;

  return useSWR<BankSyncStatus>(key, () => getBankSyncStatus(), {
    revalidateOnFocus: false,
    dedupingInterval: DEDUPING_INTERVAL,
  });
}
