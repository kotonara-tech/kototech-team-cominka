// ユースケース：解体現場の追加。

import type { Site } from "../domain/listing.ts";
import { isValidBuiltYear, MIN_BUILT_YEAR } from "../domain/site.ts";
import { invalid } from "./errors.ts";
import type { Store } from "./ports.ts";
import * as v from "./validate.ts";

export function createSite(store: Store, raw: unknown, now = new Date()): Site {
  const body = v.asBody(raw);
  const requestId = v.str(body, "requestId", 80);
  const existing = store.findSiteByRequest(requestId);
  if (existing) return existing;

  const year = body.builtYear ?? null;
  if (year !== null && !isValidBuiltYear(year, now.getFullYear())) {
    throw invalid(`builtYear は ${MIN_BUILT_YEAR}〜${now.getFullYear()} の整数、不明なら null にする`);
  }
  const site: Site = {
    id: `S-${crypto.randomUUID().slice(0, 8)}`,
    name: v.str(body, "name", 40).trim(),
    area: v.str(body, "area", 40).trim(),
    builtYear: year,
    kind: v.str(body, "kind", 20).trim(),
  };
  if (!site.name || !site.area || !site.kind) throw invalid("name・area・kind は空白だけにしない");
  store.saveSite(site, requestId);
  return site;
}
