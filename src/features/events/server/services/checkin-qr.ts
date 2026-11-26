// @boundary server
import { encodeQR } from "qr";

const QR_BORDER = 2;
const QR_ERROR_CORRECTION = "medium";
const EMAIL_QR_SCALE = 6;

/**
 * Max renders retained per memo. Registration ids are immutable, so results
 * never need invalidation; the cap just bounds memory for long-lived processes.
 */
const QR_MEMO_LIMIT = 256;

interface QrMemo<TRender> {
  get: (id: string) => TRender | undefined;
  set: (id: string, value: TRender) => void;
}

/** Bounded LRU memo around a deterministic, id-keyed renderer. */
function createQrMemo<TRender>(): QrMemo<TRender> {
  const entries = new Map<string, TRender>();

  return {
    get: (id: string): TRender | undefined => {
      const value = entries.get(id);

      if (value === undefined) {
        return undefined;
      }

      // Re-insert so the least-recently-used entry is evicted first.
      entries.delete(id);
      entries.set(id, value);
      return value;
    },
    set: (id: string, value: TRender) => {
      entries.set(id, value);

      if (entries.size > QR_MEMO_LIMIT) {
        const oldest = entries.keys().next().value;

        if (oldest !== undefined) {
          entries.delete(oldest);
        }
      }
    },
  };
}

const gifMemo = createQrMemo<Uint8Array>();
const svgMemo = createQrMemo<string>();

/** Render the check-in QR used by the payment email. */
export function createCheckinQrGif(registrationId: string): Uint8Array {
  const cached = gifMemo.get(registrationId);

  if (cached !== undefined) {
    // Callers own their buffer, as they did before memoization.
    return new Uint8Array(cached);
  }

  const gif = encodeQR(registrationId, "gif", {
    scale: EMAIL_QR_SCALE,
    border: QR_BORDER,
    ecc: QR_ERROR_CORRECTION,
  });
  // Keep the cached buffer private: callers own the buffer they receive.
  gifMemo.set(registrationId, new Uint8Array(gif));
  return gif;
}

function appendRowRuns(row: readonly boolean[], rowIndex: number, runs: string[]) {
  const size = row.length;
  let column = 0;

  while (column < size) {
    if (row[column] === true) {
      const start = column;

      while (column < size && row[column] === true) {
        column += 1;
      }

      const run = column - start;
      runs.push(`M${start} ${rowIndex}h${run}v1h-${run}z`);
    } else {
      column += 1;
    }
  }
}

/** Render a registration check-in QR as a compact inline SVG. */
export function createCheckinQrSvg(registrationId: string): string {
  const cached = svgMemo.get(registrationId);

  if (cached !== undefined) {
    return cached;
  }

  const modules = encodeQR(registrationId, "raw", {
    scale: 1,
    border: QR_BORDER,
    ecc: QR_ERROR_CORRECTION,
  });
  const size = modules.length;
  const runs: string[] = [];

  for (let rowIndex = 0; rowIndex < size; rowIndex += 1) {
    const row = modules[rowIndex];

    if (row !== undefined) {
      appendRowRuns(row, rowIndex, runs);
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"`,
    ` role="img" aria-hidden="true" focusable="false" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
    `<path d="${runs.join("")}" fill="#000"/>`,
    `</svg>`,
  ].join("");
  svgMemo.set(registrationId, svg);
  return svg;
}
