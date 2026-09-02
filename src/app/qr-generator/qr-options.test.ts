import { describe, expect, it } from 'vitest';
import { defaultQrOptions, QR_PRESETS, qrColorProperties } from './qr-options.js';

describe('qrColorProperties', () => {
  it('omits the corner colors while they match the module color', () => {
    expect(qrColorProperties(defaultQrOptions())).toEqual({
      '--ig-qr-code-background': '#ffffff',
      '--ig-qr-code-dark-color': '#000000',
    });
  });

  it('emits a corner color once it is unlinked from the module color', () => {
    const properties = qrColorProperties({
      ...defaultQrOptions(),
      matchCornerSquareColor: false,
      cornerSquareColor: '#00695c',
    });

    expect(properties['--ig-qr-code-corner-square-color']).toBe('#00695c');
    expect(properties).not.toHaveProperty('--ig-qr-code-corner-dot-color');
  });

  it('emits both corner colors when both are unlinked', () => {
    const properties = qrColorProperties({
      ...defaultQrOptions(),
      matchCornerSquareColor: false,
      matchCornerDotColor: false,
      cornerSquareColor: '#00695c',
      cornerDotColor: '#0d47a1',
    });

    expect(properties['--ig-qr-code-corner-square-color']).toBe('#00695c');
    expect(properties['--ig-qr-code-corner-dot-color']).toBe('#0d47a1');
  });
});

describe('QR_PRESETS', () => {
  it.each(QR_PRESETS)('$name stays scannable when merged over the defaults', (preset) => {
    const merged = { ...defaultQrOptions(), ...preset.options };

    expect(merged.background).toBeTypeOf('string');
    expect(merged.darkColor).toBeTypeOf('string');
    expect(merged.background).not.toBe(merged.darkColor);
  });
});
