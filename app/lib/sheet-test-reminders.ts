import {type Sheet} from "./sheet-test";
import {sheetValue} from "./sheet-test-order";
export function sheetCutoffInstant(value:string):number {
 const m=value.trim().match(/^(?:(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4}))(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
 if(!m)return Infinity;
 const year=m[1]?Number(m[1]):Number(m[6])+(m[6].length===2?2000:0),month=Number(m[2]||m[5]),day=Number(m[3]||m[4]),hour=Number(m[7]||0),minute=Number(m[8]||0),second=Number(m[9]||0);
 const local=Date.UTC(year,month-1,day,hour,minute,second),d=new Date(local);
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day||hour>23||minute>59||second>59)return Infinity;
 let offset=480;
 if(m[10]){if(m[10].toUpperCase()==="Z")offset=0;else {const zone=m[10].replace(":","");const h=Number(zone.slice(1,3)),min=Number(zone.slice(3));if(h>23||min>59)return Infinity;offset=(h*60+min)*(zone[0]==="-"?-1:1);}}
 return local-offset*60000;
}
export function sheetReminderRows(sheet:Sheet|undefined,now:number){
 const pull=new Set<number>(),missing=new Set<number>();
 sheet?.rows.forEach((row,r)=>{if(!sheetValue(sheet,row,"订单号","订舱号"))return;const remaining=sheetCutoffInstant(sheetValue(sheet,row,"截关时间"))-now;if(!Number.isFinite(remaining))return;const container=sheetValue(sheet,row,"柜号");if(container&&remaining<=72*3600000&&!sheetValue(sheet,row,"进港时间"))pull.add(r);if(!container&&remaining<=5*24*3600000)missing.add(r);});
 return {pull,missing};
}
