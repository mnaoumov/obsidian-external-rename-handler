import type { FileSystemAdapter } from 'obsidian';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import { isDotFile } from '../dot-file.ts';

export type OnFileChangeFn = FileSystemAdapter['onFileChange'];

export class FileSystemAdapterOnFileChangePatchComponent extends MonkeyAroundComponent {
  public get originalOnFileChange(): OnFileChangeFn {
    return ensureNonNullable(this._originalOnFileChange);
  }

  private _originalOnFileChange?: OnFileChangeFn;

  public constructor(private readonly fileSystemAdapter: FileSystemAdapter) {
    super();
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'onFileChange',
      obj: this.fileSystemAdapter,
      patchHandler: ({
        fallback,
        originalArgs: [normalizedPath]
      }) => {
        if (normalizedPath === null) {
          return;
        }
        if (isDotFile(normalizedPath)) {
          fallback();
        }
      },
      postPatchHandler: ({
        originalMethod
      }) => {
        this._originalOnFileChange = originalMethod.bind(this.fileSystemAdapter);
      }
    });
  }
}
