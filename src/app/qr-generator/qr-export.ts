const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

/** Fallback for browsers that never fire `afterprint`, in milliseconds. */
const PRINT_CLEANUP_DELAY = 60_000;

/**
 * Makes the embedded logo of an exported QR code readable by SVG 1.1
 * consumers, leaving everything else untouched.
 *
 * `igc-qr-code` writes the logo as `<image href="data:...">`. Browsers resolve
 * that, so the export looks right in a browser, but SVG 1.1 consumers -
 * Illustrator, the Office import, Batik, older librsvg - drop the logo, which
 * leaves a blank hole in the middle of an otherwise correct QR code:
 *
 * - They read only `xlink:href`, so every `href` gets that alias as well. SVG 2
 *   gives `href` priority when the two are present.
 * - They accept only raster data in `<image>`, so an SVG logo is inlined as a
 *   nested `<svg>` in place of the image. It stays a vector, too.
 *
 * Drop this once the component exports logos in this shape itself.
 */
export function ensureLogoCompatibility(markup: string): string {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');

  if (parsed.querySelector('parsererror')) {
    return markup;
  }

  const images = [...parsed.querySelectorAll('image')].filter((image) =>
    image.hasAttribute('href')
  );

  if (images.length === 0) {
    return markup;
  }

  for (const image of images) {
    inlineSvgLogo(image);
  }

  for (const element of parsed.querySelectorAll('[href]')) {
    element.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', element.getAttribute('href') as string);
  }

  return new XMLSerializer().serializeToString(parsed.documentElement);
}

/**
 * Replaces an `<image>` that embeds an SVG document with that document's
 * markup, sized and aligned the way the image showed it.
 *
 * The image is kept whenever the logo cannot be inlined faithfully: when it is
 * not an SVG, does not parse, needs HTML (`<foreignObject>`), uses an id the
 * QR code already uses, or has a size in units other than pixels.
 */
function inlineSvgLogo(image: Element): void {
  const source = decodeSvgDataUrl(image.getAttribute('href') as string);

  if (source === null) {
    return;
  }

  const logo = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = logo.documentElement;

  if (
    logo.querySelector('parsererror') ||
    root.namespaceURI !== SVG_NAMESPACE ||
    root.localName !== 'svg' ||
    root.querySelector('foreignObject')
  ) {
    return;
  }

  const host = image.ownerDocument;
  const hostIds = idsIn(host);
  const logoIds = idsIn(logo);

  if ([...logoIds].some((id) => hostIds.has(id)) || !fillViewport(root)) {
    return;
  }

  removeActiveContent(root);

  // The image's alignment wins over the logo's own, as it did for the image.
  const alignment = image.getAttribute('preserveAspectRatio');

  if (alignment) {
    root.setAttribute('preserveAspectRatio', alignment);
  } else {
    root.removeAttribute('preserveAspectRatio');
  }

  // A nested viewport in the box of the image. It clips the logo the way the
  // image did, and its id scopes the logo's style sheets.
  const viewport = host.createElementNS(SVG_NAMESPACE, 'svg');

  viewport.id = uniqueId('qr-logo', new Set([...hostIds, ...logoIds]));

  for (const name of ['x', 'y', 'width', 'height']) {
    const value = image.getAttribute(name);

    if (value !== null) {
      viewport.setAttribute(name, value);
    }
  }

  scopeStyleSheets(root, `#${viewport.id}`);
  viewport.append(host.importNode(root, true));
  image.replaceWith(viewport);
}

/** Decodes the markup of a `data:image/svg+xml` URI, or `null` for anything else. */
function decodeSvgDataUrl(url: string): string | null {
  const match = /^data:image\/svg\+xml((?:;[^,]*)?),(.*)$/is.exec(url.trim());

  if (!match) {
    return null;
  }

  const [, parameters, payload] = match;

  try {
    if (/;base64$/i.test(parameters)) {
      return new TextDecoder().decode(Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)));
    }

    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function idsIn(document: Document): Set<string> {
  return new Set([...document.querySelectorAll('[id]')].map((element) => element.id));
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;

  for (let suffix = 1; taken.has(id); suffix++) {
    id = `${base}-${suffix}`;
  }

  return id;
}

/**
 * Stretches the logo's root over its parent viewport, keeping the scaling an
 * `<image>` applies: a logo with a pixel size but no `viewBox` gets one from
 * that size. Returns `false` when the size is in other units, which cannot be
 * mapped to a `viewBox` without knowing the resolution of the consumer.
 */
function fillViewport(root: Element): boolean {
  if (!root.hasAttribute('viewBox')) {
    const width = pixels(root.getAttribute('width'));
    const height = pixels(root.getAttribute('height'));

    if (width !== null && height !== null) {
      root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    } else if (root.hasAttribute('width') || root.hasAttribute('height')) {
      return false;
    }
  }

  root.removeAttribute('x');
  root.removeAttribute('y');
  root.setAttribute('width', '100%');
  root.setAttribute('height', '100%');

  return true;
}

function pixels(length: string | null): number | null {
  const match = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(?:px)?\s*$/i.exec(length ?? '');

  return match ? Number(match[1]) : null;
}

/**
 * Drops what an `<image>` never ran or loaded, but inline markup would:
 * scripts, event handlers, and links to anything other than a fragment or an
 * embedded image.
 */
function removeActiveContent(root: Element): void {
  for (const script of root.querySelectorAll('script')) {
    script.remove();
  }

  for (const element of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.localName.toLowerCase();
      const isExternalLink =
        name === 'href' && !/^(?:#|data:image\/)/i.test(attribute.value.trim());

      if (name.startsWith('on') || isExternalLink) {
        element.removeAttributeNode(attribute);
      }
    }
  }
}

/**
 * Confines the logo's `<style>` rules to the logo. Inline, a rule such as
 * `path { fill: white }` would otherwise reach the QR modules, which are bare
 * paths, and break the code. Prefixing every selector with the same id keeps
 * the cascade inside the logo as it was.
 */
function scopeStyleSheets(root: Element, scope: string): void {
  for (const style of root.querySelectorAll('style')) {
    const sheet = new CSSStyleSheet();

    // Drops `@import`, which an `<image>` never loaded either.
    sheet.replaceSync(style.textContent ?? '');
    scopeRules(sheet.cssRules, scope);
    style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
  }
}

function scopeRules(rules: CSSRuleList, scope: string): void {
  for (const rule of rules) {
    // Checked first: a style rule is a grouping rule too, but the selectors of
    // the rules nested in it are relative to its own.
    if (rule instanceof CSSStyleRule) {
      rule.selectorText = splitSelectorList(rule.selectorText)
        .map((selector) => `${scope} ${selector}`)
        .join(', ');
    } else if (rule instanceof CSSGroupingRule) {
      scopeRules(rule.cssRules, scope);
    }
  }
}

/** Splits a selector list on its top-level commas, e.g. not those in `:is(a, b)`. */
function splitSelectorList(list: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;

  for (let index = 0; index < list.length; index++) {
    const char = list[index];

    if (char === '\\') {
      index++;
    } else if (quote) {
      quote = char === quote ? '' : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 0) {
      selectors.push(list.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(list.slice(start).trim());

  return selectors;
}

/** Saves a file to the user's downloads through a transient anchor. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = file.name;
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
