import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { FeedbackProvider } from "@/components/uiFeedback";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";

const manrope = localFont({ src: "./fonts/manrope.woff2", variable: "--font-manrope", weight: "400 800", display: "swap" });
const jetbrains = localFont({ src: "./fonts/jetbrains-mono.woff2", variable: "--font-jetbrains", weight: "400 700", display: "swap" });

export const metadata: Metadata = {
  title: { default: "STaR — Stranded Train Risk", template: "%s · STaR" },
  description: "Collaborative stranded train risk management: live timers, the risk matrix, plans A/B/C and the RIO evacuation checklist.",
};

export const viewport: Viewport = { themeColor: "#0b0e13", colorScheme: "dark light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${manrope.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <FeedbackProvider>
          <AppShell>{children}</AppShell>
        </FeedbackProvider>
      </body>
    </html>
  );
}
