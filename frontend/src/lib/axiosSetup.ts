// ============================================================
// axiosSetup.ts — Central Axios config
// All base URLs, headers, interceptors live here
// ============================================================

import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";

// ── Base URL ──────────────────────────────────────────────────
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Create instance ───────────────────────────────────────────
const axiosInstance: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Request interceptor ───────────────────────────────────────
axiosInstance.interceptors.request.use(
  (config) => {
    // attach auth token if present (for Day 6 wallet auth)
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("clauseai_token");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ── Response interceptor ──────────────────────────────────────
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) console.warn("[ClauseAi] Unauthorized");
    if (status === 502) console.warn("[ClauseAi] Backend unreachable");
    return Promise.reject(error);
  },
);

export default axiosInstance;
