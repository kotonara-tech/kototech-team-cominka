// 呼び出しのたびに API キーを読み、キーがあれば Claude、なければデモ用鑑定を使う。

import type { AppraiseInput, Appraiser } from "../../application/ports.ts";
import { ClaudeAppraiser } from "../claude-appraiser.ts";
import { MockAppraiser } from "../mock-appraiser.ts";
import { createBrowserClient, getApiKey } from "./api-key.ts";

export class KeyedAppraiser implements Appraiser {
  readonly #demo = new MockAppraiser();
  #cache: { key: string; appraiser: ClaudeAppraiser } | null = null;

  mode(): "claude" | "demo" {
    return getApiKey() ? "claude" : "demo";
  }

  appraise(input: AppraiseInput) {
    const key = getApiKey();
    if (!key) return this.#demo.appraise(input);
    if (this.#cache?.key !== key) this.#cache = { key, appraiser: new ClaudeAppraiser(createBrowserClient(key)) };
    return this.#cache.appraiser.appraise(input);
  }
}
