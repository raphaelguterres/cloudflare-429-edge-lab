import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLeadHandler } from "./edge.mjs";

async function serve(handler) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(`http://127.0.0.1${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(500).end();
      console.error(error);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${server.address().port}`, server };
}

function fixtureLimiter(clock) {
  let windowStart = clock.now;
  let requests = 0;
  return {
    async limit() {
      if (clock.now - windowStart >= 10_000) {
        windowStart = clock.now;
        requests = 0;
      }
      requests += 1;
      return { success: requests <= 2 };
    },
  };
}

const scratch = await mkdtemp(join(tmpdir(), "edge-429-"));
const servers = [];
const receipts = [];
let database;

try {
  database = new DatabaseSync(join(scratch, "leads.sqlite3"));
  database.exec("CREATE TABLE leads (id TEXT PRIMARY KEY, email TEXT NOT NULL)");
  const insert = database.prepare("INSERT INTO leads (id, email) VALUES (?, ?)");
  const lookup = database.prepare("SELECT id FROM leads ORDER BY rowid");
  const origin = await serve(async (request) => {
    const id = request.headers.get("x-test-id");
    const { email } = await request.json();
    receipts.push(id);
    insert.run(id, email);
    return Response.json({ result: "fixture_saved" }, { status: 201 });
  });
  servers.push(origin.server);

  const clock = { now: 0 };
  const edge = await serve(createLeadHandler({ limiter: fixtureLimiter(clock), origin: origin.url }));
  servers.push(edge.server);

  const snapshot = () => ({
    api: [...receipts],
    sqlite: lookup.all().map(row => row.id),
  });

  async function observe(id, expectedStatus, expectedLayer, method = "POST", path = "/api/lead") {
    const response = await fetch(new URL(path, edge.url), {
      method,
      headers: { "x-test-id": id, "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify({ email: `${id}@example.test` }) : undefined,
      redirect: "error",
    });
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("x-test-layer"), expectedLayer);
    const { result } = await response.json();
    const { api, sqlite } = snapshot();
    console.log(`${id.padEnd(15)} ${response.status}  ${result}  API=${api.length}  SQLite=${sqlite.length}`);
    return result;
  }

  await observe("lead-1", 201, "origin");
  await observe("lead-2", 201, "origin");
  const before = snapshot();
  assert.deepEqual(before, { api: ["lead-1", "lead-2"], sqlite: ["lead-1", "lead-2"] });
  assert.equal(await observe("lead-blocked", 429, "edge"), "worker_rate_limited");
  assert.deepEqual(snapshot(), before);

  await observe("method-control", 404, "edge", "GET");
  await observe("path-control", 404, "edge", "POST", "/api/control");
  assert.deepEqual(snapshot(), before);

  clock.now += 12_000;
  await observe("lead-recovery", 201, "origin");
  const expected = ["lead-1", "lead-2", "lead-recovery"];
  assert.deepEqual(snapshot(), { api: expected, sqlite: expected });
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  console.log("OK: ID bloqueado ausente da API e do SQLite. Integridade confirmada.");
} finally {
  for (const server of servers) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
  database?.close();
  await rm(scratch, { recursive: true, force: true });
}
