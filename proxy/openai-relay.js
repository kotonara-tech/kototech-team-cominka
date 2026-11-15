// OpenAI API の中継（Cloudflare Workers 用の例）。
// ブラウザからの事前確認（CORS）に応答し、鑑定に使う 2 つのパスだけを api.openai.com に転送する。
// API キーは利用者のブラウザから Authorization ヘッダーで届き、中継では保存しない。
// 環境変数 ALLOWED_ORIGIN に公開ページのオリジン（例：https://ohru131.github.io）を設定する。

const UPSTREAM = "https://api.openai.com";
const ALLOWED_PATHS = [/^\/v1\/responses$/, /^\/v1\/models\/[\w.\-]+$/];

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") ?? "";
    if (origin !== env.ALLOWED_ORIGIN) return new Response("forbidden origin", { status: 403 });

    const url = new URL(request.url);
    if (!ALLOWED_PATHS.some((p) => p.test(url.pathname))) {
      return new Response("not found", { status: 404, headers: corsHeaders(origin) });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("method not allowed", { status: 405, headers: corsHeaders(origin) });
    }

    const upstream = await fetch(UPSTREAM + url.pathname, {
      method: request.method,
      headers: {
        authorization: request.headers.get("authorization") ?? "",
        "content-type": request.headers.get("content-type") ?? "application/json",
      },
      body: request.method === "POST" ? request.body : undefined,
    });
    const headers = new Headers(corsHeaders(origin));
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
