export type CatalogViewState = "loading" | "searching" | "error" | "ready";

export function normalizeCatalogQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getCatalogViewState({
  hasData,
  isLoading,
  isQueryPending,
  hasError,
}: {
  hasData: boolean;
  isLoading: boolean;
  isQueryPending: boolean;
  hasError: boolean;
}): CatalogViewState {
  if (isQueryPending || (isLoading && hasData)) return "searching";
  if (hasError) return "error";
  if (isLoading) return "loading";
  return "ready";
}
