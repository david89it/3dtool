// The e2e specs run in Node, but this project does not install @types/node.
// Just the few calls e2e/pages.spec.ts makes.
declare module 'node:child_process' {
  export function execFileSync(
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined>; stdio?: 'inherit' | 'pipe' | 'ignore'; cwd?: string },
  ): unknown;
  export function spawn(
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined>; stdio?: 'inherit' | 'pipe' | 'ignore'; cwd?: string },
  ): { kill(signal?: string): boolean };
}
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}
