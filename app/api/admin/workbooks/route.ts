import {currentAccount} from "@/app/lib/account-access";
import {database} from "@/db/raw";
import {normalizeWorkflow,type TestWorkbook} from "@/app/lib/sheet-test";
export async function GET(){
 const admin=await currentAccount();if(!admin||admin.role!=="admin")return Response.json({error:"只有管理员可以查看全部账号数据"},{status:403});
 const db=database();await db.prepare("CREATE TABLE IF NOT EXISTS sheet_test (owner_id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL)").run();
 const result=await db.prepare("SELECT s.owner_id AS ownerId,COALESCE(a.name,s.owner_id) AS ownerName,s.data,s.revision FROM sheet_test s LEFT JOIN accounts a ON a.id=s.owner_id ORDER BY ownerName").all<{ownerId:string;ownerName:string;data:string;revision:number}>();
 return Response.json({workbooks:result.results.map(r=>({...r,data:normalizeWorkflow(JSON.parse(r.data) as TestWorkbook)}))});
}
