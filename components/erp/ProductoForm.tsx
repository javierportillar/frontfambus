"use client";

import { useMemo } from "react";
import {
  MaestroField,
  MaestroFormNotice,
  MaestroSelect,
  MaestroTextarea,
} from "@/components/erp/MaestroField";
import { mergePriceLists } from "@/lib/erp/priceLists";
import {
  emptyBarcodeRow,
  emptyPriceRow,
  emptyUnitRow,
  type BarcodeFormRow,
  type PriceFormRow,
  type ProductoFormState,
  type UnitFormRow,
} from "@/lib/erp/forms";
import { barcodeFieldError, priceFieldError, unitFieldError } from "@/lib/erp/fieldErrors";

interface ProductoFormProps {
  state: ProductoFormState;
  onChange: (state: ProductoFormState) => void;
  /** Errores por campo del backend (422 aggregate / pydantic / 409). */
  errors: Record<string, string>;
  /** `true` en modo edición: `codprod`/`codmed`/`valmed` no se pueden tocar. */
  editing: boolean;
}

const ACTPROD_OPTIONS = [
  { value: "A", label: "Activo (A)" },
  { value: "I", label: "Inactivo (I)" },
  { value: "S", label: "Suspendido (S)" },
];

const DIVMUL_OPTIONS = [
  { value: "M", label: "Multiplica (M)" },
  { value: "D", label: "Divide (D)" },
];

const MODO_PRECIO_OPTIONS = [
  { value: "1", label: "Precio exclusivo (sin IVA)" },
  { value: "2", label: "Precio con IVA incluido" },
];

const TIPOVC_OPTIONS = [{ value: "0", label: "0 — unidad de venta" }];

/**
 * Formulario de producto: maestro + precios por lista + unidades de venta +
 * códigos de barras.
 *
 * Los precios, las unidades y los códigos de barras se reemplazan por
 * completo al guardar (así los documenta el backend): el orden de las filas
 * se conserva para que el índice del 422 (`prices[0].pvconi`) apunte a la
 * fila que la persona está viendo.
 */
export function ProductoForm({
  state,
  onChange,
  errors,
  editing,
}: ProductoFormProps): JSX.Element {
  const priceListOptions = useMemo(
    () =>
      mergePriceLists(state.prices.map((row) => row.codlis)).map((option) => ({
        value: option.codlis,
        label: option.label,
      })),
    [state.prices],
  );

  function setValue(key: keyof ProductoFormState["values"], value: string): void {
    onChange({ ...state, values: { ...state.values, [key]: value } });
  }

  function updatePrice(index: number, patch: Partial<PriceFormRow>): void {
    onChange({
      ...state,
      prices: state.prices.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function updateUnit(index: number, patch: Partial<UnitFormRow>): void {
    onChange({
      ...state,
      units: state.units.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function updateBarcode(index: number, codbar: string): void {
    onChange({
      ...state,
      barcodes: state.barcodes.map((row, i) => (i === index ? { ...row, codbar } : row)),
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Maestro del producto
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MaestroField
            id="producto-codprod"
            label="Código de producto"
            required
            value={state.values.codprod}
            onChange={(value) => setValue("codprod", value)}
            error={errors.codprod}
            maxLength={20}
            disabled={editing}
            hint={editing ? "El código no se puede editar." : "Identificador del maestro."}
          />
          <MaestroField
            id="producto-nomprod"
            label="Nombre"
            required
            value={state.values.nomprod}
            onChange={(value) => setValue("nomprod", value)}
            error={errors.nomprod}
            maxLength={200}
          />
          <MaestroField
            id="producto-codbar"
            label="Código de barras principal"
            value={state.values.codbar}
            onChange={(value) => setValue("codbar", value)}
            error={errors.codbar}
            maxLength={40}
          />
          <MaestroField
            id="producto-codmed"
            label="Unidad base (codmed)"
            required
            value={state.values.codmed}
            onChange={(value) => setValue("codmed", value)}
            error={errors.codmed}
            maxLength={3}
            disabled={editing}
            hint={editing ? "La unidad base no se puede editar." : "Unidad de venta base."}
          />
          <MaestroField
            id="producto-valmed"
            label="Valor de la unidad"
            value={state.values.valmed}
            onChange={(value) => setValue("valmed", value)}
            error={errors.valmed}
            inputMode="decimal"
            disabled={editing}
          />
          <MaestroField
            id="producto-codlin1"
            label="Línea (codlin1)"
            required
            value={state.values.codlin1}
            onChange={(value) => setValue("codlin1", value)}
            error={errors.codlin1}
            maxLength={4}
          />
          <MaestroSelect
            id="producto-actprod"
            label="Estado"
            value={state.values.actprod}
            onChange={(value) => setValue("actprod", value)}
            options={ACTPROD_OPTIONS}
            error={errors.actprod}
            hint="Un producto inactivo no se puede usar en documentos nuevos."
          />
          <MaestroField
            id="producto-stockmin"
            label="Stock mínimo"
            value={state.values.stockmin}
            onChange={(value) => setValue("stockmin", value)}
            error={errors.stockmin}
            inputMode="decimal"
          />
          <MaestroField
            id="producto-stockmax"
            label="Stock máximo"
            value={state.values.stockmax}
            onChange={(value) => setValue("stockmax", value)}
            error={errors.stockmax}
            inputMode="decimal"
          />
        </div>
        <MaestroTextarea
          id="producto-desprod"
          label="Descripción"
          value={state.values.desprod}
          onChange={(value) => setValue("desprod", value)}
          error={errors.desprod}
          maxLength={800}
          rows={2}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Precios por lista
          </h3>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...state,
                prices: [...state.prices, emptyPriceRow(priceListOptions[0]?.value ?? "")],
              })
            }
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-alt"
          >
            Agregar precio
          </button>
        </div>
        {state.prices.length === 0 ? (
          <p className="text-xs text-text-muted">
            Sin precios cargados. Si el producto no tiene precio, no se podrá vender.
          </p>
        ) : (
          <div className="space-y-3">
            {state.prices.map((row, index) => (
              <div
                key={`precio-${index}`}
                className="rounded-xl border border-border bg-surface-alt/50 p-3"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MaestroSelect
                    id={`precio-${index}-codlis`}
                    label="Lista"
                    value={row.codlis}
                    onChange={(value) => updatePrice(index, { codlis: value })}
                    options={priceListOptions}
                    error={priceFieldError(errors, index, "codlis")}
                  />
                  <MaestroSelect
                    id={`precio-${index}-modo`}
                    label="Modo"
                    value={row.modo}
                    onChange={(value) =>
                      updatePrice(index, { modo: value === "2" ? "2" : "1" })
                    }
                    options={MODO_PRECIO_OPTIONS}
                    error={priceFieldError(errors, index, "pvtipo")}
                  />
                  <MaestroField
                    id={`precio-${index}-precio`}
                    label="Valor"
                    value={row.precio}
                    onChange={(value) => updatePrice(index, { precio: value })}
                    error={priceFieldError(errors, index, "pvconi") ?? priceFieldError(errors, index, "pvsini")}
                    inputMode="decimal"
                  />
                  <MaestroField
                    id={`precio-${index}-iva`}
                    label="Tasa IVA (%)"
                    value={row.ivaRate}
                    onChange={(value) => updatePrice(index, { ivaRate: value })}
                    error={priceFieldError(errors, index, "iva_rate")}
                    inputMode="decimal"
                    hint={
                      row.ivaRateKnown
                        ? undefined
                        : "La API no devuelve la tasa: confirmá el valor."
                    }
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...state,
                        prices: state.prices.filter((_, i) => i !== index),
                      })
                    }
                    className="text-xs font-semibold text-error hover:underline"
                  >
                    Quitar precio
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Unidades de venta
          </h3>
          <button
            type="button"
            onClick={() =>
              onChange({ ...state, units: [...state.units, emptyUnitRow()] })
            }
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-alt"
          >
            Agregar unidad
          </button>
        </div>
        {state.units.length === 0 ? (
          <p className="text-xs text-text-muted">
            Sin unidades de venta adicionales.
          </p>
        ) : (
          <div className="space-y-3">
            {state.units.map((row, index) => (
              <div
                key={`unidad-${index}`}
                className="rounded-xl border border-border bg-surface-alt/50 p-3"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <MaestroField
                    id={`unidad-${index}-codmed`}
                    label="Unidad"
                    value={row.codmed}
                    onChange={(value) => updateUnit(index, { codmed: value })}
                    error={unitFieldError(errors, index, "codmed")}
                    maxLength={3}
                  />
                  <MaestroSelect
                    id={`unidad-${index}-divmul`}
                    label="Multiplica / divide"
                    value={row.divmul}
                    onChange={(value) =>
                      updateUnit(index, { divmul: value === "D" ? "D" : "M" })
                    }
                    options={DIVMUL_OPTIONS}
                    error={unitFieldError(errors, index, "divmul")}
                  />
                  <MaestroField
                    id={`unidad-${index}-facumed`}
                    label="Factor"
                    value={row.facumed}
                    onChange={(value) => updateUnit(index, { facumed: value })}
                    error={unitFieldError(errors, index, "facumed")}
                    inputMode="decimal"
                  />
                  <MaestroField
                    id={`unidad-${index}-pventa`}
                    label="Precio de venta"
                    value={row.pventa}
                    onChange={(value) => updateUnit(index, { pventa: value })}
                    error={unitFieldError(errors, index, "pventa")}
                    inputMode="decimal"
                  />
                  <MaestroSelect
                    id={`unidad-${index}-tipovc`}
                    label="Tipo"
                    value={row.tipovc || "0"}
                    onChange={(value) => updateUnit(index, { tipovc: value })}
                    options={TIPOVC_OPTIONS}
                    error={unitFieldError(errors, index, "tipovc")}
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...state,
                        units: state.units.filter((_, i) => i !== index),
                      })
                    }
                    className="text-xs font-semibold text-error hover:underline"
                  >
                    Quitar unidad
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Códigos de barras
          </h3>
          <button
            type="button"
            onClick={() =>
              onChange({ ...state, barcodes: [...state.barcodes, emptyBarcodeRow()] })
            }
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-surface-alt"
          >
            Agregar código
          </button>
        </div>
        {state.barcodes.length === 0 ? (
          <p className="text-xs text-text-muted">
            Sin códigos de barras adicionales.
          </p>
        ) : (
          <div className="space-y-2">
            {state.barcodes.map((row: BarcodeFormRow, index: number) => (
              <div key={`barra-${index}`} className="flex items-end gap-2">
                <MaestroField
                  id={`barra-${index}-codbar`}
                  label="Código de barras"
                  value={row.codbar}
                  onChange={(value) => updateBarcode(index, value)}
                  error={barcodeFieldError(errors, index, "codbar")}
                  maxLength={30}
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...state,
                      barcodes: state.barcodes.filter((_, i) => i !== index),
                    })
                  }
                  className="mb-1 text-xs font-semibold text-error hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <MaestroFormNotice
        title="Stock y costo"
        message="El stock real (exiprod) y los costos sólo se mueven por transacciones: los maestros no los escriben."
        tone="warning"
      />
    </div>
  );
}
