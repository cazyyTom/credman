import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CredMan — payments, spending and coins",
  description:
    "Pay your card bill, watch where the money goes, and spend the coins you earn.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1219",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>
        {/* Skip link: the filter bar is long, and a keyboard user should be able
            to get past it to the payments table in one press. */}
        <a href="#payments" className="skip">
          Skip to payments
        </a>
        <main id="payments">{children}</main>
        <style>{`
          .skip{
            position:absolute;
            left:var(--space-4);
            top:-48px;
            z-index:100;
            padding:var(--space-2) var(--space-4);
            background:var(--indigo-500);
            color:#fff;
            border-radius:var(--radius-md);
            font-size:var(--text-sm);
            text-decoration:none;
            transition:top var(--dur-fast) var(--ease);
          }
          .skip:focus{top:var(--space-4)}
          main{
            max-width:1440px;
            margin-inline:auto;
            padding:var(--space-6) var(--space-5) var(--space-12);
          }
          @media (max-width:560px){
            main{padding:var(--space-4) var(--space-3) var(--space-10)}
          }
        `}</style>
      </body>
    </html>
  );
}
