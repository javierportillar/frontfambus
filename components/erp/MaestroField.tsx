"use client";

import type { ReactNode } from "react";

/**
 * Primitivas de formulario de la UI de maestros.
 *
 * Todas arman el mismo cableado de accesibilidad: el error va con
 * `role="alert"`, el input queda marcado con `aria-invalid` y el
 * `aria-describedby` apunta al mensaje de error y a la ayuda.
 */

const FIELD_CLASSES =
  "mt-1 block w-full rounded-lg border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60";

function describedBy(errorId: string, hintId: string, error?: string, hint?: string): string | undefined {
  const ids = [error ? errorId : null, hint ? hintId : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

interface MaestroFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Mensaje del backend para este campo (422 aggregate o pydantic). */
  error?: string;
  /** Ayuda o aclaración de la UI. */
  hint?: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
  autoComplete?: string;
  className?: string;
}

/** Campo de texto con etiqueta, error por campo y ayuda. */
export function MaestroField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  type = "text",
  placeholder,
  maxLength,
  disabled = false,
  inputMode,
  autoComplete,
  className = "",
}: MaestroFieldProps): JSX.Element {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(errorId, hintId, error, hint)}
        className={`${FIELD_CLASSES} ${error ? "border-error" : "border-border"}`}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface MaestroSelectOption {
  value: string;
  label: string;
}

interface MaestroSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: MaestroSelectOption[];
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Campo de selección con etiqueta, error por campo y ayuda. */
export function MaestroSelect({
  id,
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required = false,
  disabled = false,
  className = "",
}: MaestroSelectProps): JSX.Element {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(errorId, hintId, error, hint)}
        className={`${FIELD_CLASSES} ${error ? "border-error" : "border-border"}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface MaestroTextareaProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

/** Campo de texto largo (descripciones). */
export function MaestroTextarea({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 3,
  maxLength,
  disabled = false,
  className = "",
}: MaestroTextareaProps): JSX.Element {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(errorId, hintId, error, hint)}
        className={`${FIELD_CLASSES} resize-y ${error ? "border-error" : "border-border"}`}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface MaestroFormNoticeProps {
  title: string;
  message: string;
  tone?: "error" | "warning";
  children?: ReactNode;
}

/** Banner de error global del formulario (mensaje del backend). */
export function MaestroFormNotice({
  title,
  message,
  tone = "error",
  children,
}: MaestroFormNoticeProps): JSX.Element {
  const tones = {
    error: "border-error/40 bg-error/10 text-error",
    warning: "border-warning/40 bg-warning/10 text-warning",
  } as const;

  return (
    <div
      role="alert"
      className={`rounded-xl border px-3 py-2.5 text-sm ${tones[tone]}`}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-text-secondary">{message}</p>
      {children}
    </div>
  );
}
