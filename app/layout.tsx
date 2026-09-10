import type { Metadata } from "next";
import { Saira, Saira_Condensed } from "next/font/google";
import { AppProvider } from "@/components/providers/app-provider";
import "./globals.css";

const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const sairaCondensed = Saira_Condensed({
  variable: "--font-saira-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "NanoPrint — Gestion d’imprimerie",
    template: "%s · NanoPrint",
  },
  description: "Plateforme professionnelle de pilotage d’imprimerie.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${saira.variable} ${sairaCondensed.variable}`}
    >
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
