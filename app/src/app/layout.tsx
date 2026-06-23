import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
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
      {/* No font className here — the design system's self-hosted Inter is
          applied to `body` via the `font-body` token in globals.css, so we
          don't pull a second copy of Inter from Google Fonts (#1059). */}
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
