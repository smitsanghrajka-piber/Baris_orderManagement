import { beforeEach, describe, expect, it, vi } from "vitest";
const http = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    create: () => http,
    isAxiosError: (e: any) => e?.isAxiosError === true,
  },
}));
import { can, getSession, request, setSession, type Session } from "./api";
const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  };
};
const session: Session = {
  accessToken: "old-access",
  refreshToken: "old-refresh",
  user: {
    id: "u1",
    kind: "STAFF",
    name: "Test",
    email: "test@example.com",
    roles: [],
    permissions: ["sku.view"],
    mustChangePassword: false,
  },
};
const unauthorized = { isAxiosError: true, response: { status: 401 } };
beforeEach(() => {
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  http.request.mockReset();
  http.post.mockReset();
  setSession(session);
});
describe("authenticated API requests", () => {
  it("sends the bearer token and honours permissions", async () => {
    http.request.mockResolvedValue({ data: { ok: true } });
    await request("/skus");
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { Authorization: "Bearer old-access" },
      }),
    );
    expect(can("sku.view")).toBe(true);
    expect(can("sku.edit")).toBe(false);
  });
  it("refreshes once for concurrent expired requests", async () => {
    let resolve!: (value: any) => void;
    http.post.mockReturnValue(new Promise((r) => (resolve = r)));
    http.request
      .mockRejectedValueOnce(unauthorized)
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValue({ data: [] });
    const first = request("/skus");
    const second = request("/customers");
    await Promise.resolve();
    await Promise.resolve();
    resolve({
      data: {
        ...session,
        accessToken: "new-access",
        refreshToken: "new-refresh",
      },
    });
    await Promise.all([first, second]);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(getSession()?.refreshToken).toBe("new-refresh");
  });
  it("does not sign out when a retried write has a validation conflict", async () => {
    const conflict = { isAxiosError: true, response: { status: 409 } };
    http.request
      .mockRejectedValueOnce(unauthorized)
      .mockRejectedValueOnce(conflict);
    http.post.mockResolvedValue({
      data: { ...session, accessToken: "new-access" },
    });
    await expect(request("/skus/s1", "PATCH", { version: 1 })).rejects.toBe(
      conflict,
    );
    expect(getSession()?.accessToken).toBe("new-access");
  });
  it("clears a revoked session and announces expiration", async () => {
    http.request.mockRejectedValue(unauthorized);
    http.post.mockRejectedValue(new Error("Revoked"));
    await expect(request("/skus")).rejects.toThrow("Revoked");
    expect(getSession()).toBeNull();
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
