import type { FileSystemAdapter } from 'obsidian';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import { isDotFile } from '../dot-file.ts';

export type OnFileChangeFunction = FileSystemAdapter['onFileChange'];

export class FileSystemAdapterOnFileChangePatchComponent extends MonkeyAroundComponent {
  public get originalOnFileChange(): OnFileChangeFunction {
    return ensureNonNullable(this._originalOnFileChange);
  }

  private _originalOnFileChange?: OnFileChangeFunction;

  public constructor(private readonly fileSystemAdapter: FileSystemAdapter) {
    super();
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.fileSystemAdapter,
      methodName: 'onFileChange',
      patchHandler: ({
        fallback,
        originalArguments: [normalizedPath]
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
