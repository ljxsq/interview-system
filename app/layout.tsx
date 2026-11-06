import type { Metadata } from "next";
import "./globals.css";

import { SceneBackground } from "@/components/scene-background";

export const metadata: Metadata = {
  title: "智能面试系统",
  description:
    "根据简历与岗位描述生成面试题，录制视频作答并输出多维评分报告。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-xuan font-sans text-ink">
        <SceneBackground />
        {children}
      </body>
    </html>
  );
}
