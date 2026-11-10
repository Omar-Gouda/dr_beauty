import { getAdminRequestAccess } from "@/lib/admin";
import { createReceiptArchiveWorkbook } from "@/lib/receipt-archive-xlsx.mjs";

const PAGE_SIZE = 500;
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

function response(message, status) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function rpcCode(error) {
  return typeof error?.code === "string" && SQLSTATE_PATTERN.test(error.code) ? error.code : "XX000";
}

export async function GET(request) {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") {
    return response(access.status === "unauthenticated" ? "Sign in with an authorized admin account." : "Admin access is unavailable.", access.status === "unauthenticated" ? 401 : 403);
  }
  const mode = new URL(request.url).searchParams.get("mode");
  if (!["incremental", "complete"].includes(mode)) return response("Choose a valid archive export mode.", 400);

  const { data: startRows, error: startError } = await access.supabase.rpc("begin_admin_receipt_archive_export", { p_export_mode: mode });
  if (startError) return response("The receipt archive export could not be started.", 503);
  const started = Array.isArray(startRows) ? startRows[0] : startRows;
  if (!started?.export_id) return response("The receipt archive export could not be started.", 503);

  const rows = [];
  let cursor = "0";
  let failureCode = null;
  try {
    while (true) {
      const { data, error } = await access.supabase.rpc("get_admin_receipt_archive_export_page", {
        p_export_id: started.export_id,
        p_after_order_number: cursor,
        p_limit: PAGE_SIZE,
      });
      if (error || !Array.isArray(data)) {
        failureCode = rpcCode(error);
        break;
      }
      if (data.length === 0) break;
      rows.push(...data.map((row) => ({
        archiveId: row.archive_id,
        archiveSource: row.archive_source,
        snapshotVersion: row.snapshot_version,
        snapshot: row.snapshot,
        archivedAt: row.archived_at,
      })));
      const nextCursor = String(data[data.length - 1].original_order_number ?? "");
      if (!/^\d{1,18}$/.test(nextCursor) || BigInt(nextCursor) <= BigInt(cursor)) {
        failureCode = "22000";
        break;
      }
      cursor = nextCursor;
      if (data.length < PAGE_SIZE) break;
      if (rows.length > 2_000_000) {
        failureCode = "54000";
        break;
      }
    }

    if (!failureCode) {
      const workbook = createReceiptArchiveWorkbook(rows);
      const archiveDates = rows.map((row) => row.archivedAt).filter((value) => typeof value === "string").sort();
      const { data: finalized, error: finalizeError } = await access.supabase.rpc("finish_admin_receipt_archive_export", {
        p_export_id: started.export_id,
        p_success: true,
        p_record_count: rows.length,
        p_range_started_at: archiveDates[0] ?? null,
        p_range_ended_at: archiveDates.at(-1) ?? null,
        p_sqlstate: null,
      });
      if (finalizeError || finalized !== true) return response("The export was generated but its audit record could not be completed. No file was returned.", 503);

      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      return new Response(workbook, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="dr-beauty-receipts-${date}.xlsx"`,
          "Content-Length": String(workbook.byteLength),
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch {
    failureCode = "XX000";
  }

  await access.supabase.rpc("finish_admin_receipt_archive_export", {
    p_export_id: started.export_id,
    p_success: false,
    p_record_count: rows.length,
    p_range_started_at: null,
    p_range_ended_at: null,
    p_sqlstate: failureCode ?? "XX000",
  });
  return response("The receipt archive export failed. The attempt was recorded; no customer data was written to application logs.", 503);
}
