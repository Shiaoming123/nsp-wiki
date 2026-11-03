import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "查无此地 · 生存手册",
  description: "物品、任务、敌怪、地图与玩家夯拉榜攻略。",
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
