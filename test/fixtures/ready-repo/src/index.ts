/**
 * Public entry point. Assembles the parse → validate → normalize → render
 * pipeline described in docs/architecture.md.
 */

import { parseWidget } from './parse/parseWidget';
import { validateWidget } from './validate/validateWidget';
import { normalizeWidget } from './normalize/normalizeWidget';
import { renderWidget } from './render/renderWidget';
import type { RawWidget, ValidationError, Widget, WidgetSpec } from './types';

export type { Widget, WidgetSpec, ValidationError, WidgetKind, Theme } from './types';
export { renderWidget } from './render/renderWidget';

/** Raised by {@link createWidget} when a spec fails validation. */
export class WidgetValidationError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(`widget spec invalid: ${errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
    this.name = 'WidgetValidationError';
  }
}

/**
 * Validate and normalize a widget spec in one step.
 *
 * @throws {WidgetValidationError} if the spec is not valid.
 */
export function createWidget(spec: WidgetSpec): Widget {
  const raw = spec as unknown as RawWidget;
  const validated = validateWidget(raw);
  if (Array.isArray(validated)) {
    throw new WidgetValidationError(validated);
  }
  return normalizeWidget(validated);
}

/** Full pipeline: JSON string in, HTML string out. */
export function compileWidget(json: string): string {
  const validated = validateWidget(parseWidget(json));
  if (Array.isArray(validated)) {
    throw new WidgetValidationError(validated);
  }
  return renderWidget(normalizeWidget(validated));
}
