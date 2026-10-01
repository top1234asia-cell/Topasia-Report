"use client";

import { useState } from "react";

export function BookingDropzone({ onFile, disabled = false, compact = false }: {
  onFile: (file: File) => void; disabled?: boolean; compact?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return <label
    onDragOver={event => { event.preventDefault(); if (!disabled) setHovered(true); }}
    onDragLeave={event => { event.preventDefault(); setHovered(false); }}
    onDrop={event => {
      event.preventDefault(); setHovered(false);
      if (!disabled && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]);
    }}
    className={`block cursor-pointer rounded-lg border-2 border-dashed px-4 text-center transition-colors ${compact ? "py-2" : "py-5"} ${hovered ? "border-[#0b756f] bg-[#e7f6f1]" : "border-[#89b6bb] bg-[#f7fbfb] hover:bg-[#e9f5f2]"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
  >
    <span className="block font-semibold text-[#0b756f]">拖入 Booking PDF，或点击选择文件</span>
    <span className="mt-1 block text-xs text-[#607a86]">WAN HAI / INTERASIA / YANG MING / QEL / ONE / EVERGREEN · 提取七项资料后核对保存</span>
    <input aria-label="上传 Booking PDF" type="file" accept="application/pdf,.pdf" disabled={disabled} className="sr-only"
      onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
  </label>;
}
