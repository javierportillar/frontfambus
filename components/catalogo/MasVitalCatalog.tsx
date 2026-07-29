"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  ChangeEvent,
  Dispatch,
  MouseEvent,
  RefObject,
} from "react";
import Image from "next/image";
import { Pagination } from "@/components/Pagination";
import type {
  CatalogAvailability,
  CatalogProduct,
  MasVitalCatalogData,
} from "@/lib/catalog/types";

const PAGE_SIZE = 24;
const ALL_CATEGORIES = "Todas las categorías";
const ALL_AVAILABILITY = "Todas las disponibilidades";

type AvailabilityFilter = CatalogAvailability | typeof ALL_AVAILABILITY;
type ViewMode = "grid" | "compact";

const editorialFont: CSSProperties = {
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, serif',
};

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const snapshotDate = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function availabilityClasses(availability: CatalogAvailability): string {
  if (availability === "Disponible") {
    return "bg-[#e8efe5] text-[#173d2e]";
  }
  if (availability === "Agotado") {
    return "bg-[#f6dfda] text-[#a24335]";
  }
  return "bg-[#faebc8] text-[#6c5b2b]";
}

function ProductArtwork({
  product,
  compact = false,
}: {
  product: CatalogProduct;
  compact?: boolean;
}): JSX.Element {
  if (product.image) {
    return (
      <Image
        src={product.image}
        alt={product.name}
        fill
        sizes={
          compact
            ? "(max-width: 520px) 112px, 180px"
            : "(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
        }
        unoptimized
        className="h-full w-full object-contain p-5 transition-transform duration-300 group-hover:scale-[1.035]"
      />
    );
  }

  return (
    <div
      role="img"
      aria-label="Imagen no disponible"
      className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,#ecf1e8,#d9e2d7)] text-[#173d2e]"
    >
      <span
        style={editorialFont}
        className={`grid place-items-center rounded-[50%_50%_46%_54%] border border-[#173d2e]/20 ${
          compact ? "h-16 w-16 text-2xl" : "h-24 w-24 text-4xl"
        }`}
      >
        {product.name
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word[0])
          .join("")}
      </span>
    </div>
  );
}

function ProductCard({
  product,
  view,
  onSelect,
}: {
  product: CatalogProduct;
  view: ViewMode;
  onSelect: Dispatch<string>;
}): JSX.Element {
  const handleSelect = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const sku = event.currentTarget.dataset.sku;
      if (sku) onSelect(sku);
    },
    [onSelect],
  );

  const compact = view === "compact";

  return (
    <article className="group min-w-0 overflow-hidden rounded-3xl border border-[#173d2e]/15 bg-[#fffdf8] shadow-[0_10px_34px_rgba(23,61,46,0.075)] transition duration-300 hover:-translate-y-1 hover:border-[#173d2e]/30 hover:shadow-[0_22px_54px_rgba(23,61,46,0.14)] focus-within:border-[#d9a441] focus-within:ring-2 focus-within:ring-[#d9a441]/30">
      <button
        type="button"
        data-sku={product.sku}
        onClick={handleSelect}
        aria-label={`Ver detalles de ${product.name}`}
        className={`w-full min-w-0 bg-transparent text-left text-[#24332b] focus-visible:outline-none ${
          compact
            ? "grid min-h-[188px] grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)]"
            : "flex h-full flex-col"
        }`}
      >
        <div
          className={`relative min-w-0 overflow-hidden bg-[#f0f2ea] ${
            compact ? "min-h-[188px]" : "h-[220px] sm:h-[250px]"
          }`}
        >
          <ProductArtwork product={product} compact={compact} />
          <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-[#fffdf8]/90 px-2.5 py-1.5 text-[0.65rem] font-bold tracking-wide text-[#173d2e] shadow-sm backdrop-blur">
            {product.category}
          </span>
        </div>

        <div
          className={`flex min-w-0 flex-1 flex-col ${
            compact ? "min-h-[188px] p-3.5 sm:p-5" : "min-h-[238px] p-5"
          }`}
        >
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#24543f]">
            {product.type}
          </p>
          <h2
            style={editorialFont}
            className={`mt-2 overflow-hidden font-semibold leading-[1.08] tracking-[-0.015em] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] ${
              compact ? "text-lg sm:text-[1.35rem]" : "text-[1.45rem]"
            }`}
          >
            {product.name}
          </h2>
          <p className="mt-2 truncate text-xs text-[#6b6a61]">
            {product.brand ?? "Marca por confirmar"}
          </p>
          <div className="mt-auto flex min-w-0 flex-wrap items-end justify-between gap-2 pt-4">
            <p
              style={editorialFont}
              className={`min-w-0 break-words font-semibold text-[#173d2e] ${
                compact ? "text-xl" : "text-[1.7rem]"
              }`}
            >
              {product.price === null
                ? "Precio por consultar"
                : currency.format(product.price)}
            </p>
            <span
              className={`max-w-full rounded-full px-2.5 py-1.5 text-right text-[0.68rem] font-bold ${availabilityClasses(
                product.availability,
              )}`}
            >
              {product.availability}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}): JSX.Element {
  return (
    <div className="border-b border-[#d8d8ce] py-3 last:border-0">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#6b6a61]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#24332b]">
        {value ?? "No registrado"}
      </dd>
    </div>
  );
}

function ProductDetail({ product }: { product: CatalogProduct }): JSX.Element {
  return (
    <div>
      <div className="relative min-h-[220px] bg-[#e8efe5] sm:min-h-[300px]">
        <ProductArtwork product={product} compact />
      </div>
      <div className="p-5 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#24543f]">
          {product.type}
        </p>
        <h3
          style={editorialFont}
          className="mt-2 break-words text-3xl font-semibold leading-none sm:text-[2.4rem]"
        >
          {product.name}
        </h3>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p
            style={editorialFont}
            className="text-3xl font-semibold text-[#173d2e]"
          >
            {product.price === null
              ? "Precio por consultar"
              : currency.format(product.price)}
          </p>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${availabilityClasses(
              product.availability,
            )}`}
          >
            {product.availability}
          </span>
        </div>
        <dl className="mt-6 grid border-t border-[#d8d8ce] sm:grid-cols-2 sm:gap-x-6">
          <DetailRow label="Categoría" value={product.category} />
          <DetailRow label="Marca / proveedor" value={product.brand} />
          <DetailRow label="Presentación" value={product.presentation} />
          <DetailRow label="Stock actual" value={product.stock} />
          <DetailRow label="SKU" value={product.sku} />
          <DetailRow label="Código de barras" value={product.barcode} />
        </dl>
        {product.image && (
          <p className="mt-5 rounded-2xl bg-[#faebc8] px-4 py-3 text-xs leading-relaxed text-[#5d573e]">
            Imagen recuperada del catálogo histórico. La presentación comercial
            puede cambiar antes de la publicación definitiva.
          </p>
        )}
      </div>
    </div>
  );
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function CatalogProductDialog({
  product,
  onClose,
  returnFocusRef,
}: {
  product: CatalogProduct;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocusTarget = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTarget?.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar detalle"
        className="absolute inset-0 bg-[#0d1f17]/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-product-dialog-title"
        tabIndex={-1}
        className="relative z-10 max-h-[calc(100dvh-0.5rem)] w-full overflow-hidden rounded-t-3xl bg-[#fffdf8] shadow-2xl sm:max-h-[92vh] sm:max-w-3xl sm:rounded-[1.75rem]"
      >
        <h2 id="catalog-product-dialog-title" className="sr-only">
          Detalle del producto
        </h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#173d2e] text-2xl text-white shadow-lg transition hover:bg-[#24543f] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#d9a441] focus-visible:ring-offset-2 sm:right-4 sm:top-4"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="max-h-[calc(100dvh-0.5rem)] overflow-y-auto overscroll-contain sm:max-h-[92vh]">
          <ProductDetail product={product} />
        </div>
      </div>
    </div>
  );
}

export function MasVitalCatalog({
  data,
}: {
  data: MasVitalCatalogData;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [availability, setAvailability] =
    useState<AvailabilityFilter>(ALL_AVAILABILITY);
  const [onlyWithImage, setOnlyWithImage] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  const filteredProducts = useMemo(() => {
    const needle = normalize(deferredQuery);
    return data.products.filter((product) => {
      const matchesCategory =
        category === ALL_CATEGORIES || product.category === category;
      const matchesAvailability =
        availability === ALL_AVAILABILITY ||
        product.availability === availability;
      const matchesImage = !onlyWithImage || Boolean(product.image);
      const searchable = normalize(
        `${product.name} ${product.sku} ${product.barcode ?? ""} ${
          product.brand ?? ""
        } ${product.type}`,
      );
      return (
        matchesCategory &&
        matchesAvailability &&
        matchesImage &&
        (!needle || searchable.includes(needle))
      );
    });
  }, [availability, category, data.products, deferredQuery, onlyWithImage]);

  const visibleProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, page]);

  const selectedProduct = useMemo(
    () => data.products.find((product) => product.sku === selectedSku) ?? null,
    [data.products, selectedSku],
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
      setPage(1);
    },
    [],
  );

  const handleCategoryChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setCategory(event.target.value);
      setPage(1);
    },
    [],
  );

  const handleAvailabilityChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setAvailability(event.target.value as AvailabilityFilter);
      setPage(1);
    },
    [],
  );

  const handleImageToggle = useCallback(() => {
    setOnlyWithImage((current) => !current);
    setPage(1);
  }, []);

  const handleViewToggle = useCallback(() => {
    setView((current) => (current === "grid" ? "compact" : "grid"));
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    setCategory(ALL_CATEGORIES);
    setAvailability(ALL_AVAILABILITY);
    setOnlyWithImage(false);
    setPage(1);
  }, []);

  const handleSelect = useCallback((sku: string) => {
    dialogTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedSku(sku);
  }, []);

  const handleCloseDetail = useCallback(() => setSelectedSku(null), []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
    requestAnimationFrame(() =>
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }, []);

  const formattedSnapshot = snapshotDate.format(
    new Date(`${data.snapshot}T00:00:00Z`),
  );
  const imageCoverage = Math.round(
    (data.summary.withImage / data.summary.total) * 100,
  );
  const filtersActive =
    query !== "" ||
    category !== ALL_CATEGORIES ||
    availability !== ALL_AVAILABILITY ||
    onlyWithImage;

  const metrics = [
    [data.summary.total, "Productos activos", "portafolio completo"],
    [data.summary.available, "Disponibles", "con stock reportado"],
    [data.summary.outOfStock, "Agotados", "stock actual en cero"],
    [data.summary.withImage, "Con imagen", `${imageCoverage}% del catálogo`],
    [data.categories.length, "Categorías", "segmentación funcional"],
  ] as const;

  return (
    <div className="-mx-4 -mt-4 min-h-screen overflow-x-hidden bg-[#f7f3ea] text-[#24332b]">
      <header className="relative isolate min-h-[430px] overflow-hidden rounded-b-[2.9rem] bg-[#173d2e] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_22%,rgba(217,164,65,0.22),transparent_28%)]" />
        <div className="absolute -bottom-80 -right-28 -z-10 h-[520px] w-[520px] rounded-full border border-white/15 shadow-[0_0_0_72px_rgba(255,255,255,0.025),0_0_0_144px_rgba(255,255,255,0.02)]" />
        <div className="mx-auto grid min-h-[430px] w-full max-w-[1480px] items-end gap-10 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)] lg:gap-14 lg:pb-14 lg:pt-14">
          <div>
            <div className="mb-8 flex items-center gap-4 lg:mb-11">
              <Image
                src="/tenants/masvital/logo.png"
                alt="MásVital"
                width={86}
                height={86}
                priority
                className="h-[68px] w-[68px] object-contain drop-shadow-xl sm:h-[86px] sm:w-[86px]"
              />
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#d8e5d6] sm:text-xs">
                  Portafolio vigente
                </p>
                <strong className="mt-1 block text-lg">MásVital Market</strong>
              </div>
            </div>
            <h1
              style={editorialFont}
              className="max-w-4xl text-[clamp(2.75rem,7vw,6.1rem)] font-medium leading-[0.92] tracking-[-0.045em]"
            >
              Naturalmente, <em className="font-normal text-[#e7c77d]">todo</em>{" "}
              en un solo catálogo.
            </h1>
            <p className="mt-7 max-w-3xl text-base leading-relaxed text-[#d8e5d6] sm:text-lg">
              Explorá productos, precios, disponibilidad, categorías, marcas e
              imágenes en una experiencia diseñada para el futuro catálogo
              público de MásVital.
            </p>
          </div>

          <aside
            aria-label="Información de la edición"
            className="self-center rounded-[1.65rem] border border-white/15 bg-white/[0.075] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.14)] backdrop-blur-xl sm:p-7"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#b9cebb]">
              Edición para stakeholders
            </p>
            <strong
              style={editorialFont}
              className="my-2 block text-2xl font-medium sm:text-3xl"
            >
              Catálogo vigente de MásVital
            </strong>
            <p className="mb-5 text-sm leading-relaxed text-white/65">
              Preview dentro del aplicativo. La apertura pública será una fase
              posterior.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Corte", formattedSnapshot],
                ["Ámbito", "Solo MásVital"],
                ["Productos", data.summary.total],
                ["Imágenes", data.summary.withImage],
              ].map(([label, value]) => (
                <div key={label} className="border-t border-white/15 pt-3">
                  <span className="block text-[0.68rem] text-[#a9c2ad]">
                    {label}
                  </span>
                  <b className="mt-1 block text-sm font-semibold text-white">
                    {value}
                  </b>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1480px] px-4 pb-20 sm:px-6">
        <section
          aria-label="Indicadores del catálogo"
          className="relative z-10 -mt-12 grid grid-cols-2 gap-2 sm:-mt-16 sm:gap-3 lg:grid-cols-5"
        >
          {metrics.map(([value, label, helper], index) => (
            <article
              key={label}
              className={`min-w-0 rounded-[1.35rem] border border-[#173d2e]/15 bg-[#fffdf8]/95 p-4 shadow-[0_18px_60px_rgba(23,61,46,0.12)] backdrop-blur sm:min-h-36 sm:p-6 ${
                index === metrics.length - 1 ? "col-span-2 lg:col-span-1" : ""
              }`}
            >
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#6b6a61] sm:text-xs">
                {label}
              </span>
              <strong
                style={editorialFont}
                className="mt-3 block text-4xl font-medium leading-none text-[#173d2e] sm:text-[2.85rem]"
              >
                {value}
              </strong>
              <small className="mt-2 block text-xs text-[#6b6a61]">
                {helper}
              </small>
            </article>
          ))}
        </section>

        <section className="my-7 grid gap-4 rounded-[1.35rem] border border-[#d9a441]/40 bg-[#faebc8] p-5 sm:grid-cols-[48px_1fr] sm:p-6">
          <div
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-full bg-[#f3d991] text-2xl text-[#173d2e]"
            style={editorialFont}
          >
            i
          </div>
          <div>
            <h2 style={editorialFont} className="text-2xl font-semibold">
              Una propuesta pública, revisada primero por quienes conocen la
              marca.
            </h2>
            <p className="mt-1 max-w-5xl leading-relaxed text-[#5d573e]">
              Esta sección reproduce la dirección visual del catálogo público.
              Por ahora vive dentro del aplicativo para recoger comentarios de
              stakeholders sin exponerla fuera de MásVital.
            </p>
          </div>
        </section>

        <section aria-labelledby="catalog-title">
          <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#24543f]">
                Explorá el portafolio
              </p>
              <h2
                id="catalog-title"
                style={editorialFont}
                className="mt-1 text-[clamp(2.4rem,5vw,3.9rem)] font-medium leading-none tracking-[-0.025em]"
              >
                Productos de MásVital
              </h2>
            </div>
            <p className="text-sm text-[#6b6a61]" aria-live="polite">
              <strong className="text-[#24332b]">
                {filteredProducts.length}
              </strong>{" "}
              producto{filteredProducts.length === 1 ? "" : "s"}
            </p>
          </div>

          <div
            className="sticky top-3 z-30 mb-6 grid gap-2 rounded-[1.25rem] border border-[#173d2e]/15 bg-[#fffdf8]/95 p-2.5 shadow-[0_14px_45px_rgba(23,61,46,0.1)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[minmax(260px,1.4fr)_minmax(170px,0.55fr)_minmax(190px,0.55fr)_auto_auto]"
            aria-label="Filtros del catálogo"
          >
            <label className="min-w-0 sm:col-span-2 lg:col-span-1">
              <span className="sr-only">Buscar productos</span>
              <input
                type="search"
                value={query}
                onChange={handleQueryChange}
                placeholder="Buscar producto, marca, SKU o código…"
                className="h-12 w-full rounded-[0.8rem] border border-transparent bg-[#f7f3ea] px-4 text-base text-[#24332b] outline-none transition placeholder:text-[#6b6a61] focus:border-[#24543f] focus:ring-3 focus:ring-[#24543f]/10"
              />
            </label>
            <label className="min-w-0">
              <span className="sr-only">Filtrar por categoría</span>
              <select
                value={category}
                onChange={handleCategoryChange}
                className="h-12 w-full rounded-[0.8rem] border border-transparent bg-[#f7f3ea] px-3 text-base font-semibold text-[#24332b] outline-none transition focus:border-[#24543f] focus:ring-3 focus:ring-[#24543f]/10"
              >
                <option>{ALL_CATEGORIES}</option>
                {data.categories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">Filtrar por disponibilidad</span>
              <select
                value={availability}
                onChange={handleAvailabilityChange}
                className="h-12 w-full rounded-[0.8rem] border border-transparent bg-[#f7f3ea] px-3 text-base font-semibold text-[#24332b] outline-none transition focus:border-[#24543f] focus:ring-3 focus:ring-[#24543f]/10"
              >
                <option>{ALL_AVAILABILITY}</option>
                <option>Disponible</option>
                <option>Agotado</option>
                <option>Sin registro de inventario</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleImageToggle}
              aria-pressed={onlyWithImage}
              className={`min-h-12 rounded-[0.8rem] px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#d9a441] ${
                onlyWithImage
                  ? "bg-[#173d2e] text-white"
                  : "bg-[#e8efe5] text-[#173d2e]"
              }`}
            >
              Solo con imagen
            </button>
            <button
              type="button"
              onClick={handleViewToggle}
              aria-pressed={view === "compact"}
              className={`min-h-12 rounded-[0.8rem] px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#d9a441] ${
                view === "compact"
                  ? "bg-[#173d2e] text-white"
                  : "bg-[#e8efe5] text-[#173d2e]"
              }`}
            >
              {view === "compact" ? "Vista amplia" : "Vista compacta"}
            </button>
          </div>

          <div ref={resultsRef} className="scroll-mt-4">
            {filtersActive && (
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs font-bold text-[#24543f] underline-offset-4 hover:underline"
                >
                  Limpiar filtros
                </button>
              </div>
            )}

            {visibleProducts.length > 0 ? (
              <div
                className={
                  view === "compact"
                    ? "grid grid-cols-1 gap-4 xl:grid-cols-2"
                    : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                }
              >
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.sku}
                    product={product}
                    view={view}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-[#a8bca5] bg-[#fffdf8] px-6 py-20 text-center text-[#6b6a61]">
                <p
                  style={editorialFont}
                  className="text-3xl font-semibold text-[#173d2e]"
                >
                  No encontramos productos
                </p>
                <p className="mt-2 text-sm">
                  Probá con otro término o limpiá los filtros.
                </p>
                <button
                  type="button"
                  onClick={handleClear}
                  className="mt-5 rounded-xl bg-[#173d2e] px-4 py-2.5 text-sm font-bold text-white"
                >
                  Ver todo el catálogo
                </button>
              </div>
            )}

            <Pagination
              page={page}
              total={filteredProducts.length}
              limit={PAGE_SIZE}
              onPageChange={handlePageChange}
            />
          </div>
        </section>
      </main>

      <footer className="bg-[#173d2e] px-4 py-8 text-sm text-[#c8d8ca] sm:px-6">
        <div className="mx-auto flex w-full max-w-[1480px] flex-col justify-between gap-2 sm:flex-row">
          <p>
            <strong className="text-white">MásVital Market</strong> · Preview
            para stakeholders
          </p>
          <p>Corte del {formattedSnapshot} · Próxima fase: catálogo público</p>
        </div>
      </footer>

      {selectedProduct && (
        <CatalogProductDialog
          product={selectedProduct}
          onClose={handleCloseDetail}
          returnFocusRef={dialogTriggerRef}
        />
      )}
    </div>
  );
}
