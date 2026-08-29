/** Shared domain types for the widget pipeline. */

/** The kinds of widget the toolkit knows how to render. */
export type WidgetKind = 'button' | 'checkbox' | 'divider';

/** Visual theme applied to a rendered widget. */
export type Theme = 'light' | 'dark';

/** What a caller passes to {@link createWidget}. */
export interface WidgetSpec {
  kind: WidgetKind;
  /** Visible text. Required for every kind except `divider`. */
  label?: string;
  theme?: Theme;
  children?: WidgetSpec[];
}

/** The loosely-typed shape produced by the parser before validation. */
export interface RawWidget {
  kind: unknown;
  label?: unknown;
  theme?: unknown;
  children?: unknown;
}

/** A fully validated and normalized widget, safe to render. */
export interface Widget {
  kind: WidgetKind;
  label: string;
  theme: Theme;
  children: Widget[];
}

/** A single validation problem, returned as a value rather than thrown. */
export interface ValidationError {
  path: string;
  message: string;
}
