// 寸法推定の精度評価：eval/manifest.json の写真を Claude で鑑定し、実寸との差を表にする。
// 使い方：npm run eval -- [eval/manifest.json]（API キーは .env の ANTHROPIC_API_KEY から読む）
// 画像は長辺 1568px 以下にしておく（scripts/shrink-photos.ps1）。

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { appraisePhoto } from "../src/application/appraise.ts";
import { ClaudeAppraiser } from "../src/infrastructure/claude-appraiser.ts";
import { MemoryStore } from "../src/infrastructure/memory-store.ts";
import { seedData } from "../src/infrastructure/seed.ts";

type Dims = { lengthMm: number; widthMm: number; thicknessMm: number };
type Entry = { file: string; reference: "a4" | "card" | "none"; memo?: string; siteId?: string; material?: string; actual: Dims };

const manifestPath = process.argv[2] ?? "eval/manifest.json";
const dir = path.dirname(manifestPath);
const entries = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Entry[];

const store = new MemoryStore({ ...seedData(), inquiries: [], requests: {} });
const appraiser = new ClaudeAppraiser(new Anthropic({ timeout: 60_000, maxRetries: 1 }));

const MEDIA: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
// AI は長い順に返すので、実寸も長い順に並べて比べる
const sorted = (d: Dims) => [d.lengthMm, d.widthMm, d.thicknessMm].sort((a, b) => b - a);
const pct = (est: number, act: number) => ((est - act) / act) * 100;
const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;

const rows: string[] = [];
const errors: { len: number[]; wid: number[]; thk: number[] } = { len: [], wid: [], thk: [] };
let materialHits = 0;
let materialTotal = 0;

for (const e of entries) {
  const file = path.join(dir, e.file);
  const mediaType = MEDIA[path.extname(file).toLowerCase()];
  if (!mediaType) throw new Error(`対応していない画像形式: ${e.file}`);
  const t0 = Date.now();
  try {
    const result = await appraisePhoto(
      { appraiser, store },
      { imageBase64: fs.readFileSync(file).toString("base64"), mediaType, reference: e.reference, memo: e.memo ?? "", siteId: e.siteId ?? "S-naramachi" },
    );
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const est = sorted(result.ai.dimensions);
    const act = sorted(e.actual);
    const [l, w, t] = [0, 1, 2].map((i) => pct(est[i], act[i]));
    errors.len.push(l);
    errors.wid.push(w);
    errors.thk.push(t);
    let mat = result.ai.materialKey;
    if (e.material) {
      materialTotal++;
      const hit = e.material === result.ai.materialKey;
      if (hit) materialHits++;
      mat = `${result.ai.materialKey}${hit ? " ✓" : `（正: ${e.material}）`}`;
    }
    rows.push(`| ${e.file} | ${e.reference} | ${est.join("×")}（実 ${act.join("×")}） | ${fmt(l)} | ${fmt(w)} | ${fmt(t)} | ${mat} | ${sec}s |`);
    console.error(`${e.file}: ${sec}s  根拠: ${result.ai.dimensionBasis}`);
  } catch (error) {
    rows.push(`| ${e.file} | ${e.reference} | エラー: ${(error as Error).message} | | | | | |`);
  }
}

const mae = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + Math.abs(x), 0) / xs.length).toFixed(1) : "-");
console.log("| 写真 | 基準物 | 推定（実寸）mm | 長さ | 幅 | 厚さ | 材質 | 時間 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
console.log(`\n平均絶対誤差：長さ ${mae(errors.len)}%・幅 ${mae(errors.wid)}%・厚さ ${mae(errors.thk)}%`);
if (materialTotal) console.log(`材質の一致：${materialHits}/${materialTotal}`);
