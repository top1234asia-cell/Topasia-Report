export function bookingDepot(text:string):string {
 const lines=text.replace(/\r/g,"").split("\n");
 const label=/(?:empty\s*(?:container\s*)?(?:pick[ -]?up\s*(?:depot|location|place)|release\s*(?:depot|location))|pick[ -]?up\s*(?:depot|location|place)|(?:empty\s*)?(?:collection|release)\s*depot|depot\s*(?:name|address)|(?:empty\s*)?depot(?=\s*[:：])|提柜堆场|提箱地点|空箱堆场|堆场)\s*[:：-]?\s*/i;
 const stop=/\b(?:booking\s*(?:no|number)|vessel|voyage|port of|place of|cut[ -]?off|closing|commodity|cargo|equipment|quantity|container\s*(?:type|size|no)|weight|shipper|consignee|delivery|return\s*(?:depot|location)|remarks?|telephone|tel|contact)\s*[:：]|\b(?:gate[ -]?open|gate[ -]?cutoff|SI cut|VGM cut)\b/i;
 for(let i=0;i<lines.length;i++){const match=label.exec(lines[i]);if(!match)continue;let value=lines[i].slice(match.index+match[0].length).trim();if(!value){for(let j=i+1;j<Math.min(lines.length,i+4);j++){const next=lines[j].trim();if(!next)continue;if(stop.test(next)||label.test(next))break;value=next;break;}}
 value=value.split(stop)[0].replace(/^[\s:：-]+|\s+$/g,"").replace(/[ \t]+/g," ").slice(0,1500);
 if(value&&!/^(?:N\/?A|NIL|NONE|TBA|TBC|TO BE (?:ADVISED|CONFIRMED)|待定|待通知|[-—]+)\.?$/i.test(value))return value;
 }return "";
}
