// リクエスト本文の検査。型が合わない値は INVALID_ARGUMENT にする。

import { isCondition, isValidDimensions, type Condition, type Dimensions } from "../domain/estimate.ts";
import { isAsbestosSurvey, type AsbestosSurvey } from "../domain/hazard.ts";
import { findMaterial, type Material } from "../domain/materials.ts";
import { invalid } from "./errors.ts";
import type { MediaType, ReferenceObject } from "./ports.ts";

export type Body = Record<string, unknown>;

export function asBody(value: unknown): Body {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid("本文は JSON オブジェクトにする");
  return value as Body;
}

export function str(body: Body, key: string, max: number, required = true): string {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw invalid(`${key} は必須`);
    return "";
  }
  if (typeof v !== "string") throw invalid(`${key} は文字列にする`);
  if (v.length > max) throw invalid(`${key} は ${max} 文字以内にする`);
  return v;
}

export function strList(body: Body, key: string): string[] {
  const v = body[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) throw invalid(`${key} は文字列の配列にする`);
  return v.slice(0, 10).map((s) => s.slice(0, 100));
}

export function material(body: Body): Material {
  const m = findMaterial(str(body, "materialKey", 40));
  if (!m) throw invalid("materialKey が材料表にない");
  return m;
}

export function dimensions(body: Body): Dimensions {
  const d = body.dimensions;
  if (!isValidDimensions(d)) throw invalid("dimensions の長さ・幅・厚さは 0 より大きい mm の数値にする");
  return { lengthMm: d.lengthMm, widthMm: d.widthMm, thicknessMm: d.thicknessMm };
}

export function condition(body: Body): Condition {
  if (!isCondition(body.condition)) throw invalid("condition は good / fair / poor のいずれか");
  return body.condition;
}

export function survey(body: Body): AsbestosSurvey {
  const v = body.asbestosSurvey ?? "none";
  if (!isAsbestosSurvey(v)) throw invalid("asbestosSurvey は none / not_detected / detected のいずれか");
  return v;
}

export function optionalPositive(body: Body, key: string): number | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw invalid(`${key} は 0 より大きい数値にする`);
  return v;
}

export function mediaType(body: Body): MediaType {
  const v = body.mediaType;
  if (v === "image/jpeg" || v === "image/png" || v === "image/webp") return v;
  throw invalid("mediaType は image/jpeg / image/png / image/webp のいずれか");
}

export function reference(body: Body): ReferenceObject {
  const v = body.reference;
  if (v === "a4" || v === "card" || v === "none") return v;
  throw invalid("reference は a4 / card / none のいずれか");
}

/** 長辺 1568px の JPEG は 1MB 前後。上限は余裕を持たせて 7MB（base64） */
export const MAX_IMAGE_BASE64 = 7_000_000;
