import {bookingDepot} from "./booking-depot";
export type ContainerSize = "20GP" | "40GP" | "40HQ" | "20OT" | "40OT" | "20TK" | "40TK";
export type BookingFields = { booking: string; carrier: string; destination: string; quantity: string; commodity: string; terminal: string; vessel: string; containerSizeHint?: ContainerSize; pickupDepot?:string };
const field = (text: string, pattern: RegExp) => pattern.exec(text)?.[1]?.trim() || "";
const sizeFrom = (dimension: string, type: string): ContainerSize | undefined => {
  const length = dimension.match(/20|40/)?.[0];
  if (!length) return undefined;
  if (/\b(?:TANK|TK)\b/i.test(type)) return `${length}TK` as ContainerSize;
  if (/\b(?:OPEN[ -]?TOP|OT)\b/i.test(type)) return `${length}OT` as ContainerSize;
  if (/\b(?:HI[ -]?CUBE|HIGH[ -]?CUBE|HC|HQ|H)\b/i.test(type)) return length === "40" ? "40HQ" : undefined;
  if (/\b(?:GENERAL PURPOSE|GP|DV|DC|DRY|ST|STANDARD)\b/i.test(type) || (length === "20" && /\bHD\b/i.test(type))) return `${length}GP` as ContainerSize;
  return undefined;
};
const equipmentType = String.raw`(?:HI[ -]?CUBE|HIGH[ -]?CUBE|GENERAL PURPOSE|OPEN[ -]?TOP|TANK|STANDARD|HC|HQ|GP|DV|DC|DRY|ST|OT|TK|H)`;
const terminalFrom = (value: string) => /\b(?:KPM|KCT)\b|PORT KLANG NORTH\b|NORTH\s*PORT/.test(value.toUpperCase()) ? "NP"
  : /\bKMT\b|PORT KLANG WEST\b|WEST\s*PORT/.test(value.toUpperCase()) ? "WP" : "";

/** Extract only the seven approved booking fields; PDF ETA is deliberately ignored. */
function parseBookingFields(text: string, layoutText = text): BookingFields {
  const first = text.slice(0, 10000).replace(/\r/g, "");
  const compact = first.replace(/[ \t]+/g, " ");
  // Tailwind confirmation without an OPR line still uses the Book No., equipment summary and acceptance terminal layout.
  if (/\bBook No\.\s*:\s*TSHGPKG[A-Z0-9-]+/i.test(layoutText) && /Container Summary Details\s*:/i.test(layoutText) && /Acceptance Terminal\s*:/i.test(layoutText)) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Book No\.\s*:\s*(TSHGPKG[A-Z0-9-]+)/i);
    const equipment = /Container Summary Details\s*:[\s\S]{0,300}?\b\d{1,3}\s+(\d{1,3})\s+(20|40)\s*(HC|HQ|GP|OT|TK|HD)\b/i.exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /Port of Discharge\s*:\s*([^\n]+)/i);
    const terminal = terminalFrom(field(lines, /Acceptance Terminal\s*:\s*([^\n]+)/i));
    const vessel = field(lines, /Vessel\s*\/\s*Voyage\s*:\s*([^\n]+?)(?:\s+B\/L Release Office|\n|$)/i);
    const commodity = field(lines, /Commodity Description[^\n]*\n\s*([A-Z][A-Z ]+?)\s+\d+(?:\.\d+)?\s+[A-Z]\b/i)
      || field(lines, /Commodity Description[^\n]*\n\s*([^\n]+)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 TAILWIND，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "TAILWIND", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/MERIDIAN STAR NAVIGATION SDN\s*BHD/i.test(layoutText.slice(0, 1500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    // Booking No. is the shipping reference; MSN Ref is an internal reference.
    const booking = field(lines, /Booking No\.\s*:\s*(TSHGPKG[A-Z0-9-]+)/i);
    const equipment = /Container\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)[’']?\s*(HC|HQ|GP|OT|TK|HD)\b/i.exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /(?:^|\n)\s*POD\s*:\s*([^\n]+)/im);
    const commodity = field(lines, /(?:^|\n)\s*Commodity\s*:\s*([^\n]+)/im);
    const terminal = terminalFrom(field(lines, /(?:^|\n)\s*TERMINAL\s*:\s*([^\n]+)/im));
    const vessel = field(lines, /Vessel\s*\/\s*Voyage\s*:\s*([^\n]+)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 MERIDIAN，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "MERIDIAN", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/CLARION INTERNATIONAL FREIGHT\s*&\s*LOGISTICS/i.test(layoutText.slice(0, 2000))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Carrier Booking No\.\s*:\s*([A-Z0-9-]+)/i);
    const volume = /Booking Volume\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(GP|HC|HQ|OT|TK)\b/i.exec(lines);
    const quantity = volume?.[1] || "";
    const containerSizeHint = volume ? sizeFrom(volume[2], volume[3]) : undefined;
    const destination = field(lines, /Final Of Destinaiton\s*:\s*([^\n]+)/i)
      || field(lines, /Port of Discharge\s*:\s*([^\n]+)/i);
    const commodity = field(lines, /Commodity\s*:\s*([^\n]+)/i);
    const terminal = terminalFrom(field(lines, /CALLING\s*\/\s*SCN\s*\/\s*VESSEL ID\s*:\s*(KCT|KMT|KPM|NORTHPORT|WESTPORTS?)/i));
    const vessel = field(lines, /Feeder Vessel\s*:\s*([^\n]+)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 CLARION，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "CLARION", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/INOX SHIPPING SDN\.?\s*BHD\.?/i.test(layoutText.slice(0, 1500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    // The filename and document reference can differ from the printed Booking No.
    const booking = field(lines, /Booking No\.\s+Service Mode[\s\S]{0,150}?\b(\d{4,}[A-Z0-9]{4,})\b/i)
      || field(lines, /Booking No\.\s*:\s*(\d{4,}[A-Z0-9]{4,})/i);
    const quantity = field(lines, /(?:^|\n)\s*(\d{1,3})\s*[X×]\s*(?:20|40)\s*(?:HD|GP|HC|HQ|OT|TK)\b/im);
    const equipment = /(?:^|\n)\s*\d{1,3}\s*[X×]\s*(20|40)\s*(HD|GP|HC|HQ|OT|TK)\b/im.exec(lines);
    const containerSizeHint = equipment ? sizeFrom(equipment[1], equipment[2]) : undefined;
    const destination = field(lines, /(?:^|\n)\s*POD\s+FD\s*\n\s*([^,\n]+),/im);
    const commodity = field(lines, /(?:^|\n)\s*Commodity\s+Booking Agent\s*\n\s*([^\n]+?)(?:\s{2,}INOX|$)/im).replace(/\s+INOX PORTKLANG\s*$/i, "").trim();
    const terminal = /PORTKLANG\s*-\s*NORTH\b/i.test(lines) ? "NP" : /PORTKLANG\s*-\s*WEST\b/i.test(lines) ? "WP" : "";
    const vessel = field(lines, /PORTKLANG\s*-\s*(?:NORTH|WEST)\s+[^\n]*?\s{2,}([A-Z][A-Z0-9 ]+?\s*-\s*[A-Z0-9]+)\s{2,}\d{1,2}\s+[A-Z]{3}/i)
      || field(lines, /(?:^|\n)\s*PORTKLANG\s*-\s*(?:NORTH|WEST)\s+[^\n]*?\s+(WAN HAI\s+\d+\s*-\s*[A-Z0-9]+)/im);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 INOX，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "INOX", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  // Nepal Shipping Liner confirmations identify the issuer by its nepalship domain and NSL reference.
  if (/nepalship\.com\.my/i.test(layoutText.slice(0, 3000)) && /BOOKING REF NO\s*:\s*NSL/i.test(layoutText)) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /BOOKING REF NO\s*:\s*(NSL[A-Z0-9-]{5,})/i);
    const volume = /VOLUME\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)\s*(FT|HC|HQ|GP|OT|TK)\b/i.exec(lines);
    const quantity = volume?.[1] || "";
    const containerSizeHint = volume ? sizeFrom(volume[2], volume[3] === "FT" ? "GP" : volume[3]) : undefined;
    const destination = field(lines, /(?:^|\n)\s*POD\s*:\s*([^\n]+?)(?:\s{2,}FPOD\b|$)/im);
    const commodity = field(lines, /(?:^|\n)\s*COMMODITY\s*:\s*([^\n]+?)(?:\s+PAYMENT TERM\b|$)/im);
    const terminal = terminalFrom(field(lines, /(?:^|\n)\s*TERMINAL\s*:\s*(NORTHPORT|WESTPORTS?|KCT|KMT|KPM)\b/im));
    const vesselName = field(lines, /VESSEL NAME\s*:\s*([A-Z][A-Z0-9 -]+?)\s+ETA POL\b/i);
    const voyage = field(lines, /VOY\s*\/\s*ID\s*:\s*([A-Z0-9/.-]+)/i);
    const vessel = [vesselName, voyage].filter(Boolean).join(" ");
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 NEPAL SHIPPING LINER，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "NEPAL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/CORDELIA CONTAINER SHIPPING LINE/i.test(layoutText.slice(0, 2500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking Ref No\.\s*:?\s*(CSXB[A-Z0-9]+)/i)
      || field(lines, /Booking Ref[\s\S]{0,120}?\bNo\s*:\s*(CSXB[A-Z0-9]+)/i);
    const equipment = /Container Type\s*\/\s*Qty\s*:?\s*D?(20|40)(H|HQ|HC|GP|DV|OT|TK)\s*[-–]\s*(\d{1,3})\b/i.exec(lines);
    const oldEquipment = /Container Type\s*(?:\d{1,2}\s*)?\/\s*Qty\s*D(20|40)\s*[-–]\s*(\d{1,3})\b/i.exec(lines);
    const quantity = equipment?.[3] || oldEquipment?.[2] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[1], equipment[2]) : oldEquipment ? `${oldEquipment[1]}GP` as ContainerSize : undefined;
    const destination = field(lines, /Final Destination\s+(?:[A-Z]{2}[A-Z]{3}-)?([A-Z][A-Z -]+)(?:\s*\n|\s+\d+\s+|$)/i)
      || field(lines, /Final Destination\s+(?:[A-Z]{2}[A-Z]{3}-)?([A-Z][A-Z -]+)(?:\n|$)/i)
      || field(lines, /Port of Discharge\s+([A-Z][A-Z -]+)/i);
    const oldCommodity = /\n\s*([A-Z][A-Z ]+)\s*\n\s*23\s+Cargo Type[^\n]*\b24\s+Commodity\s*\n\s*([A-Z][A-Z ]+)\s*(?:\n|$)/i.exec(layoutText);
    const commodity = oldEquipment && oldCommodity ? [oldCommodity[1], oldCommodity[2]].map(part => part.trim()).join(" ")
      : field(lines, /\bCommodity\s*:?\s*([^\n]+?)(?:\s+\d+\s+Container Type|\n|$)/i).replace(/^\d+\s*/, "")
        || field(lines, /\bCommodity\s*\n\s*([A-Z][A-Z ]+?)(?:\s*\n|$)/i);
    const loading = field(lines, /Port Of Loading\s+([^\n]+)/i);
    const terminal = /\bPKGTKMT\b/i.test(loading) || /PKGTKMT-/i.test(loading) ? "WP" : terminalFrom(loading);
    const vesselName = field(lines, /Vessel Name\s*:?\s*([A-Z][A-Z0-9 ]+?)(?:\s+\d+\s+Voyage No\.|\n|$)/i);
    const voyage = field(lines, /Voyage No\.\s*:?\s*([A-Z0-9-]+)/i);
    const vessel = [vesselName, voyage].filter(Boolean).join(" ");
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 CORDELIA，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "CSL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/MSC MEDITERRANEAN SHIPPING COMPANY/i.test(layoutText.slice(0, 3500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /(?:BOOKING REFERENCE[\s\S]{0,150}?|EDI TRANSACTION N\*\s*)(EBKG[A-Z0-9]+)/i)
      || field(lines, /\b(EBKG\d{7,14})\b/i);
    const equipment = /EQUIP\.\s*TYPE\/(?:ISO\/)?NUMBER\s*:?\s*(20|40)\s*(DV|GP|HC|HQ|H|OT|TK)(?:\/\S+)?\s+QUANTITY\s*:?\s*(\d{1,3})\b/i.exec(lines);
    const quantity = field(lines, /TOTAL CONTAINER\s*\(S\)\s*:?\s*(\d{1,3})\b/i) || equipment?.[3] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[1], equipment[2]) : undefined;
    const destination = field(lines, /PORT OF DISCHARGE\s*:?\s*([^\n]+?)(?:\s+EST\. TIME|\n|$)/i);
    const commodity = field(lines, /CARGO DESCRIPTION\s+HS CODE\s+WEIGHT \(KG\)[^\n]*\n\s*([A-Z][A-Z0-9 ,./-]+?)\s+\d{4,}/i);
    const terminal = terminalFrom(field(lines, /GATE IN AT TERMINAL(?:\/DEPOT)?\s*:?\s*([^\n]+)/i));
    const vesselName = field(lines, /VESSEL NAME\s*\/\s*FLAG\s*:?\s*(.+?)(?:\s*\(LLOYDS|\s*\/\s*[A-Z]{2}\b|\n|$)/i);
    const voyage = field(lines, /VOYAGE NUMBER\s*:?\s*([A-Z0-9]+)\b/i);
    const vessel = [vesselName, voyage].filter(Boolean).join(" ");
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 MSC，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "MSC", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/SINOKOR MERCHANT MARINE|www\.sinokor\.co\.kr/i.test(layoutText.slice(0, 5000))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking No\s*:?\s*(SNKO[A-Z0-9-]+)/i);
    const equipment = new RegExp(String.raw`Cntr Q['’]?TY\s*:?\s*(20|40)['’]?\s*(?:(${equipmentType})\s*)?[X×]\s*(\d{1,3})\b`, "i").exec(lines);
    const quantity = equipment?.[3] || "";
    const containerSizeHint = equipment ? equipment[2] ? sizeFrom(equipment[1], equipment[2]) : equipment[1] === "20" ? "20GP" : undefined : undefined;
    const destination = field(lines, /Port of Discharge\s*:?\s*([^,\n]+),/i);
    const commodity = field(lines, /(?:^|\n)\s*Commodity\s*:?\s*([^\n]+)/i);
    const terminal = terminalFrom(field(lines, /(?:PICK UP DEPOT|FULL RETURN|LOADING TERMINAL)\s*:\s*([^\n]+)/i) || (/\b(?:NORTHPORT|WESTPORT|KPM|KMT|KCT)\b/i.exec(lines)?.[0] || ""));
    const vessel = field(lines, /VSL Name\/Voy\s*:?\s*([A-Z][A-Z0-9 ]+?\s*\/\/?\s*\d{3,5}[A-Z]?)/i).replace(/\s*\/\/?\s*/, " ");
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 SINOKOR，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "SNK", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/HAPAG-LLOYD \(MALAYSIA\)/i.test(layoutText.slice(0, 3000))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Our Reference\s*:\s*(\d{6,12})/i);
    const equipment = /Summary\s*:\s*(\d{1,3})\s*[X×]\s*(22|42|45)(GP|OT|TK)\b/i.exec(lines);
    const quantity = equipment ? String(Number(equipment[1])) : "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2] === "22" ? "20" : "40", equipment[3]) : undefined;
    const destination = field(lines, /Import terminal pick up address[\s\S]{0,200}\n\s*([A-Z][A-Z -]+),\s*[A-Z]+\b/i);
    const commodity = field(lines, /Commodity\s+Description\s*:\s*(.+?)(?:\s+HS Code\s*:|\n|$)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 HAPAG-LLOYD，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "HPL", destination, quantity, commodity, terminal: "", vessel: "", containerSizeHint };
  }
  if (/SAMUDERA INTERMODAL SDN BHD/i.test(layoutText.slice(0, 1500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /BOOKING CONFIRMATION\s*:\s*([A-Z0-9-]+)/i);
    const equipment = new RegExp(String.raw`QUANTITY\s*:\s*(\d{1,3})\s*[X×*]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /PORT OF DISCHARGE\s*:\s*([^\n]+?)(?:\s+PLACE OF DELIVERY\s*:|\n|$)/i);
    const commodity = field(lines, /\bCMDTY\s*:\s*([^,\n]+)/i) || field(lines, /(?:^|\n)COMMODITY\s*:\s*([^\n]+)/i);
    const terminal = terminalFrom(field(lines, /RETURN TO \(POL\)\s*:\s*([^\n]+)/i));
    const vessel = field(lines, /LOADING VSL\s*\/\s*VOY\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 SAMUDERA，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "SAMUDERA", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/CU LINES \(MALAYSIA\) SDN BHD/i.test(layoutText.slice(0, 1800))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking No\s*:\s*([A-Z0-9-]+)/i);
    const equipment = /Equipment Type\/Q[’']?ty\s*:\s*(20|40)['’]?\s*([A-Z ]+?)\.\s*[-–]\s*(\d{1,3})\b/i.exec(lines);
    const quantity = equipment?.[3] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[1], equipment[2]) : undefined;
    const destination = field(lines, /Port of Discharging\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i);
    const commodity = field(lines, /Commodity\s*:\s*([^\n]+?)(?:\s+Estimated Weight\s*:|\n|$)/i);
    const terminal = terminalFrom(field(lines, /Full Return CY\s*:\s*([^\n]+?)(?:\s+Full Return Date\s*:|\n|$)/i));
    const vessel = field(lines, /Trunk Vessel\s*:\s*([^\n]+?)(?:\s+ETA\/ETD\s*:|\n|$)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 CU LINES，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "CUL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/NAVIO SHIPPING \(M\)\s*SDN BHD/i.test(layoutText.slice(0, 1600))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Carrier Booking No\.\s*:\s*([A-Z0-9-]+)/i);
    const equipment = new RegExp(String.raw`Booking Volume\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = equipment ? String(Number(equipment[1])) : "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /Port Of Discharges\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i);
    const commodity = field(lines, /(?:^|\n)Commodity\s*:\s*([^/\n]+)/i);
    const terminal = terminalFrom(field(lines, /Port Of Loading\s*:\s*([^\n]+)/i));
    const vessel = field(lines, /Feeder Vessel\s*:\s*([^\n]+)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 NAVIO，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "NAVIO", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/SITC CONTAINER LINES MALAYSIA SDN BHD/i.test(layoutText.slice(0, 1500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking No\.\s*:\s*([A-Z0-9-]+)/i);
    const equipment = new RegExp(String.raw`Quantity\s*:\s*(\d{1,3})\s*[X×*]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /(?:^|\n)POD\s*:\s*([^\n-]+?)(?:-[A-Z]+|\s+ETA\s*:|\n|$)/i);
    const commodity = field(lines, /Commodity\s*:\s*([^\n]+?)(?:\s+Shipping Term\s*:|\n|$)/i);
    const terminal = terminalFrom(field(lines, /(?:^|\n)POL\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i));
    const vessel = field(lines, /Vessel\s*\/\s*Voyage\s*:\s*([^\n]+?)(?:\s+Ship Call No\.\s*:|\n|$)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 SITC，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "SITC", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/Business Unit\s*:\s*Maersk Malaysia|booking with Maersk A\/S/i.test(layoutText.slice(0, 3500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking No\.\s*:\s*(\d{9})\b/i) || field(lines, /^\s*(\d{9})\s+Print Date\s*:/im);
    const equipment = /Quantity\s+Size\/Type\/Height[^\n]*\n\s*(\d{1,3})\s+(20|40)\s+(DR\s*Y|GP|OT|TK|TANK)\s+(9\s*6|8\s*6)\b/i.exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? /\b(?:OT|TK|TANK)\b/i.test(equipment[3]) ? sizeFrom(equipment[2], equipment[3])
      : equipment[2] === "40" && equipment[4].replace(/\s/g, "") === "96" ? "40HQ" : sizeFrom(equipment[2], equipment[3].replace(/\s/g, "")) : undefined;
    const destination = field(lines, /\bTo\s*:\s*([^,\n]+),\s*[A-Z]/i);
    const commodity = field(lines, /Commodity Description\s*:\s*([^\n]+)/i).replace(/\bP\s+el\s+lets\b/i, "Pellets");
    const terminal = terminalFrom(field(lines, /(?:^|\n)\s*(Westport|Northport)\b/i));
    const firstLeg = /\bFEF\s+([A-Z][A-Z ]+?)\s+(\d{3}[A-Z])\b/i.exec(lines);
    const vessel = firstLeg ? `${firstLeg[1]} ${firstLeg[2]}` : "";
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 MAERSK，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "MSK", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/CMA CGM MALAYSIA SDN BHD/i.test(layoutText) && /Booking Number\s*:\s*CNB\w+/i.test(layoutText)) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking Number\s*:\s*([A-Z0-9-]+)/i);
    const equipment = new RegExp(String.raw`(?:^|\n)Quantity\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /Port Of Discharge\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i);
    const commodity = field(lines, /HS Commodity\s*:\s*(.+?)(?:\s+Container Grade\s*:|\n|$)/i);
    const terminal = terminalFrom(field(lines, /Loading Terminal\s*:\s*([^\n]+?)(?:\s+VGM Cut-Off|\n|$)/i));
    const vessel = field(lines, /Vessel\/Voyage\s*:\s*([^\n]+?)(?:\s+Port Cut-Off Date\s*:|\n|$)/i).replace(/\s*\/\s*/, " ");
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 CMA CGM，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "CMA", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/FROM\s*:\s*COSCO SHIPPING Lines|Customer provided SCAC:\s*COSU/i.test(layoutText.slice(0, 4000))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /BOOKING NUMBER\s*:\s*([A-Z0-9-]+)/i);
    const equipment = new RegExp(String.raw`TOTAL BOOKING CONTAINER\s+(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const destination = field(lines, /PORT OF DISCHARGE\s*:\s*([^/\n]+)/i);
    const commodity = field(lines, /CARGO DESCRIPTION\s*:\s*([^\n]+)/i);
    const loading = field(lines, /PORT OF LOADING\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i);
    const fullReturn = field(lines, /FULL RETURN LOCATION\s*:\s*([^\n]+)/i);
    const terminal = terminalFrom(loading) || terminalFrom(fullReturn)
      || (/Container Terminal 1/i.test(loading) && /FULL RETURN ADDRESS:[\s\S]{0,180}\bNorth Port\b/i.test(lines) ? "NP" : "");
    const vessel = field(lines, /INTENDED VESSEL\/VOYAGE\s*:\s*([^\n]+?)(?:\s+ETD\s*:|\n|$)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 COSCO，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "COSCO", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/Carrier Code\s+HAL\b|Carrier\/Agent\s+HEUNG[ -]?A LINE/i.test(layoutText)) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking No\s+([A-Z0-9-]{8,})\b/i);
    // HEUNG-A also prints a plain count such as "Cntr Q'TY 20'x1", without an equipment type.
    const equipment = new RegExp(String.raw`Cntr Q['’]?TY\s+(20|40)['’]?\s*(?:(${equipmentType})\s*)?[X×]\s*(\d{1,3})\b`, "i").exec(lines);
    const quantity = equipment?.[3] || "";
    const containerSizeHint = equipment ? equipment[2] ? sizeFrom(equipment[1], equipment[2]) : equipment[1] === "20" ? "20GP" : undefined : undefined;
    const destination = field(lines, /Port of Discharge\s+([^\n,]+)(?:,\s*[^\n]+)?/i);
    const commodity = field(lines, /Commodity\s+(.+?)\s+Cargo Weight\b/i);
    const terminal = terminalFrom(field(lines, /\bTerminal\s+([^\n]+?)(?:\s+Port of Transit|\n|$)/i));
    const vessel = field(lines, /VSL Name\s*\/\s*Voy\s+([^\n]+)/i).replace(/\s*\/\/\s*/g, " ");
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 HEUNG-A LINE，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "HAL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/benline\.com|BEN LINE AGENCIES/i.test(layoutText.slice(0, 3500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    // Some BEN PDFs use a font without usable Unicode mapping for field labels.
    // The values remain readable, so use nearby intact markers and row order.
    const booking = field(lines, /Booking No\.\s*:\s*([A-Z0-9-]+)/i)
      || field(lines, /:\s*([A-Z0-9-]{12,})\s+(?:KMT|KCT|KPM) Code\s*:/i);
    const equipment = new RegExp(String.raw`Quantity\s*\/\s*Equipment Type\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines)
      || new RegExp(String.raw`:\s*(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = equipment?.[1] || "";
    const containerSizeHint = equipment ? sizeFrom(equipment[2], equipment[3]) : undefined;
    const rows = lines.split("\n").map(row => row.trim());
    const vesselRow = rows.findIndex(row => /Close FCL\s*:/.test(row));
    const rowValue = (index: number) => index >= 0 ? field(rows[index] || "", /:\s*(.+?)(?:\s+ETA\s*:|\s+Close FCL\s*:|$)/i) : "";
    const destination = field(lines, /Port of Discharge\s*:\s*([^\n]+?)(?:\s+ETA\s*:|\n|$)/i)
      || (vesselRow >= 0 && /^[A-Z][A-Z ]{2,}$/.test(rowValue(vesselRow + 2)) ? rowValue(vesselRow + 2) : "");
    const commodity = field(lines, /Cargo Description\s*:\s*([^\n]+)/i)
      || (rows.findIndex(row => /\bKGS\s*\/\s*[\d.]+\s*CBM\b/i.test(row)) >= 0
        ? rowValue(rows.findIndex(row => /\bKGS\s*\/\s*[\d.]+\s*CBM\b/i.test(row)) + 1) : "");
    const terminalCode = field(lines, /\b(KMT|KCT|KPM)\s+Code\s*:/i);
    const terminal = terminalFrom(terminalCode);
    const vessel = field(lines, /Vessel\s*\/\s*Voy\. No\.\s*:\s*([^\n]+?)(?:\s+Close FCL\s*:|\n|$)/i)
      || rowValue(vesselRow);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 BEN LINE，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "BEN", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/OPERATOR CODE\s*:\s*TSC\b|T\.\s*S\.\s*Lines bill of lading/i.test(layoutText.slice(0, 4000))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /BOOKING REF\s*:\s*([A-Z0-9-]+)/i);
    const volume = new RegExp(String.raw`VOLUME\s*:\s*(\d{1,3})\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const quantity = volume?.[1] || "";
    const containerSizeHint = volume ? sizeFrom(volume[2], volume[3]) : undefined;
    const destination = field(lines, /POL\/POD\/FINAL DESTINATION\s*:\s*[^/\n]+\/\s*([^/\n]+)/i);
    const commodity = field(lines, /COMMODITY\s*:\s*([^\n]+)/i);
    const loading = field(lines, /FROM\s+([^\n]+)/i).toUpperCase();
    const terminal = terminalFrom(loading);
    const vessel = field(lines, /(?:^|\n)VESSEL\s+([^\n]+)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 T.S. CONTAINER，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "TSL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/LINE CODE\s*:\s*EMC\b|CARRIER\s*:\s*EVERGREEN LINE/i.test(layoutText.slice(0, 3500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /BOOKING NO\.\s*:\s*([A-Z0-9-]+)/i);
    const quantity = field(lines, /(?:^|\n)(\d{1,3})\s*\/\s*\d{2}['’]?\s*[A-Z -]+\s+\d[\d,.]*\+/i);
    const destination = field(lines, /PORT OF DISCHARGING\s*:\s*([^,\n]+)/i);
    const commodity = field(lines, /(?:^|\n)COMMODITY\s*:\s*([^\n]+)/i);
    const loading = field(lines, /PORT OF LOADING\s*:\s*([^\n]+)/i).toUpperCase();
    const terminal = terminalFrom(loading);
    const vessel = field(lines, /VESSEL\/VOYAGE\s*:\s*([^\n]+?)(?:\s+Estimated Carbon Emission|\n|$)/i);
    const equipment = new RegExp(String.raw`(?:^|\n)\d{1,3}\s*\/\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const containerSizeHint = equipment ? sizeFrom(equipment[1], equipment[2]) : undefined;
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 EVERGREEN LINE，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "EMC", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/Ocean Network Express \(Malaysia\)/i.test(compact + "\n" + layoutText.slice(0, 1500))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking No\s*:\s*([A-Z0-9-]+)/i);
    const quantity = field(lines, /Equipment Type\/Q[’']?ty\s*:\s*[^\n]*?[-–]\s*(\d{1,3})\b/i);
    const equipment = field(lines, /Equipment Type\/Q[’']?ty\s*:\s*([^\n]+)/i);
    const type = new RegExp(String.raw`\b(20|40)['’]?\s*((?:DRY\s+)?${equipmentType})\b`, "i").exec(equipment);
    const containerSizeHint = type ? sizeFrom(type[1], type[2]) : undefined;
    const destination = field(lines, /Port of Discharging\s*:\s*([^\n]+?)\s+Terminal\s*:/i);
    const commodity = field(lines, /Commodity\s*:\s*([^\n]+?)\s+Estimated Weight\s*:/i);
    const portTerminal = field(lines, /Port of Loading\s*:[^\n]*?\s+Terminal\s*:\s*([A-Z]+)/i).toUpperCase();
    const terminal = terminalFrom(portTerminal);
    const vessel = field(lines, /Trunk Vessel\s*:\s*([^\n]+?)\s+Latest ETA\/ETD\s*:/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 ONE，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "ONE", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/QEL SHIPPING SERVICES SDN/i.test(compact + "\n" + layoutText.slice(0, 1800))) {
    // QEL's confirmation lists a different vessel operator; use the booking issuer.
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /BOOKING\.REF_NO\s*:\s*([A-Z0-9-]+)/i);
    const quantity = field(lines, /VOLUME\s*:\s*(\d{1,3})\s*[X×]\s*\d{2}/i);
    const volume = new RegExp(String.raw`VOLUME\s*:\s*\d{1,3}\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const containerSizeHint = volume ? sizeFrom(volume[1], volume[2]) : undefined;
    const destination = field(lines, /PORT OF DISCHARGE\s*:\s*([A-Z][A-Z \-]+?)(?:\s+ETA\s*:|\n|$)/i);
    const commodity = field(lines, /DESC\. OF GOODS\s*:\s*([^\n]+)/i).replace(/\s*\(HS CODE\s*:.*$/i, "").trim();
    const terminalCode = field(lines, /TERMINAL\s*:\s*(KCT|KMT|KPM|NORTHPORT|WESTPORTS?)\b/i).toUpperCase();
    const terminal = terminalFrom(terminalCode);
    const vessel = field(lines, /MOTHER VESSEL\s*:\s*([^\n]+)/i);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 QEL SHIPPING，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "QEL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  if (/Container Operator\s*:\s*YML\b|my\.yangming\.com/i.test(compact + "\n" + layoutText.slice(0, 3000))) {
    const lines = layoutText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
    const booking = field(lines, /Booking Confirmation\s*:\s*(I\d{7,12})\b/i);
    const quantity = field(lines, /Cntrs Request\s*:\s*(\d{1,3})\s*[X×]\s*\d{2}/i);
    const request = new RegExp(String.raw`Cntrs Request\s*:\s*\d{1,3}\s*[X×]\s*(20|40)['’]?\s*(${equipmentType})\b`, "i").exec(lines);
    const containerSizeHint = request ? sizeFrom(request[1], request[2]) : undefined;
    const commodity = field(lines, /(?:^|\n)Commodity\s*:\s*([^\n]+)/i);
    const discharge = field(lines, /Port of Discharge\s*:\s*([^\n]+)/i);
    const destination = field(discharge, /(?:[A-Z]{5}-)?([A-Z][A-Z \-]+?)(?:\s*,\s*[A-Z]+|\s+\d{4}\/|$)/i);
    const vessel = field(lines, /VESSEL NAME[^\n]*\n\s*(.+?)\s+MYPKG-PORT KLANG\b/i);
    const ladenReturn = field(lines, /Laden Cntr Return to\s*:\s*([^\n]+)/i).toUpperCase();
    const terminal = terminalFrom(ladenReturn);
    if (!booking || !quantity || Number(quantity) < 1 || Number(quantity) > 100) throw Error("已识别 YANG MING，但无法读取订舱号或柜量，请核对 PDF");
    return { booking, carrier: "YML", destination, quantity, commodity, terminal, vessel, containerSizeHint };
  }
  // A WAN HAI booking can sail on a vessel named INTERASIA HORIZON.
  // Identify the carrier from its operator code, never from the vessel name.
  const operator = field(compact, /Operator Code\s*:\s*(?:Operator Code\s*:\s*)?(IAL|WHS)\b/i).toUpperCase();
  const ial = operator === "IAL" || (!operator && /\bINTERASIA (?:LINES?|SHIPPING)\b/i.test(compact));
  const whl = operator === "WHS" || (!operator && /WAN HAI LINES/i.test(compact));
  if (!ial && !whl) throw Error("目前不支持这份 booking PDF 的格式，请核对船司及文件是否为文字版订舱确认书");
  const booking = ial ? field(compact, /Book No(?:\s+Book No)?\s*\n\s*([A-Z0-9-]{6,})/i)
    : field(compact, /Booking Number\s*:\s*([A-Z0-9-]{6,})/i);
  const destination = ial ? field(compact, /POD:\s*(?:POD:\s*)?([^\n]+)/i).replace(/\s*,\s*CHINA\s*$/i, "")
    : field(compact, /(?:Port of Discharge|Place of Delivery)\s*:\s*([A-Z][A-Z \-]+?)(?:\s+ETA\s*:|\n|$)/i);
  const vessel = ial ? field(compact, /Vessel Name(?:\s+Vessel Name)?\s*\n\s*([^\n]+)/i)
    : field(compact, /Mother Vessel\s*:\s*([^\n]+)/i);
  const quantity = ial ? field(compact, /Container Volume(?:\s+Container Volume)?\s*\n\s*(\d{1,3})\b/i)
    : field(compact, /\b(?:20|40|45)['’]?\s+(?:86|96|8['’]6|9['’]6)\s+(\d{1,3})\b/i);
  const ialEquipment = /Container Type(?:\s+Container Type)?\s+Container Size(?:\s+Container Size)?\s+Container Height(?:\s+Container Height)?\s+Container Volume(?:\s+Container Volume)?\s*\n\s*([A-Z]{2,8})\s+(20|40)\s+(86|96)\s+\d{1,3}\b/i.exec(layoutText);
  const whlEquipment = /Ctnr Type[^\n]*\n\s*(?:COC|SOC)\s+(General Purpose|Open Top|Tank|[A-Z]{2,8})\s+(20|40)['’]?\s+(86|96)\s+\d{1,3}\b/i.exec(layoutText);
  const sizeForHeight = (length: string, type: string, height: string): ContainerSize | undefined =>
    /\b(?:TANK|TK|OPEN[ -]?TOP|OT)\b/i.test(type) ? sizeFrom(length, type)
      : height === "96" && length === "40" ? "40HQ" : `${length}GP` as ContainerSize;
  const containerSizeHint = ialEquipment ? sizeForHeight(ialEquipment[2], ialEquipment[1], ialEquipment[3])
    : whlEquipment ? sizeForHeight(whlEquipment[2], whlEquipment[1], whlEquipment[3]) : undefined;
  let commodity = ial ? field(compact, /Commodity(?:\s+Commodity)?\s*\n([\s\S]*?)\s*\n\s*Remark(?:\s+Remark)?\b/i).replace(/\s*\n\s*/g, " ")
    : field(compact, /Commodity\s*:\s*([^\n]+)/i);
  commodity = commodity.trim().replace(/\s+/g, " ").replace(/\bETHY LENE\b/g, "ETHYLENE");
  const terminalCode = field(compact, /Terminal\s*:\s*(?:Terminal\s*:\s*)?(KCT|KMT|KPM|NORTHPORT|WESTPORTS?)\b/i).toUpperCase();
  const loading = field(compact, /(?:POL|Port of Loading)\s*:\s*(?:POL\s*:\s*)?([^\n]+)/i).toUpperCase();
  const terminal = terminalFrom(terminalCode) || terminalFrom(loading);
  if (!booking) throw Error(`已识别 ${ial ? "INTERASIA" : "WAN HAI"}，但无法读取订舱号；请检查 PDF 是否为 Booking Confirmation`);
  if (!quantity || !/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 100) throw Error(`已识别 ${ial ? "INTERASIA" : "WAN HAI"}，但无法读取柜量；请检查 PDF 的货柜资料`);
  return { booking, carrier: ial ? "IAL" : "WHL", destination, quantity, commodity, terminal, vessel, containerSizeHint };
}

export function parseBookingText(text:string,layoutText=text):BookingFields{return {...parseBookingFields(text,layoutText),pickupDepot:bookingDepot(layoutText)||bookingDepot(text)};}

export async function readBookingPdf(file: File): Promise<BookingFields> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw Error("请选择 PDF booking 文件");
  if (file.size > 8 * 1024 * 1024) throw Error("PDF 文件不能超过 8 MB");
  // The PDF remains in the browser. No booking document is uploaded to our server.
  // @ts-expect-error The PDF reader is served as a static browser module.
  const pdf = await import(/* webpackIgnore: true */ /* @vite-ignore */ "/vendor/pdfjs/pdf.mjs").catch(() => { throw Error("PDF 阅读器无法加载。请刷新网站后重试"); });
  pdf.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";
  const document = await pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let content = "", layoutContent = "";
  for (let page = 1; page <= Math.min(document.numPages, 8); page++) {
    const items = (await (await document.getPage(page)).getTextContent()).items as Array<{ str: string; hasEOL: boolean; transform: number[] }>;
    content += items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("") + "\n";
    const lines: Array<{ y: number; items: typeof items }> = [];
    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = item.transform[5];
      let line = lines.find(entry => Math.abs(entry.y - y) < 2);
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push(item);
    }
    layoutContent += lines.sort((a, b) => b.y - a.y)
      .map(line => line.items.sort((a, b) => a.transform[4] - b.transform[4]).map(item => item.str).join(" ")).join("\n") + "\n";
  }
  await document.destroy();
  if (!content.trim()) throw Error("PDF 没有可读取的文字，请提供文字版 booking");
  return parseBookingText(content, layoutContent);
}
