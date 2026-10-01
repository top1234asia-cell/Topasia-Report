export type CellStyle={bg?:string;fg?:string;bold?:boolean};
export type Sheet={name:string;headers:string[];rows:string[][];styles:Record<string,CellStyle>;widths:number[];heights:Record<string,number>;fontSize:number;rowHeight:number};
export type TestWorkbook={sheets:Sheet[];bookingDepots?:Record<string,{depot:string}>};
export function validWorkbook(v:unknown):v is TestWorkbook {
 if(!v||typeof v!=="object")return false;
 const w=v as TestWorkbook;
 return (w.bookingDepots===undefined||(w.bookingDepots&&typeof w.bookingDepots==="object"&&!Array.isArray(w.bookingDepots)&&Object.entries(w.bookingDepots).length<=9000&&Object.entries(w.bookingDepots).every(([key,info])=>key.length<=200&&info&&typeof info==="object"&&typeof info.depot==="string"&&info.depot.length<=1500)))&&Array.isArray(w.sheets)&&w.sheets.length>0&&w.sheets.length<=24&&w.sheets.every(s=>typeof s.name==="string"&&s.name.length>0&&s.name.length<=31&&Array.isArray(s.headers)&&s.headers.length>0&&s.headers.length<=80&&s.headers.every(h=>typeof h==="string"&&h.length<=200)&&Array.isArray(s.rows)&&s.rows.length<=3000&&s.rows.every(r=>Array.isArray(r)&&r.length===s.headers.length&&r.every(c=>typeof c==="string"&&c.length<=10000))&&Array.isArray(s.widths)&&s.widths.length===s.headers.length&&s.widths.every(n=>Number.isFinite(n)&&n>=60&&n<=800)&&Number.isFinite(s.fontSize)&&s.fontSize>=10&&s.fontSize<=24&&Number.isFinite(s.rowHeight)&&s.rowHeight>=24&&s.rowHeight<=250&&s.heights&&typeof s.heights==="object"&&Object.entries(s.heights).every(([k,n])=>/^\d+$/.test(k)&&Number.isFinite(n)&&n>=24&&n<=500)&&s.styles&&typeof s.styles==="object"&&Object.entries(s.styles).every(([k,st])=>/^\d+:\d+$/.test(k)&&st&&typeof st==="object"&&(!st.bg||/^#[\da-f]{6}$/i.test(st.bg))&&(!st.fg||/^#[\da-f]{6}$/i.test(st.fg))&&(st.bold===undefined||typeof st.bold==="boolean")));
}
export function pasteCells(s:Sheet,row:number,col:number,text:string,targetRows?:number[]):Sheet {
 const matrix=parseClipboard(text);
 const columns=Math.max(s.headers.length,col+Math.max(...matrix.map(r=>r.length)));
 const targets=matrix.map((_,i)=>targetRows?(targetRows[i]??s.rows.length+Math.max(0,i-targetRows.length)):row+i);
 if(columns>80||targets.some(r=>r>=3000||r<0))throw Error("最多 80 列、3000 行");
 const headers=[...s.headers,...Array.from({length:columns-s.headers.length},(_,i)=>`新增栏目 ${s.headers.length+i+1}`)];
 const rows=s.rows.map(r=>[...r,...Array(columns-r.length).fill("")]);
 while(rows.length<=Math.max(...targets))rows.push(Array(columns).fill(""));
 matrix.forEach((r,i)=>r.forEach((v,j)=>{rows[targets[i]][col+j]=v.slice(0,10000);}));
 return {...s,headers,rows,widths:[...s.widths,...Array(columns-s.widths.length).fill(140)]};
}

export function parseClipboard(text:string):string[][] {
 const rows:string[][]=[],row:string[]=[];let value="",quoted=false;
 const input=text.replace(/\r\n/g,"\n");
 for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'&&(quoted||value.length===0)){if(quoted&&input[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c==='\t'||c==='\n')){row.push(value);value="";if(c==='\n'){rows.push([...row]);row.length=0;}}else value+=c;}
 if(value||row.length||!rows.length){row.push(value);rows.push(row);}return rows;
}
export function clipboardCell(value:string){return /[\t\n\r"]/.test(value)?'"'+value.replaceAll('"','""')+'"':value;}

export const workflowNames=["RUNNING","完成","退关"] as const;
export function bookingColumn(s:Sheet){return s.headers.findIndex(h=>h==="订单号"||h==="订舱号");}
export function normalizeWorkflow(w:TestWorkbook):TestWorkbook {
 if(w.sheets.length===3&&workflowNames.every((n,i)=>w.sheets[i].name===n))return w;
 const base=w.sheets.find(s=>s.name.toUpperCase()==="RUNNING")||w.sheets[0];
 const keyHeaders=(headers:string[])=>{const seen:Record<string,number>={};return headers.map(h=>`${h}:${seen[h]=(seen[h]||0)+1}`);};
 const keys=keyHeaders(base.headers),headers=[...base.headers];
 for(const s of w.sheets)keyHeaders(s.headers).forEach((key,c)=>{if(!keys.includes(key)){keys.push(key);headers.push(s.headers[c]);}});
 const blank=(name:string):Sheet=>({...base,name,headers:[...headers],rows:[],styles:{},heights:{},widths:headers.map((h,i)=>h==="订单号"||h==="订舱号"?Math.max(230,base.widths[i]||140):base.widths[i]||140)});
 const sheets=workflowNames.map(blank);
 for(const s of w.sheets){const mapped=keyHeaders(s.headers).map(k=>keys.indexOf(k));const delivery=s.headers.indexOf("送柜时间");for(let r=0;r<s.rows.length;r++){if(s.rows[r].every(v=>!v.trim()))continue;const cancelled=delivery>=0&&/^(CANCEL|CANCELLED|退关)$/i.test(s.rows[r][delivery].trim());const index=s.name==="退关"||cancelled?2:s.name.toUpperCase()==="RUNNING"?0:1;const target=sheets[index],newRow=target.rows.length,row=Array(headers.length).fill("");s.rows[r].forEach((v,c)=>row[mapped[c]]=v);target.rows.push(row);for(let c=0;c<s.headers.length;c++){const st=s.styles[`${r}:${c}`];if(st)target.styles[`${newRow}:${mapped[c]}`]={...st};}if(s.heights[r])target.heights[newRow]=s.heights[r];}}
 return {...w,sheets};
}
export function moveBooking(w:TestWorkbook,from:number,to:number,booking:string):TestWorkbook {
 const source=w.sheets[from],target=w.sheets[to],column=bookingColumn(source),key=booking.trim().toUpperCase();
 if(from===to||column<0||!key)throw Error("请填写订舱号");
 const matched=source.rows.map((row,r)=>({row,r})).filter(({row})=>row[column].trim().toUpperCase()===key);
 if(!matched.length)throw Error("找不到该订舱号");
 const labels=(h:string[])=>{const seen:Record<string,number>={};return h.map(v=>`${v}:${seen[v]=(seen[v]||0)+1}`);};
 const mergedHeaders=[...target.headers],keys=labels(target.headers),mapping=labels(source.headers).map((key,c)=>{let i=keys.indexOf(key);if(i<0){i=keys.length;keys.push(key);mergedHeaders.push(source.headers[c]);}return i;});
 if(target.rows.length+matched.length>3000)throw Error("目标分类最多 3000 行");
 const rows=target.rows.map(r=>[...r,...Array(mergedHeaders.length-r.length).fill("")]),styles={...target.styles},heights={...target.heights};
 for(const {row,r}of matched){const newIndex=rows.length;const mapped=Array(mergedHeaders.length).fill("");row.forEach((v,c)=>mapped[mapping[c]]=v);rows.push(mapped);for(let c=0;c<row.length;c++){const st=source.styles[`${r}:${c}`];if(st)styles[`${newIndex}:${mapping[c]}`]={...st};}if(source.heights[r])heights[newIndex]=source.heights[r];}
 const removed=new Set(matched.map(v=>v.r)),kept=source.rows.map((row,r)=>({row,r})).filter(v=>!removed.has(v.r)),sourceStyles:Sheet['styles']={},sourceHeights:Sheet['heights']={};
 kept.forEach(({r},i)=>{for(let c=0;c<source.headers.length;c++){const st=source.styles[`${r}:${c}`];if(st)sourceStyles[`${i}:${c}`]={...st};}if(source.heights[r])sourceHeights[i]=source.heights[r];});
 return {...w,sheets:w.sheets.map((s,i)=>i===from?{...s,rows:kept.map(v=>v.row),styles:sourceStyles,heights:sourceHeights}:i===to?{...s,headers:mergedHeaders,rows,styles,heights,widths:mergedHeaders.map((_,c)=>target.widths[c]||source.widths[c]||140)}:s)};
}

export function appendBookingRows(rows:string[][],headers:string[],values:Record<string,string>,quantity:number):string[][] {
 if(!Number.isInteger(quantity)||quantity<1||quantity>100||rows.length+quantity>3000)throw Error("请检查柜量");
 return [...rows.map(r=>[...r,...Array(Math.max(0,headers.length-r.length)).fill("")]),...Array.from({length:quantity},()=>headers.map(h=>values[h]||""))];
}

/** Archive by cutoff month, without relying on the browser's timezone. */
export function cutoffMonth(value:string):string {
 const input=value.trim(),iso=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]|$)/.exec(input),dayFirst=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:[T\s]|$)/.exec(input);
 if(!iso&&!dayFirst)return "未填写截关";
 const match=(iso||dayFirst)!,yearText=match[iso?1:3],year=Number(yearText)+(yearText.length===2?2000:0),month=Number(match[2]),day=Number(match[iso?3:1]),date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return "未填写截关";
 return `${year}-${String(month).padStart(2,"0")}`;
}
export function archiveMonth(s:Sheet,row:string[]){const c=s.headers.indexOf("截关时间");return cutoffMonth(c>=0?row[c]||"":"");}
