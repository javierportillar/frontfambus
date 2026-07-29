import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MasVitalCatalog } from "@/components/catalogo/MasVitalCatalog";
import { loadMasVitalCatalogPageData } from "@/lib/catalog/pageData";

export const metadata: Metadata = {
  title: "Catálogo | MasVital",
  description: "Catálogo vigente de productos MasVital",
};

export default async function CatalogPage(): Promise<JSX.Element> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("motoshop_token")?.value;
  const requestedTenant = cookieStore.get("motoshop_tenant")?.value;
  const securedCatalog = await loadMasVitalCatalogPageData({
    accessToken,
    requestedTenant,
  });
  if (!securedCatalog) redirect("/");

  return <MasVitalCatalog data={securedCatalog} />;
}
