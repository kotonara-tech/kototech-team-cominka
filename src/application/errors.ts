// 業務の言葉のエラー。HTTP 層が API 契約のエラーコードに変換する。

export type ErrorCode = "INVALID_ARGUMENT" | "NOT_FOUND" | "FAILED_PRECONDITION" | "APPRAISAL_FAILED" | "UNAVAILABLE";

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const invalid = (message: string) => new AppError("INVALID_ARGUMENT", message);
export const notFound = (message: string) => new AppError("NOT_FOUND", message);
