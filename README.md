# 古材リレー（Kozai Relay）

古民家の解体で出る廃材を、写真 1 枚から出品データにするハッカソン用デモ。
AI（Claude）が写真から種類・材質候補・寸法・状態・説明文・用途案を推定し、重量・参考価格・CO2 固定量・運搬目安・出品可否（石綿含有のおそれ）は材料表から計算する。

**公開ページ：https://ohru131.github.io/haizai/**

- 出品画面（スマホ向け）：`index.html` … 解体現場の選択 → 撮影 → AI 鑑定 → 確認・修正 → 出品
- マーケット画面：`market.html` … 作りたいもの（カウンター・ベンチなど）から逆引き、詳細、購入希望・問い合わせ
- 設定（右上の ⚙）：Claude API キーの登録・確認・削除、デモデータの初期化

## 動作の前提

- サーバーを置かず、ブラウザ内で完結する（[ADR 0002](docs/adr/0002-static-hosting-browser-only.md)）
- 出品・問い合わせはそのブラウザの IndexedDB に保存する。端末をまたいで共有しない
- Claude API キーは利用者が設定画面で入力し、そのブラウザの localStorage に保存する。キーはブラウザから Claude API へ直接送る。共有端末では使い終わったら削除し、キーには Anthropic Console で利用上限を設定する
- キーが未設定ならデモ用の推定で動く

## 開発

Node.js 24 以上。

```bash
npm install
```

```bash
npm run dev
```

http://localhost:8787/ で開く（変更を監視して再ビルドする）。

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

`main` に push すると GitHub Actions（`.github/workflows/pages.yml`）がテスト・型チェック・ビルドを行い、`dist/` を GitHub Pages に配置する。

## 寸法精度の評価

実寸を測った写真で、推定寸法との差を測る。キーは `.env` の `ANTHROPIC_API_KEY` から読む（`.env.example` をコピー）。写真は `eval/`（git の対象外）に置く。

```bash
pwsh scripts/shrink-photos.ps1 eval/raw eval
```

```bash
npm run eval -- eval/manifest.json
```

## AI の使い方

- モデル `claude-opus-5-5`、effort `low`、画像入力 ＋ strict tool `register_material` で構造化結果を受け取る
- 拒否時は別モデルで再実行する `fallbacks: "default"`（beta `server-side-fallback-2026-07-01`）を有効にしている
- 重量・価格・出品可否は AI に出させない（[ADR 0001](docs/adr/0001-ai-estimates-only-observables.md)）

## ドキュメント

[docs/README.md](docs/README.md) に索引。アイデア一覧とデモ台本は [docs/ideas.md](docs/ideas.md)。
