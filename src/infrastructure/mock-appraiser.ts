// デモ用鑑定：API キーがない環境で、メモのキーワードから決まった推定を返す。

import type { AiAppraisal, AppraiseInput, Appraiser } from "../application/ports.ts";

type Preset = { keywords: string[]; ai: AiAppraisal };

const PRESETS: Preset[] = [
  {
    keywords: ["スレート", "波板", "slate"],
    ai: {
      category: "board",
      materialKey: "corrugated_slate",
      materialCandidates: ["波形スレート", "繊維強化セメント板"],
      dimensions: { lengthMm: 1820, widthMm: 720, thicknessMm: 6 },
      dimensionBasis: "A4用紙の短辺との比較で推定",
      condition: "fair",
      defects: ["端部の欠け", "苔の付着"],
      features: ["波形の凹凸", "灰色の風合い"],
      title: "波形スレート板（納屋の外壁）",
      description: "納屋の外壁に使われていた波形スレート板。",
      ideas: ["ガーデンの目隠し"],
    },
  },
  {
    keywords: ["障子", "格子", "建具", "戸"],
    ai: {
      category: "fitting",
      materialKey: "shoji",
      materialCandidates: ["杉", "檜"],
      dimensions: { lengthMm: 1760, widthMm: 880, thicknessMm: 30 },
      dimensionBasis: "A4用紙の長辺との比較で推定",
      condition: "fair",
      defects: ["紙の破れ", "桟の一部に欠け"],
      features: ["細かな組子の意匠", "飴色に焼けた木肌"],
      title: "組子入りの障子戸（大正期の町家）",
      description: "町家の座敷で使われていた障子戸。組子の意匠が残り、木肌は飴色に焼けている。紙を張り替えて間仕切りに、またはガラスやアクリルを入れて店舗の壁面装飾に使える。",
      ideas: ["和モダンな間仕切り", "照明のシェード枠", "店舗の壁面装飾", "ヘッドボード"],
    },
  },
  {
    keywords: ["瓦"],
    ai: {
      category: "roof",
      materialKey: "kawara",
      materialCandidates: ["いぶし瓦"],
      dimensions: { lengthMm: 305, widthMm: 305, thicknessMm: 16 },
      dimensionBasis: "名刺との比較で推定",
      condition: "good",
      defects: ["表面の薄い苔"],
      features: ["銀色のいぶし", "経年の色むら"],
      title: "いぶし瓦（奈良の町家の屋根）",
      description: "町家の屋根から下ろしたいぶし瓦。銀黒の色むらが美しく、割れはない。庭の縁取りや花壇、看板、アート作品の素材に向く。",
      ideas: ["花壇の縁取り", "表札・看板", "モザイクアート", "鍋敷き"],
    },
  },
];

const DEFAULT_PRESET: AiAppraisal = {
  category: "timber",
  materialKey: "matsu",
  materialCandidates: ["松（赤松）", "杉"],
  dimensions: { lengthMm: 2400, widthMm: 180, thicknessMm: 150 },
  dimensionBasis: "A4用紙（297mm）との比較で推定",
  condition: "fair",
  defects: ["ほぞ穴2か所", "表面の細かな割れ"],
  features: ["手斧（ちょうな）の跡", "黒く焼けた古色", "力強い木目"],
  title: "手斧跡の残る松の古梁",
  description: "町家の小屋組に使われていた松の梁。表面に手斧の跡が残り、長年の煙で黒く焼けた古色が出ている。ほぞ穴を活かしてカウンターや店舗の装飾梁に、切り分けてベンチの脚や棚にも使える。",
  ideas: ["カフェのカウンター", "装飾梁", "ベンチ", "飾り棚"],
};

export class MockAppraiser implements Appraiser {
  async appraise(input: AppraiseInput) {
    const memo = input.memo.toLowerCase();
    const preset = PRESETS.find((p) => p.keywords.some((k) => memo.includes(k.toLowerCase())));
    const ai = structuredClone(preset?.ai ?? DEFAULT_PRESET);
    if (input.reference === "none") ai.dimensionBasis = "基準物がないため、一般的な部材の大きさから推定（要確認）";
    // AI の応答時間を模す
    await new Promise((r) => setTimeout(r, 800));
    return { ai, source: "demo" as const };
  }
}
