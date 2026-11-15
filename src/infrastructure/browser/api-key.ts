// Claude API キーを localStorage に保存する。キーはこの端末のブラウザにだけ残る。

import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../claude-appraiser.ts";

const KEY = "kozai-relay.anthropicApiKey";

export function getApiKey(): string {
  return localStorage.getItem(KEY) ?? "";
}

export function setApiKey(value: string): void {
  const v = value.trim();
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY);
}

export function createBrowserClient(apiKey: string): Anthropic {
  // 利用者自身のキーをその端末から使う前提で、ブラウザからの直接呼び出しを許可する
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 60_000, maxRetries: 1 });
}

/** キーで鑑定に使うモデルの情報を取得できるか確かめる（料金はかからない） */
export async function verifyApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await createBrowserClient(apiKey).models.retrieve(MODEL);
    return { ok: true };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: "キーが無効" };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, message: "このキーではモデルを使えない" };
    if (error instanceof Anthropic.NotFoundError) return { ok: false, message: "モデルが見つからない" };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, message: "通信できない" };
    if (error instanceof Anthropic.APIError) return { ok: false, message: `エラー ${error.status}` };
    return { ok: false, message: (error as Error).message };
  }
}
