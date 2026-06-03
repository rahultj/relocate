import "server-only";
import QRCode from "qrcode";

// QR codes for the share sheet. SVG so they print crisp at any size. Near-black
// on transparent for max scannability (colored QRs hurt scan reliability) while
// still sitting cleanly on the Weave card background.
export async function qrSvg(data: string): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#2A2A2A", light: "#00000000" },
  });
}
