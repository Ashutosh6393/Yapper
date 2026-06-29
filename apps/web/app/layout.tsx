import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Yapper",
  description: "Collaborative real-time note-taking",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
