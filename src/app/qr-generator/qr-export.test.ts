import { afterEach, describe, expect, it } from 'vitest';
import { defineComponents, IgcQrCodeComponent } from 'igniteui-webcomponents';
import { qrFileName, serializeQrCode, svgToBlob, svgToPngBlob } from './qr-export.js';

defineComponents(IgcQrCodeComponent);

const created: IgcQrCodeComponent[] = [];

/** Renders an `igc-qr-code` in the document and waits for its first paint. */
async function renderQrCode(): Promise<IgcQrCodeComponent> {
  const qrCode = document.createElement('igc-qr-code');
  qrCode.value = 'https://example.com/';
  qrCode.size = 128;
  qrCode.style.setProperty('--ig-qr-code-dark-color', 'rgb(13, 71, 161)');
  qrCode.style.setProperty('--ig-qr-code-background', 'rgb(255, 255, 255)');

  document.body.append(qrCode);
  created.push(qrCode);
  await qrCode.updateComplete;

  return qrCode;
}

afterEach(() => {
  for (const qrCode of created.splice(0)) {
    qrCode.remove();
  }
});

describe('serializeQrCode', () => {
  it('produces a standalone SVG document', async () => {
    const markup = serializeQrCode(await renderQrCode());

    expect(markup).toContain('<svg');
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('width="128"');
    expect(markup).toContain('height="128"');
  });

  it('inlines the part colors that the shadow stylesheet resolved', async () => {
    const markup = serializeQrCode(await renderQrCode());

    // Without the inlined fills the exported SVG would render entirely black.
    expect(markup).toContain('fill="rgb(13, 71, 161)"');
    expect(markup).toContain('fill="rgb(255, 255, 255)"');
  });

  it('honours an explicit export size', async () => {
    const markup = serializeQrCode(await renderQrCode(), 512);

    expect(markup).toContain('width="512"');
    expect(markup).toContain('height="512"');
  });

  it('throws for a QR code that has not rendered', () => {
    const empty = document.createElement('igc-qr-code');

    expect(() => serializeQrCode(empty)).toThrow(/not been rendered/);
  });
});

describe('svgToBlob', () => {
  it('types the blob as SVG', async () => {
    const blob = svgToBlob(serializeQrCode(await renderQrCode()));

    expect(blob.type).toContain('image/svg+xml');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('svgToPngBlob', () => {
  it('rasterizes the markup at the requested size', async () => {
    const markup = serializeQrCode(await renderQrCode());
    const blob = await svgToPngBlob(markup, 256);

    expect(blob.type).toBe('image/png');

    const bitmap = await createImageBitmap(blob);

    expect(bitmap.width).toBe(256);
    expect(bitmap.height).toBe(256);
  });
});

describe('qrFileName', () => {
  it('derives the name from the host and drops the www prefix', () => {
    expect(qrFileName('https://www.example.com/a/b?c=1', 'png')).toBe('qr-example-com.png');
  });

  it('slugifies hosts with several labels', () => {
    expect(qrFileName('http://docs.infragistics.co.uk/', 'svg')).toBe(
      'qr-docs-infragistics-co-uk.svg'
    );
  });

  it('falls back to a generic name for values that are not URLs', () => {
    expect(qrFileName('not a url', 'png')).toBe('qr-code.png');
  });
});
