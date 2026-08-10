export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string;
  handle: string | null;
  role:
    | 'USER'
    | 'BUSINESS_ADMIN'
    | 'DISPATCHER'
    | 'SECURITY_OPERATOR'
    | 'TRANSIT_EDITOR'
    | 'TRANSIT_REVIEWER'
    | 'SUPER_ADMIN';
}

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
  user: AdminUser;
}

export interface Overview {
  pendingPlaces: number;
  draftRoutes: number;
  pendingRevisions: number;
  activeDisruptions: number;
  imports: number;
}

export interface PlaceItem {
  id: string;
  code: string;
  name: string;
  type: string;
  verificationStatus: string;
  latitude: string;
  longitude: string;
  area: { id: string; name: string; type: string };
  aliases: Array<{ alias: string }>;
  modes: Array<{ mode: string }>;
}

export interface RouteItem {
  id: string;
  code: string;
  name: string;
  status: string;
  mode: string;
  confidenceScore: number;
  area: { id: string; name: string };
  originPlace: { id: string; name: string; verificationStatus: string };
  destinationPlace: { id: string; name: string; verificationStatus: string };
  _count: { stops: number; segments: number; revisions: number };
}

export interface RouteDetails extends RouteItem {
  revisionId?: string;
  revisionVersion?: number;
  destinationSign: string | null;
  currentRevisionId: string | null;
  stops: Array<{
    id: string;
    placeId: string;
    stopOrder: number;
    platformName: string | null;
    pickupAllowed: boolean;
    dropoffAllowed: boolean;
    boardingInstructions: string | null;
    alightingInstructions: string | null;
    place: PlaceItem;
  }>;
  segments: Array<{
    id: string;
    fromStopId: string;
    toStopId: string;
    segmentOrder: number;
    durationMinMinutes: number | null;
    durationMaxMinutes: number | null;
    distanceM: number | null;
    fareMinKobo: number | null;
    fareMaxKobo: number | null;
    roadDescription: string | null;
  }>;
  serviceWindows: Array<{
    id: string;
    day: string;
    startMinute: number;
    endMinute: number;
    endsNextDay: boolean;
    frequencyMinMinutes: number | null;
    frequencyMaxMinutes: number | null;
    isApproximate: boolean;
  }>;
}

export interface CoverageItem {
  id: string;
  areaId: string;
  status: string;
  qualityScore: number;
  dataVersion: number;
  lastSurveyedAt: string | null;
  lastVerifiedAt: string | null;
  area: {
    id: string;
    parentId: string | null;
    name: string;
    slug: string;
    code: string | null;
    type: string;
  };
}

export interface CoverageMetrics {
  approvedPlaceCount: number;
  publishedRouteCount: number;
  completeRouteCount: number;
  freshFareRouteCount: number;
  lowestRouteConfidence: number | null;
  staleRouteCount: number;
  lastSurveyedAt: string | null;
}

export interface RevisionItem {
  id: string;
  version: number;
  submittedAt: string;
  changeSummary: string | null;
  route: { id: string; code: string; name: string; status: string };
  createdBy: { profile: { displayName: string } | null };
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SESSION_KEY = 'atlas.admin.session.v1';
const INSTALLATION_KEY = 'atlas.admin.installation.v1';
let refreshInFlight: Promise<AdminSession | null> | null = null;

export function getStoredSession(): AdminSession | null {
  const value = sessionStorage.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AdminSession;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session: AdminSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

function installationId(): string {
  const existing = sessionStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

export async function login(email: string, password: string): Promise<AdminSession> {
  const response = await fetch('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email,
      password,
      device: {
        installationId: installationId(),
        name: 'Atlas Transit Operations',
        platform: 'WEB',
        appVersion: '0.1.0',
      },
    }),
  });
  if (!response.ok) throw new AdminApiError(response.status, 'Email or password is incorrect.');
  const session = (await response.json()) as AdminSession;
  if (!['TRANSIT_EDITOR', 'TRANSIT_REVIEWER', 'SUPER_ADMIN'].includes(session.user.role)) {
    throw new AdminApiError(403, 'This account has no transit administration role.');
  }
  saveSession(session);
  return session;
}

async function refresh(): Promise<AdminSession | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const session = getStoredSession();
    if (!session) return null;
    const response = await fetch('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        refreshToken: session.refreshToken,
        installationId: installationId(),
      }),
    });
    if (!response.ok) {
      clearSession();
      return null;
    }
    const updated = (await response.json()) as AdminSession;
    saveSession(updated);
    return updated;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const session = getStoredSession();
  const response = await fetch(`/v1${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 401 && options.retry !== false && (await refresh())) {
    return request<T>(path, { ...options, retry: false });
  }
  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const error = (await response.json()) as { message?: string };
      message = error.message ?? message;
    } catch {
      // A proxy can return non-JSON errors.
    }
    throw new AdminApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
