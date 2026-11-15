// 鑑定に使う AI の設定（種類・AI ごとのキーとモデル・OpenAI の接続先）を localStorage に保存する。
// キーはこの端末のブラウザにだけ残る。

import Anthropic from "@anthropic-ai/sdk";
import { MODEL as CLAUDE_MODEL } from "../claude-appraiser.ts";
import { GEMINI_BASE, GEMINI_MODEL } from "../gemini-appraiser.ts";
import { CORS_BLOCKED_MESSAGE, normalizeBaseUrl, OPENAI_BASE, OPENAI_MODEL } from "../openai-appraiser.ts";

export type Provider = "claude" | "gemini" | "openai";

export type AiSettings = {
  provider: Provider;
  keys: Record<Provider, string>;
  models: Record<Provider, string>;
  openaiBaseUrl: string;
};

export const PROVIDERS: readonly { key: Provider; name: string; defaultModel: string; models: string[]; consoleUrl: string }[] = [
  { key: "claude", name: "Claude", defaultModel: CLAUDE_MODEL, models: [CLAUDE_MODEL, "claude-sonnet-5-5", "claude-haiku-5-5"], consoleUrl: "https://console.anthropic.com/" },
  { key: "gemini", name: "Gemini", defaultModel: GEMINI_MODEL, models: [GEMINI_MODEL, "gemini-4-carbon", "gemini-3.5-flash-lite"], consoleUrl: "https://aistudio.google.com/" },
  { key: "openai", name: "OpenAI", defaultModel: OPENAI_MODEL, models: [OPENAI_MODEL, "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna"], consoleUrl: "https://platform.openai.com/" },
];

const STORAGE_KEY = "kozai-relay.ai";
const LEGACY_CLAUDE_KEY = "kozai-relay.anthropicApiKey";

const empty = (): Record<Provider, string> => ({ claude: "", gemini: "", openai: "" });

export function isProvider(v: unknown): v is Provider {
  return v === "claude" || v === "gemini" || v === "openai";
}

export function loadSettings(): AiSettings {
  const raw = localStorage.getItem(STORAGE_KEY);
  const saved = raw ? (JSON.parse(raw) as Partial<AiSettings>) : {};
  const settings: AiSettings = {
    provider: isProvider(saved.provider) ? saved.provider : "claude",
    keys: { ...empty(), ...saved.keys },
    models: { ...empty(), ...saved.models },
    openaiBaseUrl: saved.openaiBaseUrl ?? "",
  };
  // 旧形式（Claude のキーだけ）を移す
  const legacy = localStorage.getItem(LEGACY_CLAUDE_KEY);
  if (legacy && !settings.keys.claude) {
    settings.keys.claude = legacy;
    saveSettings(settings);
  }
  if (legacy) localStorage.removeItem(LEGACY_CLAUDE_KEY);
  return settings;
}

export function saveSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function modelOf(settings: AiSettings, provider: Provider): string {
  return settings.models[provider].trim() || PROVIDERS.find((p) => p.key === provider)!.defaultModel;
}

/** 選んだ AI のキーがあればその AI、なければ demo */
export function activeMode(settings: AiSettings): Provider | "demo" {
  return settings.keys[settings.provider].trim() ? settings.provider : "demo";
}

export function createClaudeClient(apiKey: string): Anthropic {
  // 利用者自身のキーをその端末から使う前提で、ブラウザからの直接呼び出しを許可する
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 60_000, maxRetries: 1 });
}

export type VerifyResult = { ok: true; message: string } | { ok: false; message: string };

/** キー・モデル・接続を確かめる。いずれも鑑定は行わず、料金はかからない */
export async function verify(settings: AiSettings, provider: Provider): Promise<VerifyResult> {
  const key = settings.keys[provider].trim();
  const model = modelOf(settings, provider);
  if (!key) return { ok: false, message: "キーが未設定" };
  try {
    if (provider === "claude") return await verifyClaude(key, model);
    if (provider === "gemini") return await verifyGemini(key, model);
    return await verifyOpenAI(key, model, normalizeBaseUrl(settings.openaiBaseUrl || OPENAI_BASE));
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function verifyClaude(key: string, model: string): Promise<VerifyResult> {
  try {
    await createClaudeClient(key).models.retrieve(model);
    return { ok: true, message: `キーは有効。モデル ${model} を使える` };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: "キーが無効" };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, message: "このキーではモデルを使えない" };
    if (error instanceof Anthropic.NotFoundError) return { ok: false, message: `モデル ${model} が見つからない` };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, message: "通信できない" };
    if (error instanceof Anthropic.APIError) return { ok: false, message: `エラー ${error.status}` };
    throw error;
  }
}

async function verifyGemini(key: string, model: string): Promise<VerifyResult> {
  const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}`, { headers: { "x-goog-api-key": key } }).catch(() => null);
  if (!res) return { ok: false, message: "Gemini に接続できない" };
  if (res.ok) return { ok: true, message: `キーは有効。モデル ${model} を使える` };
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; details?: { reason?: string }[] } };
  if (body.error?.details?.some((d) => d.reason === "API_KEY_INVALID") || res.status === 401 || res.status === 403) return { ok: false, message: "キーが無効" };
  if (res.status === 404) return { ok: false, message: `モデル ${model} が見つからない` };
  return { ok: false, message: `エラー ${res.status}：${body.error?.message ?? ""}` };
}

async function verifyOpenAI(key: string, model: string, base: string): Promise<VerifyResult> {
  const auth = { authorization: `Bearer ${key}` };
  const get = await fetch(`${base}/v1/models/${encodeURIComponent(model)}`, { headers: auth }).catch(() => null);
  if (get && (get.status === 401 || get.status === 403)) return { ok: false, message: "キーが無効" };
  if (get && get.status === 404) return { ok: false, message: `モデル ${model} が見つからない` };
  // 鑑定と同じ POST が届くか（空の本文なので 400 が返れば届いている）
  const post = await fetch(`${base}/v1/responses`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: "{}",
  }).catch(() => null);
  if (!post) return { ok: false, message: CORS_BLOCKED_MESSAGE };
  if (post.status === 401 || post.status === 403) return { ok: false, message: "キーが無効" };
  return { ok: true, message: `キーは有効。モデル ${model} を使える` };
}
