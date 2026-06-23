import type { FileSystemAdapter } from 'obsidian';
import type { Mock } from 'vitest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { FileSystemAdapterOnFileChangePatchComponent } from './file-system-adapter-on-file-change-patch-component.ts';

interface PatchedAdapter {
  onFileChange(path: null | string): void;
}

function createAdapter(spy: Mock<(path: null | string) => void>): FileSystemAdapter {
  return castTo<FileSystemAdapter>({ onFileChange: spy });
}

describe('FileSystemAdapterOnFileChangePatchComponent', () => {
  describe('originalOnFileChange', () => {
    it('should throw when accessed before the component is loaded', () => {
      const component = new FileSystemAdapterOnFileChangePatchComponent(createAdapter(vi.fn()));
      expect(() => component.originalOnFileChange).toThrow('Value is undefined');
    });

    it('should expose the original method bound to the adapter once loaded', () => {
      const spy = vi.fn();
      const component = new FileSystemAdapterOnFileChangePatchComponent(createAdapter(spy));
      component.load();
      component.originalOnFileChange('original.md');
      expect(spy).toHaveBeenCalledWith('original.md');
    });
  });

  describe('patched onFileChange', () => {
    it('should ignore a null path', () => {
      const spy = vi.fn();
      const adapter = createAdapter(spy);
      const component = new FileSystemAdapterOnFileChangePatchComponent(adapter);
      component.load();
      castTo<PatchedAdapter>(adapter).onFileChange(null);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should forward dot files to the original method', () => {
      const spy = vi.fn();
      const adapter = createAdapter(spy);
      const component = new FileSystemAdapterOnFileChangePatchComponent(adapter);
      component.load();
      castTo<PatchedAdapter>(adapter).onFileChange('.git/config');
      expect(spy).toHaveBeenCalledWith('.git/config');
    });

    it('should not forward non-dot files to the original method', () => {
      const spy = vi.fn();
      const adapter = createAdapter(spy);
      const component = new FileSystemAdapterOnFileChangePatchComponent(adapter);
      component.load();
      castTo<PatchedAdapter>(adapter).onFileChange('normal.md');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
