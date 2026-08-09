import { describe, expect, it } from 'vitest';
import { validateTransitCsv } from './transit-csv';

describe('validateTransitCsv', () => {
  it('validates quoted place and route rows', () => {
    const result = validateTransitCsv(
      [
        'record_type,code,name,place_type,latitude,longitude,origin_code,destination_code,mode',
        'PLACE,NG-LA-001,"Ikeja, Under Bridge",MOTOR_PARK,6.60,3.35,,,',
        'ROUTE,NG-LA-R1,Ikeja to Ajah,,,,NG-LA-001,NG-LA-002,CITY_BUS',
      ].join('\n'),
    );
    expect(result.valid).toBe(true);
    expect(result.validRows).toBe(2);
    expect(result.preview[0]?.name).toBe('Ikeja, Under Bridge');
  });

  it('fails closed for malformed coordinates and modes', () => {
    const result = validateTransitCsv(
      [
        'record_type,code,name,place_type,latitude,longitude,origin_code,destination_code,mode',
        'PLACE,bad,Unknown,NOPE,500,3.2,,,',
      ].join('\n'),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.column)).toEqual(
      expect.arrayContaining(['code', 'place_type', 'latitude']),
    );
  });

  it('rejects missing required headers', () => {
    const result = validateTransitCsv('foo,bar\n1,2');
    expect(result.valid).toBe(false);
    expect(result.validRows).toBe(0);
  });
});
