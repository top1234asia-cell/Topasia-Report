import type {Sheet} from "./sheet-test";
import {bookingColumn} from "./sheet-test";
import {etaFromCutoff} from "./eta";
import type {EmailOrder} from "../order-email-dialog";
import type {DeliveryOrder} from "./delivery-order-export";
export function sheetValue(s:Sheet,row:string[],...names:string[]){for(const name of names){const c=s.headers.indexOf(name);if(c>=0&&row[c]?.trim())return row[c].trim();}return "";}
export function sheetDate(value:string){return value.replace(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})(?=\s|$)/,(_,d,m,y)=>`${d}/${m}/20${y}`);}
export function sheetSize(s:Sheet,row:string[]){const value=sheetValue(s,row,"柜型","柜量").toUpperCase().replace(/\s+/g,"").replace(/['’"]/g,"");const match=/\b(20|40)(HQ|HC|GP|HD|OT|TK|TANK)\b/.exec(value.replace(/[×*X]/g," "));if(!match)return "";return `${match[1]}${match[2]==="HC"?"HQ":match[2]==="HD"?"GP":match[2]==="TANK"?"TK":match[2]}`;}
export function sheetEmailOrder(s:Sheet,booking:string):EmailOrder {
 const c=bookingColumn(s),key=booking.trim().toUpperCase();if(c<0||!key)throw Error("请填写订舱号");
 const rows=s.rows.filter(row=>row[c].trim().toUpperCase()===key);if(!rows.length)throw Error("找不到这票业务");
 const first=rows[0],v=(...names:string[])=>sheetValue(s,first,...names);
 return {booking:v("订单号","订舱号"),businessNo:v("业务编号","业务编码"),groupNo:v("群号","群主"),carrier:v("船司","船公司"),terminal:v("码头"),destination:v("目的港"),vessel:v("船名"),commodity:v("品名","货物品名"),gateOpen:sheetDate(v("开闸时间")),cutoff:sheetDate(v("截关时间")),customs:v("报关行","报关"),rows:rows.map(row=>({container:sheetValue(s,row,"柜号"),size:sheetSize(s,row),factory:sheetValue(s,row,"工厂地址","地址"),deliveryTime:sheetDate(sheetValue(s,row,"送柜时间")),haulier:sheetValue(s,row,"车队"),truckType:sheetValue(s,row,"卡车类型"),rot:sheetValue(s,row,"ROT","ROT/SMK"),ticketBusinessNo:sheetValue(s,row,"业务编号","业务编码")}))};
}
export type RotBatch={key:string;businessNo:string;order:DeliveryOrder};
export function sheetRotBatches(s:Sheet,booking:string):RotBatch[] {
 const shared=sheetEmailOrder(s,booking),c=bookingColumn(s),source=s.rows.filter(row=>row[c].trim().toUpperCase()===booking.trim().toUpperCase());
 const batches=new Map<string,RotBatch>();
 for(let i=0;i<source.length;i++){const row=source[i],detail=shared.rows[i],haulier=detail.haulier||"",businessNo=detail.ticketBusinessNo||shared.businessNo||"",bl=sheetValue(s,row,"提单号","进口提单");const key=JSON.stringify([haulier.toUpperCase(),businessNo,bl]);let batch=batches.get(key);if(!batch){batch={key,businessNo,order:{booking:shared.booking||"",customer:sheetValue(s,row,"客户"),groupNo:shared.groupNo||"",customs:shared.customs||"",terminal:shared.terminal||"",carrier:shared.carrier||"",vessel:shared.vessel||"",destination:shared.destination||"",commodity:shared.commodity||"",gateOpen:shared.gateOpen||"",cutoff:shared.cutoff||"",eta:etaFromCutoff(shared.cutoff||""),ticket:businessNo||"未分票",billOfLading:bl,haulier,rows:[]}};batches.set(key,batch);}batch.order.rows.push({container:detail.container||"",size:detail.size||"",factory:detail.factory||"",deliveryTime:detail.deliveryTime||"",gateIn:sheetDate(sheetValue(s,row,"进港时间")),truckType:detail.truckType||"",rot:detail.rot||"",remark:s.headers.map((h,c)=>h==="备注"?row[c]?.trim():"").filter(Boolean).join(" / ")});}
 return [...batches.values()];
}
export function matchesSheetFilters(row:string[],filters:Record<string,string[]>){return Object.entries(filters).every(([column,values])=>values.includes(row[Number(column)]?.trim()||""));}

export function sheetFilterValues(rows:string[][],filters:Record<string,string[]>,column:number){const others={...filters};delete others[column];return [...new Set(rows.filter(row=>matchesSheetFilters(row,others)).map(row=>row[column]?.trim()||""))].sort((a,b)=>a.localeCompare(b,"zh"));}
