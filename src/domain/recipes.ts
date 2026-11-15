// 用途案と「作りたいもの」からの逆引き。

import type { Category } from "./materials.ts";
import type { Dimensions } from "./estimate.ts";

export type Recipe = {
  key: string;
  name: string;
  categories: readonly Category[];
  minLengthMm: number;
  minWidthMm: number;
  minThicknessMm: number;
};

export const RECIPES: readonly Recipe[] = [
  { key: "counter", name: "カウンター", categories: ["timber"], minLengthMm: 1800, minWidthMm: 250, minThicknessMm: 30 },
  { key: "table", name: "テーブル天板", categories: ["timber"], minLengthMm: 1200, minWidthMm: 300, minThicknessMm: 25 },
  { key: "bench", name: "ベンチ", categories: ["timber"], minLengthMm: 1000, minWidthMm: 180, minThicknessMm: 30 },
  { key: "shelf", name: "棚板", categories: ["timber"], minLengthMm: 600, minWidthMm: 150, minThicknessMm: 15 },
  { key: "small", name: "額縁・小物", categories: ["timber", "fitting"], minLengthMm: 0, minWidthMm: 0, minThicknessMm: 0 },
  { key: "partition", name: "間仕切り・壁面装飾", categories: ["fitting", "glass"], minLengthMm: 600, minWidthMm: 300, minThicknessMm: 0 },
  { key: "lamp", name: "照明・オブジェ", categories: ["glass", "metal", "roof", "fitting"], minLengthMm: 0, minWidthMm: 0, minThicknessMm: 0 },
];

export function findRecipe(key: string): Recipe | undefined {
  return RECIPES.find((r) => r.key === key);
}

export function recipeNeeds(recipe: Recipe): string {
  if (recipe.minLengthMm === 0) return "寸法の条件なし";
  const parts = [`長さ${recipe.minLengthMm}mm以上`, `幅${recipe.minWidthMm}mm以上`];
  if (recipe.minThicknessMm > 0) parts.push(`厚さ${recipe.minThicknessMm}mm以上`);
  return parts.join("・");
}

export function fitsRecipe(recipe: Recipe, category: Category, d: Dimensions): boolean {
  return (
    recipe.categories.includes(category) &&
    d.lengthMm >= recipe.minLengthMm &&
    d.widthMm >= recipe.minWidthMm &&
    d.thicknessMm >= recipe.minThicknessMm
  );
}

/** 寸法から作れるものの一覧（条件の厳しいものから並ぶ） */
export function suggestUses(category: Category, d: Dimensions): string[] {
  return RECIPES.filter((r) => fitsRecipe(r, category, d)).map((r) => r.name);
}
