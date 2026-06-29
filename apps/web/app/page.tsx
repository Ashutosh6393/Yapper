import type { Metadata } from "next";
import LandingPage from "./_landing/LandingPage";

export const metadata: Metadata = {
  title: "Yapper — Real-time collaborative notes",
  description:
    "Multiplayer rich-text editing with live cursors and real identities. See who's reading, who's typing — and pull a note private in one click.",
};

export default function Home() {
  return <LandingPage />;
}
