import {currentAccount} from "@/app/lib/account-access";
import {hashPassword,validPassword} from "@/app/lib/account-password";
import {database} from "@/db/raw";
export async function POST(request:Request){
 const admin=await currentAccount();if(!admin||admin.role!=="admin")return Response.json({error:"只有管理员可以重设其他账号密码"},{status:403});
 const body=await request.json().catch(()=>null) as {id?:unknown;newPassword?:unknown}|null;if(typeof body?.id!=="string"||typeof body?.newPassword!=="string"||!validPassword(body.newPassword))return Response.json({error:"请选择账号；新密码需为 12–128 个字符"},{status:400});
 const db=database(),target=await db.prepare("SELECT id,role FROM accounts WHERE id=?").bind(body.id).first<{id:string;role:string}>();if(!target)return Response.json({error:"账号不存在"},{status:404});if(target.role==="admin")return Response.json({error:"管理员自己的密码请在账号设置中修改"},{status:400});
 const {hash,salt}=await hashPassword(body.newPassword);await db.batch([
 db.prepare("UPDATE accounts SET password_hash=?,password_salt=?,auth_version=auth_version+1 WHERE id=?").bind(hash,salt,target.id),
 db.prepare("INSERT INTO admin_account_audit(id,actor_id,target_id,action,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,target.id,"reset_password",Date.now())
 ]);return Response.json({ok:true,message:"密码已重设，该账号需重新登录"});
}
