import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CTRL+SHIFT / Signal Mirror",
  description: "A live webcam-driven visual instrument for projection, performance, and interactive installation.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
