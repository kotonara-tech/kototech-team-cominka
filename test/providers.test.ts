import assert from "node:assert/strict";
import { test } from "node:test";
import type { AiAppraisal, AppraiseInput } from "../src/application/ports.ts";
import { APPRAISAL_SCHEMA, parseAppraisal } from "../src/infrastructure/appraisal-spec.ts";
import { GeminiAppraiser } from "../src/infrastructure/gemini-appraiser.ts";
import { normalizeBaseUrl, OpenAIAppraiser } from "../src/infrastructure/openai-appraiser.ts";

const input: AppraiseInput = {
  imageBase64: "AAAA",
  mediaType: "image/jpeg",
  reference: "a4",
  memo: "梁",
  site: { id: "s", name: "町家", area: "奈良市", builtYear: null, kind: "町家" },
};

const ai: AiAppraisal = {
  category: "timber", materialKey: "sugi", materialCandidates: ["杉"], dimensions: { lengthMm: 1800, widthMm: 200, thicknessMm: 30 },
  dimensionBasis: "A4", condition: "good", defects: [], features: ["木目"], title: "杉板", description: "説明", ideas: ["棚"],
};

type Call = { url: string; body: any; headers: Record<string, string> };
function fakeFetch(responses: { status: number; body: unknown }[] | Error) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> });
    if (responses instanceof Error) throw responses;
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
  return { fn, calls };
}

test("出力の検査：形が合えば通し、合わなければ APPRAISAL_FAILED", () => {
  assert.deepEqual(parseAppraisal(JSON.stringify(ai)), ai);
  assert.throws(() => parseAppraisal("not json"), { code: "APPRAISAL_FAILED" });
  assert.throws(() => parseAppraisal({ ...ai, dimensions: { lengthMm: 0, widthMm: 1, thicknessMm: 1 } }), { code: "APPRAISAL_FAILED" });
  assert.throws(() => parseAppraisal({ ...ai, ideas: "棚" }), { code: "APPRAISAL_FAILED" });
});

test("スキーマは全項目必須・追加項目なし（OpenAI strict の条件）", () => {
  assert.deepEqual([...APPRAISAL_SCHEMA.required].sort(), Object.keys(APPRAISAL_SCHEMA.properties).sort());
  assert.equal(APPRAISAL_SCHEMA.additionalProperties, false);
  assert.equal(APPRAISAL_SCHEMA.properties.dimensions.additionalProperties, false);
});

test("Gemini：画像・指示・JSON スキーマを送り、候補のテキストを読む", async () => {
  const { fn, calls } = fakeFetch([{ status: 200, body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(ai) }] } }] } }]);
  const r = await new GeminiAppraiser("k", "gemini-x", fn).appraise(input);
  assert.equal(r.source, "gemini");
  assert.equal(r.ai.materialKey, "sugi");
  assert.match(calls[0].url, /\/v1beta\/models\/gemini-x:generateContent$/);
  assert.equal(calls[0].headers["x-goog-api-key"], "k");
  assert.equal(calls[0].body.contents[0].parts[1].inlineData.mimeType, "image/jpeg");
  assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
  assert.ok(calls[0].body.generationConfig.responseJsonSchema);
  assert.match(calls[0].body.contents[0].parts[0].text, /築年不明/);
});

test("Gemini：responseJsonSchema が拒否されたら responseSchema で 1 回だけ再送する", async () => {
  const ok = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(ai) }] } }] };
  const { fn, calls } = fakeFetch([
    { status: 400, body: { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } } },
    { status: 200, body: ok },
  ]);
  await new GeminiAppraiser("k", "m", fn).appraise(input);
  assert.equal(calls.length, 2);
  const schema = calls[1].body.generationConfig.responseSchema;
  assert.ok(schema);
  assert.equal(JSON.stringify(schema).includes("additionalProperties"), false);
});

test("Gemini：無効なキー・拒否・途中停止をエラーに変換する", async () => {
  const invalid = fakeFetch([{ status: 400, body: { error: { message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] } } }]);
  await assert.rejects(new GeminiAppraiser("k", "m", invalid.fn).appraise(input), { code: "UNAVAILABLE", message: /キーが無効/ });
  const blocked = fakeFetch([{ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }]);
  await assert.rejects(new GeminiAppraiser("k", "m", blocked.fn).appraise(input), { code: "APPRAISAL_FAILED" });
  const stopped = fakeFetch([{ status: 200, body: { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] } }]);
  await assert.rejects(new GeminiAppraiser("k", "m", stopped.fn).appraise(input), { code: "APPRAISAL_FAILED" });
});

test("OpenAI：Responses API に strict な JSON スキーマで送り、output_text を読む", async () => {
  const { fn, calls } = fakeFetch([
    { status: 200, body: { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(ai) }] }] } },
  ]);
  const r = await new OpenAIAppraiser("k", "gpt-x", "https://relay.example/v1/", fn).appraise(input);
  assert.equal(r.source, "openai");
  assert.equal(calls[0].url, "https://relay.example/v1/responses");
  assert.equal(calls[0].headers.authorization, "Bearer k");
  assert.equal(calls[0].body.model, "gpt-x");
  assert.equal(calls[0].body.text.format.type, "json_schema");
  assert.equal(calls[0].body.text.format.strict, true);
  assert.match(calls[0].body.input[0].content[1].image_url, /^data:image\/jpeg;base64,AAAA$/);
});

test("OpenAI：拒否・途中停止・無効なキー・接続失敗をエラーに変換する", async () => {
  const refusal = fakeFetch([{ status: 200, body: { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] } }]);
  await assert.rejects(new OpenAIAppraiser("k", "m", "", refusal.fn).appraise(input), { code: "APPRAISAL_FAILED" });
  const incomplete = fakeFetch([{ status: 200, body: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } }]);
  await assert.rejects(new OpenAIAppraiser("k", "m", "", incomplete.fn).appraise(input), { code: "APPRAISAL_FAILED" });
  const invalid = fakeFetch([{ status: 401, body: { error: { message: "Incorrect API key" } } }]);
  await assert.rejects(new OpenAIAppraiser("k", "m", "", invalid.fn).appraise(input), { code: "UNAVAILABLE", message: /キーが無効/ });
  const cors = fakeFetch(new TypeError("Failed to fetch"));
  await assert.rejects(new OpenAIAppraiser("k", "m", "", cors.fn).appraise(input), { code: "UNAVAILABLE", message: /中継/ });
});

test("OpenAI の接続先 URL を正規化する", () => {
  assert.equal(normalizeBaseUrl(""), "https://api.openai.com");
  assert.equal(normalizeBaseUrl("https://relay.example/"), "https://relay.example");
  assert.equal(normalizeBaseUrl("https://relay.example/v1"), "https://relay.example");
});
