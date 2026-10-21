/**
 * Utilidades de conciliación y extracción para comprobantes y transferencias Bancolombia / QR.
 */

export interface BancolombiaQRParseResult {
  customerName?: string;
  reference?: string;
  amount?: number;
  rawMatched: boolean;
}

/**
 * Limpia una referencia eliminando sufijos o palabras "null" y espacios sobrantes.
 * Ejemplo: "0092055984 null" -> "0092055984"
 * Ejemplo: "0092055984null" -> "0092055984"
 */
export function sanitizeBancolombiaReference(ref: string): string {
  if (!ref) return "";
  return ref
    .replace(/\s*null\b/gi, "")
    .replace(/null$/i, "")
    .trim();
}

/**
 * Parsea el texto copiado de un movimiento bancario o notificación de Bancolombia:
 * - Extrae el nombre del pagador después de "PAGO QR ".
 * - Extrae el número de referencia numérico (6+ dígitos) eliminando "null".
 * - Extrae opcionalmente el importe si viene con formato monetario ($...).
 */
export function parseBancolombiaQRText(rawText: string): BancolombiaQRParseResult {
  const text = rawText.trim();
  if (!text) return { rawMatched: false };

  // 1. Extraer nombre después de PAGO QR
  // Corta antes de la referencia numérica, el símbolo de pesos o salto de línea/tabulación
  const nameMatch = text.match(
    /PAGO\s+QR\s+([A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+?)(?=\s+\d{6,}|\s+\$|\s+null|$|\n|\t)/i,
  );
  const customerName =
    nameMatch && nameMatch[1]
      ? nameMatch[1].trim().replace(/\s+/g, " ")
      : undefined;

  // 2. Extraer referencia numérica eliminando sufijo "null"
  let reference: string | undefined;
  const refMatch = text.match(/(\d{6,})(?:\s*null)?/i);
  if (refMatch && refMatch[1]) {
    reference = sanitizeBancolombiaReference(refMatch[1]);
  } else {
    // Si viene precedido por ref/referencia o código alfanumérico
    const refExplicit = text.match(/(?:ref(?:erencia)?[:\s]+)(\w+)(?:\s*null)?/i);
    if (refExplicit && refExplicit[1]) {
      reference = sanitizeBancolombiaReference(refExplicit[1]);
    }
  }

  // 3. Extraer importe monetario si está presente
  let amount: number | undefined;
  const amountMatch = text.match(/\$\s*([\d.,]+)/);
  if (amountMatch && amountMatch[1]) {
    const cleanAmount = amountMatch[1].replace(/\./g, "").replace(/,/g, ".");
    const parsed = parseFloat(cleanAmount);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  const rawMatched = Boolean(customerName || reference || amount);
  return { customerName, reference, amount, rawMatched };
}
