import localFont from "next/font/local";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

const sourceSans = localFont({
  src: "../../public/fonts/SourceSans3-Variable.ttf",
  variable: "--font-source-sans",
  display: "swap",
  weight: "200 900",
});

const atkinson = localFont({
  src: [
    { path: "../../public/fonts/AtkinsonHyperlegible-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/AtkinsonHyperlegible-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-atkinson",
  display: "swap",
  preload: false,
});

export const metadata = {
  title: PRODUCT_NAME,
  description: "A quiet place to build a steady typing practice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${atkinson.variable}`}>
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link aria-label={`${PRODUCT_NAME} home`} className="wordmark" href="/">
              {PRODUCT_NAME}
            </Link>
            <nav aria-label="Primary">
              <Link className="header-link" href="/history/">History</Link>
              <Link className="header-link" href="/design-system/">Design system</Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>English · Keyboard-first</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
