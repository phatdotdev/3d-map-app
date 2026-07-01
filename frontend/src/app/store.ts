import { configureStore, createSlice } from "@reduxjs/toolkit";

import { mapEditingReducer } from "../features/map/state/mapEditingSlice";

const appSlice = createSlice({
  name: "app",
  initialState: {},
  reducers: {},
});

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    mapEditing: mapEditingReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
