import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { persistAdminOrderDiagnostic } from "../src/lib/admin-order-diagnostics.server.mjs";

const diagnostic = {
  operation: "rpc",
  code: "23514",
  correlation_id: "65b8bce3-d483-47b3-b841-7fe18b02f472",
};

async function withTemporaryWorkingDirectory(run) {
  const previousDirectory = process.cwd();
  const previousNodeEnv = process.env.NODE_ENV;
  const directory = await mkdtemp(join(tmpdir(), "dr-beauty-admin-diagnostic-"));

  try {
    process.chdir(directory);
    await run(directory);
  } finally {
    process.chdir(previousDirectory);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await rm(directory, { recursive: true, force: true });
  }
}

test("development diagnostics append only sanitized JSONL fields", async () => {
  await withTemporaryWorkingDirectory(async (directory) => {
    process.env.NODE_ENV = "development";
    const logPath = join(directory, ".local-diagnostics", "admin-order-status.jsonl");

    await persistAdminOrderDiagnostic({
      ...diagnostic,
      rawMessage: "must not be persisted",
      orderId: "must not be persisted",
    });
    await persistAdminOrderDiagnostic(diagnostic);

    const lines = (await readFile(logPath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    for (const line of lines) {
      const record = JSON.parse(line);
      assert.deepEqual(Object.keys(record).sort(), [
        "code", "correlation_id", "event", "operation", "timestamp",
      ]);
      assert.equal(record.event, "admin_order_status_failed");
      assert.equal(record.operation, "rpc");
      assert.equal(record.code, "23514");
      assert.equal(record.correlation_id, diagnostic.correlation_id);
      assert.equal(Number.isNaN(Date.parse(record.timestamp)), false);
      assert.equal(line.includes("must not be persisted"), false);
    }

    await appendFile(logPath, "existing-record\n", "utf8");
    await persistAdminOrderDiagnostic(diagnostic);
    assert.equal((await readFile(logPath, "utf8")).trim().split("\n").length, 4);
    assert.equal((await stat(logPath)).isFile(), true);
  });
});

test("production diagnostics do not create a local file", async () => {
  await withTemporaryWorkingDirectory(async (directory) => {
    process.env.NODE_ENV = "production";
    await persistAdminOrderDiagnostic(diagnostic);
    await assert.rejects(
      stat(join(directory, ".local-diagnostics", "admin-order-status.jsonl")),
      { code: "ENOENT" },
    );
  });
});

test("diagnostic filesystem failures do not reject the order action helper", async () => {
  await withTemporaryWorkingDirectory(async (directory) => {
    process.env.NODE_ENV = "development";
    await appendFile(join(directory, ".local-diagnostics"), "blocks directory creation", "utf8");
    await assert.doesNotReject(persistAdminOrderDiagnostic(diagnostic));
  });
});
