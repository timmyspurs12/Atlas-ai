import { useEffect, useMemo, useState } from 'react';
import { request, type PlaceItem, type RouteDetails } from './api';

interface EditableStop {
  placeId: string;
  platformName: string;
  boardingInstructions: string;
  alightingInstructions: string;
}

interface EditableSegment {
  durationMinMinutes: string;
  durationMaxMinutes: string;
  distanceM: string;
  fareMinNaira: string;
  fareMaxNaira: string;
  roadDescription: string;
}

interface Props {
  routeId: string;
  revisionId?: string;
  places: PlaceItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const emptySegment = (): EditableSegment => ({
  durationMinMinutes: '10',
  durationMaxMinutes: '20',
  distanceM: '',
  fareMinNaira: '',
  fareMaxNaira: '',
  roadDescription: '',
});

export function RouteEditor({ routeId, revisionId, places, onClose, onSaved }: Props) {
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [stops, setStops] = useState<EditableStop[]>([]);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [startMinute, setStartMinute] = useState('360');
  const [endMinute, setEndMinute] = useState('1320');
  const [frequencyMin, setFrequencyMin] = useState('10');
  const [frequencyMax, setFrequencyMax] = useState('30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detailsPath = revisionId
      ? `/transit/editor/revisions/${revisionId}`
      : `/transit/admin/routes/${routeId}`;
    void request<RouteDetails>(detailsPath)
      .then((data) => {
        setRoute(data);
        const initialStops =
          data.stops.length > 0
            ? data.stops.map((stop) => ({
                placeId: stop.placeId,
                platformName: stop.platformName ?? '',
                boardingInstructions: stop.boardingInstructions ?? '',
                alightingInstructions: stop.alightingInstructions ?? '',
              }))
            : [
                {
                  placeId: data.originPlace.id,
                  platformName: '',
                  boardingInstructions: '',
                  alightingInstructions: '',
                },
                {
                  placeId: data.destinationPlace.id,
                  platformName: '',
                  boardingInstructions: '',
                  alightingInstructions: '',
                },
              ];
        setStops(initialStops);
        setSegments(
          Array.from({ length: Math.max(1, initialStops.length - 1) }, (_, index) => {
            const segment = data.segments[index];
            return segment
              ? {
                  durationMinMinutes: String(segment.durationMinMinutes ?? 10),
                  durationMaxMinutes: String(segment.durationMaxMinutes ?? 20),
                  distanceM: segment.distanceM === null ? '' : String(segment.distanceM),
                  fareMinNaira:
                    segment.fareMinKobo === null ? '' : String(segment.fareMinKobo / 100),
                  fareMaxNaira:
                    segment.fareMaxKobo === null ? '' : String(segment.fareMaxKobo / 100),
                  roadDescription: segment.roadDescription ?? '',
                }
              : emptySegment();
          }),
        );
        const firstWindow = data.serviceWindows[0];
        if (firstWindow) {
          setStartMinute(String(firstWindow.startMinute));
          setEndMinute(String(firstWindow.endMinute));
          setFrequencyMin(String(firstWindow.frequencyMinMinutes ?? 10));
          setFrequencyMax(String(firstWindow.frequencyMaxMinutes ?? 30));
        }
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Unable to load route.');
      });
  }, [revisionId, routeId]);

  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);

  const updateStop = (index: number, patch: Partial<EditableStop>): void => {
    setStops((current) =>
      current.map((stop, stopIndex) => (stopIndex === index ? { ...stop, ...patch } : stop)),
    );
  };

  const updateSegment = (index: number, patch: Partial<EditableSegment>): void => {
    setSegments((current) =>
      current.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, ...patch } : segment,
      ),
    );
  };

  const addStop = (): void => {
    if (!route) return;
    setStops((current) => {
      const destination = current.at(-1) ?? {
        placeId: route.destinationPlace.id,
        platformName: '',
        boardingInstructions: '',
        alightingInstructions: '',
      };
      return [
        ...current.slice(0, -1),
        {
          placeId: places[0]?.id ?? route.originPlace.id,
          platformName: '',
          boardingInstructions: '',
          alightingInstructions: '',
        },
        destination,
      ];
    });
    setSegments((current) => [...current, emptySegment()]);
  };

  const removeStop = (index: number): void => {
    if (index === 0 || index === stops.length - 1 || stops.length <= 2) return;
    setStops((current) => current.filter((_, stopIndex) => stopIndex !== index));
    setSegments((current) => current.slice(0, -1));
  };

  const save = async (submitAfterSave = false): Promise<void> => {
    if (!route) return;
    setSaving(true);
    setError(null);
    try {
      const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
      const graphPath = revisionId
        ? `/transit/editor/revisions/${revisionId}/graph`
        : `/transit/admin/routes/${route.id}/graph`;
      await request(graphPath, {
        method: 'POST',
        body: {
          stops: stops.map((stop) => ({
            ...stop,
            pickupAllowed: true,
            dropoffAllowed: true,
          })),
          segments: segments.map((segment, index) => ({
            fromStopOrder: index,
            toStopOrder: index + 1,
            durationMinMinutes: Number(segment.durationMinMinutes),
            durationMaxMinutes: Number(segment.durationMaxMinutes),
            distanceM: segment.distanceM ? Number(segment.distanceM) : undefined,
            fareMinKobo: segment.fareMinNaira
              ? Math.round(Number(segment.fareMinNaira) * 100)
              : undefined,
            fareMaxKobo: segment.fareMaxNaira
              ? Math.round(Number(segment.fareMaxNaira) * 100)
              : undefined,
            roadDescription: segment.roadDescription || undefined,
          })),
          serviceWindows: weekdays.map((day) => ({
            day,
            startMinute: Number(startMinute),
            endMinute: Number(endMinute),
            endsNextDay: false,
            frequencyMinMinutes: Number(frequencyMin),
            frequencyMaxMinutes: Number(frequencyMax),
            isApproximate: true,
          })),
        },
      });
      if (submitAfterSave && revisionId) {
        await request(`/transit/editor/revisions/${revisionId}/submit`, {
          method: 'POST',
        });
      }
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save route graph.');
    } finally {
      setSaving(false);
    }
  };

  if (!route) {
    return (
      <div className="editor-overlay">
        <section className="route-editor">
          <p>{error ?? 'Loading route editor…'}</p>
          <button onClick={onClose}>Close</button>
        </section>
      </div>
    );
  }

  return (
    <div className="editor-overlay" role="dialog" aria-modal="true" aria-label="Route graph editor">
      <section className="route-editor">
        <header className="editor-header">
          <div>
            <p className="eyebrow">
              {revisionId ? `PRIVATE REVISION ${route.revisionVersion ?? ''}` : 'DRAFT ROUTE GRAPH'}
            </p>
            <h2>{route.name}</h2>
            <span>
              {route.code} · {route.mode}
            </span>
          </div>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </header>
        {route.currentRevisionId && !revisionId ? (
          <div className="alert error">
            Published routes are immutable. Create a new draft revision before editing.
          </div>
        ) : null}
        {error ? <div className="alert error">{error}</div> : null}

        <div className="route-canvas">
          {stops.map((stop, index) => (
            <div className="canvas-node" key={`${stop.placeId}-${index}`}>
              <div className="node-dot">{index + 1}</div>
              <strong>{placeById.get(stop.placeId)?.name ?? 'Select place'}</strong>
              {index < stops.length - 1 ? <div className="node-line" /> : null}
            </div>
          ))}
        </div>

        <div className="editor-grid">
          <div className="editor-column">
            <div className="editor-section-title">
              <div>
                <h3>Ordered stops</h3>
                <p>The first and final stops must match the route endpoints.</p>
              </div>
              <button className="secondary" onClick={addStop}>
                Add stop
              </button>
            </div>
            {stops.map((stop, index) => (
              <article className="edit-card" key={`edit-${index}`}>
                <div className="edit-card-title">
                  <span className="step-number">{index + 1}</span>
                  <strong>
                    {index === 0
                      ? 'Origin'
                      : index === stops.length - 1
                        ? 'Destination'
                        : 'Intermediate stop'}
                  </strong>
                  {index > 0 && index < stops.length - 1 ? (
                    <button className="text-danger" onClick={() => removeStop(index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <label>
                  Place
                  <select
                    value={stop.placeId}
                    onChange={(event) => updateStop(index, { placeId: event.target.value })}
                  >
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name} · {place.area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Platform or loading point
                  <input
                    value={stop.platformName}
                    onChange={(event) => updateStop(index, { platformName: event.target.value })}
                    placeholder="Under bridge, gate 2, opposite market…"
                  />
                </label>
                <label>
                  Boarding instruction
                  <textarea
                    rows={2}
                    value={stop.boardingInstructions}
                    onChange={(event) =>
                      updateStop(index, { boardingInstructions: event.target.value })
                    }
                  />
                </label>
                <label>
                  Alighting instruction
                  <textarea
                    rows={2}
                    value={stop.alightingInstructions}
                    onChange={(event) =>
                      updateStop(index, { alightingInstructions: event.target.value })
                    }
                  />
                </label>
              </article>
            ))}
          </div>

          <div className="editor-column">
            <div className="editor-section-title">
              <div>
                <h3>Segments</h3>
                <p>One segment for every consecutive pair of stops.</p>
              </div>
            </div>
            {segments.map((segment, index) => (
              <article className="edit-card" key={`segment-${index}`}>
                <div className="edit-card-title">
                  <span className="step-number teal">{index + 1}</span>
                  <strong>
                    {placeById.get(stops[index]?.placeId ?? '')?.name ?? 'Stop'} →{' '}
                    {placeById.get(stops[index + 1]?.placeId ?? '')?.name ?? 'Stop'}
                  </strong>
                </div>
                <div className="two-columns">
                  <label>
                    Minimum minutes
                    <input
                      type="number"
                      min="1"
                      value={segment.durationMinMinutes}
                      onChange={(event) =>
                        updateSegment(index, { durationMinMinutes: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Maximum minutes
                    <input
                      type="number"
                      min="1"
                      value={segment.durationMaxMinutes}
                      onChange={(event) =>
                        updateSegment(index, { durationMaxMinutes: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="two-columns">
                  <label>
                    Minimum fare (₦)
                    <input
                      type="number"
                      min="0"
                      value={segment.fareMinNaira}
                      onChange={(event) =>
                        updateSegment(index, { fareMinNaira: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Maximum fare (₦)
                    <input
                      type="number"
                      min="0"
                      value={segment.fareMaxNaira}
                      onChange={(event) =>
                        updateSegment(index, { fareMaxNaira: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Distance in metres
                  <input
                    type="number"
                    min="0"
                    value={segment.distanceM}
                    onChange={(event) => updateSegment(index, { distanceM: event.target.value })}
                  />
                </label>
                <label>
                  Road or landmark description
                  <textarea
                    rows={2}
                    value={segment.roadDescription}
                    onChange={(event) =>
                      updateSegment(index, { roadDescription: event.target.value })
                    }
                  />
                </label>
              </article>
            ))}
            <article className="edit-card">
              <h3>Weekday service window</h3>
              <div className="two-columns">
                <label>
                  Start minute after midnight
                  <input
                    type="number"
                    min="0"
                    max="1439"
                    value={startMinute}
                    onChange={(event) => setStartMinute(event.target.value)}
                  />
                </label>
                <label>
                  End minute after midnight
                  <input
                    type="number"
                    min="0"
                    max="1439"
                    value={endMinute}
                    onChange={(event) => setEndMinute(event.target.value)}
                  />
                </label>
              </div>
              <div className="two-columns">
                <label>
                  Minimum frequency
                  <input
                    type="number"
                    min="1"
                    value={frequencyMin}
                    onChange={(event) => setFrequencyMin(event.target.value)}
                  />
                </label>
                <label>
                  Maximum frequency
                  <input
                    type="number"
                    min="1"
                    value={frequencyMax}
                    onChange={(event) => setFrequencyMax(event.target.value)}
                  />
                </label>
              </div>
            </article>
          </div>
        </div>
        <footer className="editor-footer">
          <p>
            {revisionId
              ? 'The currently published route stays live until this revision is approved.'
              : 'Saving keeps the route private. Submit it separately for independent review.'}
          </p>
          <div className="actions">
            <button
              className="secondary"
              disabled={saving || (!revisionId && Boolean(route.currentRevisionId))}
              onClick={() => void save(false)}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            {revisionId ? (
              <button className="primary" disabled={saving} onClick={() => void save(true)}>
                Save and submit
              </button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}
