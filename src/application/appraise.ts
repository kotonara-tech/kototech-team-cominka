// ユースケース：写真の鑑定と、寸法・材質からの見積。

import { evaluate, type EstimateResult } from "../domain/listing.ts";
import { findMaterial, MATERIALS } from "../domain/materials.ts";
import { RECIPES, recipeNeeds } from "../domain/recipes.ts";
import { notFound } from "./errors.ts";
import { REFERENCE_NAMES, type AiAppraisal, type Appraiser, type AppraiserSource, type Store } from "./ports.ts";
import * as v from "./validate.ts";

export type Appraisal = { ai: AiAppraisal; source: AppraiserSource; estimate: EstimateResult };

function siteOf(store: Store, siteId: string) {
  const site = store.getSite(siteId);
  if (!site) throw notFound("解体現場が見つからない");
  return site;
}

export async function appraisePhoto(deps: { appraiser: Appraiser; store: Store }, raw: unknown): Promise<Appraisal> {
  const body = v.asBody(raw);
  const imageBase64 = v.str(body, "imageBase64", v.MAX_IMAGE_BASE64);
  const site = siteOf(deps.store, v.str(body, "siteId", 40));
  const input = {
    imageBase64,
    mediaType: v.mediaType(body),
    reference: v.reference(body),
    memo: v.str(body, "memo", 200, false),
    site,
  };
  const { ai, source } = await deps.appraiser.appraise(input);
  // 材料表にない材質は「その他」として扱う
  const material = findMaterial(ai.materialKey) ?? findMaterial("other")!;
  const normalized: AiAppraisal = { ...ai, materialKey: material.key, category: material.category };
  const estimate = evaluate(material, site, { dimensions: ai.dimensions, condition: ai.condition, asbestosSurvey: "none" });
  return { ai: normalized, source, estimate };
}

export function estimateFor(store: Store, raw: unknown): EstimateResult {
  const body = v.asBody(raw);
  const material = v.material(body);
  const site = siteOf(store, v.str(body, "siteId", 40));
  return evaluate(material, site, {
    dimensions: v.dimensions(body),
    condition: v.condition(body),
    measuredWeightKg: v.optionalPositive(body, "measuredWeightKg"),
    asbestosSurvey: v.survey(body),
  });
}

export function catalog() {
  return {
    materials: MATERIALS.map((m) => ({ key: m.key, name: m.name, category: m.category })),
    recipes: RECIPES.map((r) => ({ key: r.key, name: r.name, needs: recipeNeeds(r) })),
    references: Object.entries(REFERENCE_NAMES).map(([key, name]) => ({ key, name })),
  };
}
