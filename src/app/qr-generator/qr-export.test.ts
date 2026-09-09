import { describe, expect, it } from 'vitest';
import { qrFileName } from './qr-export.js';

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
