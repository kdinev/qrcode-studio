import type { IgcQrCodeComponent } from 'igniteui-webcomponents';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

/** Fallback for browsers that never fire `afterprint`, in milliseconds. */
const PRINT_CLEANUP_DELAY = 60_000;

/**
 * Lifts the QR code out of the component's shadow root as a standalone SVG
 * document.
 *
 * `igc-qr-code` paints its parts through CSS custom properties, which do not
 * survive serialization, so the resolved `fill` of every part is copied onto
 * the clone as a presentation attribute. An uploaded logo is already a data
 * URI, so the result needs no external resources.
 *
 * @param qrCode The rendered QR code component.
 * @param exportSize Pixel width/height of the output; defaults to the rendered size.
 */
export function serializeQrCode(qrCode: IgcQrCodeComponent, exportSize?: number): string {
  const source = qrCode.shadowRoot?.querySelector('svg');

  if (!source) {
    throw new Error('The QR code has not been rendered yet.');
  }

  const clone = source.cloneNode(true) as SVGSVGElement;
  inlinePartFills(source, clone);

  const size = Math.round(exportSize ?? qrCode.size);
  clone.setAttribute('xmlns', SVG_NAMESPACE);
  clone.setAttribute('xmlns:xlink', XLINK_NAMESPACE);
  clone.setAttribute('width', String(size));
  clone.setAttribute('height', String(size));

  return new XMLSerializer().serializeToString(clone);
}

/** Copies the computed `fill` of every `part` element onto the matching clone. */
function inlinePartFills(source: SVGSVGElement, clone: SVGSVGElement): void {
  const originals = source.querySelectorAll<SVGElement>('[part]');
  const clones = clone.querySelectorAll<SVGElement>('[part]');

  originals.forEach((original, index) => {
    const target = clones[index];
    const { fill } = getComputedStyle(original);

    if (target && fill) {
      target.setAttribute('fill', fill);
    }
  });
}

/** Wraps serialized SVG markup in a downloadable blob. */
export function svgToBlob(markup: string): Blob {
  return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
}

/** Rasterizes serialized SVG markup to a PNG blob of `size` x `size` pixels. */
export async function svgToPngBlob(markup: string, size: number): Promise<Blob> {
  const image = await loadSvgImage(markup);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('This browser did not provide a 2D canvas context.');
  }

  context.drawImage(image, 0, 0, size, size);

  return await canvasToBlob(canvas);
}

function loadSvgImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener(
      'error',
      () => reject(new Error('The QR code could not be converted to an image.')),
      { once: true }
    );

    // A data URI keeps the canvas untainted, unlike a cross-document blob URL.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The PNG encoding failed.'))),
      'image/png'
    );
  });
}

/** Saves a blob to the user's downloads through a transient anchor. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.hidden = true;

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoking in the same task cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Prints the QR code from an off-screen iframe, which keeps the surrounding
 * application out of the printed page without opening a blocked popup.
 *
 * Resolves once the print dialog has been dismissed.
 */
export function printQrCode(markup: string, caption = ''): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    let finished = false;

    const cleanup = () => {
      if (finished) {
        return;
      }

      finished = true;
      frame.remove();
      resolve();
    };

    frame.title = 'QR code print preview';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;border:0;';
    frame.srcdoc = printDocument(markup, caption);

    frame.addEventListener(
      'load',
      () => {
        const view = frame.contentWindow;

        if (!view) {
          cleanup();
          return;
        }

        view.addEventListener('afterprint', cleanup, { once: true });
        view.focus();
        view.print();
        setTimeout(cleanup, PRINT_CLEANUP_DELAY);
      },
      { once: true }
    );

    document.body.append(frame);
  });
}

function printDocument(markup: string, caption: string): string {
  const title = escapeHtml(caption) || 'QR code';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { margin: 16mm; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font: 11pt/1.5 system-ui, sans-serif;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  figure { display: flex; flex-direction: column; align-items: center; gap: 8mm; margin: 0; }
  svg { height: auto; max-width: 100%; }
  figcaption { max-width: 120mm; overflow-wrap: anywhere; text-align: center; }
</style>
</head>
<body>
<figure>
  ${markup}
  ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
</figure>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Derives a readable file name from the encoded value, e.g.
 * `https://www.example.com/a` becomes `qr-example-com.png`.
 */
export function qrFileName(value: string, extension: string): string {
  let base = 'qr-code';

  try {
    base = `qr-${new URL(value).hostname.replace(/^www\./, '')}`;
  } catch {
    // Not a URL - keep the generic base.
  }

  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${slug || 'qr-code'}.${extension}`;
}
