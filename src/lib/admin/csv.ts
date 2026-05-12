/**
 * Mini-helper para serializar filas a CSV. Sin libs externas porque el
 * volumen de exports en admin es pequeño y los casos especiales (comas,
 * comillas, saltos de línea, BOM para Excel español) son fáciles de cubrir
 * a mano.
 */

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: Array<{ key: keyof T; header: string }>,
): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCsv(row[c.key])).join(','))
    .join('\n');
  // BOM al inicio para que Excel español detecte UTF-8 correctamente
  return `﻿${header}\n${body}\n`;
}

export function csvFilename(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
}
