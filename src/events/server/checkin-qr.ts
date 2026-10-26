import encodeQR from "qr";

const QR_BORDER = 2;
const QR_ERROR_CORRECTION = "medium";
const EMAIL_QR_SCALE = 6;

/** Render the check-in QR used by the payment email. */
export function createCheckinQrGif(registrationId: string): Uint8Array {
  return encodeQR(registrationId, "gif", {
    scale: EMAIL_QR_SCALE,
    border: QR_BORDER,
    ecc: QR_ERROR_CORRECTION,
  });
}

function appendRowRuns(row: readonly boolean[], y: number, runs: string[]): void {
  const size = row.length;
  let x = 0;

  while (x < size) {
    if (row[x] === true) {
      const start = x;

      while (x < size && row[x] === true) {
        x += 1;
      }

      const run = x - start;
      runs.push(`M${start} ${y}h${run}v1h-${run}z`);
    } else {
      x += 1;
    }
  }
}

/** Render a registration check-in QR as a compact inline SVG. */
export function createCheckinQrSvg(registrationId: string): string {
  const modules = encodeQR(registrationId, "raw", {
    scale: 1,
    border: QR_BORDER,
    ecc: QR_ERROR_CORRECTION,
  });
  const size = modules.length;
  const runs: string[] = [];

  for (let y = 0; y < size; y += 1) {
    const row = modules[y];

    if (row !== undefined) {
      appendRowRuns(row, y, runs);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` role="img" aria-hidden="true" focusable="false" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
    `<path d="${runs.join("")}" fill="#000"/>`,
    `</svg>`,
  ].join("");
}
