/** Fallback for browsers that never fire `afterprint`, in milliseconds. */
const PRINT_CLEANUP_DELAY = 60_000;

/**
 * Prints the QR code from an off-screen iframe, which keeps the surrounding
 * application out of the printed page without opening a blocked popup.
 *
 * `markup` is the SVG of a `toBlob()` export, which already carries resolved
 * colors and an inlined logo, so the printed document needs no external
 * resources.
 *
 * Resolves once the print dialog has been triggered. The iframe is removed
 * afterwards on `afterprint`, or after a fallback delay - `afterprint` is not
 * reliably fired by every browser, and waiting on it here would leave the
 * caller unable to print again if it never arrives.
 */
export function printQrCode(markup: string, caption = ''): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      frame.remove();
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
          reject(new Error('The print preview could not be created.'));
          return;
        }

        view.addEventListener('afterprint', cleanup, { once: true });
        view.focus();
        view.print();
        setTimeout(cleanup, PRINT_CLEANUP_DELAY);
        resolve();
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
 * `https://www.example.com/a` becomes `qr-example-com`.
 *
 * The extension is left off: `toImage()` appends the one that matches the
 * requested format.
 */
export function qrFileName(value: string): string {
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

  return slug || 'qr-code';
}
