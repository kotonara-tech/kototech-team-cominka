// ポート：application が使う外部機能の型。実装は infrastructure にある。

import type { Condition, Dimensions } from "../domain/estimate.ts";
import type { Inquiry, Listing, Site } from "../domain/listing.ts";
import type { Category } from "../domain/materials.ts";

export type ReferenceObject = "a4" | "card" | "none";

export const REFERENCE_NAMES: Record<ReferenceObject, string> = {
  a4: "A4用紙（297×210mm）",
  card: "名刺（91×55mm）",
  none: "基準物なし",
};

export type MediaType = "image/jpeg" | "image/png" | "image/webp";

export type AppraiseInput = {
  imageBase64: string;
  mediaType: MediaType;
  reference: ReferenceObject;
  memo: string;
  site: Site;
};

/** AI が写真から推定する値（見て分かることだけ） */
export type AiAppraisal = {
  category: Category;
  materialKey: string;
  materialCandidates: string[];
  dimensions: Dimensions;
  dimensionBasis: string;
  condition: Condition;
  defects: string[];
  features: string[];
  title: string;
  description: string;
  ideas: string[];
};

export type AppraiserSource = "claude" | "demo";

export interface Appraiser {
  appraise(input: AppraiseInput): Promise<{ ai: AiAppraisal; source: AppraiserSource }>;
}

export interface Store {
  listSites(): Site[];
  getSite(id: string): Site | undefined;
  findSiteByRequest(requestId: string): Site | undefined;
  saveSite(site: Site, requestId: string): void;
  listListings(): Listing[];
  getListing(id: string): Listing | undefined;
  findListingByRequest(requestId: string): Listing | undefined;
  saveListing(listing: Listing, requestId: string): void;
  saveImage(id: string, imageBase64: string, mediaType: MediaType): string;
  findInquiryByRequest(requestId: string): Inquiry | undefined;
  saveInquiry(inquiry: Inquiry, requestId: string): void;
  countInquiries(listingId: string): number;
}
