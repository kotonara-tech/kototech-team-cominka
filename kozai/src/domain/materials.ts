// 材料表：材質ごとの密度・単価・注意事項。種類ごとの値はこの表に集める。

export type Category = "timber" | "fitting" | "metal" | "roof" | "glass" | "board" | "other";

export const CATEGORY_NAMES: Record<Category, string> = {
  timber: "木材",
  fitting: "建具",
  metal: "金物・金属",
  roof: "屋根材",
  glass: "ガラス",
  board: "成形板",
  other: "その他",
};

export type Pricing =
  | { unit: "m3"; yen: number }
  | { unit: "piece"; yen: number }
  | { unit: "kg"; yen: number };

export type Material = {
  key: string;
  name: string;
  category: Category;
  /** かさ密度 kg/m³。建具は外形の直方体あたりの値 */
  densityKgM3: number;
  /** 重量の誤差率（0.15 = ±15%） */
  weightErrorRate: number;
  pricing: Pricing;
  /** 木材として CO2 固定量を計算する */
  isWood: boolean;
  /** 石綿含有のおそれがある建材（2006年9月の全面禁止より前の製品） */
  asbestosRisk: boolean;
  /** 塗装・防腐処理などの取り扱い注意 */
  cautions: string[];
};

const wood = (key: string, name: string, densityKgM3: number, yenPerM3: number): Material => ({
  key,
  name,
  category: "timber",
  densityKgM3,
  weightErrorRate: 0.15,
  pricing: { unit: "m3", yen: yenPerM3 },
  isWood: true,
  asbestosRisk: false,
  cautions: [],
});

export const MATERIALS: readonly Material[] = [
  wood("sugi", "杉", 380, 120_000),
  wood("hinoki", "檜", 410, 180_000),
  wood("matsu", "松（赤松）", 520, 150_000),
  wood("keyaki", "欅", 690, 400_000),
  wood("kuri", "栗", 600, 220_000),
  wood("kiri", "桐", 290, 160_000),
  wood("wood_unknown", "木材（樹種不明）", 450, 100_000),
  {
    ...wood("painted_wood", "塗装・防腐処理された木材", 450, 60_000),
    cautions: ["古い塗料に鉛を含む場合がある。研磨時は防じんマスクを使う", "防腐処理材は燃やさない"],
  },
  {
    key: "shoji",
    name: "障子・格子戸（木製）",
    category: "fitting",
    densityKgM3: 140,
    weightErrorRate: 0.3,
    pricing: { unit: "piece", yen: 4_000 },
    isWood: true,
    asbestosRisk: false,
    cautions: [],
  },
  {
    key: "itado",
    name: "板戸・襖（木製）",
    category: "fitting",
    densityKgM3: 260,
    weightErrorRate: 0.3,
    pricing: { unit: "piece", yen: 6_000 },
    isWood: true,
    asbestosRisk: false,
    cautions: [],
  },
  {
    key: "ranma",
    name: "欄間",
    category: "fitting",
    densityKgM3: 200,
    weightErrorRate: 0.3,
    pricing: { unit: "piece", yen: 15_000 },
    isWood: true,
    asbestosRisk: false,
    cautions: [],
  },
  {
    key: "iron",
    name: "鉄（金物・鋼材）",
    category: "metal",
    densityKgM3: 7_850,
    weightErrorRate: 0.05,
    pricing: { unit: "kg", yen: 300 },
    isWood: false,
    asbestosRisk: false,
    cautions: ["錆・塗膜の剥離に注意"],
  },
  {
    key: "copper",
    name: "銅・真鍮",
    category: "metal",
    densityKgM3: 8_700,
    weightErrorRate: 0.05,
    pricing: { unit: "kg", yen: 1_500 },
    isWood: false,
    asbestosRisk: false,
    cautions: [],
  },
  {
    key: "kawara",
    name: "いぶし瓦（粘土瓦）",
    category: "roof",
    densityKgM3: 2_000,
    weightErrorRate: 0.15,
    pricing: { unit: "piece", yen: 300 },
    isWood: false,
    asbestosRisk: false,
    cautions: [],
  },
  {
    key: "slate_roof",
    name: "化粧スレート（屋根材）",
    category: "roof",
    densityKgM3: 1_800,
    weightErrorRate: 0.15,
    pricing: { unit: "piece", yen: 200 },
    isWood: false,
    asbestosRisk: true,
    cautions: [],
  },
  {
    key: "old_glass",
    name: "古いガラス（型板・ゆらぎ）",
    category: "glass",
    densityKgM3: 2_500,
    weightErrorRate: 0.05,
    pricing: { unit: "piece", yen: 2_500 },
    isWood: false,
    asbestosRisk: false,
    cautions: ["割れ・欠けに注意。運搬時は養生する"],
  },
  {
    key: "corrugated_slate",
    name: "波形スレート",
    category: "board",
    densityKgM3: 1_800,
    weightErrorRate: 0.15,
    pricing: { unit: "piece", yen: 300 },
    isWood: false,
    asbestosRisk: true,
    cautions: [],
  },
  {
    key: "calcium_silicate",
    name: "けい酸カルシウム板",
    category: "board",
    densityKgM3: 900,
    weightErrorRate: 0.15,
    pricing: { unit: "piece", yen: 300 },
    isWood: false,
    asbestosRisk: true,
    cautions: [],
  },
  {
    key: "vinyl_tile",
    name: "ビニル床タイル（Pタイル）",
    category: "board",
    densityKgM3: 2_000,
    weightErrorRate: 0.15,
    pricing: { unit: "piece", yen: 50 },
    isWood: false,
    asbestosRisk: true,
    cautions: [],
  },
  {
    key: "other",
    name: "その他",
    category: "other",
    densityKgM3: 1_000,
    weightErrorRate: 0.3,
    pricing: { unit: "piece", yen: 500 },
    isWood: false,
    asbestosRisk: false,
    cautions: [],
  },
];

export function findMaterial(key: string): Material | undefined {
  return MATERIALS.find((m) => m.key === key);
}

export const MATERIAL_KEYS: readonly string[] = MATERIALS.map((m) => m.key);

export const CATEGORIES = Object.keys(CATEGORY_NAMES) as Category[];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && value in CATEGORY_NAMES;
}
