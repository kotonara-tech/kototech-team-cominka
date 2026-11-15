# ADR 0003：鑑定に Claude・Gemini・OpenAI を選べるようにする

- 状態：採用
- 日付：2026-11-15

## 背景

利用者が持っている API キーの種類に合わせて、鑑定に使う AI を選べるようにする。
アプリはブラウザ内で完結し（ADR 0002）、AI の API をブラウザから直接呼ぶ。

2026-11-15 に公開ページ（ohru131.github.io）から無効なキーで試した結果：

| AI | ブラウザからの直接呼び出し | 無効なキーの応答 |
|---|---|---|
| Claude（api.anthropic.com） | できる（SDK の `dangerouslyAllowBrowser`） | 401 |
| Gemini（generativelanguage.googleapis.com、`x-goog-api-key` ヘッダー） | できる | 400（`API_KEY_INVALID`） |
| OpenAI（api.openai.com） | GET はできる。キー付きの POST はブラウザの事前確認（CORS）で拒否される | 401（GET） |

## 決定

- 鑑定器のポート（`Appraiser`）はそのままにし、AI ごとに実装を分ける（`claude-appraiser`・`gemini-appraiser`・`openai-appraiser`）
- 指示文・出力の JSON スキーマ・出力の検査は `appraisal-spec.ts` に 1 つだけ置き、3 つの実装で共有する
- 設定画面で AI の種類・キー・モデルを選ぶ。キーは AI ごとに localStorage に保存する。選んだ AI のキーがなければデモ用鑑定を使う
- 既定のモデル：Claude `claude-opus-5-5`、Gemini `gemini-4-hydrogen`、OpenAI `gpt-6-astra`。設定画面で変更できる
- Gemini と OpenAI は SDK を使わず `fetch` で REST API を呼ぶ（バンドルを大きくしない）
- OpenAI は接続先 URL を設定できるようにする。既定は `https://api.openai.com`。直接呼べない場合は、利用者が用意した中継（例：`proxy/openai-relay.js` を Cloudflare Workers に配置）を指定する
- Gemini の構造化出力は `generationConfig.responseJsonSchema` を使う。受け付けられない場合は `responseSchema`（`additionalProperties` を除く）で 1 回だけ再送する

## 理由

- 出力の形と検査を共有するので、どの AI でも重量・価格・出品可否の計算（ADR 0001）は同じ入力で動く
- 公開サイトに運営側のキーやサーバーを置かない方針（ADR 0002）を保てる

## 影響

- OpenAI は中継を用意しない限り公開ページから使えない。設定画面の確認で「直接接続できない」と表示する
- AI ごとに寸法の推定精度が異なる。`npm run eval` は `AI_PROVIDER` で AI を切り替えて比較できる
- モデル ID は各社の更新で変わる。既定値が使えなくなったら設定画面でモデルを変える
