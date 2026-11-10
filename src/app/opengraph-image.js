import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* ImageResponse supports native img nodes; next/image is not supported in its JSX renderer. */
/* eslint-disable @next/next/no-img-element */

export const alt = "Dr. Beauty by Dr. Radwa Hassan — beauty and skincare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public/icons/svg/logo-SVG/logo-SVG.svg"), "utf8");
  const sanitizedLogo = logo.replace(/<\?xml[\s\S]*?\?>/i, "").replace(/<!DOCTYPE[\s\S]*?>/i, "");
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(sanitizedLogo).toString("base64")}`;

  return new ImageResponse(
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#fff9f7",
      color: "#352628",
      fontFamily: "serif",
    }}>
      <div style={{
        width: 1080,
        height: 510,
        display: "flex",
        alignItems: "center",
        padding: "64px 78px",
        borderRadius: 34,
        border: "1px solid #ead8d9",
        background: "linear-gradient(135deg, #fffdfc 0%, #faeceb 100%)",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, width: 730 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 74, height: 74, alignItems: "center", justifyContent: "center", borderRadius: 37, border: "1px solid #ead8d9", background: "#fff" }}>
              <img alt="Dr. Beauty logo" src={logoDataUri} width="50" height="50" />
            </div>
            <span style={{ fontFamily: "sans-serif", fontSize: 17, letterSpacing: 4, color: "#9a5968", textTransform: "uppercase" }}>By Dr. Radwa Hassan</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 82, lineHeight: 1, fontWeight: 600, letterSpacing: -2 }}>Dr. Beauty</div>
            <div style={{ fontFamily: "sans-serif", fontSize: 25, lineHeight: 1.4, color: "#755e61" }}>Thoughtful beauty & skincare, chosen with care.</div>
          </div>
          <div style={{ width: 92, height: 4, borderRadius: 4, background: "#d77b8e" }} />
        </div>
        <div style={{ display: "flex", width: 210, height: 210, alignItems: "center", justifyContent: "center", borderRadius: 105, border: "1px solid #e9cdd1", background: "#f5dfe1", color: "#a7566a", fontSize: 110, fontWeight: 500 }}>✿</div>
      </div>
    </div>,
    size,
  );
}
