import { readFile } from 'node:fs/promises';
import type { Theme } from '../types';

/** Runtime configuration loaded from `widget.config.json`. */
export interface ToolkitConfig {
  strictValidation: boolean;
  defaultTheme: Theme;
}

const DEFAULTS: ToolkitConfig = {
  strictValidation: true,
  defaultTheme: 'light',
};

/**
 * Load `widget.config.json` from `dir`, falling back to defaults if it is
 * missing. This is the only function in the toolkit that touches the disk.
 */
export async function readConfig(dir: string): Promise<ToolkitConfig> {
  try {
    const raw = await readFile(`${dir}/widget.config.json`, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ToolkitConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    // Missing or unreadable config is fine — callers get sensible defaults.
    return DEFAULTS;
  }
}
