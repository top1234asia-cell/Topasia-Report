import {cookies} from "next/headers";
import {readSession,sessionCookie} from "@/app/lib/railway-session";
import {database} from "@/db/raw";
export type Account={id:string;name:string;role:string;status:string;authVersion:number};
export async function accountFromToken(token:string|undefined):Promise<Account|null>{
 const session=await readSession(token);if(!session)return null;
 const account=await database().prepare("SELECT id,name,role,status,auth_version AS authVersion FROM accounts WHERE id=?").bind(session.id).first<Account>();
 return account?.status==="approved"&&account.authVersion===(session.authVersion??0)?account:null;
}
export async function currentAccount():Promise<Account|null>{return accountFromToken((await cookies()).get(sessionCookie)?.value);}
