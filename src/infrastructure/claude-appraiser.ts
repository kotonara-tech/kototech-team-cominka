// Claude API で写真を鑑定する。結果は strict tool `register_material` の入力として受け取る。

import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../application/errors.ts";
import { REFERENCE_NAMES, type AiAppraisal, type AppraiseInput, type Appraiser } from "../application/ports.ts";
import { isCondition, isValidDimensions } from "../domain/estimate.ts";
import { CATEGORIES, CATEGORY_NAMES, isCategory, MATERIAL_KEYS, MATERIALS } from "../domain/materials.ts";

export const MODEL = "claude-opus-5-5";
const TOOL_NAME = "register_material";

const strArray = { type: "array", items: { type: "string" } } as const;

const TOOL: Anthropic.Beta.BetaTool = {
  name: TOOL_NAME,
  description: "写真から読み取った廃材の情報を登録する。必ずこのツールを1回だけ呼ぶ。",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "category", "materialKey", "materialCandidates", "dimensions", "dimensionBasis",
      "condition", "defects", "features", "title", "description", "ideas",
    ],
    properties: {
      category: { type: "string", enum: [...CATEGORIES], description: "種類" },
      materialKey: { type: "string", enum: [...MATERIAL_KEYS], description: "材料表のキー。迷う場合は不明側のキーを選ぶ" },
      materialCandidates: { ...strArray, description: "材質の候補（日本語、可能性の高い順に最大3つ）" },
      dimensions: {
        type: "object",
        additionalProperties: false,
        required: ["lengthMm", "widthMm", "thicknessMm"],
        properties: {
          lengthMm: { type: "number", description: "最も長い辺 mm" },
          widthMm: { type: "number", description: "2番目に長い辺 mm" },
          thicknessMm: { type: "number", description: "最も短い辺 mm" },
        },
      },
      dimensionBasis: { type: "string", description: "寸法をどう推定したか（基準物との比較など）を1文で" },
      condition: { type: "string", enum: ["good", "fair", "poor"], description: "good=良 / fair=経年変化あり / poor=割れ・腐朽・虫食いあり" },
      defects: { ...strArray, description: "欠点（割れ・虫食い・釘穴・腐朽など）" },
      features: { ...strArray, description: "魅力となる特徴（木目・色味・手斧の跡・時代を感じる意匠など）" },
      title: { type: "string", description: "出品タイトル（30文字以内）" },
      description: { type: "string", description: "出品説明文（150〜250文字。DIY・作家向けに、風合いと使い道を具体的に）" },
      ideas: { ...strArray, description: "この材で作れるものの案（3〜5個、具体的に）" },
    },
  },
};

const materialTable = MATERIALS.map((m) => `- ${m.key}: ${m.name}（${CATEGORY_NAMES[m.category]}）`).join("\n");

const SYSTEM = `あなたは古民家の解体現場で出る廃材（古材・建具・瓦・金物など）を査定する専門家です。
写真から、DIY 利用者やアーティストに販売するための出品情報を作ります。

- 寸法は写真内の基準物の大きさと比べて推定します。基準物がない場合は、木目・釘・人の手など一般的な大きさから推定し、dimensionBasis にその旨を書きます。
- 材質は次の材料表のキーから選びます。樹種が確定できない木材は wood_unknown、塗装や防腐処理が見える木材は painted_wood を選びます。
${materialTable}
- スレート・けい酸カルシウム板・ビニル床タイルのように見える成形板は、該当するキーを選びます。石綿の有無は判断しません。
- 重量・価格は書きません（システムが計算します）。
- 結果は必ず ${TOOL_NAME} ツールで返します。`;

function toAppraisal(input: unknown): AiAppraisal {
  const a = input as AiAppraisal;
  if (!isCategory(a.category) || !isCondition(a.condition) || !isValidDimensions(a.dimensions)) {
    throw new AppError("APPRAISAL_FAILED", "鑑定結果の形式が不正");
  }
  return a;
}

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
  constructor(client: Anthropic) {
    this.#client = client;
  }

  async appraise(input: AppraiseInput) {
    try {
      return await this.#request(input);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async #request(input: AppraiseInput) {
    const userText = [
      `写っている基準物：${REFERENCE_NAMES[input.reference]}`,
      `解体現場：${input.site.area}の${input.site.kind}（${input.site.builtYear === null ? "築年不明" : `${input.site.builtYear}年頃建築`}）`,
      input.memo ? `出品者のメモ：${input.memo}` : "",
      "この廃材を鑑定して登録してください。",
    ].filter(Boolean).join("\n");

    const response = await this.#client.beta.messages.create({
      model: MODEL,
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
    return { ai: toAppraisal(call.input), source: "claude" as const };
  }
}
