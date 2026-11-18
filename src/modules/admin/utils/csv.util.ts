/**
 * RFC 4180 compliant CSV Export Utility
 */

export interface CsvColumn<T = any> {
  header: string;
  key: keyof T | string;
  format?: (value: any, row: T) => string | number | null | undefined;
}

/**
 * Escapes a single CSV value according to RFC 4180 rules
 */
export function escapeCsvValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If string contains comma, double quote, CR, or LF, wrap in quotes and escape internal quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts an array of objects into CSV format string
 */
export function generateCsv<T = any>(
  data: T[],
  columns: CsvColumn<T>[],
): string {
  const headerRow = columns.map((col) => escapeCsvValue(col.header)).join(',');

  const dataRows = data.map((row: any) => {
    return columns
      .map((col) => {
        let val = row[col.key];
        if (col.format) {
          val = col.format(val, row);
        }
        return escapeCsvValue(val);
      })
      .join(',');
  });

  return [headerRow, ...dataRows].join('\r\n');
}
