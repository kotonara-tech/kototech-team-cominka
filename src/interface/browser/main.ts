// ブラウザ用の組み立て：IndexedDB の保存先・鑑定器・ルーティングをつなぎ、画面に関数として公開する。

import { clearApiKey, getApiKey, setApiKey, verifyApiKey } from "../../infrastructure/browser/api-key.ts";
import { openBrowserStore } from "../../infrastructure/browser/idb.ts";
import { KeyedAppraiser } from "../../infrastructure/browser/keyed-appraiser.ts";
import { handle } from "../routes.ts";

const appraiser = new KeyedAppraiser();
function notice(text: string) {
  const el = document.createElement("div");
  el.className = "notice caution app-notice";
  el.textContent = text;
  document.body.prepend(el);
  return el;
}

const ui: { blocked: HTMLElement | null } = { blocked: null };
const { store, reset } = await openBrowserStore({
  onError(e) {
    console.error(e);
    alert("ブラウザへの保存に失敗した。設定画面からデモデータを初期化すると空きができる。");
  },
  onBlocked() {
    ui.blocked ??= notice("古材リレーを開いている他のタブを閉じると表示される（データの形式を更新中）。");
  },
  onVersionChange() {
    notice("別のタブで新しい版に更新された。このページを再読み込みする。");
  },
});
ui.blocked?.remove();

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
