import { toPosixPath } from 'obsidian-dev-utils/path';

export function isDotFile(path: string): boolean {
  path = toPosixPath(path) || '/';
  return path.split('/').some((part) => part.startsWith('.'));
}
