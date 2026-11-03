import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createAdminOrderDiagnostic } from "./admin-order-status.mjs";

const DIAGNOSTIC_DIRECTORY = ".local-diagnostics";
const DIAGNOSTIC_FILENAME = "admin-order-status.jsonl";

export async function persistAdminOrderDiagnostic(diagnostic) {
  if (process.env.NODE_ENV !== "development") return;

  try {
    const safeDiagnostic = createAdminOrderDiagnostic(
      diagnostic?.operation,
      diagnostic?.code,
      diagnostic?.correlation_id,
    );
    const record = {
      timestamp: new Date().toISOString(),
      ...safeDiagnostic,
    };
    const directory = join(process.cwd(), DIAGNOSTIC_DIRECTORY);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await appendFile(
      join(directory, DIAGNOSTIC_FILENAME),
      `${JSON.stringify(record)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch {
    // Local diagnostics must never change the result of an order action.
  }
}
