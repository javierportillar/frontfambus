import { canAccessFeature, type AccessContext } from "./access";

export const ANALYSIS_TAB_KEYS = [
  "balance",
  "productos",
  "proveedores",
  "horas",
  "gastos",
  "proyeccion",
] as const;

export type AnalysisTab = (typeof ANALYSIS_TAB_KEYS)[number];

const RANGE_ANALYSIS_TABS: readonly AnalysisTab[] = [
  "balance",
  "productos",
  "proveedores",
  "horas",
  "gastos",
];

export function allowedAnalysisTabs(context: AccessContext): AnalysisTab[] {
  const tabs: AnalysisTab[] = [];
  if (canAccessFeature("analisis", context)) tabs.push(...RANGE_ANALYSIS_TABS);
  if (canAccessFeature("forecast", context)) tabs.push("proyeccion");
  return tabs;
}

export function resolveAnalysisTab(
  requested: string | null,
  current: AnalysisTab | null,
  allowed: readonly AnalysisTab[],
): AnalysisTab | null {
  if (requested && allowed.includes(requested as AnalysisTab)) return requested as AnalysisTab;
  if (current && allowed.includes(current)) return current;
  return allowed[0] ?? null;
}
