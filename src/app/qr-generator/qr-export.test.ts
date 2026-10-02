import { afterEach, describe, expect, it } from 'vitest';
import { ensureLogoCompatibility, qrFileName } from './qr-export.js';

const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';

const PINK_CIRCLE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e91e63"/></svg>';

/** A QR code the way `toBlob()` exports it, with `logo` in the image. */
function qrMarkup(logo: string, imageAttributes = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 37 37">
    <defs><mask id="qr-mask-1"><rect width="37" height="37" fill="white"/></mask></defs>
    <g mask="url(#qr-mask-1)"><path d="M4 4h7v7H4z" fill="rgb(0, 0, 0)"/></g>
    <image href="${logo}" x="11" y="12" width="15" height="13"${imageAttributes}/>
  </svg>`;
}

function svgDataUrl(markup: string): string {
  return `data:image/svg+xml;base64,${btoa(markup)}`;
}

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

/** The nested viewport that replaced the logo image. */
function logoViewport(document: Document): Element | null {
  return document.querySelector('svg > svg');
}

describe('ensureLogoCompatibility', () => {
  const attached: Element[] = [];

  afterEach(() => {
    for (const element of attached.splice(0)) {
      element.remove();
    }
  });

  /** Renders the export inline, so computed styles can be checked. */
  function attach(markup: string): SVGSVGElement {
    const svg = document.importNode(parse(markup).documentElement, true) as unknown as SVGSVGElement;

    document.body.append(svg);
    attached.push(svg);

    return svg;
  }

  it('aliases the href of a raster logo for SVG 1.1 consumers', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const image = parse(ensureLogoCompatibility(qrMarkup(png))).querySelector('image');

    // Browsers read `href`; Illustrator, Office and Batik read `xlink:href`.
    expect(image?.getAttribute('href')).toBe(png);
    expect(image?.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe(png);
  });

  it('inlines an SVG logo in the box of the image it replaces', () => {
    // SVG 1.1 consumers accept only raster data in an image, so an embedded
    // SVG document vanishes from the export.
    const exported = parse(ensureLogoCompatibility(qrMarkup(svgDataUrl(PINK_CIRCLE))));
    const viewport = logoViewport(exported);
    const logo = viewport?.firstElementChild;

    expect(exported.querySelector('image')).toBeNull();
    expect(viewport?.getAttribute('x')).toBe('11');
    expect(viewport?.getAttribute('y')).toBe('12');
    expect(viewport?.getAttribute('width')).toBe('15');
    expect(viewport?.getAttribute('height')).toBe('13');
    expect(logo?.localName).toBe('svg');
    expect(logo?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(logo?.getAttribute('width')).toBe('100%');
    expect(logo?.getAttribute('height')).toBe('100%');
    expect(logo?.querySelector('circle')?.getAttribute('fill')).toBe('#e91e63');
  });

  it('reads percent-encoded SVG data URIs', () => {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PINK_CIRCLE)}`;
    const exported = parse(ensureLogoCompatibility(qrMarkup(url)));

    expect(logoViewport(exported)?.querySelector('circle')).not.toBeNull();
  });

  it("carries the image's alignment over to the logo", () => {
    const logo = PINK_CIRCLE.replace('<svg ', '<svg preserveAspectRatio="none" ');
    const aligned = parse(
      ensureLogoCompatibility(qrMarkup(svgDataUrl(logo), ' preserveAspectRatio="xMinYMin slice"'))
    );
    const unaligned = parse(ensureLogoCompatibility(qrMarkup(svgDataUrl(logo))));

    // An image ignores the alignment of the document it shows.
    expect(logoViewport(aligned)?.firstElementChild?.getAttribute('preserveAspectRatio')).toBe(
      'xMinYMin slice'
    );
    expect(logoViewport(unaligned)?.firstElementChild?.hasAttribute('preserveAspectRatio')).toBe(
      false
    );
  });

  it('derives a viewBox from a pixel size, so the logo still scales', () => {
    const logo =
      '<svg xmlns="http://www.w3.org/2000/svg" width="48px" height="24"><rect width="48" height="24"/></svg>';
    const exported = parse(ensureLogoCompatibility(qrMarkup(svgDataUrl(logo))));

    expect(logoViewport(exported)?.firstElementChild?.getAttribute('viewBox')).toBe('0 0 48 24');
  });

  it('keeps the image for logos it cannot inline faithfully', () => {
    const logos = [
      // Physical units have no fixed size in user units.
      '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm"><rect width="5" height="5"/></svg>',
      // Inline, the logo's mask would replace the one of the QR code.
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><mask id="qr-mask-1"/></svg>',
      // SVG 1.1 consumers cannot render HTML either way.
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject/></svg>',
      'not markup',
    ];

    for (const logo of logos) {
      const image = parse(ensureLogoCompatibility(qrMarkup(svgDataUrl(logo)))).querySelector('image');

      expect(image?.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe(svgDataUrl(logo));
    }
  });

  it("aliases the logo's own references for SVG 1.1 consumers", () => {
    const logo =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><circle id="dot" r="4"/></defs><use href="#dot"/></svg>';
    const use = parse(ensureLogoCompatibility(qrMarkup(svgDataUrl(logo)))).querySelector('use');

    expect(use?.getAttributeNS(XLINK_NAMESPACE, 'href')).toBe('#dot');
  });

  it('confines the style sheets of the logo to the logo', () => {
    const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <style>path, :is(rect, circle) { fill: rgb(255, 255, 255) } .accent { fill: rgb(233, 30, 99) }</style>
      <path d="M0 0h24v24H0z"/><circle class="accent" cx="12" cy="12" r="6"/>
    </svg>`;
    const svg = attach(ensureLogoCompatibility(qrMarkup(svgDataUrl(logo))));
    const [module, logoPath] = svg.querySelectorAll('path');

    // Unscoped, the logo's `path` rule would whiten the QR modules.
    expect(getComputedStyle(module).fill).toBe('rgb(0, 0, 0)');
    expect(getComputedStyle(logoPath).fill).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(svg.querySelector('circle') as Element).fill).toBe('rgb(233, 30, 99)');
  });

  it('drops the scripts, handlers and external links that an image never ran', () => {
    const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">
      <script>alert(2)</script>
      <a href="javascript:alert(3)"><circle cx="12" cy="12" r="10" onclick="alert(4)"/></a>
      <image href="https://example.com/pixel.png" width="1" height="1"/>
    </svg>`;
    const exported = ensureLogoCompatibility(qrMarkup(svgDataUrl(logo)));

    expect(exported).not.toContain('alert');
    expect(exported).not.toContain('example.com');
    expect(parse(exported).querySelector('circle')).not.toBeNull();
  });

  it('leaves markup without a logo untouched', () => {
    const markup = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

    expect(ensureLogoCompatibility(markup)).toBe(markup);
  });
});

describe('qrFileName', () => {
  it('derives the name from the host and drops the www prefix', () => {
    expect(qrFileName('https://www.example.com/a/b?c=1')).toBe('qr-example-com');
  });

  it('slugifies hosts with several labels', () => {
    expect(qrFileName('http://docs.infragistics.co.uk/')).toBe('qr-docs-infragistics-co-uk');
  });

  it('falls back to a generic name for values that are not URLs', () => {
    expect(qrFileName('not a url')).toBe('qr-code');
  });

  it('leaves the extension to the export format', () => {
    // `toImage()` appends the extension that matches the requested format.
    expect(qrFileName('https://example.com')).not.toContain('.');
  });
});
