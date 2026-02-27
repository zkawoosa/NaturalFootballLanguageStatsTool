import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NFL Query",
  description: "Natural-language NFL stats query app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
