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
              <Link className="header-link" href="/learn/">Learn</Link>
              <Link className="header-link" href="/practice/">Practice</Link>
              <Link className="header-link" href="/test/">Test</Link>
              <Link className="header-link" href="/progress/">Progress</Link>
              <Link className="header-link" href="/history/">History</Link>
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
