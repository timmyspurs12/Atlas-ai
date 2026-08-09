export interface TransitCsvError {
  row: number;
  column: string | null;
  message: string;
}

export interface TransitCsvValidationResult {
  valid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  headers: string[];
  errors: TransitCsvError[];
  preview: Array<Record<string, string>>;
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field.trim());
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field');
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

const allowedRecordTypes = new Set(['PLACE', 'ROUTE']);
const allowedPlaceTypes = new Set([
  'STOP',
  'MOTOR_PARK',
  'TERMINAL',
  'STATION',
  'JUNCTION',
  'LANDMARK',
  'JETTY',
  'PICKUP_POINT',
]);
const allowedModes = new Set([
  'DANFO',
  'BRT',
  'CITY_BUS',
  'KOROPE',
  'KEKE',
  'SHARED_TAXI',
  'INTERCITY_BUS',
  'RAIL',
  'FERRY',
  'WALK',
  'OKADA',
  'OTHER',
]);

export function validateTransitCsv(csvText: string): TransitCsvValidationResult {
  let rows: string[][];
  try {
    rows = parseCsvRows(csvText.replace(/^\uFEFF/, ''));
  } catch (error) {
    return {
      valid: false,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      headers: [],
      errors: [
        {
          row: 1,
          column: null,
          message: error instanceof Error ? error.message : 'CSV parsing failed',
        },
      ],
      preview: [],
    };
  }
  const rawHeaders = rows.shift() ?? [];
  const headers = rawHeaders.map((header) => header.trim().toLowerCase());
  const errors: TransitCsvError[] = [];
  for (const required of ['record_type', 'code', 'name']) {
    if (!headers.includes(required)) {
      errors.push({ row: 1, column: required, message: `Missing required column ${required}` });
    }
  }
  if (rows.length > 5_000) {
    errors.push({ row: 1, column: null, message: 'A CSV import may contain at most 5,000 rows' });
  }
  const records = rows
    .slice(0, 5_000)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    );
  const invalid = new Set<number>();
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const fail = (column: string, message: string): void => {
      invalid.add(index);
      if (errors.length < 200) errors.push({ row: rowNumber, column, message });
    };
    if (!allowedRecordTypes.has(record.record_type ?? '')) {
      fail('record_type', 'record_type must be PLACE or ROUTE');
    }
    if (!(record.code ?? '').match(/^[A-Z0-9][A-Z0-9_-]{2,79}$/)) {
      fail('code', 'code must be 3-80 uppercase letters, numbers, underscores, or hyphens');
    }
    if (!(record.name ?? '').trim()) fail('name', 'name is required');
    if (record.record_type === 'PLACE') {
      if (!allowedPlaceTypes.has(record.place_type ?? '')) {
        fail('place_type', 'Invalid or missing place_type');
      }
      const latitude = Number(record.latitude);
      const longitude = Number(record.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        fail('latitude', 'latitude must be between -90 and 90');
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        fail('longitude', 'longitude must be between -180 and 180');
      }
    }
    if (record.record_type === 'ROUTE') {
      if (!record.origin_code) fail('origin_code', 'origin_code is required for routes');
      if (!record.destination_code) {
        fail('destination_code', 'destination_code is required for routes');
      }
      if (!allowedModes.has(record.mode ?? '')) fail('mode', 'Invalid or missing route mode');
    }
  });
  const structuralErrors = errors.some((error) => error.row === 1);
  return {
    valid: errors.length === 0,
    totalRows: records.length,
    validRows: structuralErrors ? 0 : records.length - invalid.size,
    invalidRows: structuralErrors ? records.length : invalid.size,
    headers,
    errors,
    preview: records.slice(0, 10),
  };
}
