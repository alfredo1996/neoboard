import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NeoBoard",
  description:
    "Open-source dashboards for Neo4j + PostgreSQL — the modern alternative to NeoDash",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "NeoBoard",
    description: "Open-source dashboards for Neo4j + PostgreSQL",
    images: [{ url: "/og-image.svg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeoBoard",
    description: "Open-source dashboards for Neo4j + PostgreSQL",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("neoboard-theme");var d=(p==="dark")||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
