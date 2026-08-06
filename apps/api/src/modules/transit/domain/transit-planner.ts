export type PlannerPreference =
  'BALANCED' | 'CHEAPEST' | 'FASTEST' | 'FEWEST_TRANSFERS' | 'LEAST_WALKING' | 'FORMAL_TRANSIT';

export interface TransitGraphPlace {
  id: string;
  name: string;
}

export interface TransitGraphEdge {
  id: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  routeDataVersion: number;
  fromPlaceId: string;
  toPlaceId: string;
  mode: string;
  destinationSign: string | null;
  instructions: string | null;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  fareMinKobo: number | null;
  fareMaxKobo: number | null;
  distanceM: number;
}

export interface TransitGraph {
  places: TransitGraphPlace[];
  edges: TransitGraphEdge[];
}

export interface PlannerRequest {
  originPlaceId: string;
  destinationPlaceId: string;
  preference: PlannerPreference;
  maxTransfers: number;
  maxAlternatives: number;
}

export interface PlannedJourneyLeg {
  routeId: string;
  routeCode: string;
  routeName: string;
  routeDataVersion: number;
  mode: string;
  fromPlaceId: string;
  fromLabel: string;
  toPlaceId: string;
  toLabel: string;
  destinationSign: string | null;
  instructions: string[];
  stopCount: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  fareMinKobo: number | null;
  fareMaxKobo: number | null;
  distanceM: number;
}

export interface PlannedJourney {
  id: string;
  preference: PlannerPreference;
  originPlaceId: string;
  destinationPlaceId: string;
  transferCount: number;
  totalDurationMinMinutes: number;
  totalDurationMaxMinutes: number;
  totalFareMinKobo: number | null;
  totalFareMaxKobo: number | null;
  walkingDistanceM: number;
  hasUnknownFare: boolean;
  legs: PlannedJourneyLeg[];
}

interface SearchState {
  placeId: string;
  currentRouteId: string | null;
  transferCount: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  fareMinKobo: number;
  fareMaxKobo: number;
  hasUnknownFare: boolean;
  walkingDistanceM: number;
  edges: TransitGraphEdge[];
  score: number;
}

const FORMAL_MODES = new Set(['BRT', 'CITY_BUS', 'INTERCITY_BUS', 'RAIL', 'FERRY']);

class MinHeap {
  private readonly values: SearchState[] = [];

  get size(): number {
    return this.values.length;
  }

  push(value: SearchState): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentValue = this.values[parent];
      if (!parentValue || parentValue.score <= value.score) break;
      this.values[index] = parentValue;
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): SearchState | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = left;
      if (
        right < this.values.length &&
        (this.values[right]?.score ?? Infinity) < (this.values[left]?.score ?? Infinity)
      ) {
        smallest = right;
      }
      const child = this.values[smallest];
      if (!child || child.score >= last.score) break;
      this.values[index] = child;
      index = smallest;
    }
    this.values[index] = last;
    return first;
  }
}

function score(state: Omit<SearchState, 'score'>, preference: PlannerPreference): number {
  const durationMidpoint = (state.durationMinMinutes + state.durationMaxMinutes) / 2;
  const fareNaira = state.fareMaxKobo / 100;
  const unknownFarePenalty = state.hasUnknownFare ? 10_000 : 0;
  const informalEdges = state.edges.filter((edge) => !FORMAL_MODES.has(edge.mode)).length;

  switch (preference) {
    case 'CHEAPEST':
      return fareNaira + durationMidpoint * 0.8 + state.transferCount * 150 + unknownFarePenalty;
    case 'FASTEST':
      return durationMidpoint + state.transferCount * 8 + (state.hasUnknownFare ? 5 : 0);
    case 'FEWEST_TRANSFERS':
      return state.transferCount * 10_000 + durationMidpoint + fareNaira * 0.05;
    case 'LEAST_WALKING':
      return state.walkingDistanceM * 10 + durationMidpoint + state.transferCount * 20;
    case 'FORMAL_TRANSIT':
      return informalEdges * 10_000 + durationMidpoint + state.transferCount * 20;
    case 'BALANCED':
      return durationMidpoint + fareNaira * 0.25 + state.transferCount * 20 + unknownFarePenalty;
  }
}

function journeySignature(edges: TransitGraphEdge[]): string {
  return edges.map((edge) => edge.id).join('|');
}

function findPath(
  graph: TransitGraph,
  request: PlannerRequest,
  excludedEdges: ReadonlySet<string>,
): SearchState | null {
  const adjacency = new Map<string, TransitGraphEdge[]>();
  for (const edge of graph.edges) {
    if (excludedEdges.has(edge.id)) continue;
    const current = adjacency.get(edge.fromPlaceId) ?? [];
    current.push(edge);
    adjacency.set(edge.fromPlaceId, current);
  }

  const startWithoutScore: Omit<SearchState, 'score'> = {
    placeId: request.originPlaceId,
    currentRouteId: null,
    transferCount: 0,
    durationMinMinutes: 0,
    durationMaxMinutes: 0,
    fareMinKobo: 0,
    fareMaxKobo: 0,
    hasUnknownFare: false,
    walkingDistanceM: 0,
    edges: [],
  };
  const queue = new MinHeap();
  queue.push({ ...startWithoutScore, score: 0 });
  const best = new Map<string, number>();

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;
    if (current.placeId === request.destinationPlaceId) return current;
    if (current.edges.length >= 64) continue;

    for (const edge of adjacency.get(current.placeId) ?? []) {
      const routeChanged =
        current.currentRouteId !== null && current.currentRouteId !== edge.routeId;
      const transferCount = current.transferCount + (routeChanged ? 1 : 0);
      if (transferCount > request.maxTransfers) continue;
      if (current.edges.some((used) => used.id === edge.id)) continue;

      const transferWaitMin = routeChanged ? 5 : 0;
      const transferWaitMax = routeChanged ? 15 : 0;
      const unknownFare = edge.fareMinKobo === null || edge.fareMaxKobo === null;
      const candidateWithoutScore: Omit<SearchState, 'score'> = {
        placeId: edge.toPlaceId,
        currentRouteId: edge.routeId,
        transferCount,
        durationMinMinutes: current.durationMinMinutes + edge.durationMinMinutes + transferWaitMin,
        durationMaxMinutes: current.durationMaxMinutes + edge.durationMaxMinutes + transferWaitMax,
        fareMinKobo: current.fareMinKobo + (edge.fareMinKobo ?? 0),
        fareMaxKobo: current.fareMaxKobo + (edge.fareMaxKobo ?? 0),
        hasUnknownFare: current.hasUnknownFare || unknownFare,
        walkingDistanceM: current.walkingDistanceM + (edge.mode === 'WALK' ? edge.distanceM : 0),
        edges: [...current.edges, edge],
      };
      const candidate: SearchState = {
        ...candidateWithoutScore,
        score: score(candidateWithoutScore, request.preference),
      };
      const key = `${candidate.placeId}:${candidate.currentRouteId}:${transferCount}`;
      if ((best.get(key) ?? Infinity) <= candidate.score) continue;
      best.set(key, candidate.score);
      queue.push(candidate);
    }
  }
  return null;
}

function toJourney(
  state: SearchState,
  graph: TransitGraph,
  request: PlannerRequest,
): PlannedJourney {
  const placeNames = new Map(graph.places.map((place) => [place.id, place.name]));
  const legs: PlannedJourneyLeg[] = [];
  for (const edge of state.edges) {
    const previous = legs.at(-1);
    if (previous?.routeId === edge.routeId) {
      previous.toPlaceId = edge.toPlaceId;
      previous.toLabel = placeNames.get(edge.toPlaceId) ?? edge.toPlaceId;
      previous.stopCount += 1;
      previous.durationMinMinutes += edge.durationMinMinutes;
      previous.durationMaxMinutes += edge.durationMaxMinutes;
      previous.distanceM += edge.distanceM;
      previous.fareMinKobo =
        previous.fareMinKobo === null || edge.fareMinKobo === null
          ? null
          : previous.fareMinKobo + edge.fareMinKobo;
      previous.fareMaxKobo =
        previous.fareMaxKobo === null || edge.fareMaxKobo === null
          ? null
          : previous.fareMaxKobo + edge.fareMaxKobo;
      if (edge.instructions && !previous.instructions.includes(edge.instructions)) {
        previous.instructions.push(edge.instructions);
      }
      continue;
    }
    legs.push({
      routeId: edge.routeId,
      routeCode: edge.routeCode,
      routeName: edge.routeName,
      routeDataVersion: edge.routeDataVersion,
      mode: edge.mode,
      fromPlaceId: edge.fromPlaceId,
      fromLabel: placeNames.get(edge.fromPlaceId) ?? edge.fromPlaceId,
      toPlaceId: edge.toPlaceId,
      toLabel: placeNames.get(edge.toPlaceId) ?? edge.toPlaceId,
      destinationSign: edge.destinationSign,
      instructions: edge.instructions ? [edge.instructions] : [],
      stopCount: 1,
      durationMinMinutes: edge.durationMinMinutes,
      durationMaxMinutes: edge.durationMaxMinutes,
      fareMinKobo: edge.fareMinKobo,
      fareMaxKobo: edge.fareMaxKobo,
      distanceM: edge.distanceM,
    });
  }
  const signature = journeySignature(state.edges);
  return {
    id: signature,
    preference: request.preference,
    originPlaceId: request.originPlaceId,
    destinationPlaceId: request.destinationPlaceId,
    transferCount: state.transferCount,
    totalDurationMinMinutes: state.durationMinMinutes,
    totalDurationMaxMinutes: state.durationMaxMinutes,
    totalFareMinKobo: state.hasUnknownFare ? null : state.fareMinKobo,
    totalFareMaxKobo: state.hasUnknownFare ? null : state.fareMaxKobo,
    walkingDistanceM: state.walkingDistanceM,
    hasUnknownFare: state.hasUnknownFare,
    legs,
  };
}

export function planTransitJourneys(
  graph: TransitGraph,
  request: PlannerRequest,
): PlannedJourney[] {
  if (request.originPlaceId === request.destinationPlaceId) return [];
  const bestPath = findPath(graph, request, new Set());
  if (!bestPath) return [];
  const candidates = new Map<string, SearchState>();
  candidates.set(journeySignature(bestPath.edges), bestPath);

  for (const edge of bestPath.edges) {
    const alternate = findPath(graph, request, new Set([edge.id]));
    if (alternate) candidates.set(journeySignature(alternate.edges), alternate);
  }

  return [...candidates.values()]
    .sort((first, second) => first.score - second.score)
    .slice(0, request.maxAlternatives)
    .map((state) => toJourney(state, graph, request));
}
