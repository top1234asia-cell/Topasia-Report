import {currentAccount} from "@/app/lib/account-access";
import {database} from "@/db/raw";
import {summarizeHauliers,type HaulierRecord} from "@/app/lib/haulier-stats";
import {normalizeWorkflow} from "@/app/lib/sheet-test";
import {sheetValue,sheetDate} from "@/app/lib/sheet-test-order";
export async function GET(){
 const user=await currentAccount();if(!user)return Response.json({error:"请先登录"},{status:401});
 try{const db=database();await db.prepare("CREATE TABLE IF NOT EXISTS sheet_test (owner_id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL)").run();
 const saved=user.role==="admin"?await db.prepare("SELECT data FROM sheet_test").all<{data:string}>():await db.prepare("SELECT data FROM sheet_test WHERE owner_id=?").bind(user.id).all<{data:string}>();
 const records:HaulierRecord[]=saved.results.flatMap(item=>normalizeWorkflow(JSON.parse(item.data)).sheets.slice(0,2).flatMap(sheet=>sheet.rows.filter(row=>sheetValue(sheet,row,"订单号","订舱号")).map(row=>({haulier:sheetValue(sheet,row,"车队"),truckType:sheetValue(sheet,row,"卡车类型"),deliveryTime:sheetDate(sheetValue(sheet,row,"送柜时间","送柜日期"))}))));
 return Response.json({months:summarizeHauliers(records),scope:user.role==="admin"?"all":"own"});
 }catch{return Response.json({error:"车队统计暂时无法读取"},{status:500});}
}
