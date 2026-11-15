import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryStore } from "../src/infrastructure/memory-store.ts";
import { MockAppraiser } from "../src/infrastructure/mock-appraiser.ts";
import { seedData } from "../src/infrastructure/seed.ts";
import { handle } from "../src/interface/routes.ts";

const persisted: string[] = [];
const store = new MemoryStore({ ...seedData(), inquiries: [], requests: {} }, (c) => persisted.push(c.kind));
const deps = { store, appraiser: new MockAppraiser(), aiMode: () => "demo" };
const call = async (method: string, path: string, body?: unknown) => {
  const r = await handle(deps, method, path, body);
  return { status: r.status, body: r.body as any };
};

// 1×1 の PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("鑑定 → 出品 → 検索 → 問い合わせ", async () => {
  const { body: appraisal } = await call("POST", "/api/appraisals", { imageBase64: PNG, mediaType: "image/png", reference: "a4", siteId: "S-naramachi" });
  assert.equal(appraisal.source, "demo");
  assert.equal(appraisal.ai.materialKey, "matsu");
  assert.equal(appraisal.estimate.hazard.level, "ok");

  const body = {
    requestId: "r1", siteId: "S-naramachi", part: "梁", materialKey: appraisal.ai.materialKey,
    dimensions: appraisal.ai.dimensions, condition: appraisal.ai.condition, title: appraisal.ai.title,
    description: appraisal.ai.description, priceYen: appraisal.estimate.suggestedPriceYen, imageBase64: PNG, mediaType: "image/png",
  };
  const created = await call("POST", "/api/listings", body);
  assert.equal(created.status, 201);
  assert.equal(created.body.provenance, "1920年頃建築・奈良市ならまちの町家の梁");
  assert.equal(created.body.imageUrl, `data:image/png;base64,${PNG}`);

  // 同じ requestId なら同じ出品を返し、保存は 1 回だけ
  assert.equal((await call("POST", "/api/listings", body)).body.id, created.body.id);
  assert.deepEqual(persisted, ["listing"]);

  const found = await call("GET", `/api/listings?q=${encodeURIComponent("ほぞ穴")}`);
  assert.deepEqual(found.body.listings.map((l: { id: string }) => l.id), [created.body.id]);

  const inq = await call("POST", `/api/listings/${created.body.id}/inquiries`, { requestId: "q1", name: "山田", kind: "purchase", message: "購入希望です" });
  assert.equal(inq.status, 201);
  assert.equal((await call("GET", `/api/listings/${created.body.id}`)).body.inquiryCount, 1);
});

test("D7: 石綿のおそれがある建材は 409 で出品できない", async () => {
  const r = await call("POST", "/api/listings", {
    requestId: "r2", siteId: "S-uda", materialKey: "corrugated_slate", dimensions: { lengthMm: 1820, widthMm: 720, thicknessMm: 6 },
    condition: "fair", title: "波板", description: "納屋の外壁", priceYen: 300, imageBase64: PNG, mediaType: "image/png",
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, "FAILED_PRECONDITION");
});

test("入力の誤りは 400、ないものは 404", async () => {
  const bad = await call("POST", "/api/estimates", { siteId: "S-uda", materialKey: "sugi", dimensions: { lengthMm: 0, widthMm: 1, thicknessMm: 1 }, condition: "good" });
  assert.equal(bad.status, 400);
  assert.equal((await call("GET", "/api/listings/L-none")).status, 404);
  assert.equal((await call("GET", "/api/listings?recipe=rocket")).status, 400);
  assert.equal((await call("GET", "/api/unknown")).status, 404);
});

test("catalog は鑑定器のモードを返す", async () => {
  assert.equal((await call("GET", "/api/catalog")).body.aiMode, "demo");
});

test("D16: 解体現場を追加し、その現場で出品できる", async () => {
  const body = { requestId: "s1", name: "高畑町の町家", area: "奈良市高畑町", builtYear: null, kind: "町家" };
  const created = await call("POST", "/api/sites", body);
  assert.equal(created.status, 201);
  assert.equal(created.body.builtYear, null);
  // 同じ requestId なら同じ現場を返す
  assert.equal((await call("POST", "/api/sites", body)).body.id, created.body.id);
  const sites = (await call("GET", "/api/sites")).body.sites;
  assert.equal(sites.filter((s: { name: string }) => s.name === "高畑町の町家").length, 1);

  // 築年不明の現場では、スレートは出品できない
  const slate = await call("POST", "/api/estimates", {
    siteId: created.body.id, materialKey: "corrugated_slate", dimensions: { lengthMm: 1820, widthMm: 720, thicknessMm: 6 }, condition: "fair",
  });
  assert.equal(slate.body.hazard.level, "blocked");

  const listing = await call("POST", "/api/listings", {
    requestId: "r3", siteId: created.body.id, part: "柱", materialKey: "hinoki", dimensions: { lengthMm: 2700, widthMm: 120, thicknessMm: 120 },
    condition: "good", title: "檜の柱", description: "通し柱", priceYen: 5000, imageBase64: PNG, mediaType: "image/png",
  });
  assert.equal(listing.status, 201);
  assert.equal(listing.body.provenance, "築年不明・奈良市高畑町の町家の柱");
});

test("D16: 解体現場の入力の誤りは 400", async () => {
  const base = { name: "蔵", area: "奈良市", kind: "蔵" };
  assert.equal((await call("POST", "/api/sites", { ...base, requestId: "s2", builtYear: 1500 })).status, 400);
  assert.equal((await call("POST", "/api/sites", { ...base, requestId: "s3", builtYear: 3000 })).status, 400);
  assert.equal((await call("POST", "/api/sites", { ...base, requestId: "s4", builtYear: 1950, name: "   " })).status, 400);
  assert.equal((await call("POST", "/api/sites", { requestId: "s5", name: "蔵", builtYear: 1950, kind: "蔵" })).status, 400);
});
