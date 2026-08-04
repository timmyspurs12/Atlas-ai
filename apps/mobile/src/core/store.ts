import { configureStore } from '@reduxjs/toolkit';
import { authReducer } from '@/features/auth/store/auth-slice';

export const store = configureStore({
  reducer: { auth: authReducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: { ignoredPaths: ['auth.session'] } }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
