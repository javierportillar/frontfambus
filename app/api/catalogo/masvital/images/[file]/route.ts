import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import catalogJson from "@/data/catalog/masvital.json";
import { authorizeMasVitalCatalog } from "@/lib/catalog/access";
import type { MasVitalCatalogData } from "@/lib/catalog/types";

export const dynamic = "force-dynamic";

const catalog = catalogJson as MasVitalCatalogData;
const allowedFiles = new Set(
  catalog.products.flatMap((product) => {
    const file = product.image?.split("/").pop();
    return file ? [file] : [];
  }),
);

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: { file: string } },
): Promise<NextResponse> {
  const file = params.file;
  if (path.basename(file) !== file || !allowedFiles.has(file)) {
    return NextResponse.json(
      { detail: "Imagen no encontrada" },
      { status: 404 },
    );
  }

  const accessToken = request.cookies.get("motoshop_token")?.value;
  const activeTenant = request.cookies.get("motoshop_tenant")?.value;
  const authorization = await authorizeMasVitalCatalog({
    accessToken,
    requestedTenant: activeTenant,
  });
  if (!authorization.allowed) {
    return NextResponse.json(
      { detail: "Imagen no autorizada" },
      { status: authorization.status },
    );
  }

  try {
    const image = await readFile(
      path.join(process.cwd(), "data", "catalog", "masvital-images", file),
    );
    const extension = path.extname(file).toLowerCase();
    return new NextResponse(image, {
      headers: {
        "Cache-Control": "private, max-age=300, must-revalidate",
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        Vary: "Cookie",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Imagen no encontrada" },
      { status: 404 },
    );
  }
}
