import { describe, expect, it } from 'vitest';
import {
  CURRENT_WEATHER_FIELDS,
  classifyWeatherSeverity,
  describeWeatherCode,
  parseOpenMeteoResponse,
} from './weather.provider';

/** Open-Meteo `/v1/forecast?...&current=...` shape. */
const openMeteoBody = {
  latitude: 11.8464,
  longitude: 13.1603,
  timezone: 'Africa/Lagos',
  current: {
    time: '2026-09-18T21:00',
    temperature_2m: 30.5,
    apparent_temperature: 33.1,
    precipitation: 0,
    weather_code: 2,
    wind_speed_10m: 12.3,
    wind_direction_10m: 240,
    visibility: 14_820,
  },
};

describe('WMO weather code descriptions', () => {
  it('describes known codes', () => {
    expect(describeWeatherCode(0)).toBe('Clear sky');
    expect(describeWeatherCode(3)).toBe('Overcast');
    expect(describeWeatherCode(65)).toBe('Heavy rain');
    expect(describeWeatherCode(95)).toBe('Thunderstorm');
  });

  it('is honest about an unknown code instead of guessing', () => {
    expect(describeWeatherCode(4242)).toContain('Unrecognised');
  });

  it('reports unavailability rather than implying clear skies', () => {
    // A null code must never render as calm weather — that would be a safety lie.
    expect(describeWeatherCode(null)).toBe('Conditions unavailable');
    expect(classifyWeatherSeverity(null)).toBe('calm');
  });
});

describe('weather severity classification', () => {
  it('flags thunderstorms, hail and freezing precipitation as severe', () => {
    for (const code of [56, 57, 66, 67, 75, 82, 86, 95, 96, 99]) {
      expect(classifyWeatherSeverity(code), `code ${code}`).toBe('severe');
    }
  });

  it('flags rain, snow and fog as advisory', () => {
    for (const code of [45, 48, 61, 63, 65, 71, 73, 80, 81]) {
      expect(classifyWeatherSeverity(code), `code ${code}`).toBe('advisory');
    }
  });

  it('treats clear and cloudy conditions as calm', () => {
    for (const code of [0, 1, 2, 3]) {
      expect(classifyWeatherSeverity(code), `code ${code}`).toBe('calm');
    }
  });
});

describe('Open-Meteo response parsing', () => {
  it('parses a complete current-conditions block', () => {
    const parsed = parseOpenMeteoResponse(openMeteoBody);
    expect(parsed).toMatchObject({
      observedAt: '2026-09-18T21:00',
      temperatureC: 30.5,
      apparentTemperatureC: 33.1,
      precipitationMm: 0,
      windSpeedKmh: 12.3,
      windDirectionDegrees: 240,
      visibilityM: 14_820,
      weatherCode: 2,
      summary: 'Partly cloudy',
      severity: 'calm',
      attribution: 'Weather data by Open-Meteo.com',
    });
  });

  it('tolerates a missing visibility field', () => {
    // visibility is not returned for all regions or models, so the parser must not assume it.
    const parsed = parseOpenMeteoResponse({
      latitude: 11.8464,
      longitude: 13.1603,
      timezone: 'Africa/Lagos',
      current: {
        time: '2026-09-18T21:00',
        temperature_2m: 30.5,
        apparent_temperature: 33.1,
        precipitation: 0,
        weather_code: 2,
        wind_speed_10m: 12.3,
        wind_direction_10m: 240,
      },
    });
    expect(parsed?.visibilityM).toBeNull();
    expect(parsed?.temperatureC).toBe(30.5);
    expect(parsed?.summary).toBe('Partly cloudy');
  });

  it('keeps the other fields when the weather code is absent', () => {
    const parsed = parseOpenMeteoResponse({
      current: { time: '2026-09-18T21:00', temperature_2m: 28 },
    });
    expect(parsed?.weatherCode).toBeNull();
    expect(parsed?.summary).toBe('Conditions unavailable');
    expect(parsed?.temperatureC).toBe(28);
  });

  it('rejects a response with no current block', () => {
    expect(parseOpenMeteoResponse({})).toBeNull();
    expect(parseOpenMeteoResponse({ current: null })).toBeNull();
    expect(parseOpenMeteoResponse({ current: 'nope' })).toBeNull();
    expect(parseOpenMeteoResponse(null)).toBeNull();
    expect(parseOpenMeteoResponse('text')).toBeNull();
  });

  it('rejects non-numeric values rather than coercing them', () => {
    const parsed = parseOpenMeteoResponse({
      current: { temperature_2m: '30.5', wind_speed_10m: Number.NaN, weather_code: 0 },
    });
    expect(parsed?.temperatureC).toBeNull();
    expect(parsed?.windSpeedKmh).toBeNull();
    expect(parsed?.weatherCode).toBe(0);
  });

  it('requests the fields the parser actually reads', () => {
    for (const field of [
      'temperature_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'visibility',
    ]) {
      expect(CURRENT_WEATHER_FIELDS).toContain(field);
    }
  });
});
