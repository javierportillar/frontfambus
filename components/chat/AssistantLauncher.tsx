"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { canAccessFeature } from "@/lib/auth/access";

export function AssistantLauncher(): JSX.Element | null {
  const pathname = usePathname();
  const tenant = useAuthStore((state) => state.currentTenant);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const role = useAuthStore((state) => state.role);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const allowed = canAccessFeature("chat-ia", { role, enabledFeatures, allowedModules, currentTenant: tenant });
  if (!tenant || !allowed || pathname === "/chat") return null;
  return (
    <Link
      href="/chat"
      className="fixed bottom-[4.5rem] right-4 z-40 flex h-14 items-center gap-2 rounded-full border border-primary/30 bg-primary px-5 text-sm font-semibold text-primary-fg shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-light hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 sm:bottom-5 sm:right-5"
      aria-label="Abrir asistente de negocio"
    >
      <span aria-hidden="true" className="text-base">✦</span>
      <span className="hidden sm:inline">Asistente</span>
    </Link>
  );
}
