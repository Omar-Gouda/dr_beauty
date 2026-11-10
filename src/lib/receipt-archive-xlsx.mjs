import { deflateRawSync } from "node:zlib";

const RECEIPT_COLUMNS = [
  ["Archive record ID", (_receipt, row) => row.archiveId, "text"],
  ["Archive source", (_receipt, row) => row.archiveSource, "text"],
  ["Snapshot version", (_receipt, row) => row.snapshotVersion, "number"],
  ["Internal archive reference", (receipt) => receipt.internal_archive_reference, "text"],
  ["Order number", (receipt) => receipt.order_number, "text"],
  ["Customer name", (receipt) => receipt.customer_name, "text"],
  ["Customer email", (receipt) => receipt.customer_email, "text"],
  ["Customer phone", (receipt) => receipt.customer_phone, "text"],
  ["Additional phone", (receipt) => receipt.additional_phone, "text"],
  ["Order date (UTC)", (receipt) => receipt.created_at, "text"],
  ["Delivery date (UTC)", (receipt) => receipt.delivered_at, "text"],
  ["Archive date (UTC)", (_receipt, row) => row.archivedAt, "text"],
  ["Order status", (receipt) => receipt.order_status, "text"],
  ["Payment method", (receipt) => receipt.payment_method, "text"],
  ["Payment status", (receipt) => receipt.payment_status, "text"],
  ["Promotion code", (receipt) => receipt.promotion_code, "text"],
  ["Currency", (receipt) => receipt.currency, "text"],
  ["Subtotal", (receipt) => receipt.subtotal, "money"],
  ["Promotion discount", (receipt) => receipt.discount_amount, "money"],
  ["Delivery charge", (receipt) => receipt.shipping_fee_amount ?? receipt.shipping_amount, "money"],
  ["Delivery discount", (receipt) => receipt.shipping_discount_amount, "money"],
  ["Gift packaging", (receipt) => receipt.gift_packaging_fee_amount, "money"],
  ["Final order total", (receipt) => receipt.total_amount, "money"],
  ["Governorate", (receipt) => receipt.governorate, "text"],
  ["City", (receipt) => receipt.city, "text"],
  ["Delivery address", (receipt) => receipt.address_line, "text"],
  ["Delivery notes", (receipt) => receipt.delivery_notes, "text"],
  ["Gift order", (receipt) => receipt.is_gift ? "Yes" : "No", "text"],
  ["Gift recipient", (receipt) => receipt.gift_recipient_name, "text"],
  ["Gift recipient phone", (receipt) => receipt.gift_recipient_phone, "text"],
  ["Gift message", (receipt) => receipt.gift_message, "text"],
  ["Shipping carrier", (receipt) => receipt.shipping_carrier, "text"],
  ["Tracking number", (receipt) => receipt.tracking_number, "text"],
  ["Tracking URL", (receipt) => receipt.tracking_url, "text"],
];

const ITEM_COLUMNS = [
  ["Order number", (item, receipt) => receipt.order_number, "text"],
  ["Product name", (item) => item.product_name, "text"],
  ["Product slug snapshot", (item) => item.product_slug, "text"],
  ["Quantity", (item) => item.quantity, "number"],
  ["Unit price", (item) => item.unit_price, "money"],
  ["Historical line total", (item) => item.line_total, "money"],
  ["Promotion discount", (item) => item.promotion_discount_amount, "money"],
  ["Final item total", (item) => formatCents(toCents(item.line_total) - toCents(item.promotion_discount_amount ?? "0")), "money"],
  ["Product ID at order time", (item) => item.product_id, "text"],
];

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function xmlEscape(value) {
  return safeText(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function toCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? "0"));
  if (!match) throw new TypeError("An archived monetary value is invalid.");
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function formatCents(value) {
  const cents = BigInt(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function worksheetXml(rows, columns) {
  const xmlRows = [null, ...rows].map((row, rowIndex) => {
    const cells = columns.map((column, columnIndex) => {
      const value = rowIndex === 0 ? column[0] : column[1](...row);
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (rowIndex > 0 && column[2] !== "text" && value !== null && value !== undefined && value !== "") {
        const numericValue = column[2] === "money" ? String(value) : String(value);
        if (!/^-?\d+(?:\.\d+)?$/.test(numericValue)) throw new TypeError("An archived numeric value is invalid.");
        return `<c r="${reference}" s="${column[2] === "money" ? "1" : "0"}"><v>${numericValue}</v></c>`;
      }
      return `<c r="${reference}" t="inlineStr" s="${rowIndex === 0 ? "2" : "0"}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const finalColumn = columnName(columns.length - 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${finalColumn}${rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${xmlRows}</sheetData></worksheet>`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let current = index;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
  return current >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, source] of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(source, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(header, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBuffer);
    localOffset += header.length + nameBuffer.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function workbookFiles(receipts) {
  const receiptRows = receipts.map((row) => [row.snapshot, row]);
  const itemRows = receipts.flatMap((row) => (Array.isArray(row.snapshot.items) ? row.snapshot.items : []).map((item) => [item, row.snapshot]));
  const maxDataRows = 1_048_575;
  const makeSheets = (prefix, rows, columns) => {
    const chunks = rows.length ? Array.from({ length: Math.ceil(rows.length / maxDataRows) }, (_, index) => rows.slice(index * maxDataRows, (index + 1) * maxDataRows)) : [[]];
    return chunks.map((chunk, index) => ({ name: chunks.length === 1 ? prefix : `${prefix} ${index + 1}`, rows: chunk, columns }));
  };
  const sheets = [...makeSheets("Receipts", receiptRows, RECEIPT_COLUMNS), ...makeSheets("Items", itemRows, ITEM_COLUMNS)];
  if (sheets.length > 255) throw new RangeError("The archive is too large for a single Excel workbook.");
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const sheetNodes = sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNodes}</sheets></workbook>`;
  const sheetRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;EGP &quot;#,##0.00;[Red]-&quot;EGP &quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return [
    ["[Content_Types].xml", contentTypes], ["_rels/.rels", relationships],
    ["xl/workbook.xml", workbook], ["xl/_rels/workbook.xml.rels", workbookRels],
    ["xl/styles.xml", styles],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet.rows, sheet.columns)]),
  ];
}

export function createReceiptArchiveWorkbook(receipts) {
  if (!Array.isArray(receipts)) throw new TypeError("Receipt records must be an array.");
  return makeZip(workbookFiles(receipts));
}

export function getReceiptArchiveWorkbookColumns() {
  return { receipts: RECEIPT_COLUMNS.map(([label]) => label), items: ITEM_COLUMNS.map(([label]) => label) };
}
