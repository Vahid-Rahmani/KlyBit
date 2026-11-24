import type { Metadata } from "next";
import "./korrektur.css";

export const metadata: Metadata = {
  title: "Schreibwerkstatt · Deutsch · Klybit",
  description: "Schreibe auf Deutsch und sieh sofort, welche Fehler im Text stecken, warum, und welches Modul sie trainiert.",
};

export default function WritingLayout({ children }: { children: React.ReactNode }) { return children; }
