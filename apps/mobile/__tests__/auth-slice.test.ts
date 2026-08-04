import { authReducer, enterDemo } from '../src/features/auth/store/auth-slice';

describe('auth slice', () => {
  it('enters demo mode without granting a real backend token', () => {
    const state = authReducer(undefined, enterDemo());
    expect(state.status).toBe('signedIn');
    expect(state.mode).toBe('demo');
    expect(state.session?.user.displayName).toBe('Maya Okafor');
  });
});
