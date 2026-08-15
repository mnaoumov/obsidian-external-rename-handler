import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

// Desktop only: the manifest marks this plugin desktop-only.
await wrapCliTask(async () => {
  await test({
    projects: ['capture-screenshots:desktop']
  });
});
