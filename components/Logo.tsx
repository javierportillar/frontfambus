"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";
import { getTenantDisplay } from "@/lib/tenant/config";

interface LogoProps {
  /** Tamaño: sm=32px, md=48px (default), lg=64px */
  size?: "sm" | "md" | "lg";
  /** Si true, linkea a "/" */
  link?: boolean;
  className?: string;
}

const sizeMap: Record<NonNullable<LogoProps["size"]>, number> = {
  sm: 32,
  md: 48,
  lg: 64,
};

/** Fallback genérico cuando aún no hay tenant activo (login, primer render). */
const FALLBACK_LOGO = "/logo.png";

function useTenantLogo(): { src: string; alt: string } {
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const cfg = currentTenant ? getTenantDisplay(currentTenant) : undefined;
  if (cfg) return { src: cfg.logo, alt: cfg.name };
  return { src: FALLBACK_LOGO, alt: "Plataforma" };
}

/**
 * Logo del tenant activo. Se resuelve dinámicamente del store de auth +
 * el catálogo en lib/tenant/config.ts. Si no hay tenant (ej. ruta /login),
 * cae al genérico /logo.png.
 *
 * Usamos `<img>` regular en vez de `next/image` porque cada tenant tiene
 * su propio aspect ratio y queremos contener al alto sin distorsionar.
 */
export function Logo({
  size = "md",
  link = false,
  className = "",
}: LogoProps): JSX.Element {
  const px = sizeMap[size];
  const { src, alt } = useTenantLogo();

  const image = (
    <div
      className={`inline-flex items-center justify-center rounded-lg bg-surface-dark px-3 py-2 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        height={px}
        style={{ height: `${px}px`, width: "auto", maxWidth: `${px * 2.5}px`, objectFit: "contain" }}
      />
    </div>
  );

  if (link) {
    return (
      <Link href="/" className="inline-block" aria-label={`Ir a inicio ${alt}`}>
        {image}
      </Link>
    );
  }

  return image;
}

/**
 * Logo compacto: solo la marca sin texto, para espacios reducidos
 * (mobile nav, favicon substitute, loading states).
 */
export function LogoMark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}): JSX.Element {
  const { src, alt } = useTenantLogo();

  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg bg-surface-dark p-1.5 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ height: `${size}px`, width: `${size}px`, objectFit: "contain" }}
      />
    </div>
  );
}
