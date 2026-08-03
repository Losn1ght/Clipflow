import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clipflow",
  description: "Private clipping operations dashboard",
  icons: {
    icon: "/clipflow-logo.svg",
    shortcut: "/clipflow-logo.svg",
    apple: "/clipflow-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark h-full antialiased ${spaceGrotesk.variable}`}>
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}

