import { css, html, LitElement, nothing } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  defineComponents,
  IgcButtonComponent,
  IgcCardActionsComponent,
  IgcCardComponent,
  IgcCardContentComponent,
  IgcCardHeaderComponent,
  IgcFileInputComponent,
  IgcIconButtonComponent,
  IgcIconComponent,
  IgcInputComponent,
  IgcNavbarComponent,
  IgcQrCodeComponent,
  IgcSelectComponent,
  IgcSelectItemComponent,
  IgcToastComponent,
  IgcTooltipComponent,
} from 'igniteui-webcomponents';
import { APP_ICONS, registerAppIcons } from './icons.js';
import {
  downloadBlob,
  printQrCode,
  qrFileName,
  serializeQrCode,
  svgToBlob,
  svgToPngBlob,
} from './qr-export.js';
import { defaultQrOptions, qrColorProperties, type QrOptions } from './qr-options.js';
import './qr-options-panel.js';

defineComponents(
  IgcButtonComponent,
  IgcCardActionsComponent,
  IgcCardComponent,
  IgcCardContentComponent,
  IgcCardHeaderComponent,
  IgcFileInputComponent,
  IgcIconButtonComponent,
  IgcIconComponent,
  IgcInputComponent,
  IgcNavbarComponent,
  IgcQrCodeComponent,
  IgcSelectComponent,
  IgcSelectItemComponent,
  IgcToastComponent,
  IgcTooltipComponent
);
registerAppIcons();

/** Data URIs are inlined into the exported SVG, so keep the logo small. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Multipliers offered for the PNG export, relative to the rendered size. */
const PNG_SCALES = [1, 2, 4] as const;

type PngScale = (typeof PNG_SCALES)[number];

/**
 * QR code generator: encodes a URL, overlays an optional logo, exposes every
 * customization property of `igc-qr-code`, and prints or downloads the result.
 *
 * @element app-qr-generator
 */
@customElement('app-qr-generator')
export class QrGenerator extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
    }

    /* The document reset in styles.css does not cross the shadow boundary. */
    h1,
    h2,
    p {
      margin: 0;
    }

    .page {
      display: grid;
      gap: 24px;
      align-items: start;
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
      box-sizing: border-box;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    }

    @media (max-width: 960px) {
      .page {
        grid-template-columns: minmax(0, 1fr);
        padding: 16px;
      }
    }

    .column {
      display: flex;
      flex-direction: column;
      gap: 24px;
      min-width: 0;
    }

    igc-navbar h1 {
      font-size: 18px;
      font-weight: 600;
    }

    igc-card-header h2 {
      font-size: 16px;
      font-weight: 600;
    }

    igc-card-header p {
      color: var(--ig-gray-600, #666);
      font-size: 13px;
    }

    .content-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .logo {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .logo__preview {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border: 1px solid var(--ig-gray-200, #e0e0e0);
      border-radius: 8px;
    }

    .logo__thumb {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      object-fit: contain;
      background:
        repeating-conic-gradient(var(--ig-gray-200, #e0e0e0) 0% 25%, transparent 0% 50%) 50% / 12px
        12px;
      border-radius: 4px;
    }

    .logo__name {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .preview-card {
      position: sticky;
      top: 24px;
    }

    @media (max-width: 960px) {
      .preview-card {
        position: static;
      }
    }

    .stage {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 280px;
      padding: 24px;
      /* Flat, not a checkerboard: the exported QR code is never transparent. */
      background: var(--ig-gray-100, #f1f3f5);
      border-radius: 8px;
    }

    .stage igc-qr-code {
      /*
       * The component is an inline-block whose inner SVG sits on the text
       * baseline, which leaves a few pixels of descender space below it and
       * skews both the centering and the shadow. Flex removes it.
       */
      display: flex;
      max-width: 100%;
      box-shadow: 0 2px 12px rgb(0 0 0 / 12%);
    }

    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--ig-gray-600, #666);
      text-align: center;
      max-width: 280px;
    }

    .placeholder igc-icon {
      --size: 48px;
      opacity: 0.35;
    }

    .encoded {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 16px;
      font-size: 13px;
      color: var(--ig-gray-700, #444);
      overflow-wrap: anywhere;
    }

    .encoded igc-icon {
      --size: 18px;
      flex: 0 0 auto;
      margin-top: 1px;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }

    .actions__row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .actions__row igc-button {
      flex: 1 1 140px;
    }

    .actions igc-select {
      width: 100%;
    }
  `;

  @query('igc-qr-code')
  private readonly _qrCode?: IgcQrCodeComponent;

  @query('igc-toast')
  private readonly _toast?: IgcToastComponent;

  /** The URL being edited, which is committed to `_encodedValue` on generate. */
  @state() private _draftUrl = '';

  /** The value the rendered QR code encodes. Empty until the first generate. */
  @state() private _encodedValue = '';

  @state() private _urlError = '';

  /** The uploaded logo as a data URI, so exports need no external resources. */
  @state() private _logoSrc = '';

  @state() private _logoName = '';

  /** Bumped to recreate `igc-file-input`, whose `value` is read-only. */
  @state() private _logoRevision = 0;

  @state() private _options: QrOptions = defaultQrOptions();

  @state() private _pngScale: PngScale = 2;

  @state() private _exporting = false;

  @state() private _toastMessage = '';

  private get _hasQrCode(): boolean {
    return this._encodedValue.length > 0;
  }

  render() {
    return html`
      <igc-navbar>
        <igc-icon slot="start" name="qr-code" collection=${APP_ICONS}></igc-icon>
        <h1>QR Code Studio</h1>
      </igc-navbar>

      <div class="page">
        <div class="column">${this._renderContentCard()} ${this._renderAppearanceCard()}</div>
        <div class="column">${this._renderPreviewCard()}</div>
      </div>

      <igc-toast>${this._toastMessage}</igc-toast>
    `;
  }

  private _renderContentCard() {
    return html`
      <igc-card>
        <igc-card-header>
          <h2 slot="title">Content</h2>
          <p slot="subtitle">The URL to encode, plus an optional logo for the center.</p>
        </igc-card-header>
        <igc-card-content>
          <form class="content-form" @submit=${this._handleSubmit}>
            <igc-input
              label="URL"
              placeholder="https://example.com"
              autocomplete="url"
              inputmode="url"
              .value=${this._draftUrl}
              .invalid=${Boolean(this._urlError)}
              @igcInput=${this._handleUrlInput}
            >
              <igc-icon slot="prefix" name="link" collection=${APP_ICONS}></igc-icon>
              <span slot="helper-text">
                ${this._urlError || 'A missing https:// prefix is added for you.'}
              </span>
            </igc-input>

            <div class="logo">
              ${keyed(
                this._logoRevision,
                html`
                  <igc-file-input
                    label="Logo (optional)"
                    accept="image/*"
                    @igcChange=${this._handleLogoChange}
                  >
                    <igc-icon slot="prefix" name="image" collection=${APP_ICONS}></igc-icon>
                    <span slot="helper-text">PNG, JPEG or SVG up to 2 MB.</span>
                  </igc-file-input>
                `
              )}
              ${this._logoSrc ? this._renderLogoPreview() : nothing}
            </div>

            <igc-button type="submit" variant="contained">
              <igc-icon slot="prefix" name="qr-code" collection=${APP_ICONS}></igc-icon>
              ${this._hasQrCode ? 'Update QR code' : 'Generate QR code'}
            </igc-button>
          </form>
        </igc-card-content>
      </igc-card>
    `;
  }

  private _renderLogoPreview() {
    return html`
      <div class="logo__preview">
        <img class="logo__thumb" src=${this._logoSrc} alt="" />
        <span class="logo__name">${this._logoName}</span>
        <igc-icon-button
          id="remove-logo"
          variant="flat"
          name="close"
          collection=${APP_ICONS}
          aria-label="Remove logo"
          @click=${this._removeLogo}
        ></igc-icon-button>
        <igc-tooltip anchor="remove-logo">Remove logo</igc-tooltip>
      </div>
    `;
  }

  private _renderAppearanceCard() {
    return html`
      <igc-card>
        <igc-card-header>
          <h2 slot="title">Appearance</h2>
          <p slot="subtitle">Every change applies to the preview immediately.</p>
        </igc-card-header>
        <igc-card-content>
          <app-qr-options-panel
            .options=${this._options}
            ?has-logo=${Boolean(this._logoSrc)}
            @qr-options-change=${this._handleOptionsChange}
          ></app-qr-options-panel>
        </igc-card-content>
      </igc-card>
    `;
  }

  private _renderPreviewCard() {
    return html`
      <igc-card class="preview-card" elevated>
        <igc-card-header>
          <h2 slot="title">Preview</h2>
          <p slot="subtitle">${this._options.size} x ${this._options.size} px</p>
        </igc-card-header>
        <igc-card-content>
          <div class="stage">${this._renderQrCode()}</div>
          ${this._hasQrCode
            ? html`
                <p class="encoded">
                  <igc-icon name="link" collection=${APP_ICONS}></igc-icon>
                  <span>${this._encodedValue}</span>
                </p>
              `
            : nothing}
        </igc-card-content>
        <igc-card-actions>
          <div class="actions" slot="start">
            <div class="actions__row">
              <igc-button
                variant="contained"
                ?disabled=${!this._hasQrCode || this._exporting}
                @click=${this._downloadPng}
              >
                <igc-icon slot="prefix" name="download" collection=${APP_ICONS}></igc-icon>
                PNG
              </igc-button>
              <igc-button
                variant="outlined"
                ?disabled=${!this._hasQrCode || this._exporting}
                @click=${this._downloadSvg}
              >
                <igc-icon slot="prefix" name="download" collection=${APP_ICONS}></igc-icon>
                SVG
              </igc-button>
              <igc-button
                variant="outlined"
                ?disabled=${!this._hasQrCode || this._exporting}
                @click=${this._print}
              >
                <igc-icon slot="prefix" name="print" collection=${APP_ICONS}></igc-icon>
                Print
              </igc-button>
            </div>
            <igc-select
              label="PNG resolution"
              .value=${String(this._pngScale)}
              ?disabled=${!this._hasQrCode}
              @igcChange=${this._handleScaleChange}
            >
              <!--
                The item labels stay static: igc-select caches the text of the
                selected item, so a size baked into it would go stale.
              -->
              <span slot="helper-text">
                Exports at ${this._options.size * this._pngScale} x
                ${this._options.size * this._pngScale} px
              </span>
              ${PNG_SCALES.map(
                (scale) => html`<igc-select-item value=${scale}>${scale}x</igc-select-item>`
              )}
            </igc-select>
          </div>
        </igc-card-actions>
      </igc-card>
    `;
  }

  private _renderQrCode() {
    if (!this._hasQrCode) {
      return html`
        <div class="placeholder">
          <igc-icon name="qr-code" collection=${APP_ICONS}></igc-icon>
          <p>Enter a URL and generate a QR code to preview it here.</p>
        </div>
      `;
    }

    const options = this._options;

    return html`
      <igc-qr-code
        .value=${this._encodedValue}
        .size=${options.size}
        .margin=${options.margin}
        .dotStyle=${options.dotStyle}
        .squareStyle=${options.squareStyle}
        .errorLevel=${options.errorLevel === 'auto' ? undefined : options.errorLevel}
        .version=${options.version === 'auto' ? undefined : options.version}
        .logoSrc=${this._logoSrc || undefined}
        .logoSize=${options.logoSize}
        .logoMargin=${options.logoMargin}
        style=${styleMap(qrColorProperties(options))}
        aria-label="QR code for ${this._encodedValue}"
      ></igc-qr-code>
    `;
  }

  private _handleUrlInput = (event: CustomEvent<string>): void => {
    this._draftUrl = event.detail;
    this._urlError = '';
  };

  private _handleSubmit = (event: Event): void => {
    event.preventDefault();
    this._generate();
  };

  private _generate(): void {
    const normalized = normalizeUrl(this._draftUrl);

    if (!normalized) {
      this._urlError = 'Enter a valid http(s) URL, for example https://example.com';
      this._encodedValue = '';
      return;
    }

    this._urlError = '';
    this._draftUrl = normalized;
    this._encodedValue = normalized;
  }

  private _handleOptionsChange = (event: CustomEvent<Partial<QrOptions>>): void => {
    this._options = { ...this._options, ...event.detail };
  };

  private _handleScaleChange = (event: CustomEvent<IgcSelectItemComponent>): void => {
    const scale = Number(event.detail.value) as PngScale;

    if (PNG_SCALES.includes(scale)) {
      this._pngScale = scale;
    }
  };

  private _handleLogoChange = async (event: CustomEvent<FileList>): Promise<void> => {
    const file = event.detail.item(0);

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this._notify('Choose an image file for the logo.');
      this._removeLogo();
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      this._notify('That logo is larger than 2 MB. Pick a smaller image.');
      this._removeLogo();
      return;
    }

    try {
      this._logoSrc = await readAsDataUrl(file);
      this._logoName = file.name;
    } catch {
      this._notify('The logo could not be read.');
      this._removeLogo();
    }
  };

  private _removeLogo = (): void => {
    this._logoSrc = '';
    this._logoName = '';
    this._logoRevision += 1;
  };

  private _downloadPng = async (): Promise<void> => {
    await this._withExport(async (markup) => {
      const size = this._options.size * this._pngScale;
      const blob = await svgToPngBlob(markup, size);

      downloadBlob(blob, qrFileName(this._encodedValue, 'png'));
      this._notify(`Downloaded a ${size} x ${size} px PNG.`);
    });
  };

  private _downloadSvg = async (): Promise<void> => {
    await this._withExport(async (markup) => {
      downloadBlob(svgToBlob(markup), qrFileName(this._encodedValue, 'svg'));
      this._notify('Downloaded the QR code as SVG.');
    });
  };

  private _print = async (): Promise<void> => {
    await this._withExport((markup) => printQrCode(markup, this._encodedValue));
  };

  /**
   * Serializes the current QR code and hands the markup to `task`, keeping the
   * action buttons disabled and surfacing any failure as a toast.
   */
  private async _withExport(task: (markup: string) => Promise<void>): Promise<void> {
    if (!this._hasQrCode || this._exporting) {
      return;
    }

    this._exporting = true;

    try {
      await this.updateComplete;
      await this._qrCode?.updateComplete;

      if (!this._qrCode) {
        throw new Error('The QR code is not available.');
      }

      await task(serializeQrCode(this._qrCode, this._options.size));
    } catch (error) {
      this._notify(error instanceof Error ? error.message : 'The export failed.');
    } finally {
      this._exporting = false;
    }
  }

  private _notify(message: string): void {
    this._toastMessage = message;
    void this.updateComplete.then(() => this._toast?.show());
  }
}

/**
 * Normalizes user input into an absolute http(s) URL, adding the scheme when it
 * is missing. Returns `null` when the input cannot be a web address.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed || hasForeignScheme(trimmed)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const isWeb = url.protocol === 'http:' || url.protocol === 'https:';
    const isResolvable = url.hostname.includes('.') || url.hostname === 'localhost';

    return isWeb && isResolvable ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Detects a scheme other than http(s), so that `mailto:` or `javascript:` input
 * is rejected rather than rewritten into an https URL.
 *
 * A `host:port` prefix such as `localhost:8000` looks like a scheme too, which
 * is what the digit lookahead rules out.
 */
function hasForeignScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:(?!\d)/i.test(value) && !/^https?:\/\//i.test(value);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
    reader.addEventListener('error', () => reject(new Error('The file could not be read.')), {
      once: true,
    });
    reader.readAsDataURL(file);
  });
}
