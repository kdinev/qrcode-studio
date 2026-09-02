import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';
import {
  defineComponents,
  IgcButtonComponent,
  IgcButtonGroupComponent,
  IgcColorPickerComponent,
  IgcIconComponent,
  IgcSelectComponent,
  IgcSelectItemComponent,
  IgcSliderComponent,
  IgcSwitchComponent,
  IgcToggleButtonComponent,
  type QrCornerSquareStyle,
  type QrDotStyle,
} from 'igniteui-webcomponents';
import { APP_ICONS, registerAppIcons } from './icons.js';
import {
  COLOR_SWATCHES,
  defaultQrOptions,
  DOT_STYLES,
  ERROR_LEVEL_LABELS,
  ERROR_LEVELS,
  LOGO_MARGIN_RANGE,
  LOGO_SIZE_RANGE,
  MARGIN_RANGE,
  MAX_QR_VERSION,
  QR_PRESETS,
  SIZE_RANGE,
  SQUARE_STYLES,
  type ErrorLevelOption,
  type QrOptions,
  type VersionOption,
} from './qr-options.js';

defineComponents(
  IgcButtonComponent,
  IgcButtonGroupComponent,
  IgcColorPickerComponent,
  IgcIconComponent,
  IgcSelectComponent,
  IgcSelectItemComponent,
  IgcSliderComponent,
  IgcSwitchComponent,
  IgcToggleButtonComponent
);
registerAppIcons();

/** Carries only the properties the user just changed. */
export type QrOptionsChangeEvent = CustomEvent<Partial<QrOptions>>;

declare global {
  interface HTMLElementEventMap {
    'qr-options-change': QrOptionsChangeEvent;
  }
}

interface SliderConfig {
  label: string;
  value: number;
  display: string;
  range: { min: number; max: number; step: number };
  format?: string;
  disabled?: boolean;
  onInput: (value: number) => void;
}

/**
 * Editor for every look-and-feel property of `igc-qr-code`.
 *
 * The panel is controlled: it renders the `options` it is handed and reports
 * edits through `qr-options-change` rather than keeping a copy of its own.
 *
 * @element app-qr-options-panel
 *
 * @fires qr-options-change - Emitted with the changed subset of the options.
 */
@customElement('app-qr-options-panel')
export class QrOptionsPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ig-gray-600, #666);
    }

    h3 igc-icon {
      --size: 18px;
      color: var(--ig-primary-500, #09f);
    }

    .grid {
      display: grid;
      gap: 16px 24px;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    }

    /* All 40 versions plus auto overflow the viewport, so cap the dropdown
       and let its own scroll container take over. */
    .version-select::part(base) {
      max-height: 320px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .field__label {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      font-size: 14px;
    }

    .field__value {
      color: var(--ig-gray-600, #666);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .field[aria-disabled='true'] .field__label {
      opacity: 0.4;
    }

    igc-slider {
      margin-inline: 8px;
    }

    /*
     * The stock button group paints every item in the primary color, which
     * leaves almost no contrast between the selected and unselected shapes.
     * Neutral items with a primary selection make the current choice obvious.
     */
    igc-button-group {
      --ig-button-group-item-background: var(--ig-surface-500, #fff);
      --ig-button-group-item-text-color: var(--ig-gray-800, #333);
      --ig-button-group-item-border-color: var(--ig-gray-300, #ccc);
      --ig-button-group-item-hover-background: var(--ig-gray-100, #f1f3f5);
      --ig-button-group-item-hover-text-color: var(--ig-gray-900, #111);
      --ig-button-group-item-hover-border-color: var(--ig-gray-300, #ccc);
      --ig-button-group-item-selected-background: var(--ig-primary-500, #0d6efd);
      --ig-button-group-item-selected-text-color: var(--ig-primary-500-contrast, #fff);
      --ig-button-group-item-selected-border-color: var(--ig-primary-500, #0d6efd);
      --ig-button-group-item-selected-hover-background: var(--ig-primary-600, #0b5ed7);
      --ig-button-group-item-selected-hover-text-color: var(--ig-primary-600-contrast, #fff);
      --ig-button-group-item-selected-hover-border-color: var(--ig-primary-600, #0b5ed7);
    }

    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .color-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--ig-gray-200, #e0e0e0);
      border-radius: 8px;
    }

    .color-group igc-switch {
      font-size: 14px;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 4px;
      border-top: 1px solid var(--ig-gray-200, #e0e0e0);
    }
  `;

  /** The options currently applied to the QR code. */
  @property({ attribute: false })
  options: QrOptions = defaultQrOptions();

  /** Enables the logo controls, which have no effect without an uploaded logo. */
  @property({ type: Boolean, attribute: 'has-logo' })
  hasLogo = false;

  private _emit(patch: Partial<QrOptions>): void {
    this.dispatchEvent(
      new CustomEvent<Partial<QrOptions>>('qr-options-change', {
        detail: patch,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _reset = (): void => {
    this._emit(defaultQrOptions());
  };

  render() {
    return html`
      ${this._renderPresets()} ${this._renderGeometry()} ${this._renderShapes()}
      ${this._renderColors()} ${this._renderLogo()} ${this._renderEncoding()}
      <div class="footer">
        <igc-button variant="flat" @click=${this._reset}>
          <igc-icon slot="prefix" name="refresh" collection=${APP_ICONS}></igc-icon>
          Reset to defaults
        </igc-button>
      </div>
    `;
  }

  private _renderPresets() {
    return html`
      <section>
        <h3>
          <igc-icon name="palette" collection=${APP_ICONS}></igc-icon>
          Presets
        </h3>
        <div class="presets">
          ${map(
            QR_PRESETS,
            (preset) => html`
              <igc-button
                variant="outlined"
                title=${preset.description}
                @click=${() => this._emit({ ...preset.options })}
              >
                ${preset.name}
              </igc-button>
            `
          )}
        </div>
      </section>
    `;
  }

  private _renderGeometry() {
    const { size, margin } = this.options;

    return html`
      <section>
        <h3>
          <igc-icon name="tune" collection=${APP_ICONS}></igc-icon>
          Size and quiet zone
        </h3>
        <div class="grid">
          ${this._renderSlider({
            label: 'Size',
            value: size,
            display: `${size} px`,
            range: SIZE_RANGE,
            format: '{0} px',
            onInput: (value) => this._emit({ size: value }),
          })}
          ${this._renderSlider({
            label: 'Margin',
            value: margin,
            display: `${margin} ${margin === 1 ? 'module' : 'modules'}`,
            range: MARGIN_RANGE,
            onInput: (value) => this._emit({ margin: value }),
          })}
        </div>
      </section>
    `;
  }

  private _renderShapes() {
    const { dotStyle, squareStyle } = this.options;

    return html`
      <section>
        <h3>
          <igc-icon name="shapes" collection=${APP_ICONS}></igc-icon>
          Module shapes
        </h3>
        <div class="grid">
          <div class="field">
            <span class="field__label"><span>Data modules</span></span>
            <igc-button-group
              selection="single-required"
              .selectedItems=${[dotStyle]}
              @igcSelect=${(event: CustomEvent<string | undefined>) =>
                this._emit({ dotStyle: event.detail as QrDotStyle })}
            >
              ${map(
                DOT_STYLES,
                (style) =>
                  html`<igc-toggle-button value=${style}>${titleCase(style)}</igc-toggle-button>`
              )}
            </igc-button-group>
          </div>
          <div class="field">
            <span class="field__label"><span>Corner squares</span></span>
            <igc-button-group
              selection="single-required"
              .selectedItems=${[squareStyle]}
              @igcSelect=${(event: CustomEvent<string | undefined>) =>
                this._emit({ squareStyle: event.detail as QrCornerSquareStyle })}
            >
              ${map(
                SQUARE_STYLES,
                (style) =>
                  html`<igc-toggle-button value=${style}>${titleCase(style)}</igc-toggle-button>`
              )}
            </igc-button-group>
          </div>
        </div>
      </section>
    `;
  }

  private _renderColors() {
    const {
      background,
      darkColor,
      cornerSquareColor,
      cornerDotColor,
      matchCornerSquareColor,
      matchCornerDotColor,
    } = this.options;

    return html`
      <section>
        <h3>
          <igc-icon name="palette" collection=${APP_ICONS}></igc-icon>
          Colors
        </h3>
        <div class="grid">
          ${this._renderColorPicker('Background', background, (value) =>
            this._emit({ background: value })
          )}
          ${this._renderColorPicker('Data modules', darkColor, (value) =>
            this._emit({ darkColor: value })
          )}
        </div>
        <div class="grid">
          <div class="color-group">
            <igc-switch
              .checked=${matchCornerSquareColor}
              @igcChange=${(event: CustomEvent<{ checked: boolean }>) =>
                this._emit({ matchCornerSquareColor: event.detail.checked })}
            >
              Corner squares match modules
            </igc-switch>
            ${matchCornerSquareColor
              ? nothing
              : this._renderColorPicker('Corner squares', cornerSquareColor, (value) =>
                  this._emit({ cornerSquareColor: value })
                )}
          </div>
          <div class="color-group">
            <igc-switch
              .checked=${matchCornerDotColor}
              @igcChange=${(event: CustomEvent<{ checked: boolean }>) =>
                this._emit({ matchCornerDotColor: event.detail.checked })}
            >
              Corner dots match modules
            </igc-switch>
            ${matchCornerDotColor
              ? nothing
              : this._renderColorPicker('Corner dots', cornerDotColor, (value) =>
                  this._emit({ cornerDotColor: value })
                )}
          </div>
        </div>
      </section>
    `;
  }

  private _renderLogo() {
    const { logoSize, logoMargin } = this.options;
    const disabled = !this.hasLogo;

    return html`
      <section>
        <h3>
          <igc-icon name="image" collection=${APP_ICONS}></igc-icon>
          Logo
        </h3>
        <div class="grid">
          ${this._renderSlider({
            label: 'Coverage',
            value: logoSize,
            display: `${Math.round(logoSize * 100)}% of safe area`,
            range: LOGO_SIZE_RANGE,
            disabled,
            onInput: (value) => this._emit({ logoSize: value }),
          })}
          ${this._renderSlider({
            label: 'Padding',
            value: logoMargin,
            display: `${logoMargin} px`,
            range: LOGO_MARGIN_RANGE,
            format: '{0} px',
            disabled,
            onInput: (value) => this._emit({ logoMargin: value }),
          })}
        </div>
      </section>
    `;
  }

  private _renderEncoding() {
    const { errorLevel, version } = this.options;

    return html`
      <section>
        <h3>
          <igc-icon name="qr-code" collection=${APP_ICONS}></igc-icon>
          Encoding
        </h3>
        <div class="grid">
          <igc-select
            label="Error correction"
            .value=${errorLevel}
            @igcChange=${(event: CustomEvent<IgcSelectItemComponent>) =>
              this._emit({ errorLevel: event.detail.value as ErrorLevelOption })}
          >
            <span slot="helper-text">Higher levels survive more damage, but hold less data.</span>
            ${map(
              ERROR_LEVELS,
              (level) =>
                html`<igc-select-item value=${level}>${ERROR_LEVEL_LABELS[level]}</igc-select-item>`
            )}
          </igc-select>
          <igc-select
            class="version-select"
            label="Version"
            .value=${String(version)}
            @igcChange=${(event: CustomEvent<IgcSelectItemComponent>) =>
              this._emit({ version: parseVersion(event.detail.value) })}
          >
            <span slot="helper-text">Sets the module grid; auto picks the smallest that fits.</span>
            <igc-select-item value="auto">Auto</igc-select-item>
            ${map(
              qrVersions(),
              (candidate) =>
                html`<igc-select-item value=${candidate}>Version ${candidate}</igc-select-item>`
            )}
          </igc-select>
        </div>
      </section>
    `;
  }

  private _renderColorPicker(label: string, value: string, onChange: (value: string) => void) {
    // `igcInput` keeps the preview live while dragging the canvas; `igcChange`
    // catches the commit paths that do not stream input, such as the swatches.
    const handler = (event: CustomEvent<string>) => onChange(event.detail);

    return html`
      <igc-color-picker
        mode="input"
        label=${label}
        .value=${value}
        .swatches=${[...COLOR_SWATCHES]}
        @igcInput=${handler}
        @igcChange=${handler}
      ></igc-color-picker>
    `;
  }

  private _renderSlider(config: SliderConfig) {
    const { label, value, display, range, format, disabled = false, onInput } = config;

    return html`
      <div class="field" aria-disabled=${disabled}>
        <span class="field__label">
          <span>${label}</span>
          <span class="field__value">${display}</span>
        </span>
        <igc-slider
          aria-label=${label}
          min=${range.min}
          max=${range.max}
          step=${range.step}
          .value=${value}
          ?disabled=${disabled}
          value-format=${format ?? '{0}'}
          @igcInput=${(event: CustomEvent<number>) => onInput(event.detail)}
        ></igc-slider>
      </div>
    `;
  }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function qrVersions(): number[] {
  return Array.from({ length: MAX_QR_VERSION }, (_, index) => index + 1);
}

function parseVersion(value: string): VersionOption {
  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? 'auto' : parsed;
}
