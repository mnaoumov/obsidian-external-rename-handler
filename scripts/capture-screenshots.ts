import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

// Desktop only: the manifest marks this plugin desktop-only.
await wrapCliTask(async () => {
  await test({
    projects: ['capture-screenshots:desktop']
  });
});
