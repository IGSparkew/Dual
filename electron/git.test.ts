/**
 * Tests for `electron/git.ts` — the thin `execFile('git', ...)` wrapper used by
 * the Save Version / Git Commit / Git Push menu actions (`electron/ipc.ts`).
 *
 * `node:child_process` is mocked so no real git process ever runs. The mocked
 * `execFile` follows the Node error-first-callback shape `(cmd, args, options,
 * callback)` that `promisify` (used inside `git.ts`) wraps into a Promise —
 * callbacks are invoked with a single `{ stdout, stderr }` success value,
 * mirroring child_process's real `util.promisify.custom` behaviour for
 * `execFile`, so `git.ts`'s `const { stdout } = await execFile(...)`
 * destructuring works unmodified.
 *
 * `vi.mock` factories are hoisted above imports, so the mock functions
 * themselves must be created via `vi.hoisted` (a bare top-level const would
 * throw a TDZ error the moment `git.ts`'s top-level `import` executes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type ExecCallback = (
  error: unknown,
  result?: { stdout: string; stderr: string },
) => void;

const { execFileMock, existsSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(
    (_cmd: string, _args: string[], _options: unknown, callback: ExecCallback) => {
      callback(null, { stdout: '', stderr: '' });
    },
  ),
  existsSyncMock: vi.fn(() => true),
}));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('node:fs', () => ({ default: { existsSync: existsSyncMock } }));

import { ensureGitRepo, hasRemote, gitCommit, gitPush } from './git';

/** Builds a fake execFile error the way Node's real execFile rejects with on
 *  a non-zero exit code (stdout/stderr attached alongside `message`). */
function execError(message: string, stdout = '', stderr = ''): Error & { stdout: string; stderr: string } {
  const err = new Error(message) as Error & { stdout: string; stderr: string };
  err.stdout = stdout;
  err.stderr = stderr;
  return err;
}

describe('ensureGitRepo', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    existsSyncMock.mockClear();
    execFileMock.mockImplementation((_cmd, _args, _options, cb: ExecCallback) =>
      cb(null, { stdout: '', stderr: '' }),
    );
  });

  it('does not reinitialize a repo that already has a .git directory', async () => {
    existsSyncMock.mockReturnValue(true);
    await ensureGitRepo('/projects');
    expect(existsSyncMock).toHaveBeenCalledWith(expect.stringContaining('.git'));
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('runs `git init` when .git is absent', async () => {
    existsSyncMock.mockReturnValue(false);
    await ensureGitRepo('/projects');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['init'],
      { cwd: '/projects' },
      expect.any(Function),
    );
  });
});

describe('hasRemote', () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it('returns true when `git remote` prints at least one remote name', async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, cb: ExecCallback) =>
      cb(null, { stdout: 'origin\n', stderr: '' }),
    );
    expect(await hasRemote('/projects')).toBe(true);
  });

  it('returns false when `git remote` prints nothing', async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, cb: ExecCallback) =>
      cb(null, { stdout: '   \n', stderr: '' }),
    );
    expect(await hasRemote('/projects')).toBe(false);
  });

  it('returns false (swallows the error) when git itself fails, e.g. not a repo', async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, cb: ExecCallback) =>
      cb(execError('fatal: not a git repository')),
    );
    expect(await hasRemote('/projects')).toBe(false);
  });
});

describe('gitCommit', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    existsSyncMock.mockReturnValue(true);
  });

  it('stages everything then commits, returning committed:true with the commit stdout', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'commit') return cb(null, { stdout: '[main abc123] msg', stderr: '' });
      return cb(null, { stdout: '', stderr: '' });
    });

    const result = await gitCommit('/projects', 'msg');

    expect(result).toEqual({ committed: true, output: '[main abc123] msg' });
    expect(execFileMock).toHaveBeenCalledWith('git', ['add', '-A'], { cwd: '/projects' }, expect.any(Function));
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'msg'],
      { cwd: '/projects' },
      expect.any(Function),
    );
  });

  it('distinguishes "nothing to commit" from a real error: resolves, does not throw', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'commit') {
        return cb(execError('Command failed', '', 'nothing to commit, working tree clean'));
      }
      return cb(null, { stdout: '', stderr: '' });
    });

    const result = await gitCommit('/projects', 'msg');
    expect(result).toEqual({ committed: false, output: 'Nothing to commit' });
  });

  it('rethrows a genuine git failure (e.g. missing user.email) so the IPC layer can flag error:true', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'commit') {
        return cb(
          execError(
            'Command failed',
            '',
            'Author identity unknown\n\n*** Please tell me who you are.\n',
          ),
        );
      }
      return cb(null, { stdout: '', stderr: '' });
    });

    await expect(gitCommit('/projects', 'msg')).rejects.toThrow();
  });

  it('ensures the repo exists (calls `git init` first) when .git is missing', async () => {
    existsSyncMock.mockReturnValue(false);
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'commit') return cb(null, { stdout: 'ok', stderr: '' });
      return cb(null, { stdout: '', stderr: '' });
    });

    await gitCommit('/projects', 'msg');

    expect(execFileMock).toHaveBeenCalledWith('git', ['init'], { cwd: '/projects' }, expect.any(Function));
  });
});

describe('gitPush', () => {
  beforeEach(() => {
    execFileMock.mockClear();
  });

  it('never calls `git push` when hasRemote resolves false — safety-critical no-push guard', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'remote') return cb(null, { stdout: '', stderr: '' }); // no remote
      return cb(null, { stdout: '', stderr: '' });
    });

    const result = await gitPush('/projects');

    expect(result.pushed).toBe(false);
    expect(result.message).toMatch(/no git remote/i);
    expect(execFileMock).not.toHaveBeenCalledWith('git', ['push'], expect.anything(), expect.anything());
  });

  it('pushes and returns pushed:true when a remote is configured', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'remote') return cb(null, { stdout: 'origin\n', stderr: '' });
      if (args[0] === 'push') return cb(null, { stdout: 'Everything up-to-date', stderr: '' });
      return cb(null, { stdout: '', stderr: '' });
    });

    const result = await gitPush('/projects');

    expect(result).toEqual({ pushed: true, message: 'Everything up-to-date' });
    expect(execFileMock).toHaveBeenCalledWith('git', ['push'], { cwd: '/projects' }, expect.any(Function));
  });

  it('falls back to stderr for the message when push stdout is empty', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'remote') return cb(null, { stdout: 'origin\n', stderr: '' });
      if (args[0] === 'push') return cb(null, { stdout: '', stderr: 'branch is up to date' });
      return cb(null, { stdout: '', stderr: '' });
    });

    const result = await gitPush('/projects');
    expect(result).toEqual({ pushed: true, message: 'branch is up to date' });
  });

  it('propagates a real push failure (e.g. auth error) as a rejection', async () => {
    execFileMock.mockImplementation((_cmd, args: string[], _options, cb: ExecCallback) => {
      if (args[0] === 'remote') return cb(null, { stdout: 'origin\n', stderr: '' });
      if (args[0] === 'push') return cb(execError('Command failed', '', 'fatal: Authentication failed'));
      return cb(null, { stdout: '', stderr: '' });
    });

    await expect(gitPush('/projects')).rejects.toThrow();
  });
});
