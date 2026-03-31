import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import OfflineOverlay from "@/components/OfflineOverlay";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "TransBridge — 실시간 의료 통역",
  description: "1초 만에 시작되는 11개 언어 실시간 의료 통역 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <OfflineOverlay />
        {children}
      </body>
    </html>
  );
}
