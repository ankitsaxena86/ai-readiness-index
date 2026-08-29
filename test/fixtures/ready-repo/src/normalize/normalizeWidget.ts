import type { Theme, Widget } from '../types';

/**
 * Normalize a validated widget: inherit the parent theme where a child did not
 * set one, and sort children by label for deterministic rendering.
 */
export function normalizeWidget(widget: Widget, inheritedTheme?: Theme): Widget {
  const theme = widget.theme ?? inheritedTheme ?? 'light';

  const children = widget.children
    .map((child) => normalizeWidget(child, theme))
    // Stable, deterministic order so snapshot tests do not flake.
    .sort((a, b) => a.label.localeCompare(b.label));

  return { ...widget, theme, children };
}
