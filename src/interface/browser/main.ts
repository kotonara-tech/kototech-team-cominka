// ブラウザ用の組み立て：IndexedDB の保存先・鑑定器・ルーティングをつなぎ、画面に関数として公開する。

import { clearApiKey, getApiKey, setApiKey, verifyApiKey } from "../../infrastructure/browser/api-key.ts";
import { openBrowserStore } from "../../infrastructure/browser/idb.ts";
import { KeyedAppraiser } from "../../infrastructure/browser/keyed-appraiser.ts";
import { handle } from "../routes.ts";

const appraiser = new KeyedAppraiser();
const { store, reset } = await openBrowserStore((e) => {
  console.error(e);
  alert("ブラウザへの保存に失敗した。設定画面からデモデータを初期化すると空きができる。");
});

const deps = { store, appraiser, aiMode: () => appraiser.mode() };

/** API と同じパスで呼ぶ。ステータスが 400 以上なら本文の error を返す */
export function request(method: string, path: string, body?: unknown) {
  return handle(deps, method, path, body);
}

export const settings = {
  getApiKey,
  setApiKey,
  clearApiKey,
  verifyApiKey,
  resetData: reset,
};
