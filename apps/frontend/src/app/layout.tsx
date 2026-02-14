import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "@/components/SessionProvider";
import { RecordLoginSuccess } from "@/components/RecordLoginSuccess";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "myInvestments - Portfolio Manager",
  description:
    "Track your investment portfolio, monitor market conditions, and get personalized recommendations.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <SessionProvider>
          <ToastProvider>
            <RecordLoginSuccess />
            {children}
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
