"use client";
import { translate, type Language } from "@/app/lib/translations";

export type DeliveryOrder = {
  language?: Language; depot?:string;
  booking: string; customer: string; groupNo: string; customs: string; terminal: string;
  carrier: string; vessel: string; destination: string; commodity: string; gateOpen: string; cutoff: string; eta: string;
  ticket: string; billOfLading: string; haulier: string;
  rows: Array<{ container: string; size: string; factory: string; deliveryTime: string; gateIn: string; truckType: string; rot: string; remark: string }>;
};

const columns = [
  ["序号", 54], ["柜号", 160], ["柜型", 90], ["工厂地址", 275], ["送柜时间", 180],
  ["进港时间", 180], ["卡车类型", 135], ["ROT", 155], ["备注", 230],
] as const;
const encoder = new TextEncoder();
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const ascii = (value: string) => encoder.encode(value);
const safeName = (value: string) => value.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 55) || "未填写";
const fileName = (order: DeliveryOrder) => [order.language === "en" ? "Delivery Order" : "送柜单", order.booking, order.ticket, order.haulier].map(safeName).join("_");
const valuesFor = (row: DeliveryOrder["rows"][number], index: number) =>
  [String(index + 1), row.container, row.size, row.factory, row.deliveryTime, row.gateIn, row.truckType, row.rot, row.remark];

function download(bytes: Uint8Array, name: string, mime: string) {
  const owned = new Uint8Array(bytes.length);
  owned.set(bytes);
  const url = URL.createObjectURL(new Blob([owned.buffer], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let position = 0;
  for (const part of parts) { result.set(part, position); position += part.length; }
  return result;
}
function checksum(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value, true); }

function zip(files: Array<[string, string]>) {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of files) {
    const name = ascii(path), data = ascii(content), crc = checksum(data);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    write32(h, 0, 0x04034b50); write16(h, 4, 20); write16(h, 6, 0x0800); write16(h, 8, 0);
    write32(h, 14, crc); write32(h, 18, data.length); write32(h, 22, data.length); write16(h, 26, name.length);
    header.set(name, 30); local.push(header, data);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    write32(d, 0, 0x02014b50); write16(d, 4, 20); write16(d, 6, 20); write16(d, 8, 0x0800);
    write32(d, 16, crc); write32(d, 20, data.length); write32(d, 24, data.length);
    write16(d, 28, name.length); write32(d, 42, offset); directory.set(name, 46); central.push(directory);
    offset += header.length + data.length;
  }
  const centralLength = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  write32(e, 0, 0x06054b50); write16(e, 8, files.length); write16(e, 10, files.length);
  write32(e, 12, centralLength); write32(e, 16, offset);
  return concat([...local, ...central, end]);
}

export function exportExcel(order: DeliveryOrder) {
  const t = (text: string) => translate(order.language || "zh", text);
  const cell = (column: string, row: number, text: string, style = 0) =>
    `<c r="${column}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  const letters = "ABCDEFGHI";
  const sheetRows: string[] = [];
  sheetRows.push(`<row r="1" ht="34" customHeight="1">${cell("A", 1, order.language === "en" ? "DELIVERY ORDER" : "送柜单 / DELIVERY ORDER", 1)}</row>`);
  const metadata: Array<Array<[string, string]>> = [
    [["订舱号", order.booking], ["分票", order.ticket], ["提单号", order.billOfLading]],
    [["客户", order.customer], ["车队", order.haulier], ["群号", order.groupNo]],
    [["船司", order.carrier], ["船名", order.vessel], ["目的港", order.destination]],
    [["码头", order.terminal], ["开闸时间", order.gateOpen], ["截关时间", order.cutoff]],
    [["报关行", order.customs], ["柜量", String(order.rows.length)], ["ETA", order.eta]],
  ];
  metadata.forEach((line, index) => {
    const row = index + 2;
    sheetRows.push(`<row r="${row}" ht="26" customHeight="1">${line.map(([label, text], i) => cell(letters[i * 3], row, t(label), 2) + cell(letters[i * 3 + 1], row, text, 0)).join("")}</row>`);
  });
  sheetRows.push(`<row r="7" ht="30" customHeight="1">${cell("A",7,"Pick up depot",2)}${cell("B",7,order.depot||"",0)}</row>`);
  sheetRows.push(`<row r="8" ht="28" customHeight="1">${columns.map(([name], i) => cell(letters[i], 8, t(name), 3)).join("")}</row>`);
  order.rows.forEach((detail, index) => {
    const row = index + 9;
    sheetRows.push(`<row r="${row}" ht="46" customHeight="1">${valuesFor(detail, index).map((value, i) => cell(letters[i], row, value, 4)).join("")}</row>`);
  });
  const merges = ['A1:I1','B7:I7', ...[2, 3, 4, 5, 6].flatMap(row => [`B${row}:C${row}`, `E${row}:F${row}`, `H${row}:I${row}`])];
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${[order.language === "en" ? 17 : 7, 20, 13, 36, 21, 21, 18, 22, 30].map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF0B756F"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B756F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE5EA"/></left><right style="thin"><color rgb="FFDCE5EA"/></right><top style="thin"><color rgb="FFDCE5EA"/></top><bottom style="thin"><color rgb="FFDCE5EA"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`;
  const files: Array<[string, string]> = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${t("送柜单")}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", styles], ["xl/worksheets/sheet1.xml", worksheet],
  ];
  download(zip(files), fileName(order) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function wrapped(context: CanvasRenderingContext2D, text: string, width: number) {
  if (!text) return [""];
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const character of paragraph) {
      if (context.measureText(line + character).width > width && line) { lines.push(line); line = character; }
      else line += character;
    }
    lines.push(line);
  }
  return lines;
}

function pdfPages(order: DeliveryOrder) {
  const t = (text: string) => translate(order.language || "zh", text);
  const images: Array<{ data: Uint8Array; width: number; height: number }> = [];
  const width = 1587, height = 1122, left = 60, top = 300;
  let canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, y = top;
  function page() {
    canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#0b756f"; context.font = "bold 38px Arial, 'Microsoft YaHei', sans-serif";
    context.fillText(order.language === "en" ? "DELIVERY ORDER" : "送柜单  /  DELIVERY ORDER", left, 68);
    context.fillStyle = "#31505f"; context.font = "19px Arial, 'Microsoft YaHei', sans-serif";
    const metadata = [
      ["订舱号", order.booking, "分票", order.ticket, "提单号", order.billOfLading],
      ["客户", order.customer, "车队", order.haulier, "柜量", String(order.rows.length)],
      ["船司", order.carrier, "船名", order.vessel, "目的港", order.destination],
      ["码头", order.terminal, "开闸", order.gateOpen, "截关", order.cutoff],
      ["报关行", order.customs, "群号", order.groupNo, "ETA", order.eta],
    ];
    metadata.forEach((line, index) => {
      const baseline = 112 + index * 30;
      for (let i = 0; i < 3; i++) {
        const label = line[i * 2], content = line[i * 2 + 1];
        if (!label) continue;
        const x = left + i * 490;
        context.fillStyle = "#637c87"; context.fillText(t(label) + (order.language === "en" ? ":" : "："), x, baseline);
        context.fillStyle = "#152d3a"; context.fillText(content || "—", x + (order.language === "en" ? 155 : 92), baseline, order.language === "en" ? 300 : 365);
      }
    });
    context.fillStyle = "#152d3a"; context.fillText("Pick up depot: " + (order.depot||"—"),left,272,1474);
    y = top;
    context.fillStyle = "#0b756f"; context.fillRect(left, y, 1474, 44);
    context.fillStyle = "#ffffff"; context.font = "bold 17px Arial, 'Microsoft YaHei', sans-serif";
    let x = left;
    for (const [label, cellWidth] of columns) { context.fillText(t(label), x + 9, y + 29, cellWidth - 14); x += cellWidth; }
    y += 44;
  }
  function finish() {
    context.fillStyle = "#718793"; context.font = "16px Arial, sans-serif";
    context.fillText("TOPASIA  ·  " + order.booking + "  ·  " + (images.length + 1), left, height - 40);
    const base64 = canvas.toDataURL("image/jpeg", 0.87).split(",")[1];
    const binary = atob(base64), data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    images.push({ data, width, height });
  }
  page();
  order.rows.forEach((row, index) => {
    context.font = "17px Arial, 'Microsoft YaHei', sans-serif";
    const cells = valuesFor(row, index).map((content, i) => wrapped(context, content, columns[i][1] - 18));
    const lineCount = Math.max(...cells.map(lines => lines.length));
    let start = 0;
    while (start < lineCount) {
      if (y + 48 > 1040) { finish(); page(); }
      const take = Math.min(lineCount - start, Math.max(1, Math.floor((1040 - y - 16) / 23)));
      const rowHeight = Math.max(48, 12 + take * 23);
      context.fillStyle = index % 2 ? "#f6fafb" : "#ffffff"; context.fillRect(left, y, 1474, rowHeight);
      context.strokeStyle = "#dce5ea"; context.strokeRect(left, y, 1474, rowHeight);
      let x = left;
      cells.forEach((lines, i) => {
        context.beginPath(); context.moveTo(x, y); context.lineTo(x, y + rowHeight); context.stroke();
        context.fillStyle = "#152d3a"; context.font = "17px Arial, 'Microsoft YaHei', sans-serif";
        lines.slice(start, start + take).forEach((line, lineIndex) => context.fillText(line, x + 9, y + 27 + lineIndex * 23, columns[i][1] - 18));
        x += columns[i][1];
      });
      y += rowHeight; start += take;
    }
  });
  finish();
  return images;
}

function pdf(images: ReturnType<typeof pdfPages>) {
  const parts: Uint8Array[] = []; const offsets: number[] = [0];
  let length = 0;
  function add(data: Uint8Array | string) { const part = typeof data === "string" ? ascii(data) : data; parts.push(part); length += part.length; }
  function begin(id: number) { offsets[id] = length; add(id + " 0 obj\n"); }
  add("%PDF-1.4\n");
  begin(1); add("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  begin(2); add("<< /Type /Pages /Kids [" + images.map((_, i) => (3 + i * 3) + " 0 R").join(" ") + "] /Count " + images.length + " >>\nendobj\n");
  images.forEach((image, index) => {
    const page = 3 + index * 3, content = page + 1, picture = page + 2;
    begin(page); add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 " + picture + " 0 R >> >> /Contents " + content + " 0 R >>\nendobj\n");
    const drawing = ascii("q 842 0 0 595 0 0 cm /Im0 Do Q\n");
    begin(content); add("<< /Length " + drawing.length + " >>\nstream\n"); add(drawing); add("endstream\nendobj\n");
    begin(picture); add("<< /Type /XObject /Subtype /Image /Width " + image.width + " /Height " + image.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + image.data.length + " >>\nstream\n"); add(image.data); add("\nendstream\nendobj\n");
  });
  const xref = length, count = 3 + images.length * 3;
  add("xref\n0 " + count + "\n0000000000 65535 f \n");
  for (let id = 1; id < count; id++) add(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
  add("trailer\n<< /Size " + count + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
  return concat(parts);
}

export async function exportPdf(order: DeliveryOrder) {
  await document.fonts.ready;
  download(pdf(pdfPages(order)), fileName(order) + ".pdf", "application/pdf");
}
