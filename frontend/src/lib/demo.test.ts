import { beforeEach, expect, it, vi } from "vitest";
import { demoRequest, resetDemo } from "./demo";
const store = new Map<string, string>();
beforeEach(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
  resetDemo();
});
it("creates, hydrates and approves a specification using the catalogue material", () => {
  const sku = demoRequest("/skus", "POST", {
    customerId: "c1",
    description: "Test label",
  });
  const draft = demoRequest(`/skus/${sku.id}/specifications`, "POST", {
    widthMm: 640,
    heightMm: 170,
    materialId: "m1",
    finishId: "f1",
    colourCount: 0,
  });
  expect(
    demoRequest(`/skus/${sku.id}`, "GET").specifications[0].material.name,
  ).toBe("White BOPP");
  expect(() =>
    demoRequest(`/skus/${sku.id}/specifications`, "POST", {}),
  ).toThrow("already has a draft");
  demoRequest(`/specifications/${draft.id}/approve`, "POST");
  expect(demoRequest(`/skus/${sku.id}`, "GET").status).toBe("ACTIVE");
  expect(
    demoRequest(`/skus/${sku.id}`, "GET").currentSpecification.status,
  ).toBe("APPROVED");
  const next = demoRequest(`/skus/${sku.id}/specifications`, "POST", {
    widthMm: 640,
    heightMm: 170,
    colourCount: 0,
  });
  demoRequest(`/specifications/${next.id}/approve`, "POST");
  expect(demoRequest(`/skus/${sku.id}`, "GET").specifications[1].status).toBe(
    "SUPERSEDED",
  );
});
it("limits the customer demo label library to its tenant", () => {
  expect(
    demoRequest("/portal/skus", "GET").every((r: any) => r.customerId === "c1"),
  ).toBe(true);
  expect(() => demoRequest("/portal/skus/s3", "GET")).toThrow("not found");
});
it("filters and paginates the library", () => {
  const result = demoRequest("/skus?q=ghee&page=1&pageSize=1", "GET");
  expect(result.total).toBe(1);
  expect(result.items[0].id).toBe("s2");
});
