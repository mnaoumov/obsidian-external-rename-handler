import { toPosixPath } from '@mnaoumov/typescript-lib/path';

export function isDotFile(path: string): boolean {
  path = toPosixPath(path) || '/';
  return path.split('/').some((part) => part.startsWith('.'));
}
