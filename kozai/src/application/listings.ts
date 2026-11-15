// ユースケース：出品・検索・詳細・問い合わせ。

import { evaluate, matchesQuery, provenance, type Inquiry, type InquiryKind, type Listing, type ListingQuery, type Site } from "../domain/listing.ts";
import { isCategory } from "../domain/materials.ts";
import { findRecipe } from "../domain/recipes.ts";
import { AppError, invalid, notFound } from "./errors.ts";
import type { Store } from "./ports.ts";
import * as v from "./validate.ts";

export type ListingView = Omit<Listing, "siteId"> & { site: Site; provenance: string; inquiryCount: number };

function toView(store: Store, listing: Listing): ListingView {
  const { siteId, ...rest } = listing;
  const site = store.getSite(siteId);
  if (!site) throw notFound("解体現場が見つからない");
  return { ...rest, site, provenance: provenance(site, listing.part), inquiryCount: store.countInquiries(listing.id) };
}

export function createListing(store: Store, raw: unknown, now = new Date()): ListingView {
  const body = v.asBody(raw);
  const requestId = v.str(body, "requestId", 80);
  const existing = store.findListingByRequest(requestId);
  if (existing) return toView(store, existing);

  const material = v.material(body);
  const site = store.getSite(v.str(body, "siteId", 40));
  if (!site) throw notFound("解体現場が見つからない");
  const dimensions = v.dimensions(body);
  const condition = v.condition(body);
  const asbestosSurvey = v.survey(body);
  const estimate = evaluate(material, site, {
    dimensions,
    condition,
    measuredWeightKg: v.optionalPositive(body, "measuredWeightKg"),
    asbestosSurvey,
  });
  if (estimate.hazard.level === "blocked") throw new AppError("FAILED_PRECONDITION", estimate.hazard.reasons.join(" "));

  const priceYen = body.priceYen;
  if (typeof priceYen !== "number" || !Number.isInteger(priceYen) || priceYen < 0) throw invalid("priceYen は 0 以上の整数にする");
  const imageBase64 = v.str(body, "imageBase64", v.MAX_IMAGE_BASE64);
  const id = `L-${crypto.randomUUID().slice(0, 8)}`;
  const listing: Listing = {
    id,
    siteId: site.id,
    part: v.str(body, "part", 20, false),
    materialKey: material.key,
    materialName: material.name,
    category: material.category,
    dimensions,
    condition,
    asbestosSurvey,
    title: v.str(body, "title", 60),
    description: v.str(body, "description", 1000),
    features: v.strList(body, "features"),
    ideas: v.strList(body, "ideas"),
    priceYen,
    imageUrl: store.saveImage(id, imageBase64, v.mediaType(body)),
    estimate,
    createdAt: now.toISOString(),
  };
  store.saveListing(listing, requestId);
  return toView(store, listing);
}

export function searchListings(store: Store, params: URLSearchParams): ListingView[] {
  const query: ListingQuery = {};
  const q = params.get("q");
  if (q) query.q = q.slice(0, 100);
  const category = params.get("category");
  if (category) {
    if (!isCategory(category)) throw invalid("category が不正");
    query.category = category;
  }
  const minLength = params.get("minLength");
  if (minLength) {
    const n = Number(minLength);
    if (!Number.isFinite(n) || n < 0) throw invalid("minLength は 0 以上の数値にする");
    query.minLengthMm = n;
  }
  const recipeKey = params.get("recipe");
  if (recipeKey) {
    const recipe = findRecipe(recipeKey);
    if (!recipe) throw invalid("recipe が不正");
    query.recipe = recipe;
  }
  return store
    .listListings()
    .filter((l) => {
      const site = store.getSite(l.siteId);
      return site !== undefined && matchesQuery(l, site, query);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((l) => toView(store, l));
}

export function getListing(store: Store, id: string): ListingView {
  const listing = store.getListing(id);
  if (!listing) throw notFound("出品が見つからない");
  return toView(store, listing);
}

export function createInquiry(store: Store, listingId: string, raw: unknown, now = new Date()): Inquiry {
  if (!store.getListing(listingId)) throw notFound("出品が見つからない");
  const body = v.asBody(raw);
  const requestId = v.str(body, "requestId", 80);
  const existing = store.findInquiryByRequest(requestId);
  if (existing) return existing;
  const kind = body.kind;
  if (kind !== "purchase" && kind !== "question") throw invalid("kind は purchase / question のいずれか");
  const inquiry: Inquiry = {
    id: `Q-${crypto.randomUUID().slice(0, 8)}`,
    listingId,
    name: v.str(body, "name", 40),
    kind: kind satisfies InquiryKind,
    message: v.str(body, "message", 500),
    createdAt: now.toISOString(),
  };
  store.saveInquiry(inquiry, requestId);
  return inquiry;
}
