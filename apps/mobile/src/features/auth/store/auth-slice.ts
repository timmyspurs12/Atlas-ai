import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthSession, SessionUser } from '@atlas/contracts';
import { AtlasApiError } from '@/shared/api/api-client';
import { sessionStorage } from '@/shared/storage';
import * as authService from '../services/auth-service';

export type AuthMode = 'live' | 'demo';

interface AuthState {
  status: 'booting' | 'signedOut' | 'authenticating' | 'signedIn';
  session: AuthSession | null;
  mode: AuthMode;
  error: string | null;
}

const initialState: AuthState = {
  status: 'booting',
  session: null,
  mode: 'live',
  error: null,
};

const demoSession: AuthSession = {
  accessToken: 'demo-access-token',
  refreshToken: 'demo-refresh-token',
  expiresIn: 86_400,
  sessionId: '2ff95a79-ecae-41d6-a6f5-2a2cf5c5829e',
  user: {
    id: 'e1644d8d-86a8-42ef-b91e-4f454adf8a30',
    email: 'maya@demo.atlas',
    phone: null,
    displayName: 'Maya Okafor',
    handle: 'maya',
    avatarUrl: null,
    lastSeenAt: new Date().toISOString(),
    isOnline: true,
    role: 'USER',
    emailVerified: true,
    phoneVerified: false,
  },
};

export const bootstrapSession = createAsyncThunk('auth/bootstrap', async () =>
  sessionStorage.getSession(),
);

export const loginUser = createAsyncThunk(
  'auth/login',
  async (input: { email: string; password: string }, { rejectWithValue }) => {
    try {
      return await authService.login(input);
    } catch (error) {
      return rejectWithValue(
        error instanceof AtlasApiError ? error.message : 'Sign in could not be completed.',
      );
    }
  },
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async (
    input: { email: string; password: string; displayName: string },
    { rejectWithValue },
  ) => {
    try {
      return await authService.register(input);
    } catch (error) {
      return rejectWithValue(
        error instanceof AtlasApiError ? error.message : 'Your account could not be created.',
      );
    }
  },
);

export const socialLoginUser = createAsyncThunk(
  'auth/socialLogin',
  async (
    input: { provider: 'GOOGLE' | 'APPLE'; idToken: string; displayName?: string | null },
    { rejectWithValue },
  ) => {
    try {
      return await authService.socialLogin(input.provider, input.idToken, input.displayName);
    } catch (error) {
      return rejectWithValue(
        error instanceof AtlasApiError ? error.message : 'Social sign in could not be completed.',
      );
    }
  },
);

export const logoutUser = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const state = getState() as { auth: AuthState };
  if (state.auth.mode === 'live') await authService.logout();
  else await sessionStorage.clearSession();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    enterDemo(state) {
      state.session = demoSession;
      state.mode = 'demo';
      state.status = 'signedIn';
      state.error = null;
    },
    clearAuthError(state) {
      state.error = null;
    },
    updateSessionUser(state, action: PayloadAction<Partial<SessionUser>>) {
      if (state.session) state.session.user = { ...state.session.user, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.session = action.payload;
        state.status = action.payload ? 'signedIn' : 'signedOut';
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.status = 'signedOut';
      })
      .addCase(loginUser.pending, (state) => {
        state.status = 'authenticating';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'signedIn';
        state.session = action.payload;
        state.mode = 'live';
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'signedOut';
        state.error = typeof action.payload === 'string' ? action.payload : 'Sign in failed.';
      })
      .addCase(registerUser.pending, (state) => {
        state.status = 'authenticating';
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.status = 'signedIn';
        state.session = action.payload;
        state.mode = 'live';
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = 'signedOut';
        state.error = typeof action.payload === 'string' ? action.payload : 'Registration failed.';
      })
      .addCase(socialLoginUser.pending, (state) => {
        state.status = 'authenticating';
        state.error = null;
      })
      .addCase(socialLoginUser.fulfilled, (state, action) => {
        state.status = 'signedIn';
        state.session = action.payload;
        state.mode = 'live';
      })
      .addCase(socialLoginUser.rejected, (state, action) => {
        state.status = 'signedOut';
        state.error = typeof action.payload === 'string' ? action.payload : 'Social sign in failed.';
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.status = 'signedOut';
        state.session = null;
        state.mode = 'live';
      });
  },
});

export const { enterDemo, clearAuthError, updateSessionUser } = authSlice.actions;
export const authReducer = authSlice.reducer;
