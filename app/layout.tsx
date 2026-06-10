import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deka Lens",
  description: "Legal precedent search aggregator for Thai Supreme Court judgments",
  icons: {
    icon: [
      { url: "/deka-lens-emblem.png", type: "image/png" }
    ],
    shortcut: "/deka-lens-emblem.png",
    apple: "/deka-lens-emblem.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
