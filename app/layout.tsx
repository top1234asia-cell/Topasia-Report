import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "送柜计划工作台 | Topasia",
  description: "记录、更新和导出物流送柜计划。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
