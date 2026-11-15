# OpenAI 用の中継の設置

OpenAI API は、ブラウザから API キー付きで POST すると事前確認（CORS）で拒否する（2026-11-15 に確認）。
GitHub Pages の公開ページから OpenAI で鑑定するには、CORS に応答する中継を置き、設定画面の「接続先 URL」に指定する。
Claude と Gemini は中継なしで使える（[ADR 0003](adr/0003-multiple-ai-providers.md)）。

## 中継の仕様

- 転送するのは `POST /v1/responses`（鑑定）と `GET /v1/models/{model}`（キーの確認）だけ
- 環境変数 `ALLOWED_ORIGIN` と一致するオリジンからの要求だけを受け付ける
- API キーは利用者のブラウザから `Authorization` ヘッダーで届き、中継では保存しない
- 実装の例：[proxy/openai-relay.js](../proxy/openai-relay.js)（Cloudflare Workers 用）

## Cloudflare Workers への設置

1. Cloudflare のダッシュボードで Workers を作り、`proxy/openai-relay.js` の内容を貼り付けて配置する
2. Worker の設定で環境変数 `ALLOWED_ORIGIN` に `https://ohru131.github.io` を設定する（末尾の `/` は付けない）
3. Worker の URL（例：`https://kozai-openai-relay.<アカウント>.workers.dev`）を控える

## 古材リレーでの設定

1. 右上の ⚙ を開き、「OpenAI」を選ぶ
2. OpenAI の API キーと、接続先 URL に Worker の URL を入れる
3. 「保存して確認」で「キーは有効」と表示されれば使える

## 注意事項

- 中継の URL を知っていても、許可したオリジン以外のページからは使えない。ただしオリジンのヘッダーはブラウザ以外から偽装できるため、中継の URL は公開しない
- 中継を通る通信には API キーと写真が含まれる。自分で管理するアカウントに設置する
