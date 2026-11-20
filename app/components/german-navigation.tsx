"use client";

import { ArrowLeft, BookOpen, FolderSearch, Languages, Network } from "lucide-react";
import { SimpleNavigation } from "@/app/components/simple-learning";

export type GermanNavKey = "grammatik" | "german" | "grammar-cases" | "satztat";

/** One sidebar for every German page: same order, short labels, one language. */
export function GermanNavigation({ active }: { active: GermanNavKey }) {
  return <SimpleNavigation active={active} items={[
    { key: "grammatik", label: "Grammatik A1–B2", href: "/german/grammatik", icon: <Languages size={18} /> },
    { key: "german", label: "Deutsch für IT", href: "/german", icon: <BookOpen size={18} /> },
    { key: "grammar-cases", label: "Grammatik-Fälle", href: "/german/grammar-cases", icon: <FolderSearch size={18} /> },
    { key: "satztat", label: "Netzwerk-Fälle", href: "/german/satztat", icon: <Network size={18} /> },
    { key: "home", label: "Alle Lernpfade", href: "/", icon: <ArrowLeft size={18} /> },
  ]} />;
}
