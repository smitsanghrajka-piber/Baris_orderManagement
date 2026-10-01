import axios from "axios";
import { demoRequest } from "./demo";

export interface Principal {
  id: string;
  name: string;
  email: string;
  kind: "STAFF" | "CUSTOMER";
  permissions: string[];
  roles: string[];
  mustChangePassword: boolean;
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: Principal;
  demo?: boolean;
}
const KEY = "baris.session";
export function getSession(): Session | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
export function setSession(value: Session | null) {
  value
    ? sessionStorage.setItem(KEY, JSON.stringify(value))
    : sessionStorage.removeItem(KEY);
}
export function can(permission: string) {
  const s = getSession();
  return !!s && (s.demo || s.user.permissions.includes(permission));
}
export function isDemo() {
  return !!getSession()?.demo;
}
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error))
    return (
      error.response?.data?.message ||
      "Cannot reach Baris. Check your connection and try again."
    );
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
const http = axios.create({ baseURL: "/api/v1", timeout: 20000 });
let refresh: Promise<Session> | null = null;
export async function request<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const session = getSession();
  if (session?.demo) return demoRequest(path, method, data) as T;
  const send = (token?: string) =>
    http.request<T>({
      url: path,
      method,
      data,
      // Proof uploads can be tens of megabytes; don't cut them off at the default timeout.
      ...(data instanceof FormData ? { timeout: 300000 } : {}),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  try {
    return (await send(session?.accessToken)).data;
  } catch (error) {
    if (
      !axios.isAxiosError(error) ||
      error.response?.status !== 401 ||
      !session ||
      (path.startsWith("/auth/") && path !== "/auth/me")
    )
      throw error;
    let next: Session;
    try {
      if (!refresh)
        refresh = http
          .post<Session>("/auth/refresh", {
            refreshToken: session.refreshToken,
          })
          .then((r) => {
            setSession(r.data);
            return r.data;
          })
          .finally(() => {
            refresh = null;
          });
      next = await refresh;
    } catch (refreshError) {
      setSession(null);
      window.dispatchEvent(new Event("baris:expired"));
      throw refreshError;
    }
    return (await send(next.accessToken)).data;
  }
}
