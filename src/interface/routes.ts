// API のパスをユースケースに対応づける。ネットワークを介さずブラウザ内で呼ぶ。

import { appraisePhoto, catalog, estimateFor } from "../application/appraise.ts";
import { AppError, type ErrorCode } from "../application/errors.ts";
import { createInquiry, createListing, getListing, searchListings } from "../application/listings.ts";
import type { Appraiser, Store } from "../application/ports.ts";

const STATUS: Record<ErrorCode, number> = {
  INVALID_ARGUMENT: 400,
  NOT_FOUND: 404,
  FAILED_PRECONDITION: 409,
  APPRAISAL_FAILED: 422,
  UNAVAILABLE: 503,
};

export type RouteDeps = { store: Store; appraiser: Appraiser; aiMode: () => string };
export type RouteResult = { status: number; body: unknown };

async function route(deps: RouteDeps, method: string, url: URL, body: unknown): Promise<RouteResult> {
  const { store, appraiser } = deps;
  const p = url.pathname;
  if (method === "GET" && p === "/api/catalog") return { status: 200, body: { ...catalog(), aiMode: deps.aiMode() } };
  if (method === "GET" && p === "/api/sites") return { status: 200, body: { sites: store.listSites() } };
  if (method === "POST" && p === "/api/appraisals") return { status: 200, body: await appraisePhoto({ appraiser, store }, body) };
  if (method === "POST" && p === "/api/estimates") return { status: 200, body: estimateFor(store, body) };
  if (method === "GET" && p === "/api/listings") return { status: 200, body: { listings: searchListings(store, url.searchParams) } };
  if (method === "POST" && p === "/api/listings") return { status: 201, body: createListing(store, body) };
  const detail = p.match(/^\/api\/listings\/([\w-]+)$/);
  if (method === "GET" && detail) return { status: 200, body: getListing(store, detail[1]) };
  const inquiry = p.match(/^\/api\/listings\/([\w-]+)\/inquiries$/);
  if (method === "POST" && inquiry) return { status: 201, body: createInquiry(store, inquiry[1], body) };
  throw new AppError("NOT_FOUND", "API がない");
}

export async function handle(deps: RouteDeps, method: string, path: string, body?: unknown): Promise<RouteResult> {
  try {
    return await route(deps, method, new URL(path, "http://local"), body);
  } catch (error) {
    if (error instanceof AppError) return { status: STATUS[error.code], body: { error: { code: error.code, message: error.message } } };
    console.error(error);
    return { status: 503, body: { error: { code: "UNAVAILABLE", message: "アプリ内で問題が起きた" } } };
  }
}
