export type Fee = { id: string; name: string; amount: number; currency: "MYR" | "USD"; basis: "container" | "shipment"; saleAmount?: number; costKnown?: boolean; supplier?: string; referenceCost?: number };
export type Quote = { reference: string; customer: string; groupNo: string; carrier: string; origin: string; destination: string; commodity: string; size: string; quantity: number; adjustmentPerContainer: number; rate: number; profile: string; thcIncluded: boolean; localMode?: "fees" | "manual"; localPerContainer: number; extraTaxPerContainer: number; sst: number; profitPerContainer: number; profitMode: "fixed" | "cost10" | "sales10"; validUntil: string; notes: string; fees: Fee[] };
export const profiles = [
 { id:"regular", name:"粒子及常规产品（五金除外）", profit:0, customs:200, customsCost:0, customsKnown:false, haulage:700, extra:0, certificateSale:0, supplier:"", referenceCost:0 },
 { id:"metal", name:"铝锭 / 矽钢片 · 中国 FE", profit:0, customs:200, customsCost:0, customsKnown:false, haulage:700, extra:350, certificateSale:600, supplier:"YD FREIGHT SDN. BHD.", referenceCost:0 },
 { id:"metalASEAN", name:"铝锭 · 韩国 / 东盟 FD、FAK", profit:0, customs:200, customsCost:0, customsKnown:false, haulage:700, extra:700, certificateSale:800, supplier:"SS GREENER EARTH SOLUTIONS SDN BHD", referenceCost:0 },
 { id:"scrap", name:"ASIA 废五金 / 准证（含巴生附近拖车）", profit:0, customs:1300, customsCost:0, customsKnown:false, haulage:0, extra:0, certificateSale:0, supplier:"", referenceCost:0 },
 { id:"recycled", name:"再生铝 · 中国 FE（含废五金 / 准证）", profit:0, customs:1300, customsCost:0, customsKnown:false, haulage:0, extra:800, certificateSale:1200, supplier:"FY MAD TRADING(M)SDN.BHD.", referenceCost:0 },
 { id:"recycledCopper", name:"再生铜 · 中国 FE（含废五金 / 准证）", profit:0, customs:1300, customsCost:0, customsKnown:false, haulage:0, extra:800, certificateSale:1200, supplier:"YONG HENG ALUMINIUM & CONSTRUCTION (M) SDN. BHD.", referenceCost:0 },
 { id:"lead", name:"铅锭 · 报关＋中国产地证组合", profit:0, customs:1700, customsCost:1700, customsKnown:true, haulage:700, extra:0, certificateSale:0, supplier:"YONG HENG ALUMINIUM & CONSTRUCTION (M) SDN. BHD.", referenceCost:650 },
];
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function presetLocal(profile: string, size: string, included: boolean) { const p=profiles.find(p=>p.id===profile)||profiles[0]; return p.customs+p.haulage+p.certificateSale+250+40+40+200+(included?(size.startsWith("20")?650:950):0); }
export function applyProfile(q: Quote, profile=q.profile, size=q.size, included=q.thcIncluded): Quote {
 const p=profiles.find(p=>p.id===profile)||profiles[0];
 const fees=q.fees.map(f=>f.id==="certificate"?{...f,name:"产地证费用",amount:p.extra,saleAmount:p.certificateSale,costKnown:true,supplier:p.referenceCost?"":p.supplier,referenceCost:undefined}:f.id==="customs"?{...f,name:p.customs===1300?"废五金 / 准证（含巴生附近拖车）":p.id==="lead"?"铅锭报关＋产地证组合":"报关费用",amount:p.customsCost,saleAmount:p.customs,costKnown:p.customsKnown,supplier:p.referenceCost?p.supplier:"",referenceCost:p.referenceCost||undefined}:f.id==="remote"&&f.supplier==="ASIA"?{...f,name:"远程拖车费用",amount:0,saleAmount:0,supplier:undefined}:f.id==="haulage"?{...f,name:"拖车费用",amount:p.haulage,saleAmount:p.haulage,costKnown:true,supplier:undefined}:f.id==="thc"?{...f,amount:size.startsWith("20")?650:950,saleAmount:size.startsWith("20")?650:950,costKnown:true}:f);
 // Local charges already reflect the selected size; no additional RM300 reduction.
 return {...q,profile,size,thcIncluded:included,localMode:"fees",adjustmentPerContainer:0,profitPerContainer:0,fees,localPerContainer:presetLocal(profile,size,included)};
}
export function defaultQuote(): Quote {
 const p=profiles[0];
 return { reference:"", customer:"", groupNo:"", carrier:"", origin:"PORT KLANG", destination:"", commodity:"", size:"40HQ", quantity:1, adjustmentPerContainer:0, rate:4.3, profile:p.id, thcIncluded:false,localMode:"fees", localPerContainer:presetLocal(p.id,"40HQ",false), extraTaxPerContainer:0, sst:6, profitPerContainer:p.profit, profitMode:"fixed", validUntil:"", notes:"Rates subject to space and equipment availability. Additional charges, if any, to be confirmed.", fees:[
  {id:"ocean",name:"海运费 / OCEAN FREIGHT",amount:440,currency:"USD",basis:"container"},
  {id:"lss",name:"低硫费 / LSS",amount:0,currency:"USD",basis:"container"},
  {id:"other",name:"其他 / OTHER",amount:0,currency:"MYR",basis:"container"},
  {id:"thc",name:"码头费用 / THC",amount:950,currency:"MYR",basis:"container"},
  {id:"bl",name:"文件费 / BL",amount:250,currency:"MYR",basis:"shipment"},
  {id:"edi",name:"电子数据交换 / EDI",amount:40,currency:"MYR",basis:"shipment"},
  {id:"seal",name:"封条 / SEAL",amount:40,currency:"MYR",basis:"container"},
  {id:"ams",name:"AMS",amount:30,currency:"USD",basis:"shipment"},
  {id:"telex",name:"电放 / TELEX",amount:200,currency:"MYR",basis:"shipment"},
  {id:"customs",name:"报关费用",amount:0,saleAmount:200,costKnown:false,currency:"MYR",basis:"container"},
  {id:"haulage",name:"拖车费用",amount:700,currency:"MYR",basis:"container"},
  {id:"certificate",name:"产地证额外费用",amount:0,currency:"MYR",basis:"container"},
  {id:"remote",name:"远程拖车费用",amount:0,currency:"MYR",basis:"container"},
 ]};
}
export function calculateQuote(q: Quote) {
 const quantity=Math.max(1,Number.isFinite(q.quantity)?q.quantity:1);
 const amounts=q.fees.map(f=>money(f.amount*(f.currency==="USD"?q.rate:1)*(f.basis==="container"?quantity:1)));
 const saleAmounts=q.fees.map(f=>money((f.saleAmount??f.amount)*(f.currency==="USD"?q.rate:1)*(f.basis==="container"?quantity:1)));
 const feeMargin=money(saleAmounts.reduce((a,b)=>a+b,0)-amounts.reduce((a,b)=>a+b,0));
 const pendingCosts=q.fees.filter(f=>f.costKnown===false&&(f.saleAmount??f.amount)>0).map(f=>f.name);
 const adjustment=q.adjustmentPerContainer*quantity;
 const certificate=q.fees.reduce((a,f,i)=>a+(f.id==="certificate"?amounts[i]:0),0);
 const cost=money(amounts.reduce((a,b)=>a+b,0)+adjustment);
 const fixedProfit=q.profitPerContainer*quantity;
 const threshold=(cost+feeMargin+fixedProfit)/quantity>10000;
 const extraProfit=money(threshold&&q.profitMode!=="fixed" ? q.profitMode==="cost10"?cost*.1:cost/9 : fixedProfit);
 const profit=money(feeMargin+extraProfit);
 const subtotal=money(cost+profit);
 const extra=q.fees.filter(f=>f.id==="remote"||f.id==="other").reduce((a,f)=>a+(f.saleAmount??f.amount)*(f.currency==="USD"?q.rate:1)*(f.basis==="container"?quantity:1),0)+q.extraTaxPerContainer*quantity;
 const localBase=q.localMode==="fees"?q.fees.reduce((a,f,i)=>a+(f.currency==="MYR"&&!["other","remote","ocean","lss"].includes(f.id)&&(q.thcIncluded||f.id!=="thc")?saleAmounts[i]:0),0):q.localPerContainer*quantity;
 const local=money(localBase+extra);
 const ocean=money(subtotal-local);
 const tax=money(local*q.sst/100);
 return {amounts,saleAmounts,feeMargin,extraProfit,pendingCosts,cost,adjustment,certificate,profit,subtotal,local,ocean,tax,total:money(subtotal+tax),unit:money((subtotal+tax)/quantity),threshold};
}
export function validQuote(value: unknown): value is Quote {
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const q=value as Quote;
 const texts=["reference","customer","groupNo","carrier","origin","destination","commodity","size","profile","validUntil","notes"] as const;
 if(texts.some(k=>typeof q[k]!=="string"||q[k].length>(k==="notes"?3000:200)))return false;
 if(!q.destination.trim()||!q.customer.trim())return false;
 if(!["20GP","40GP","40HQ","20OT","40OT","20TK","40TK"].includes(q.size)||!profiles.some(p=>p.id===q.profile)||typeof q.thcIncluded!=="boolean")return false;
 if(q.localMode!==undefined&&!["fees","manual"].includes(q.localMode))return false;
 if(!["fixed","cost10","sales10"].includes(q.profitMode))return false;
 if(!Number.isFinite(q.adjustmentPerContainer)||Math.abs(q.adjustmentPerContainer)>10000000)return false;
 if(!Number.isInteger(q.quantity)||q.quantity<1||q.quantity>100)return false;
 if([q.rate,q.localPerContainer,q.extraTaxPerContainer,q.sst,q.profitPerContainer].some(x=>typeof x!=="number"||!Number.isFinite(x)||x<0||x>10000000)||q.rate<=0||q.sst>100)return false;
 if(q.validUntil&&!/^\d{4}-\d{2}-\d{2}$/.test(q.validUntil))return false;
 return Array.isArray(q.fees)&&q.fees.length>0&&q.fees.length<=40&&new Set(q.fees.map(f=>f.id)).size===q.fees.length&&q.fees.every(f=>f&&typeof f.id==="string"&&f.id.length<=100&&typeof f.name==="string"&&f.name.trim()&&f.name.length<=200&&(f.saleAmount===undefined||(Number.isFinite(f.saleAmount)&&f.saleAmount>=0&&f.saleAmount<=10000000))&&(f.costKnown===undefined||typeof f.costKnown==="boolean")&&(f.supplier===undefined||(typeof f.supplier==="string"&&f.supplier.length<=200))&&(f.referenceCost===undefined||(Number.isFinite(f.referenceCost)&&f.referenceCost>=0&&f.referenceCost<=10000000))&&Number.isFinite(f.amount)&&f.amount>=0&&f.amount<=10000000&&["USD","MYR"].includes(f.currency)&&["container","shipment"].includes(f.basis));
}

export type AsiaHaulageRate = {name:string; state:string; surcharge:number; total:number};
export function applyAsiaHaulage(q:Quote, rate:AsiaHaulageRate):Quote {
 const bundled=["scrap","recycled","recycledCopper"].includes(q.profile);
 return {...q,localMode:"fees",fees:q.fees.map(f=>f.id==="haulage"?{...f,name:bundled?"拖车费用（已含在组合报价）":`ASIA 完整拖车费 · ${rate.name}`,amount:bundled?0:rate.total,saleAmount:bundled?0:rate.total,currency:"MYR",basis:"container",costKnown:true,supplier:"ASIA"}:f.id==="remote"?{...f,name:`ASIA 远程附加费 · ${rate.name}`,amount:bundled?rate.surcharge:0,saleAmount:bundled?rate.surcharge:0,currency:"MYR",basis:"container",costKnown:true,supplier:"ASIA"}:f)};
}
