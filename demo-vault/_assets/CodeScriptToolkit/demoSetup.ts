import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

// External Rename Handler reacts to renames made OUTSIDE Obsidian (a file manager, terminal, or
// Git), so the demo is driven by actions you take in your OS rather than by a code-button. The only
// helper the vault needs is the shared CodeScript Toolkit installer used by the prerequisite note's
// button.
export async function installAndEnable(app: App, pluginId: string): Promise<void> {
  await installCommunityPlugin({ app, pluginId });
  await enableCommunityPlugin({ app, pluginId });
  new Notice(`Installed and enabled: ${pluginId}`);
}
