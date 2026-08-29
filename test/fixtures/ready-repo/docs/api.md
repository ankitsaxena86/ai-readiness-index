# API Reference

## `createWidget(spec: WidgetSpec): Widget`

Validates and normalizes a widget spec in one call. Throws `ValidationError` if
the spec is invalid.

| Parameter | Type | Description |
|---|---|---|
| `spec.kind` | `'button' \| 'checkbox' \| 'divider'` | The widget type. |
| `spec.label` | `string` | Visible text. Required except for `divider`. |
| `spec.theme` | `'light' \| 'dark'` | Optional. Defaults to config. |

Returns a fully normalized `Widget`.

## `renderWidget(widget: Widget): string`

Renders a normalized widget to an HTML string. Pure; never throws.

## `validateWidget(raw: RawWidget): Widget | ValidationError[]`

Lower-level entry point. Returns either a valid `Widget` or a list of errors.

## Types

```ts
interface Widget {
  kind: WidgetKind;
  label: string;
  theme: Theme;
  children: Widget[];
}
```
