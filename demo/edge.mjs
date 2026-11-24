export function createLeadHandler({ limiter, origin }) {
  return async function handle(request) {
    const url = new URL(request.url);
    const id = request.headers.get("x-test-id");
    const reply = (status, result) => Response.json({ result }, {
      status,
      headers: { "cache-control": "no-store", "x-test-layer": "edge" },
    });

    if (request.method !== "POST" || url.pathname !== "/api/lead") {
      return reply(404, "outside_scope");
    }
    if (!/^[a-z0-9-]{1,24}$/.test(id ?? "")) {
      return reply(400, "invalid_test_id");
    }

    const { success } = await limiter.limit({ key: "local-fixture-client" });
    if (!success) return reply(429, "worker_rate_limited");

    const body = await request.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return reply(400, "invalid_json");
    }
    if (payload?.email !== `${id}@example.test`) {
      return reply(422, "synthetic_fixture_required");
    }

    const upstream = await fetch(new URL("/api/lead", origin), {
      method: "POST",
      body,
      redirect: "manual",
      headers: { "content-type": "application/json", "x-test-id": id },
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return reply(502, "unexpected_origin_redirect");
    }
    const headers = new Headers(upstream.headers);
    headers.set("x-test-layer", "origin");
    return new Response(upstream.body, { status: upstream.status, headers });
  };
}
