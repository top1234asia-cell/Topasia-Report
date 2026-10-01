"use client";
import type {Sheet,CellStyle} from "./sheet-test";
const encoder=new TextEncoder();
const ascii=(v:string)=>encoder.encode(v);
const xml=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
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


const letters=(c:number)=>{let n=c+1,r="";while(n){r=String.fromCharCode(65+(n-1)%26)+r;n=Math.floor((n-1)/26);}return r;};
export function exportTestSheet(sheet:Sheet,indices:number[]){
 const styles:CellStyle[]=[{}, {bg:"#e8f1f5",fg:"#15364a",bold:true}];
 const styleId=(st:CellStyle)=>{const key=JSON.stringify(st);let index=styles.findIndex(v=>JSON.stringify(v)===key);if(index<0){index=styles.length;styles.push(st);}return index;};
 const cell=(c:number,r:number,value:string,style:number)=>`<c r="${letters(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
 const rows=[`<row r="1" ht="28" customHeight="1">${sheet.headers.map((h,c)=>cell(c,1,h,1)).join("")}</row>`,...indices.map((r,i)=>`<row r="${i+2}" ht="${(sheet.heights[r]||sheet.rowHeight)*.75}" customHeight="1">${sheet.rows[r].map((v,c)=>cell(c,i+2,v,styleId(sheet.styles[`${r}:${c}`]||{}))).join("")}</row>`)];
 const colors=(v:string)=>v.replace("#","").toUpperCase();
 const styleXml=`<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${styles.length}">${styles.map(st=>`<font><sz val="${sheet.fontSize*.75}"/><name val="Arial"/>${st.fg?`<color rgb="FF${colors(st.fg)}"/>`:""}${st.bold?"<b/>":""}</font>`).join("")}</fonts><fills count="${styles.length+2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${styles.map(st=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${colors(st.bg||"#ffffff")}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills><borders count="1"><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.map((_,i)=>`<xf numFmtId="0" fontId="${i}" fillId="${i+2}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`).join("")}</cellXfs></styleSheet>`;
 const files:Array<[string,string]>=[
 ["[Content_Types].xml",`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
 ["_rels/.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
 ["xl/workbook.xml",`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheet.name.replace(/[\\/?:*\[\]]/g,"_").slice(0,31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
 ["xl/_rels/workbook.xml.rels",`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
 ["xl/styles.xml",styleXml],
 ["xl/worksheets/sheet1.xml",`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${sheet.widths.map((w,c)=>`<col min="${c+1}" max="${c+1}" width="${w/7}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A1:${letters(sheet.headers.length-1)}${indices.length+1}"/></worksheet>`]
 ];
 const bytes=zip(files),url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=`送柜表格测试-${sheet.name}.xlsx`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
