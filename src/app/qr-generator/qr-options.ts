import type {
  QrCornerSquareStyle,
  QrDotStyle,
  QrErrorCorrectionLevel,
} from 'igniteui-webcomponents';

/**
 * `igc-qr-code` picks the error correction level and the QR version on its own
 * unless they are set. `'auto'` models that opt-out so the UI can offer it as a
 * regular choice and still leave the properties undefined on the component.
 */
export type ErrorLevelOption = QrErrorCorrectionLevel | 'auto';
export type VersionOption = number | 'auto';

/** Every look-and-feel knob `igc-qr-code` exposes, in one serializable shape. */
export interface QrOptions {
  /** Rendered size of the QR code in pixels - `size`. */
  size: number;
  /** Quiet zone around the code, counted in modules - `margin`. */
  margin: number;
  /** Error correction level - `error-level`, or `'auto'` to let the component decide. */
  errorLevel: ErrorLevelOption;
  /** QR version 1-40 - `version`, or `'auto'` for the smallest that fits. */
  version: VersionOption;
  /** Shape of the data modules - `dot-style`. */
  dotStyle: QrDotStyle;
  /** Shape of the finder-pattern corner squares - `square-style`. */
  squareStyle: QrCornerSquareStyle;
  /** `--ig-qr-code-background`. */
  background: string;
  /** `--ig-qr-code-dark-color`. */
  darkColor: string;
  /** `--ig-qr-code-corner-square-color`, applied only when not matching the dots. */
  cornerSquareColor: string;
  /** `--ig-qr-code-corner-dot-color`, applied only when not matching the dots. */
  cornerDotColor: string;
  /** Whether the corner squares inherit `darkColor`. */
  matchCornerSquareColor: boolean;
  /** Whether the corner dots inherit `darkColor`. */
  matchCornerDotColor: boolean;
  /** Logo footprint as a ratio of the safe area - `logo-size`. */
  logoSize: number;
  /** Whitespace around the logo in pixels - `logo-margin`. */
  logoMargin: number;
}

export const SIZE_RANGE = { min: 96, max: 512, step: 8 } as const;
export const MARGIN_RANGE = { min: 0, max: 10, step: 1 } as const;
export const LOGO_SIZE_RANGE = { min: 0, max: 1, step: 0.05 } as const;
export const LOGO_MARGIN_RANGE = { min: 0, max: 24, step: 1 } as const;

export const DOT_STYLES: readonly QrDotStyle[] = ['square', 'rounded', 'circle'];
export const SQUARE_STYLES: readonly QrCornerSquareStyle[] = ['square', 'rounded', 'circle'];
export const ERROR_LEVELS: readonly ErrorLevelOption[] = ['auto', 'L', 'M', 'Q', 'H'];

/** Human readable hints for the error correction levels, keyed by option value. */
export const ERROR_LEVEL_LABELS: Readonly<Record<ErrorLevelOption, string>> = {
  auto: 'Auto (fits the logo)',
  L: 'L - low, ~7% recovery',
  M: 'M - medium, ~15% recovery',
  Q: 'Q - quartile, ~25% recovery',
  H: 'H - high, ~30% recovery',
};

export const MAX_QR_VERSION = 40;

/** Colors offered as swatches in every color picker of the options panel. */
export const COLOR_SWATCHES: readonly string[] = [
  '#000000',
  '#1a1a2e',
  '#0d47a1',
  '#00695c',
  '#4a148c',
  '#b71c1c',
  '#e65100',
  '#ffffff',
];

export function defaultQrOptions(): QrOptions {
  return {
    size: 256,
    margin: 4,
    errorLevel: 'auto',
    version: 'auto',
    dotStyle: 'square',
    squareStyle: 'square',
    background: '#ffffff',
    darkColor: '#000000',
    cornerSquareColor: '#000000',
    cornerDotColor: '#000000',
    matchCornerSquareColor: true,
    matchCornerDotColor: true,
    logoSize: 0.4,
    logoMargin: 4,
  };
}

export interface QrPreset {
  name: string;
  description: string;
  options: Partial<QrOptions>;
}

/** One-click starting points; each is merged over the current options. */
export const QR_PRESETS: readonly QrPreset[] = [
  {
    name: 'Classic',
    description: 'Square modules in black on white',
    options: {
      dotStyle: 'square',
      squareStyle: 'square',
      background: '#ffffff',
      darkColor: '#000000',
      matchCornerSquareColor: true,
      matchCornerDotColor: true,
      margin: 4,
    },
  },
  {
    name: 'Soft',
    description: 'Rounded modules with softened corners',
    options: {
      dotStyle: 'rounded',
      squareStyle: 'rounded',
      background: '#ffffff',
      darkColor: '#1a1a2e',
      matchCornerSquareColor: true,
      matchCornerDotColor: true,
      margin: 4,
    },
  },
  {
    name: 'Dots',
    description: 'Circular modules with accented corners',
    options: {
      dotStyle: 'circle',
      squareStyle: 'circle',
      background: '#ffffff',
      darkColor: '#0d47a1',
      cornerSquareColor: '#00695c',
      cornerDotColor: '#0d47a1',
      matchCornerSquareColor: false,
      matchCornerDotColor: false,
      margin: 4,
    },
  },
  {
    name: 'Inverted',
    description: 'Light modules on a dark background',
    options: {
      dotStyle: 'rounded',
      squareStyle: 'square',
      background: '#1a1a2e',
      darkColor: '#ffffff',
      matchCornerSquareColor: true,
      matchCornerDotColor: true,
      margin: 4,
    },
  },
];

/**
 * The CSS custom properties `igc-qr-code` reads for its paint.
 *
 * The corner entries are omitted while they match the dot color so that the
 * component keeps falling back to `--ig-qr-code-dark-color` on its own.
 */
export function qrColorProperties(options: QrOptions): Record<string, string> {
  const properties: Record<string, string> = {
    '--ig-qr-code-background': options.background,
    '--ig-qr-code-dark-color': options.darkColor,
  };

  if (!options.matchCornerSquareColor) {
    properties['--ig-qr-code-corner-square-color'] = options.cornerSquareColor;
  }

  if (!options.matchCornerDotColor) {
    properties['--ig-qr-code-corner-dot-color'] = options.cornerDotColor;
  }

  return properties;
}
