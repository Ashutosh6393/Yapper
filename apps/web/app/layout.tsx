import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

// Brand type: Bricolage Grotesque (distinctive display) + Hanken Grotesk (clean humanist body).
// Self-hosted via next/font — no runtime external requests. Exposed as CSS vars that globals.css
// feeds into the shared --font-display / --font-sans theme tokens (app + landing stay coherent).
const displayFace = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});
const sansFace = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-face",
  display: "swap",
});

export const metadata = {
  title: "Yapper",
  description: "Collaborative real-time note-taking",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFace.variable} ${sansFace.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
