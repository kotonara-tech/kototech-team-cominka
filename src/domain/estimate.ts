// 見積：寸法と材質から体積・重量・参考価格・CO2 固定量・運搬目安を計算する。

import type { Material } from "./materials.ts";

export type Dimensions = { lengthMm: number; widthMm: number; thicknessMm: number };

export type Condition = "good" | "fair" | "poor";

export const CONDITION_NAMES: Record<Condition, string> = { good: "良", fair: "並（経年変化あり）", poor: "難あり" };

const CONDITION_FACTOR: Record<Condition, number> = { good: 1.0, fair: 0.7, poor: 0.4 };

/** 気乾材の重量に占める乾燥重量の比 */
const DRY_RATIO = 0.85;
/** 木材の乾燥重量に占める炭素の比 */
const CARBON_RATIO = 0.5;
const CO2_PER_C = 44 / 12;
const MIN_PRICE_YEN = 300;

export type Weight = { weightKg: number; weightMinKg: number; weightMaxKg: number; weightSource: "estimated" | "measured" };

export type Estimate = Weight & {
  volumeM3: number;
  suggestedPriceYen: number;
  co2Kg: number | null;
  carry: string;
};

export function isCondition(value: unknown): value is Condition {
  return value === "good" || value === "fair" || value === "poor";
}

export function isValidDimensions(d: unknown): d is Dimensions {
  if (typeof d !== "object" || d === null) return false;
  const { lengthMm, widthMm, thicknessMm } = d as Record<string, unknown>;
  return [lengthMm, widthMm, thicknessMm].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 20_000);
}

export function volumeM3(d: Dimensions): number {
  return (d.lengthMm / 1000) * (d.widthMm / 1000) * (d.thicknessMm / 1000);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function estimateWeight(material: Material, d: Dimensions, measuredKg?: number): Weight {
  if (measuredKg !== undefined && measuredKg > 0) {
    return { weightKg: round1(measuredKg), weightMinKg: round1(measuredKg), weightMaxKg: round1(measuredKg), weightSource: "measured" };
  }
  const kg = volumeM3(d) * material.densityKgM3;
  return {
    weightKg: round1(kg),
    weightMinKg: round1(kg * (1 - material.weightErrorRate)),
    weightMaxKg: round1(kg * (1 + material.weightErrorRate)),
    weightSource: "estimated",
  };
}

export function suggestPrice(material: Material, d: Dimensions, weightKg: number, condition: Condition): number {
  const p = material.pricing;
  const base = p.unit === "m3" ? volumeM3(d) * p.yen : p.unit === "kg" ? weightKg * p.yen : p.yen;
  const yen = Math.round((base * CONDITION_FACTOR[condition]) / 100) * 100;
  return Math.max(MIN_PRICE_YEN, yen);
}

export function co2StoredKg(material: Material, weightKg: number): number | null {
  if (!material.isWood) return null;
  return round1(weightKg * DRY_RATIO * CARBON_RATIO * CO2_PER_C);
}

export function carryGuide(weightKg: number, lengthMm: number): string {
  if (lengthMm > 2000) return "長尺のため軽トラック・2人以上";
  if (weightKg <= 20) return "1人で運べる";
  if (weightKg <= 60) return "2人で運ぶ";
  return "軽トラック・複数人";
}

export function estimate(material: Material, d: Dimensions, condition: Condition, measuredKg?: number): Estimate {
  const weight = estimateWeight(material, d, measuredKg);
  return {
    ...weight,
    volumeM3: Math.round(volumeM3(d) * 1e5) / 1e5,
    suggestedPriceYen: suggestPrice(material, d, weight.weightKg, condition),
    co2Kg: co2StoredKg(material, weight.weightKg),
    carry: carryGuide(weight.weightKg, d.lengthMm),
  };
}
