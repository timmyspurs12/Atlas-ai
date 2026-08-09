export interface TransitGraphPolicyInput {
  stops: Array<{ placeId: string }>;
  segments: Array<{
    fromStopOrder: number;
    toStopOrder: number;
    durationMinMinutes: number;
    durationMaxMinutes: number;
    fareMinKobo?: number;
    fareMaxKobo?: number;
  }>;
  serviceWindows: Array<{
    startMinute: number;
    endMinute: number;
    endsNextDay: boolean;
    frequencyMinMinutes?: number;
    frequencyMaxMinutes?: number;
  }>;
}

export function transitGraphValidationErrors(input: TransitGraphPolicyInput): string[] {
  const errors: string[] = [];
  if (input.stops.length < 2) errors.push('A route requires at least two stops');
  if (input.segments.length !== input.stops.length - 1) {
    errors.push('Every consecutive stop requires exactly one segment');
  }
  input.segments.forEach((segment, index) => {
    if (segment.fromStopOrder !== index || segment.toStopOrder !== index + 1) {
      errors.push('Segments must connect consecutive stop orders');
    }
    if (segment.durationMinMinutes > segment.durationMaxMinutes) {
      errors.push('Segment minimum duration cannot exceed maximum');
    }
    const oneFareMissing =
      (segment.fareMinKobo === undefined) !== (segment.fareMaxKobo === undefined);
    if (oneFareMissing) {
      errors.push('Provide both minimum and maximum fare or neither');
    }
    if (
      segment.fareMinKobo !== undefined &&
      segment.fareMaxKobo !== undefined &&
      segment.fareMinKobo > segment.fareMaxKobo
    ) {
      errors.push('Segment minimum fare cannot exceed maximum');
    }
  });
  input.serviceWindows.forEach((window) => {
    if (!window.endsNextDay && window.endMinute <= window.startMinute) {
      errors.push('Same-day service must end after it starts');
    }
    if (
      window.frequencyMinMinutes !== undefined &&
      window.frequencyMaxMinutes !== undefined &&
      window.frequencyMinMinutes > window.frequencyMaxMinutes
    ) {
      errors.push('Minimum frequency cannot exceed maximum');
    }
  });
  return [...new Set(errors)];
}
