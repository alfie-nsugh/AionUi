declare module 'unocss' {
  export interface UserConfig {
    envMode?: string;
    presets?: unknown[];
    transformers?: unknown[];
    rules?: Array<[RegExp | string, unknown]>;
    shortcuts?: Record<string, string>;
    theme?: Record<string, unknown>;
    preflights?: Array<{ getCSS: () => string } | Record<string, unknown>>;
    content?: Record<string, unknown>;
  }

  export function defineConfig<T extends UserConfig>(config: T): T;
  export function presetMini(options?: Record<string, unknown>): unknown;
  export function presetWind3(options?: Record<string, unknown>): unknown;
  export function transformerDirectives(options?: Record<string, unknown>): unknown;
  export function transformerVariantGroup(options?: Record<string, unknown>): unknown;
}
