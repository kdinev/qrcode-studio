import { afterEach, describe, expect, it } from 'vitest';
import type { IgcInputComponent, IgcQrCodeComponent } from 'igniteui-webcomponents';
import { normalizeUrl, QrGenerator } from './qr-generator.js';
import { defaultQrOptions, type QrOptions } from './qr-options.js';
import type { QrOptionsPanel } from './qr-options-panel.js';

const created: QrGenerator[] = [];

async function renderGenerator(): Promise<QrGenerator> {
  const element = document.createElement('app-qr-generator') as QrGenerator;

  document.body.append(element);
  created.push(element);
  await element.updateComplete;

  return element;
}

function query<T extends Element>(host: QrGenerator, selector: string): T {
  const element = host.shadowRoot?.querySelector<T>(selector);

  if (!element) {
    throw new Error(`No element matched "${selector}".`);
  }

  return element;
}

function exportButtons(host: QrGenerator): HTMLElement[] {
  return [...(host.shadowRoot?.querySelectorAll<HTMLElement>('igc-card-actions igc-button') ?? [])];
}

/** Drives the URL field and the submit button the way a user would. */
async function generate(host: QrGenerator, url: string): Promise<void> {
  const input = query<IgcInputComponent>(host, 'igc-input');

  input.value = url;
  input.emitEvent('igcInput', { detail: url });
  await host.updateComplete;

  query<HTMLElement>(host, 'igc-button[type="submit"]').click();
  await host.updateComplete;
}

/** Applies an options patch the way the panel does. */
async function changeOptions(host: QrGenerator, detail: Partial<QrOptions>): Promise<void> {
  query<QrOptionsPanel>(host, 'app-qr-options-panel').dispatchEvent(
    new CustomEvent('qr-options-change', { detail, bubbles: true, composed: true })
  );
  await host.updateComplete;
}

afterEach(() => {
  for (const element of created.splice(0)) {
    element.remove();
  }
});

describe('normalizeUrl', () => {
  it('keeps an absolute http(s) URL', () => {
    expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(normalizeUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('adds the https prefix when the scheme is missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
    expect(normalizeUrl('  www.example.com/a  ')).toBe('https://www.example.com/a');
  });

  it('treats a host:port prefix as a host, not a scheme', () => {
    expect(normalizeUrl('localhost:8000')).toBe('https://localhost:8000/');
    expect(normalizeUrl('example.com:8080/a')).toBe('https://example.com:8080/a');
  });

  it('rejects empty input and bare words', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl('example')).toBeNull();
  });

  it('rejects non-web schemes instead of rewriting them', () => {
    expect(normalizeUrl('mailto:someone@example.com')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/plain,hi')).toBeNull();
    expect(normalizeUrl('ftp://example.com')).toBeNull();
  });
});

describe('QrGenerator', () => {
  it('<app-qr-generator> is an instance of QrGenerator', () => {
    expect(document.createElement('app-qr-generator')).toBeInstanceOf(QrGenerator);
  });

  it('shows a placeholder and disabled export actions before the first generate', async () => {
    const host = await renderGenerator();

    expect(host.shadowRoot?.querySelector('igc-qr-code')).toBeNull();
    expect(query<HTMLElement>(host, '.placeholder')).toBeInstanceOf(HTMLElement);
    expect(exportButtons(host)).toHaveLength(3);

    for (const button of exportButtons(host)) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
  });

  it('renders the QR code and enables the export actions after generating', async () => {
    const host = await renderGenerator();
    await generate(host, 'example.com/products');

    const qrCode = query<IgcQrCodeComponent>(host, 'igc-qr-code');

    expect(qrCode.value).toBe('https://example.com/products');
    expect(qrCode.size).toBe(defaultQrOptions().size);
    expect(qrCode.shadowRoot?.querySelector('svg')).not.toBeNull();

    for (const button of exportButtons(host)) {
      expect(button.hasAttribute('disabled')).toBe(false);
    }
  });

  it('reports an invalid URL instead of rendering a QR code', async () => {
    const host = await renderGenerator();
    await generate(host, 'nonsense');

    expect(host.shadowRoot?.querySelector('igc-qr-code')).toBeNull();
    expect(query<IgcInputComponent>(host, 'igc-input').invalid).toBe(true);
  });

  it('applies option changes from the panel to the QR code', async () => {
    const host = await renderGenerator();
    await generate(host, 'https://example.com');
    await changeOptions(host, {
      size: 320,
      margin: 2,
      dotStyle: 'circle',
      squareStyle: 'rounded',
      errorLevel: 'H',
      version: 8,
    });

    const qrCode = query<IgcQrCodeComponent>(host, 'igc-qr-code');

    expect(qrCode.size).toBe(320);
    expect(qrCode.margin).toBe(2);
    expect(qrCode.dotStyle).toBe('circle');
    expect(qrCode.squareStyle).toBe('rounded');
    expect(qrCode.errorLevel).toBe('H');
    expect(qrCode.version).toBe(8);
  });

  it("leaves the component's own defaults in place for the auto options", async () => {
    const host = await renderGenerator();
    await generate(host, 'https://example.com');

    const qrCode = query<IgcQrCodeComponent>(host, 'igc-qr-code');

    expect(qrCode.errorLevel).toBeUndefined();
    expect(qrCode.version).toBeUndefined();
  });

  it('forwards only the unlinked corner colors as CSS custom properties', async () => {
    const host = await renderGenerator();
    await generate(host, 'https://example.com');
    await changeOptions(host, { matchCornerSquareColor: false, cornerSquareColor: '#00695c' });

    const qrCode = query<IgcQrCodeComponent>(host, 'igc-qr-code');

    expect(qrCode.style.getPropertyValue('--ig-qr-code-corner-square-color')).toBe('#00695c');
    expect(qrCode.style.getPropertyValue('--ig-qr-code-corner-dot-color')).toBe('');
  });

  it('drops a corner color again once it is relinked to the module color', async () => {
    const host = await renderGenerator();
    await generate(host, 'https://example.com');
    await changeOptions(host, { matchCornerSquareColor: false, cornerSquareColor: '#00695c' });
    await changeOptions(host, { matchCornerSquareColor: true });

    const qrCode = query<IgcQrCodeComponent>(host, 'igc-qr-code');

    expect(qrCode.style.getPropertyValue('--ig-qr-code-corner-square-color')).toBe('');
  });

  it('reports the export resolution for the selected scale', async () => {
    const host = await renderGenerator();
    await generate(host, 'https://example.com');
    await changeOptions(host, { size: 320 });

    const helper = query<HTMLElement>(host, 'igc-select span[slot="helper-text"]');

    // The default scale is 2x, so a 320 px code exports at 640 px.
    expect(helper.textContent?.replace(/\s+/g, ' ').trim()).toBe('Exports at 640 x 640 px');
  });
});
