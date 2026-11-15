// 出品・解体現場・問い合わせの型と、見積の組み立て・検索条件の照合。

import { estimate, type Condition, type Dimensions, type Estimate } from "./estimate.ts";
import { judgeHazard, type AsbestosSurvey, type Hazard } from "./hazard.ts";
import type { Category, Material } from "./materials.ts";
import { fitsRecipe, suggestUses, type Recipe } from "./recipes.ts";

/** builtYear は建築年。不明なら null */
export type Site = { id: string; name: string; area: string; builtYear: number | null; kind: string };

export type EstimateResult = Estimate & { uses: string[]; hazard: Hazard };

export type Listing = {
  id: string;
  siteId: string;
  part: string;
  materialKey: string;
  materialName: string;
  category: Category;
  dimensions: Dimensions;
  condition: Condition;
  asbestosSurvey: AsbestosSurvey;
  title: string;
  description: string;
  features: string[];
  ideas: string[];
  priceYen: number;
  imageUrl: string;
  estimate: EstimateResult;
  createdAt: string;
};

export type InquiryKind = "purchase" | "question";

export type Inquiry = { id: string; listingId: string; name: string; kind: InquiryKind; message: string; createdAt: string };

export type EvaluateInput = {
  dimensions: Dimensions;
  condition: Condition;
  measuredWeightKg?: number;
  asbestosSurvey: AsbestosSurvey;
};

export function evaluate(material: Material, site: Site, input: EvaluateInput): EstimateResult {
  return {
    ...estimate(material, input.dimensions, input.condition, input.measuredWeightKg),
    uses: suggestUses(material.category, input.dimensions),
    hazard: judgeHazard(material, site.builtYear, input.asbestosSurvey),
  };
}

export type ListingQuery = { q?: string; category?: Category; minLengthMm?: number; recipe?: Recipe };

export function matchesQuery(listing: Listing, site: Site, query: ListingQuery): boolean {
  if (query.category && listing.category !== query.category) return false;
  if (query.minLengthMm && listing.dimensions.lengthMm < query.minLengthMm) return false;
  if (query.recipe && !fitsRecipe(query.recipe, listing.category, listing.dimensions)) return false;
  if (query.q) {
    const text = [listing.title, listing.description, listing.materialName, listing.part, site.name, site.area, ...listing.features]
      .join(" ")
      .toLowerCase();
    const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => text.includes(w))) return false;
  }
  return true;
}

/** 来歴の一文：「1920年頃建築・奈良市ならまちの町家の梁」 */
export function provenance(site: Site, part: string): string {
  const where = `${site.area}の${site.kind}`;
  const year = site.builtYear === null ? "築年不明" : `${site.builtYear}年頃建築`;
  return `${year}・${where}${part ? `の${part}` : ""}`;
}
