import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  version: 'stable',
  // Open a known-good fixture repo as the workspace so scan commands have
  // something real to run against.
  workspaceFolder: './test/fixtures/ready-repo',
  mocha: {
    ui: 'tdd',
    timeout: 60000,
  },
});
