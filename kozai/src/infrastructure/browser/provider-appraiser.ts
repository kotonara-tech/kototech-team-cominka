// 呼び出しのたびに AI の設定を読み、選んだ AI の鑑定器を使う。キーがなければデモ用鑑定。

import type { AppraiseInput, Appraiser } from "../../application/ports.ts";
import { ClaudeAppraiser } from "../claude-appraiser.ts";
import { GeminiAppraiser } from "../gemini-appraiser.ts";
import { MockAppraiser } from "../mock-appraiser.ts";
import { OpenAIAppraiser } from "../openai-appraiser.ts";
import { activeMode, createClaudeClient, loadSettings, modelOf, type AiSettings } from "./ai-settings.ts";

function build(settings: AiSettings): Appraiser {
  const mode = activeMode(settings);
  if (mode === "demo") return new MockAppraiser();
  const key = settings.keys[mode].trim();
  const model = modelOf(settings, mode);
  if (mode === "claude") return new ClaudeAppraiser(createClaudeClient(key), model);
  if (mode === "gemini") return new GeminiAppraiser(key, model);
  return new OpenAIAppraiser(key, model, settings.openaiBaseUrl);
}

export class ProviderAppraiser implements Appraiser {
  #cache: { signature: string; appraiser: Appraiser } | null = null;

  mode() {
    return activeMode(loadSettings());
  }

  appraise(input: AppraiseInput) {
    const settings = loadSettings();
    const signature = JSON.stringify([settings.provider, settings.keys[settings.provider], settings.models, settings.openaiBaseUrl]);
    if (this.#cache?.signature !== signature) this.#cache = { signature, appraiser: build(settings) };
    return this.#cache.appraiser.appraise(input);
  }
}
