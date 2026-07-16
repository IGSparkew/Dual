/**
 * Tests for `electron/git.ts` — the thin `execFile('git', ...)` wrapper used by
 * the Save Version / Git Commit / Git Push / Git Pull menu actions
 * (`electron/ipc.ts`).
 *
 * `node:child_process` is mocked so no real git process ever runs. The mocked
 * `execFile` follows the Node error-first-callback shape `(cmd, args, options,
 * callback)` that `promisify` (used inside `git.ts`) wraps into a Promise —
 * callbacks are invoked with a single `{ stdout, stderr }` success value,
 * mirroring child_process's real `util.promisify.custom` behaviour for
 * `execFile`, so `git.ts`'s `const { stdout } = await execFile(...)`
 * destructuring works unmodified.
 *
 * `git.ts` no longer touches `node:fs` — repo detection goes through
 * `findRepoRoot` (`git rev-parse --show-toplevel`), which also walks up into
 * parent folders. That's what lets a project nested inside an existing repo
 * share it instead of getting its own disconnected history. Only
 * `node:child_process` needs mocking here.
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

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(
    (_cmd: string, _args: string[], _options: unknown, callback: ExecCallback) => {
      callback(null, { stdout: '', stderr: '' });
    },
  ),
}));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

import { findRepoRoot, ensureGitRepo, hasRemote, gitCommit, setRemote, gitPush, gitPull } from '../../electron/git';

/** Builds a fake execFile error the way Node's real execFile rejects with on
 *  a non-zero exit code (stdout/stderr attached alongside `message`). */
function execError(message: string, stdout = '', stderr = ''): Error & { stdout: string; stderr: string } {
  const err = new Error(message) as Error & { stdout: string; stderr: string };
  err.stdout = stdout;
  err.stderr = stderr;
  return err;
}

type Route = { stdout?: string; stderr?: string } | { error: Error & { stdout?: string; stderr?: string } };

/** Wires `execFileMock` to answer per exact argv (joined with spaces), falling
 *  back to an empty success for anything not listed — keeps each test's
 *  routing table short and focused on what it actually asserts on. */
function mockGit(routes: Record<string, Route>, fallback: Route = { stdout: '', stderr: '' }) {
  execFileMock.mockImplementation((_cmd: string, args: string[], _options: unknown, cb: ExecCallback) => {
    const route = routes[args.join(' ')] ?? fallback;
    if ('error' in route) {
      cb(route.error);
    } else {
      cb(null, { stdout: route.stdout ?? '', stderr: route.stderr ?? '' });
    }
  });
}

beforeEach(() => {
  execFileMock.mockClear();
});

describe('findRepoRoot', () => {
  it('returns the trimmed toplevel path when `git rev-parse --show-toplevel` succeeds', async () => {
    mockGit({ 'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' } });

    expect(await findRepoRoot('/repo-root/nested/project')).toBe('/repo-root');
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: '/repo-root/nested/project' },
      expect.any(Function),
    );
  });

  it('returns null when the command fails (not inside any git repo)', async () => {
    mockGit({ 'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') } });

    expect(await findRepoRoot('/projects')).toBeNull();
  });
});

describe('ensureGitRepo', () => {
  it('does not run `git init` when a root is found, even if it differs from the passed dir', async () => {
    mockGit({ 'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' } });

    const root = await ensureGitRepo('/repo-root/nested/project');

    expect(root).toBe('/repo-root');
    expect(execFileMock).not.toHaveBeenCalledWith('git', ['init'], expect.anything(), expect.anything());
  });

  it('runs `git init` in dir and returns dir when no root is found', async () => {
    mockGit({ 'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') } });

    const root = await ensureGitRepo('/projects');

    expect(root).toBe('/projects');
    expect(execFileMock).toHaveBeenCalledWith('git', ['init'], { cwd: '/projects' }, expect.any(Function));
  });
});

describe('hasRemote', () => {
  it('returns false without calling `git remote` when findRepoRoot resolves null', async () => {
    mockGit({ 'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') } });

    expect(await hasRemote('/projects')).toBe(false);
    expect(execFileMock).not.toHaveBeenCalledWith('git', ['remote'], expect.anything(), expect.anything());
  });

  it('returns true when `git remote` prints at least one remote name', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
    });

    expect(await hasRemote('/projects')).toBe(true);
  });

  it('returns false when `git remote` prints nothing', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: '   \n', stderr: '' },
    });

    expect(await hasRemote('/projects')).toBe(false);
  });

  it('returns false (swallows the error) when `git remote` itself fails', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { error: execError('fatal: some git failure') },
    });

    expect(await hasRemote('/projects')).toBe(false);
  });
});

describe('gitCommit', () => {
  it('stages and commits using the resolved repo root as cwd, not the raw dir', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      'add -A': { stdout: '', stderr: '' },
      'commit -m msg': { stdout: '[main abc123] msg', stderr: '' },
    });

    const result = await gitCommit('/repo-root/nested/project', 'msg');

    expect(result).toEqual({ committed: true, output: '[main abc123] msg' });
    expect(execFileMock).toHaveBeenCalledWith('git', ['add', '-A'], { cwd: '/repo-root' }, expect.any(Function));
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'msg'],
      { cwd: '/repo-root' },
      expect.any(Function),
    );
  });

  it('distinguishes "nothing to commit" from a real error: resolves, does not throw', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      'add -A': { stdout: '', stderr: '' },
      'commit -m msg': { error: execError('Command failed', '', 'nothing to commit, working tree clean') },
    });

    const result = await gitCommit('/projects', 'msg');
    expect(result).toEqual({ committed: false, output: 'Nothing to commit' });
  });

  it('rethrows a genuine git failure (e.g. missing user.email) so the IPC layer can flag error:true', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      'add -A': { stdout: '', stderr: '' },
      'commit -m msg': {
        error: execError('Command failed', '', 'Author identity unknown\n\n*** Please tell me who you are.\n'),
      },
    });

    await expect(gitCommit('/projects', 'msg')).rejects.toThrow();
  });

  it('runs `git init` first when no repo is found anywhere up the tree, then commits in dir', async () => {
    mockGit({
      'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') },
      'add -A': { stdout: '', stderr: '' },
      'commit -m msg': { stdout: 'ok', stderr: '' },
    });

    await gitCommit('/projects', 'msg');

    expect(execFileMock).toHaveBeenCalledWith('git', ['init'], { cwd: '/projects' }, expect.any(Function));
    expect(execFileMock).toHaveBeenCalledWith('git', ['add', '-A'], { cwd: '/projects' }, expect.any(Function));
  });
});

describe('setRemote', () => {
  it('adds the remote using the resolved repo root as cwd when none exists yet', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: '', stderr: '' },
    });

    await setRemote('/repo-root/nested/project', 'https://example.com/repo.git');

    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', 'https://example.com/repo.git'],
      { cwd: '/repo-root' },
      expect.any(Function),
    );
  });

  it('updates the remote URL (set-url) using the resolved root when a remote already exists', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
    });

    await setRemote('/repo-root/nested/project', 'https://example.com/repo.git');

    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['remote', 'set-url', 'origin', 'https://example.com/repo.git'],
      { cwd: '/repo-root' },
      expect.any(Function),
    );
  });

  it('initializes a repo in dir first when none is found, then sets the remote there', async () => {
    mockGit({
      'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') },
      remote: { stdout: '', stderr: '' },
    });

    await setRemote('/projects', 'https://example.com/repo.git');

    expect(execFileMock).toHaveBeenCalledWith('git', ['init'], { cwd: '/projects' }, expect.any(Function));
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', 'https://example.com/repo.git'],
      { cwd: '/projects' },
      expect.any(Function),
    );
  });
});

describe('gitPush', () => {
  it('never calls `git push` when hasRemote resolves false — safety-critical no-push guard', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: '', stderr: '' }, // no remote
    });

    const result = await gitPush('/projects');

    expect(result.pushed).toBe(false);
    expect(result.message).toMatch(/no git remote/i);
    expect(execFileMock).not.toHaveBeenCalledWith('git', ['push'], expect.anything(), expect.anything());
  });

  it('never creates a repo (no `git init`) even when findRepoRoot resolves null', async () => {
    mockGit({ 'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') } });

    const result = await gitPush('/projects');

    expect(result.pushed).toBe(false);
    expect(execFileMock).not.toHaveBeenCalledWith('git', ['init'], expect.anything(), expect.anything());
  });

  it('pushes and returns pushed:true when a remote is configured, using the resolved root as cwd', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { stdout: 'Everything up-to-date', stderr: '' },
    });

    const result = await gitPush('/repo-root/nested/project');

    expect(result).toEqual({ pushed: true, message: 'Everything up-to-date' });
    expect(execFileMock).toHaveBeenCalledWith('git', ['push'], { cwd: '/repo-root' }, expect.any(Function));
  });

  it('falls back to stderr for the message when push stdout is empty', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { stdout: '', stderr: 'branch is up to date' },
    });

    const result = await gitPush('/projects');
    expect(result).toEqual({ pushed: true, message: 'branch is up to date' });
  });

  it('propagates a real push failure (e.g. auth error) as a rejection', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { error: execError('Command failed', '', 'fatal: Authentication failed') },
    });

    await expect(gitPush('/projects')).rejects.toThrow();
  });

  it('retries with --set-upstream on a fresh branch that has no upstream yet', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { error: execError('Command failed', '', 'fatal: The current branch main has no upstream branch.') },
      'rev-parse --abbrev-ref HEAD': { stdout: 'main\n', stderr: '' },
      'push --set-upstream origin main': { stdout: 'Branch main set up to track origin/main.', stderr: '' },
    });

    const result = await gitPush('/repo-root/nested/project');

    expect(result).toEqual({ pushed: true, message: 'Branch main set up to track origin/main.' });
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['push', '--set-upstream', 'origin', 'main'],
      { cwd: '/repo-root' },
      expect.any(Function),
    );
  });

  it('resolves (does not throw) with pushed:false, error:true on a non-fast-forward rejection', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: {
        error: execError(
          'Command failed',
          '',
          "! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'origin'\n",
        ),
      },
    });

    const result = await gitPush('/repo-root/nested/project');

    expect(result).toEqual({
      pushed: false,
      error: true,
      message: "Remote has commits you don't have locally — Pull from Remote before pushing again.",
    });
  });

  it('also detects a bare "fetch first" rejection message without the [rejected] marker', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { error: execError('Command failed', '', 'hint: Updates were rejected, fetch first.') },
    });

    const result = await gitPush('/projects');

    expect(result.pushed).toBe(false);
    expect(result.error).toBe(true);
    expect(result.message).toMatch(/Pull from Remote before pushing again/);
  });

  it('detects a non-fast-forward rejection on the --set-upstream retry itself, not just the initial push', async () => {
    // Exact scenario reported by a user: a fresh local branch (no upstream)
    // pointed at a remote that already has commits — the first push fails
    // with "no upstream", and the --set-upstream retry is what actually gets
    // rejected as non-fast-forward.
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { error: execError('Command failed', '', 'fatal: The current branch master has no upstream branch.') },
      'rev-parse --abbrev-ref HEAD': { stdout: 'master\n', stderr: '' },
      'push --set-upstream origin master': {
        error: execError(
          'Command failed',
          '',
          "To https://github.com/user/repo.git\n! [rejected]        master -> master (fetch first)\nerror: failed to push some refs",
        ),
      },
    });

    const result = await gitPush('/repo-root/nested/project');

    expect(result).toEqual({
      pushed: false,
      error: true,
      message: "Remote has commits you don't have locally — Pull from Remote before pushing again.",
    });
  });

  it('rethrows a --set-upstream retry failure that is not a non-fast-forward rejection', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      push: { error: execError('Command failed', '', 'fatal: The current branch master has no upstream branch.') },
      'rev-parse --abbrev-ref HEAD': { stdout: 'master\n', stderr: '' },
      'push --set-upstream origin master': {
        error: execError('Command failed', '', 'fatal: Authentication failed'),
      },
    });

    await expect(gitPush('/repo-root/nested/project')).rejects.toThrow();
  });
});

describe('gitPull', () => {
  it('pulls directly and returns pulled:true using the resolved root as cwd', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      pull: { stdout: 'Already up to date.', stderr: '' },
    });

    const result = await gitPull('/repo-root/nested/project');

    expect(result).toEqual({ pulled: true, message: 'Already up to date.' });
    expect(execFileMock).toHaveBeenCalledWith('git', ['pull'], { cwd: '/repo-root' }, expect.any(Function));
  });

  it('falls back to stderr for the message when pull stdout is empty', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      pull: { stdout: '', stderr: 'Fast-forward' },
    });

    const result = await gitPull('/projects');
    expect(result).toEqual({ pulled: true, message: 'Fast-forward' });
  });

  it('retries with --allow-unrelated-histories on that specific error and returns its result', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      pull: { error: execError('Command failed', '', 'fatal: refusing to merge unrelated histories') },
      'pull --allow-unrelated-histories': { stdout: 'Merge made by the recursive strategy.', stderr: '' },
    });

    const result = await gitPull('/repo-root/nested/project');

    expect(result).toEqual({ pulled: true, message: 'Merge made by the recursive strategy.' });
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['pull', '--allow-unrelated-histories'],
      { cwd: '/repo-root' },
      expect.any(Function),
    );
  });

  it('propagates any other pull failure as a rejection', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      pull: { error: execError('Command failed', '', 'fatal: Authentication failed') },
    });

    await expect(gitPull('/projects')).rejects.toThrow();
  });

  it('resolves (does not throw) with a clear message on a merge conflict', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/projects\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      pull: {
        error: execError(
          'Command failed',
          'Auto-merging song.strudel\nCONFLICT (content): Merge conflict in song.strudel\n',
          'Automatic merge failed; fix conflicts and then commit the result.',
        ),
      },
    });

    const result = await gitPull('/projects');

    expect(result).toEqual({
      pulled: false,
      error: true,
      message: 'Pull produced a merge conflict — resolve the conflicting file(s) and commit manually before continuing.',
    });
  });

  it('also reports a merge conflict hit on the --allow-unrelated-histories retry', async () => {
    mockGit({
      'rev-parse --show-toplevel': { stdout: '/repo-root\n', stderr: '' },
      remote: { stdout: 'origin\n', stderr: '' },
      pull: { error: execError('Command failed', '', 'fatal: refusing to merge unrelated histories') },
      'pull --allow-unrelated-histories': {
        error: execError(
          'Command failed',
          '',
          'CONFLICT (add/add): Merge conflict in song.strudel\nAutomatic merge failed; fix conflicts and then commit the result.',
        ),
      },
    });

    const result = await gitPull('/repo-root/nested/project');

    expect(result.pulled).toBe(false);
    expect(result.error).toBe(true);
    expect(result.message).toMatch(/merge conflict/i);
  });

  it('returns an explanatory message without calling `git pull` when there is no repo/remote', async () => {
    mockGit({ 'rev-parse --show-toplevel': { error: execError('fatal: not a git repository') } });

    const result = await gitPull('/projects');

    expect(result.pulled).toBe(false);
    expect(result.message).toMatch(/no git remote/i);
    expect(execFileMock).not.toHaveBeenCalledWith('git', ['pull'], expect.anything(), expect.anything());
  });
});
