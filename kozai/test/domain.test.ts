import assert from "node:assert/strict";
import { test } from "node:test";
import { carryGuide, co2StoredKg, estimate, estimateWeight, suggestPrice, volumeM3 } from "../src/domain/estimate.ts";
import { judgeHazard } from "../src/domain/hazard.ts";
import { evaluate, matchesQuery, provenance, type Site } from "../src/domain/listing.ts";
import { findMaterial } from "../src/domain/materials.ts";
import { findRecipe, fitsRecipe, suggestUses } from "../src/domain/recipes.ts";
import { isValidBuiltYear } from "../src/domain/site.ts";
import { seedData } from "../src/infrastructure/seed.ts";

const m = (key: string) => findMaterial(key)!;
const beam = { lengthMm: 2400, widthMm: 180, thicknessMm: 150 };
const oldSite: Site = { id: "s", name: "町家", area: "奈良市ならまち", builtYear: 1920, kind: "町家" };
const newSite: Site = { ...oldSite, builtYear: 2010 };

test("D4: 体積と重量範囲は密度と誤差率から求める", () => {
  assert.equal(volumeM3(beam), 0.0648);
  const w = estimateWeight(m("sugi"), beam);
  assert.equal(w.weightKg, 24.6); // 0.0648 × 380
  assert.equal(w.weightMinKg, 20.9);
  assert.equal(w.weightMaxKg, 28.3);
  assert.equal(w.weightSource, "estimated");
});

test("D4: 実測値があれば実測値を使う", () => {
  const w = estimateWeight(m("sugi"), beam, 31.25);
  assert.deepEqual(w, { weightKg: 31.3, weightMinKg: 31.3, weightMaxKg: 31.3, weightSource: "measured" });
});

test("D5: 参考価格は単価×状態係数を100円単位に丸め、下限300円", () => {
  assert.equal(suggestPrice(m("sugi"), beam, 24.6, "good"), 7800); // 0.0648 × 120000 = 7776
  assert.equal(suggestPrice(m("sugi"), beam, 24.6, "fair"), 5400); // 5443 → 5400
  assert.equal(suggestPrice(m("iron"), beam, 2, "good"), 600); // 2kg × 300
  assert.equal(suggestPrice(m("vinyl_tile"), beam, 1, "poor"), 300); // 下限
});

test("D12: CO2 固定量は木材だけ計算する", () => {
  assert.equal(co2StoredKg(m("sugi"), 24.6), 38.3); // 24.6 × 0.85 × 0.5 × 44/12
  assert.equal(co2StoredKg(m("iron"), 24.6), null);
});

test("D13: 運搬目安は長さと重量で決まる", () => {
  assert.equal(carryGuide(10, 900), "1人で運べる");
  assert.equal(carryGuide(40, 1800), "2人で運ぶ");
  assert.equal(carryGuide(80, 1800), "軽トラック・複数人");
  assert.equal(carryGuide(10, 3600), "長尺のため軽トラック・2人以上");
});

test("D7: 2006年以前のスレートは未調査なら出品できない", () => {
  assert.equal(judgeHazard(m("corrugated_slate"), 1970, "none").level, "blocked");
  assert.equal(judgeHazard(m("corrugated_slate"), 1970, "detected").level, "blocked");
  assert.equal(judgeHazard(m("corrugated_slate"), 1970, "not_detected").level, "caution");
  assert.equal(judgeHazard(m("corrugated_slate"), 2010, "none").level, "ok");
});

test("D7: 塗装材は注意付きで出品できる。無垢材は問題なし", () => {
  assert.equal(judgeHazard(m("painted_wood"), 1920, "none").level, "caution");
  assert.equal(judgeHazard(m("keyaki"), 1920, "none").level, "ok");
});

test("D10: レシピの必要寸法と照合する", () => {
  const counter = findRecipe("counter")!;
  assert.equal(fitsRecipe(counter, "timber", { lengthMm: 1950, widthMm: 360, thicknessMm: 45 }), true);
  assert.equal(fitsRecipe(counter, "timber", { lengthMm: 1820, widthMm: 200, thicknessMm: 45 }), false);
  assert.equal(fitsRecipe(counter, "fitting", { lengthMm: 1950, widthMm: 360, thicknessMm: 45 }), false);
  assert.deepEqual(suggestUses("timber", beam), ["ベンチ", "棚板", "額縁・小物"]);
});

test("D9: キーワード・長さ・種類で絞り込む", () => {
  const { listings, sites } = seedData(0);
  const siteOf = (id: string) => sites.find((s) => s.id === id)!;
  const hits = (q: Parameters<typeof matchesQuery>[2]) => listings.filter((l) => matchesQuery(l, siteOf(l.siteId), q)).map((l) => l.id);
  assert.deepEqual(hits({ q: "欅" }), ["L-seed3"]);
  assert.deepEqual(hits({ q: "今井町" }), ["L-seed3", "L-seed7"]);
  assert.deepEqual(hits({ recipe: findRecipe("counter") }), ["L-seed2", "L-seed3"]);
  assert.ok(hits({ minLengthMm: 3000 }).includes("L-seed1"));
  assert.deepEqual(hits({ category: "glass" }), ["L-seed5"]);
});

test("D8: 来歴の一文", () => {
  assert.equal(provenance(oldSite, "梁"), "1920年頃建築・奈良市ならまちの町家の梁");
});

test("evaluate は見積・用途・出品可否をまとめる", () => {
  const r = evaluate(m("calcium_silicate"), newSite, { dimensions: beam, condition: "good", asbestosSurvey: "none" });
  assert.equal(r.hazard.level, "ok");
  assert.deepEqual(r, { ...estimate(m("calcium_silicate"), beam, "good"), uses: [], hazard: r.hazard });
});

test("D16: 築年不明の現場は 2006 年以前として判定し、来歴に築年不明と書く", () => {
  assert.equal(judgeHazard(m("corrugated_slate"), null, "none").level, "blocked");
  assert.match(judgeHazard(m("corrugated_slate"), null, "none").reasons[0], /築年不明/);
  assert.equal(judgeHazard(m("sugi"), null, "none").level, "ok");
  assert.equal(provenance({ ...oldSite, builtYear: null }, "梁"), "築年不明・奈良市ならまちの町家の梁");
});

test("D16: 築年は 1600 年〜今年の整数", () => {
  assert.equal(isValidBuiltYear(1600, 2026), true);
  assert.equal(isValidBuiltYear(2026, 2026), true);
  assert.equal(isValidBuiltYear(1599, 2026), false);
  assert.equal(isValidBuiltYear(2027, 2026), false);
  assert.equal(isValidBuiltYear(1925.5, 2026), false);
  assert.equal(isValidBuiltYear("1925", 2026), false);
});
