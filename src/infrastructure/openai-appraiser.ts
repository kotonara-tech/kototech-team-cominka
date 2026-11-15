// OpenAI API（Responses API）で写真を鑑定する。strict な JSON スキーマ出力で受け取る。
// ブラウザからの直接呼び出しは CORS で拒否されるため、必要なら接続先（baseUrl）に中継を指定する（ADR 0003）。

import { AppError } from "../application/errors.ts";
import type { AppraiseInput, Appraiser } from "../application/ports.ts";
import { APPRAISAL_SCHEMA, httpError, parseAppraisal, systemPrompt, userPrompt } from "./appraisal-spec.ts";

export const OPENAI_MODEL = "gpt-6-astra";
export const OPENAI_BASE = "https://api.openai.com";

const SYSTEM = systemPrompt("結果は指定された JSON スキーマに沿った JSON だけで返します。");

type OutputPart = { type: string; text?: string; refusal?: string };
type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: { type: string; role?: string; content?: OutputPart[] }[];
  error?: { message?: string };
};

export const CORS_BLOCKED_MESSAGE =
  "OpenAI に接続できない。OpenAI はブラウザからの直接呼び出しを受け付けないため、設定画面で中継の URL を指定する（docs/openai-relay.md）";

export function normalizeBaseUrl(url: string): string {
  return (url.trim() || OPENAI_BASE).replace(/\/+$/, "").replace(/\/v1$/, "");
}

export class OpenAIAppraiser implements Appraiser {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(apiKey: string, model = OPENAI_MODEL, baseUrl = OPENAI_BASE, fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.#apiKey = apiKey;
    this.#model = model;
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#fetch = fetchFn;
  }

  async appraise(input: AppraiseInput) {
    let res: Response;
    try {
      res = await this.#fetch(`${this.#baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.#apiKey}` },
        body: JSON.stringify({
          model: this.#model,
          instructions: SYSTEM,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: userPrompt(input) },
                { type: "input_image", image_url: `data:${input.mediaType};base64,${input.imageBase64}` },
              ],
            },
          ],
          text: { format: { type: "json_schema", name: "register_material", strict: true, schema: APPRAISAL_SCHEMA } },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AppError("UNAVAILABLE", CORS_BLOCKED_MESSAGE);
    }
    const body = (await res.json().catch(() => ({}))) as OpenAIResponse;
    if (!res.ok) throw httpError("OpenAI", res.status, body.error?.message ?? "");

    const parts = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
    const refusal = parts.find((p) => p.type === "refusal");
    if (refusal) throw new AppError("APPRAISAL_FAILED", "OpenAI が鑑定を断った。撮り直すか手入力する");
    if (body.status === "incomplete") {
      throw new AppError("APPRAISAL_FAILED", `OpenAI の出力が途中で止まった（${body.incomplete_details?.reason ?? "不明"}）`);
    }
    const text = body.output_text ?? parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
    return { ai: parseAppraisal(text), source: "openai" as const };
  }
}
