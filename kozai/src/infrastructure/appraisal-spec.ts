// 3 つの AI（Claude・Gemini・OpenAI）で共有する、鑑定の指示文・出力の JSON スキーマ・出力の検査。

import { AppError } from "../application/errors.ts";
import { REFERENCE_NAMES, type AiAppraisal, type AppraiseInput } from "../application/ports.ts";
import { isCondition, isValidDimensions } from "../domain/estimate.ts";
import { CATEGORIES, CATEGORY_NAMES, isCategory, MATERIAL_KEYS, MATERIALS } from "../domain/materials.ts";

const strArray = (description: string) => ({ type: "array", items: { type: "string" }, description });

/** 出力の JSON スキーマ。全項目必須・追加項目なし（OpenAI の strict と Claude の strict tool の条件を満たす） */
export const APPRAISAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "category", "materialKey", "materialCandidates", "dimensions", "dimensionBasis",
    "condition", "defects", "features", "title", "description", "ideas",
  ],
  properties: {
    category: { type: "string", enum: [...CATEGORIES], description: "種類" },
    materialKey: { type: "string", enum: [...MATERIAL_KEYS], description: "材料表のキー。迷う場合は不明側のキーを選ぶ" },
    materialCandidates: strArray("材質の候補（日本語、可能性の高い順に最大3つ）"),
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
    defects: strArray("欠点（割れ・虫食い・釘穴・腐朽など）"),
    features: strArray("魅力となる特徴（木目・色味・手斧の跡・時代を感じる意匠など）"),
    title: { type: "string", description: "出品タイトル（30文字以内）" },
    description: { type: "string", description: "出品説明文（150〜250文字。DIY・作家向けに、風合いと使い道を具体的に）" },
    ideas: strArray("この材で作れるものの案（3〜5個、具体的に）"),
  },
} as const;

const materialTable = MATERIALS.map((m) => `- ${m.key}: ${m.name}（${CATEGORY_NAMES[m.category]}）`).join("\n");

/** 指示文。outputRule は AI ごとの返し方（ツールで返す・JSON で返す） */
export function systemPrompt(outputRule: string): string {
  return `あなたは古民家の解体現場で出る廃材（古材・建具・瓦・金物など）を査定する専門家です。
写真から、DIY 利用者やアーティストに販売するための出品情報を作ります。

- 寸法は写真内の基準物の大きさと比べて推定します。基準物がない場合は、木目・釘・人の手など一般的な大きさから推定し、dimensionBasis にその旨を書きます。
- 材質は次の材料表のキーから選びます。樹種が確定できない木材は wood_unknown、塗装や防腐処理が見える木材は painted_wood を選びます。
${materialTable}
- スレート・けい酸カルシウム板・ビニル床タイルのように見える成形板は、該当するキーを選びます。石綿の有無は判断しません。
- 重量・価格は書きません（システムが計算します）。
- 文章はすべて日本語で書きます。
- ${outputRule}`;
}

export function userPrompt(input: AppraiseInput): string {
  const year = input.site.builtYear === null ? "築年不明" : `${input.site.builtYear}年頃建築`;
  return [
    `写っている基準物：${REFERENCE_NAMES[input.reference]}`,
    `解体現場：${input.site.area}の${input.site.kind}（${year}）`,
    input.memo ? `出品者のメモ：${input.memo}` : "",
    "この廃材を鑑定して登録してください。",
  ].filter(Boolean).join("\n");
}

const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** AI の出力を検査する。形が合わなければ APPRAISAL_FAILED */
export function parseAppraisal(value: unknown): AiAppraisal {
  const a = (typeof value === "string" ? safeJson(value) : value) as Partial<AiAppraisal> | null;
  const ok =
    a !== null &&
    typeof a === "object" &&
    isCategory(a.category) &&
    typeof a.materialKey === "string" &&
    isCondition(a.condition) &&
    isValidDimensions(a.dimensions) &&
    typeof a.title === "string" &&
    typeof a.description === "string" &&
    typeof a.dimensionBasis === "string" &&
    isStrList(a.materialCandidates) &&
    isStrList(a.defects) &&
    isStrList(a.features) &&
    isStrList(a.ideas);
  if (!ok) throw new AppError("APPRAISAL_FAILED", "鑑定結果の形式が不正。撮り直すか手入力する");
  return a as AiAppraisal;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** HTTP の応答コードを業務のエラーに変換する（Gemini・OpenAI で共通） */
export function httpError(provider: string, status: number, detail: string): AppError {
  if (status === 401 || status === 403) return new AppError("UNAVAILABLE", `${provider} の API キーが無効、または権限がない。設定画面で確認する`);
  if (status === 404) return new AppError("UNAVAILABLE", `${provider} のモデルが見つからない。設定画面でモデルを確認する（${detail}）`);
  if (status === 429) return new AppError("UNAVAILABLE", `${provider} の利用上限に達した。時間をおいて再試行する`);
  return new AppError("UNAVAILABLE", `${provider} が一時的に使えない（${status}: ${detail}）`);
}
