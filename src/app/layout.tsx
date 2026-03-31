import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { ThemeToggle } from "./theme-toggle.tsx";
import "./globals.css";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "NFL Query",
  description: "Natural-language NFL stats query app backed by nflverse snapshot data",
};

const themeBootScript = `
(() => {
  try {
    const storedTheme = window.localStorage.getItem("nfl-query-theme");
    const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${monoFont.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
