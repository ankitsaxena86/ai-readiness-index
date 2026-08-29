import { describe, expect, it } from 'vitest';
import { findRootFile, isExcluded, matchGlob } from './fsUtils';
import type { RepoTree } from './types';

function tree(files: string[]): RepoTree {
  return { root: '/x', files: [...files].sort(), dirs: [], sizes: new Map() };
}

describe('matchGlob', () => {
  it('matches ** across path segments', () => {
    expect(matchGlob('**/node_modules/**', 'node_modules/foo')).toBe(true);
    expect(matchGlob('**/node_modules/**', 'a/b/node_modules/c/d')).toBe(true);
    expect(matchGlob('**/node_modules/**', 'src/node_modules_helper.ts')).toBe(false);
  });

  it('matches * only within a segment', () => {
    expect(matchGlob('src/*.ts', 'src/index.ts')).toBe(true);
    expect(matchGlob('src/*.ts', 'src/sub/index.ts')).toBe(false);
  });

  it('handles the asar.unpacked safety-net pattern', () => {
    expect(matchGlob('**/*.asar.unpacked/**', '.vscode-test/x/node_modules.asar.unpacked/foo')).toBe(true);
  });
});

describe('isExcluded', () => {
  const ex = ['**/node_modules/**', '**/.vscode-test/**', '**/test/fixtures/**'];
  it('excludes downloaded VS Code and fixture trees', () => {
    expect(isExcluded('.vscode-test/vscode-win32/resources/app/extensions/foo/readme.md', ex)).toBe(true);
    expect(isExcluded('test/fixtures/ready-repo/README.md', ex)).toBe(true);
    expect(isExcluded('src/engine/scanner.ts', ex)).toBe(false);
  });
});

describe('findRootFile', () => {
  it('prefers the exact repo-root file over a nested copy', () => {
    const t = tree([
      '.vscode-test/x/extensions/foo/readme.md',
      'test/fixtures/ready-repo/README.md',
      'README.md',
    ]);
    expect(findRootFile(t, 'README.md')).toBe('README.md');
  });

  it('falls back to the shallowest match when there is no root file', () => {
    const t = tree(['packages/app/README.md', 'packages/app/src/deep/README.md']);
    expect(findRootFile(t, 'README.md')).toBe('packages/app/README.md');
  });

  it('accepts any of several candidate names', () => {
    const t = tree(['docs/x.md', 'README.rst']);
    expect(findRootFile(t, 'README.md', 'README.rst', 'README')).toBe('README.rst');
  });

  it('returns undefined when nothing matches', () => {
    expect(findRootFile(tree(['src/a.ts']), 'README.md')).toBeUndefined();
  });
});
