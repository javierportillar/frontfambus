import catalogJson from "@/data/catalog/masvital.json";
import { authorizeMasVitalCatalog } from "./access";
import type { MasVitalCatalogData } from "./types";

const catalog = catalogJson as MasVitalCatalogData;

interface CatalogPageSession {
  accessToken: string | null | undefined;
  requestedTenant: string | null | undefined;
}

export async function loadMasVitalCatalogPageData(
  session: CatalogPageSession,
  {
    fetcher = fetch,
  }: { fetcher?: typeof fetch } = {},
): Promise<MasVitalCatalogData | null> {
  const authorization = await authorizeMasVitalCatalog({
    accessToken: session.accessToken,
    requestedTenant: session.requestedTenant,
    fetcher,
  });
  if (!authorization.allowed) return null;
  return catalog;
}
