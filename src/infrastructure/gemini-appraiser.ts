// Gemini API（generateContent）で写真を鑑定する。JSON スキーマ付きの JSON 出力で受け取る。

import { AppError } from "../application/errors.ts";
import type { AppraiseInput, Appraiser } from "../application/ports.ts";
import { APPRAISAL_SCHEMA, httpError, parseAppraisal, systemPrompt, userPrompt } from "./appraisal-spec.ts";

export const GEMINI_MODEL = "gemini-4-hydrogen";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const SYSTEM = systemPrompt("結果は指定された JSON スキーマに沿った JSON だけで返します。");

/** responseSchema（OpenAPI 形式）は additionalProperties を受け付けないため取り除く */
function withoutAdditionalProperties(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withoutAdditionalProperties);
  if (schema && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema).filter(([k]) => k !== "additionalProperties").map(([k, v]) => [k, withoutAdditionalProperties(v)]),
    );
  }
  return schema;
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; status?: string; details?: { reason?: string }[] };
};

export class GeminiAppraiser implements Appraiser {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #fetch: typeof fetch;

  constructor(apiKey: string, model = GEMINI_MODEL, fetchFn: typeof fetch = (...a) => fetch(...a)) {
    this.#apiKey = apiKey;
    this.#model = model;
    this.#fetch = fetchFn;
  }

  async appraise(input: AppraiseInput) {
    const contents = [
      {
        role: "user",
        parts: [{ text: userPrompt(input) }, { inlineData: { mimeType: input.mediaType, data: input.imageBase64 } }],
      },
    ];
    let res = await this.#post({ contents, schemaField: "responseJsonSchema", schema: APPRAISAL_SCHEMA });
    if (res.status === 400 && /responseJsonSchema|Unknown name|Invalid JSON payload/i.test(res.body.error?.message ?? "")) {
      // 古い形式（OpenAPI のスキーマ）で 1 回だけ再送する
      res = await this.#post({ contents, schemaField: "responseSchema", schema: withoutAdditionalProperties(APPRAISAL_SCHEMA) });
    }
    if (!res.ok) {
      const reason = res.body.error?.details?.find((d) => d.reason)?.reason;
      const status = reason === "API_KEY_INVALID" ? 401 : res.status;
      throw httpError("Gemini", status, res.body.error?.message ?? "");
    }
    const body = res.body;
    if (body.promptFeedback?.blockReason) {
      throw new AppError("APPRAISAL_FAILED", `Gemini が鑑定を断った（${body.promptFeedback.blockReason}）。撮り直すか手入力する`);
    }
    const candidate = body.candidates?.[0];
    if (!candidate || (candidate.finishReason && candidate.finishReason !== "STOP")) {
      throw new AppError("APPRAISAL_FAILED", `Gemini が鑑定結果を返さなかった（${candidate?.finishReason ?? "候補なし"}）。撮り直すか手入力する`);
    }
    const text = (candidate.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return { ai: parseAppraisal(text), source: "gemini" as const };
  }

  async #post(args: { contents: unknown; schemaField: string; schema: unknown }) {
    let res: Response;
    try {
      res = await this.#fetch(`${GEMINI_BASE}/models/${encodeURIComponent(this.#model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.#apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: args.contents,
          generationConfig: { responseMimeType: "application/json", [args.schemaField]: args.schema },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AppError("UNAVAILABLE", "Gemini に接続できない。通信状態を確認する");
    }
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    return { ok: res.ok, status: res.status, body };
  }
}
