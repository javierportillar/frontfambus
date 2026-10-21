"use client";

import { useMemo } from "react";
import { MaestroField, MaestroSelect, MaestroTextarea } from "@/components/erp/MaestroField";
import { mergePriceLists } from "@/lib/erp/priceLists";
import type { TerceroFormValues } from "@/lib/erp/validation";

interface TerceroFormProps {
  values: TerceroFormValues;
  onChange: (values: TerceroFormValues) => void;
  /** Errores por campo del backend (422 aggregate / pydantic / 409). */
  errors: Record<string, string>;
  /** `true` en modo edición: la identidad no se puede tocar. */
  editing: boolean;
}

const TIPO_NIT_OPTIONS = [
  { value: "N", label: "NIT (con dígito de verificación)" },
  { value: "C", label: "Cédula de ciudadanía" },
];

const PERSONA_JURIDICA_OPTIONS = [
  { value: "N", label: "Persona natural" },
  { value: "S", label: "Persona jurídica" },
];

const CARTERA_OPTIONS = [
  { value: "R", label: "Normal (R)" },
  { value: "B", label: "Bloqueado por cartera (B)" },
];

const ACTIVO_OPTIONS = [
  { value: "NO", label: "Activo (NO)" },
  { value: "SI", label: "Inactivo (SI)" },
];

/**
 * Formulario de tercero.
 *
 * Los errores por campo llegan ya mapeados desde el backend
 * (`lib/erp/fieldErrors.ts`): cada input muestra el suyo debajo.
 */
export function TerceroForm({
  values,
  onChange,
  errors,
  editing,
}: TerceroFormProps): JSX.Element {
  const priceListOptions = useMemo(
    () =>
      mergePriceLists(values.codlis ? [values.codlis] : []).map((option) => ({
        value: option.codlis,
        label: option.label,
      })),
    [values.codlis],
  );

  function set<K extends keyof TerceroFormValues>(
    key: K,
    value: TerceroFormValues[K],
  ): void {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Identificación
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MaestroField
            id="tercero-nitter"
            label="Identificación (nitter)"
            required
            value={values.nitter}
            onChange={(value) => set("nitter", value)}
            error={errors.nitter}
            inputMode="numeric"
            maxLength={15}
            disabled={editing}
            hint={editing ? "La identificación no se puede editar." : "Solo dígitos (3 a 15)."}
          />
          <MaestroSelect
            id="tercero-tipnit"
            label="Tipo de identificación"
            required
            value={values.tipnit}
            onChange={(value) => set("tipnit", value)}
            options={TIPO_NIT_OPTIONS}
            error={errors.tipnit}
            disabled={editing}
          />
          <MaestroField
            id="tercero-digter"
            label="Dígito de verificación"
            value={values.digter}
            onChange={(value) => set("digter", value)}
            error={errors.digter}
            inputMode="numeric"
            maxLength={2}
            disabled={editing}
            hint="Se valida contra el NIT con el algoritmo mod 11."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Datos del tercero
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MaestroSelect
            id="tercero-perjur"
            label="Persona jurídica"
            value={values.perjur}
            onChange={(value) => set("perjur", value)}
            options={PERSONA_JURIDICA_OPTIONS}
            error={errors.perjur}
            disabled={editing}
            hint={editing ? "No se puede editar." : undefined}
          />
          <MaestroField
            id="tercero-nomter"
            label="Nombre"
            value={values.nomter}
            onChange={(value) => set("nomter", value)}
            error={errors.nomter}
            maxLength={30}
          />
          <MaestroField
            id="tercero-nomter2"
            label="Segundo nombre"
            value={values.nomter2}
            onChange={(value) => set("nomter2", value)}
            error={errors.nomter2}
            maxLength={30}
            disabled={editing}
          />
          <MaestroField
            id="tercero-apeter"
            label="Apellido"
            value={values.apeter}
            onChange={(value) => set("apeter", value)}
            error={errors.apeter}
            maxLength={30}
          />
          <MaestroField
            id="tercero-apeter2"
            label="Segundo apellido"
            value={values.apeter2}
            onChange={(value) => set("apeter2", value)}
            error={errors.apeter2}
            maxLength={30}
            disabled={editing}
          />
          <MaestroField
            id="tercero-razsoc"
            label="Razón social"
            value={values.razsoc}
            onChange={(value) => set("razsoc", value)}
            error={errors.razsoc}
            maxLength={120}
          />
          <MaestroField
            id="tercero-nomcom"
            label="Nombre comercial"
            value={values.nomcom}
            onChange={(value) => set("nomcom", value)}
            error={errors.nomcom}
            maxLength={120}
          />
          <MaestroField
            id="tercero-dirter"
            label="Dirección"
            required
            value={values.dirter}
            onChange={(value) => set("dirter", value)}
            error={errors.dirter}
            maxLength={100}
          />
          <MaestroField
            id="tercero-telter"
            label="Teléfono"
            required
            value={values.telter}
            onChange={(value) => set("telter", value)}
            error={errors.telter}
            maxLength={50}
            inputMode="tel"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Ubicación y clasificación
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MaestroField
            id="tercero-movter"
            label="Municipio"
            value={values.movter}
            onChange={(value) => set("movter", value)}
            error={errors.movter}
            maxLength={15}
          />
          <MaestroField
            id="tercero-codciu"
            label="Ciudad (codciu)"
            value={values.codciu}
            onChange={(value) => set("codciu", value)}
            error={errors.codciu}
            maxLength={6}
          />
          <MaestroField
            id="tercero-codzon"
            label="Zona (codzon)"
            value={values.codzon}
            onChange={(value) => set("codzon", value)}
            error={errors.codzon}
            maxLength={4}
            disabled={editing}
          />
          <MaestroSelect
            id="tercero-codlis"
            label="Lista de precio"
            value={values.codlis}
            onChange={(value) => set("codlis", value)}
            options={priceListOptions}
            error={errors.codlis}
            hint="Lista de precio por defecto del tercero."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Estado
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <MaestroSelect
            id="tercero-cupblo"
            label="Bloqueo por cartera"
            value={values.cupblo}
            onChange={(value) => set("cupblo", value)}
            options={CARTERA_OPTIONS}
            error={errors.cupblo}
            hint="Un tercero bloqueado no se puede usar en documentos nuevos."
          />
          <MaestroSelect
            id="tercero-inater"
            label="Activo"
            value={values.inater}
            onChange={(value) => set("inater", value)}
            options={ACTIVO_OPTIONS}
            error={errors.inater}
            hint="Un tercero inactivo no se puede usar en documentos nuevos."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Correos
        </h3>
        <MaestroTextarea
          id="tercero-emails"
          label="Correos (uno por línea, hasta 10)"
          value={values.emails.join("\n")}
          onChange={(value) =>
            set(
              "emails",
              value
                .split("\n")
                .map((email) => email.trim())
                .filter((email) => email.length > 0),
            )
          }
          error={errors.emails}
          rows={3}
          hint="Cada línea es un correo; al guardar se reemplazan los anteriores."
        />
      </section>
    </div>
  );
}
