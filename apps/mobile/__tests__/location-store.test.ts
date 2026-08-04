import { useLocationStore } from '../src/features/location/store/location-store';

describe('location store', () => {
  afterEach(() => {
    useLocationStore.getState().stopSharing();
  });

  it('keeps sharing off by default and gives every share an expiry', () => {
    expect(useLocationStore.getState().sharingActive).toBe(false);
    useLocationStore.getState().startSharing(60);
    const state = useLocationStore.getState();
    expect(state.sharingActive).toBe(true);
    expect(new Date(state.sharingUntil ?? 0).getTime()).toBeGreaterThan(Date.now());
  });

  it('revokes local sharing state immediately', () => {
    useLocationStore.getState().startSharing(60);
    useLocationStore.getState().stopSharing();
    expect(useLocationStore.getState().sharingActive).toBe(false);
    expect(useLocationStore.getState().sharingUntil).toBeNull();
  });
});
