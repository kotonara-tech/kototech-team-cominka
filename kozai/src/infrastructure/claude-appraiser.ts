// Claude API で写真を鑑定する。結果は strict tool `register_material` の入力として受け取る。

import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../application/errors.ts";
import type { AppraiseInput, Appraiser } from "../application/ports.ts";
import { APPRAISAL_SCHEMA, parseAppraisal, systemPrompt, userPrompt } from "./appraisal-spec.ts";

export const MODEL = "claude-opus-5-5";
const TOOL_NAME = "register_material";

const TOOL: Anthropic.Beta.BetaTool = {
  name: TOOL_NAME,
  description: "写真から読み取った廃材の情報を登録する。必ずこのツールを1回だけ呼ぶ。",
  strict: true,
  input_schema: structuredClone(APPRAISAL_SCHEMA) as unknown as Anthropic.Beta.BetaTool["input_schema"],
};

const SYSTEM = systemPrompt(`結果は必ず ${TOOL_NAME} ツールで返します。`);

/** SDK のエラーを業務の言葉に変換する */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.AuthenticationError) return new AppError("UNAVAILABLE", "API キーが無効。設定画面でキーを確認する");
  if (error instanceof Anthropic.PermissionDeniedError) return new AppError("UNAVAILABLE", "この API キーでは鑑定に使うモデルを利用できない");
  if (error instanceof Anthropic.RateLimitError) return new AppError("UNAVAILABLE", "AI の利用上限に達した。時間をおいて再試行する");
  if (error instanceof Anthropic.APIConnectionError) return new AppError("UNAVAILABLE", "AI に接続できない。通信状態を確認する");
  if (error instanceof Anthropic.APIError) return new AppError("UNAVAILABLE", `AI が一時的に使えない（${error.status ?? "不明"}）`);
  return new AppError("UNAVAILABLE", "AI が一時的に使えない");
}

export class ClaudeAppraiser implements Appraiser {
  readonly #client: Anthropic;
  readonly #model: string;
  constructor(client: Anthropic, model = MODEL) {
    this.#client = client;
    this.#model = model;
  }

  async appraise(input: AppraiseInput) {
    try {
      return await this.#request(input);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async #request(input: AppraiseInput) {
    const userText = userPrompt(input);

    const response = await this.#client.beta.messages.create({
      model: this.#model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new AppError("APPRAISAL_FAILED", "AI が鑑定を断った。撮り直すか手入力する");
    }
    const call = response.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
    if (!call || call.type !== "tool_use") {
      throw new AppError("APPRAISAL_FAILED", "AI が鑑定結果を返さなかった。撮り直すか手入力する");
    }
    return { ai: parseAppraisal(call.input), source: "claude" as const };
  }
}
