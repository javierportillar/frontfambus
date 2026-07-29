export type CatalogAvailability =
  | "Disponible"
  | "Agotado"
  | "Sin registro de inventario";

export interface CatalogProduct {
  sku: string;
  name: string;
  category: string;
  type: string;
  brand: string | null;
  barcode: string | null;
  presentation: string | null;
  price: number | null;
  stock: number | null;
  availability: CatalogAvailability;
  image: string | null;
  imageConfidence: string;
}

export interface MasVitalCatalogData {
  tenant: "masvital";
  snapshot: string;
  summary: {
    total: number;
    available: number;
    outOfStock: number;
    withoutInventory: number;
    withImage: number;
  };
  categories: Array<{ name: string; count: number }>;
  products: CatalogProduct[];
}
