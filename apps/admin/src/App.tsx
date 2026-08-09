import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AdminApiError,
  clearSession,
  getStoredSession,
  login,
  request,
  type AdminSession,
  type Overview,
  type PlaceItem,
  type RevisionItem,
  type RouteItem,
} from './api';
import { RouteEditor } from './RouteEditor';

type Tab = 'review' | 'places' | 'routes' | 'imports';

const initialOverview: Overview = {
  pendingPlaces: 0,
  draftRoutes: 0,
  pendingRevisions: 0,
  activeDisruptions: 0,
  imports: 0,
};

function Login({ onSignedIn }: { onSignedIn: (session: AdminSession) => void }) {
  const [email, setEmail] = useState('transit.reviewer@demo.atlas');
  const [password, setPassword] = useState('AtlasDemo2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onSignedIn(await login(email, password));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark">A</div>
        <p className="eyebrow">ATLAS AI · INTERNAL OPERATIONS</p>
        <h1>Build trusted transit knowledge for every Nigerian community.</h1>
        <p>
          Routes remain private until an independent reviewer confirms the places, sequence,
          instructions, and confidence.
        </p>
        <div className="security-note">🔒 No public publishing without review</div>
      </section>
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <p className="eyebrow">SECURE ACCESS</p>
        <h2>Transit operations</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <div className="alert error">{error}</div> : null}
        <button className="primary" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="fine-print">
          Authorised internal users only. All publication actions are audited.
        </p>
      </form>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<AdminSession | null>(() => getStoredSession());
  const [tab, setTab] = useState<Tab>('review');
  const [overview, setOverview] = useState(initialOverview);
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState(
    'record_type,code,name,place_type,latitude,longitude\nPLACE,NG-LA-NEW,Example Stop,STOP,6.5,3.4',
  );
  const [areaId, setAreaId] = useState('');
  const [csvResult, setCsvResult] = useState<Record<string, unknown> | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const reviewer =
    session?.user.role === 'TRANSIT_REVIEWER' || session?.user.role === 'SUPER_ADMIN';
  const editor = session?.user.role === 'TRANSIT_EDITOR' || session?.user.role === 'SUPER_ADMIN';

  const load = useCallback(async (): Promise<void> => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [overviewData, placeData, routeData] = await Promise.all([
        request<Overview>('/transit/admin/overview'),
        request<{ data: PlaceItem[] }>('/transit/admin/places?limit=100'),
        request<{ data: RouteItem[] }>('/transit/admin/routes?limit=100'),
      ]);
      setOverview(overviewData);
      setPlaces(placeData.data);
      setRoutes(routeData.data);
      if (reviewer) {
        const revisionData = await request<{ data: RevisionItem[] }>(
          '/transit/admin/revisions/pending?limit=100',
        );
        setRevisions(revisionData.data);
      }
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 401) setSession(null);
      setError(caught instanceof Error ? caught.message : 'Dashboard refresh failed.');
    } finally {
      setLoading(false);
    }
  }, [reviewer, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (operation: () => Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Action failed.');
    }
  };

  if (!session) return <Login onSignedIn={setSession} />;

  const cards = [
    ['Pending places', overview.pendingPlaces, 'places'],
    ['Draft routes', overview.draftRoutes, 'routes'],
    ['Review queue', overview.pendingRevisions, 'review'],
    ['Active disruptions', overview.activeDisruptions, 'review'],
  ] as const;

  return (
    <div className="app-shell">
      <aside>
        <div className="logo-row">
          <div className="brand-mark small">A</div>
          <div>
            <strong>Atlas AI</strong>
            <span>Transit Operations</span>
          </div>
        </div>
        <nav>
          {(['review', 'places', 'routes', 'imports'] as Tab[]).map((item) => (
            <button
              key={item}
              className={tab === item ? 'active' : ''}
              onClick={() => setTab(item)}
            >
              {item === 'review' ? 'Review queue' : item[0]?.toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span>{session.user.displayName}</span>
          <small>{session.user.role}</small>
          <button
            onClick={() => {
              clearSession();
              setSession(null);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <div>
            <p className="eyebrow">NATIONWIDE DATA OPERATIONS</p>
            <h1>Transit command centre</h1>
          </div>
          <button className="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </header>
        {message ? <div className="alert success">{message}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        <section className="metric-grid">
          {cards.map(([label, value, target]) => (
            <button className="metric" key={label} onClick={() => setTab(target)}>
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </section>

        {tab === 'review' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Independent review queue</h2>
                <p>Editors cannot approve their own submissions.</p>
              </div>
              <span className="badge">{revisions.length} pending</span>
            </div>
            {!reviewer ? (
              <div className="empty">Your editor account can submit data but cannot review it.</div>
            ) : revisions.length === 0 ? (
              <div className="empty">No route revisions are waiting for review.</div>
            ) : (
              revisions.map((revision) => (
                <article className="row" key={revision.id}>
                  <div>
                    <strong>{revision.route.name}</strong>
                    <span>
                      {revision.route.code} · revision {revision.version}
                    </span>
                    <small>
                      Submitted by {revision.createdBy.profile?.displayName ?? 'Unknown editor'}
                    </small>
                  </div>
                  <div className="actions">
                    <button
                      className="danger-ghost"
                      onClick={() =>
                        void act(
                          () =>
                            request(`/transit/reviewer/revisions/${revision.id}/review`, {
                              method: 'POST',
                              body: {
                                decision: 'CHANGES_REQUESTED',
                                notes: 'Please verify or correct the submitted route data.',
                              },
                            }),
                          'Changes requested.',
                        )
                      }
                    >
                      Request changes
                    </button>
                    <button
                      className="approve"
                      onClick={() =>
                        void act(
                          () =>
                            request(`/transit/reviewer/revisions/${revision.id}/review`, {
                              method: 'POST',
                              body: { decision: 'APPROVED', confidenceScore: 80 },
                            }),
                          'Route revision approved and published.',
                        )
                      }
                    >
                      Approve
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        ) : null}

        {tab === 'places' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Transit places</h2>
                <p>Stops, parks, stations, junctions, and jetties.</p>
              </div>
              <span className="badge">{places.length} loaded</span>
            </div>
            {places.map((place) => (
              <article className="row" key={place.id}>
                <div>
                  <strong>{place.name}</strong>
                  <span>
                    {place.code} · {place.area.name} · {place.type}
                  </span>
                  <small>
                    {place.modes.map((mode) => mode.mode).join(', ') || 'No modes recorded'}
                  </small>
                </div>
                <div className="actions">
                  <span className={`status ${place.verificationStatus.toLowerCase()}`}>
                    {place.verificationStatus}
                  </span>
                  {reviewer && place.verificationStatus === 'PENDING' ? (
                    <>
                      <button
                        className="danger-ghost"
                        onClick={() =>
                          void act(
                            () =>
                              request(`/transit/admin/places/${place.id}/review`, {
                                method: 'POST',
                                body: {
                                  decision: 'CHANGES_REQUESTED',
                                  notes: 'Field verification is required.',
                                },
                              }),
                            'Changes requested for place.',
                          )
                        }
                      >
                        Changes
                      </button>
                      <button
                        className="approve"
                        onClick={() =>
                          void act(
                            () =>
                              request(`/transit/admin/places/${place.id}/review`, {
                                method: 'POST',
                                body: { decision: 'APPROVED' },
                              }),
                            'Place approved.',
                          )
                        }
                      >
                        Approve
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {tab === 'routes' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Route catalog</h2>
                <p>Only approved revisions can become public.</p>
              </div>
              <span className="badge">{routes.length} loaded</span>
            </div>
            {routes.map((route) => (
              <article className="row" key={route.id}>
                <div>
                  <strong>{route.name}</strong>
                  <span>
                    {route.code} · {route.mode} · {route.originPlace.name} →{' '}
                    {route.destinationPlace.name}
                  </span>
                  <small>
                    {route._count.stops} stops · {route._count.segments} segments · confidence{' '}
                    {route.confidenceScore}
                  </small>
                </div>
                <div className="actions">
                  <span className={`status ${route.status.toLowerCase()}`}>{route.status}</span>
                  {editor && route.status === 'DRAFT' ? (
                    <button className="secondary" onClick={() => setEditingRouteId(route.id)}>
                      Edit graph
                    </button>
                  ) : null}
                  {editor && route.status === 'DRAFT' ? (
                    <button
                      className="primary compact"
                      onClick={() =>
                        void act(
                          () =>
                            request(`/transit/editor/routes/${route.id}/submit`, {
                              method: 'POST',
                              body: {
                                changeSummary: 'Submitted from Transit Operations dashboard.',
                              },
                            }),
                          'Route submitted for independent review.',
                        )
                      }
                    >
                      Submit
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {tab === 'imports' ? (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Validate CSV import</h2>
                <p>Validation never imports or publishes records.</p>
              </div>
            </div>
            {!editor ? (
              <div className="empty">Only transit editors can validate imports.</div>
            ) : (
              <div className="import-form">
                <label>
                  Administrative area UUID
                  <input
                    value={areaId}
                    onChange={(event) => setAreaId(event.target.value)}
                    placeholder="Area UUID"
                  />
                </label>
                <label>
                  CSV content
                  <textarea
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    rows={12}
                  />
                </label>
                <button
                  className="primary"
                  onClick={() =>
                    void act(async () => {
                      const result = await request<Record<string, unknown>>(
                        '/transit/admin/imports/validate',
                        { method: 'POST', body: { areaId, csvText } },
                      );
                      setCsvResult(result);
                    }, 'CSV validation complete.')
                  }
                >
                  Validate without importing
                </button>
                {csvResult ? <pre>{JSON.stringify(csvResult, null, 2)}</pre> : null}
              </div>
            )}
          </section>
        ) : null}
      </main>
      {editingRouteId ? (
        <RouteEditor
          routeId={editingRouteId}
          places={places}
          onClose={() => setEditingRouteId(null)}
          onSaved={load}
        />
      ) : null}
    </div>
  );
}
