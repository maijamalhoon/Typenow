import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { ThemeShowcase } from "@/components/theme-showcase";

export const metadata = {
  title: `Design system · ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return (
    <section className="design-page">
      <div className="design-heading">
        <div>
          <span className="eyebrow">Internal review · Phase 0</span>
          <h1>Design system</h1>
          <p>Tokens and components, shown side by side in both themes.</p>
        </div>
        <Link className="text-link" href="/">Back to home</Link>
      </div>
      <ThemeShowcase />
      <section className="design-notes" aria-label="Design decisions">
        <p><strong>Type:</strong> self-hosted Source Sans 3; optional Atkinson Hyperlegible as a legibility option. Font files ship locally; no external font requests.</p>
        <p><strong>Scale:</strong> 14 / 16 / 20 / 24 / 32 / 48 / 64 px. Typing defaults to 32 px Standard and 48 px Kids; users can adjust it in Settings.</p>
        <p><strong>Spacing:</strong> 8 px grid. One 8 px radius and one shadow level. Motion is under 150 ms and respects reduced motion.</p>
        <p><strong>Focus:</strong> the focus ring contrast is measured against both canvas and surface; color contrast ratios are calculated from the rendered theme tokens.</p>
      </section>
    </section>
  );
}
