import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

/** Narrow shape of the error execFile rejects with on a non-zero exit code. */
interface ExecFileError {
  stdout?: string;
  stderr?: string;
  message: string;
}

function isExecFileError(error: unknown): error is ExecFileError {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/** Toplevel of the git repo containing `dir` (may be `dir` itself or a parent
 *  folder), or `null` if `dir` isn't inside any git repo. */
export async function findRepoRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', '--show-toplevel'], { cwd: dir });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Resolves the repo root for `dir`, initializing a new repo in `dir` only if
 *  it isn't already inside one (checking parent folders too, so nested project
 *  files sharing a repo don't each get their own disconnected history). */
export async function ensureGitRepo(dir: string): Promise<string> {
  const root = await findRepoRoot(dir);
  if (root) return root;
  await execFile('git', ['init'], { cwd: dir });
  return dir;
}

export async function hasRemote(dir: string): Promise<boolean> {
  const root = await findRepoRoot(dir);
  if (!root) return false;
  try {
    const { stdout } = await execFile('git', ['remote'], { cwd: root });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function gitCommit(
  dir: string,
  message: string,
): Promise<{ committed: boolean; output: string }> {
  const root = await ensureGitRepo(dir);
  await execFile('git', ['add', '-A'], { cwd: root });

  try {
    const { stdout } = await execFile('git', ['commit', '-m', message], { cwd: root });
    return { committed: true, output: stdout };
  } catch (error) {
    if (isExecFileError(error)) {
      const combined = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`;
      if (combined.includes('nothing to commit')) {
        return { committed: false, output: 'Nothing to commit' };
      }
    }
    throw error;
  }
}

export async function setRemote(dir: string, url: string): Promise<void> {
  const root = await ensureGitRepo(dir);
  const args = (await hasRemote(root))
    ? ['remote', 'set-url', 'origin', url]
    : ['remote', 'add', 'origin', url];
  await execFile('git', args, { cwd: root });
}

/** Non-fast-forward rejection — the local branch is behind the remote (or has
 *  diverged from it), not a permissions/auth problem. Deliberately narrower
 *  than "failed to push some refs" alone, which also fires for e.g. a
 *  pre-receive hook rejection where "Pull first" would be misleading advice. */
function isNonFastForwardRejection(combined: string): boolean {
  return (
    /\[rejected\]/.test(combined) ||
    /fetch first/.test(combined) ||
    /non-fast-forward/.test(combined)
  );
}

const REJECTED_MESSAGE = "Remote has commits you don't have locally — Pull from Remote before pushing again.";

export async function gitPush(dir: string): Promise<{ pushed: boolean; message: string; error?: boolean }> {
  const root = await findRepoRoot(dir);
  if (!root || !(await hasRemote(root))) {
    return {
      pushed: false,
      message: `No git remote configured — run \`git remote add origin <url>\` in ${dir}`,
    };
  }

  try {
    const { stdout, stderr } = await execFile('git', ['push'], { cwd: root });
    return { pushed: true, message: stdout || stderr };
  } catch (error) {
    if (!isExecFileError(error)) throw error;
    const combined = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`;

    if (/has no upstream branch/.test(combined)) {
      // First push on a fresh branch: `git push` alone has nothing to infer the
      // upstream from. Set it explicitly against the current branch and retry.
      const { stdout: branch } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root });
      try {
        const { stdout, stderr } = await execFile(
          'git',
          ['push', '--set-upstream', 'origin', branch.trim()],
          { cwd: root },
        );
        return { pushed: true, message: stdout || stderr };
      } catch (retryError) {
        if (isExecFileError(retryError)) {
          const retryCombined = `${retryError.stdout ?? ''}${retryError.stderr ?? ''}${retryError.message}`;
          if (isNonFastForwardRejection(retryCombined)) {
            return { pushed: false, message: REJECTED_MESSAGE, error: true };
          }
        }
        throw retryError;
      }
    }

    if (isNonFastForwardRejection(combined)) {
      return { pushed: false, message: REJECTED_MESSAGE, error: true };
    }

    throw error;
  }
}

const CONFLICT_MESSAGE =
  'Pull produced a merge conflict — resolve the conflicting file(s) and commit manually before continuing.';

function isMergeConflict(combined: string): boolean {
  return /CONFLICT/.test(combined) || /Automatic merge failed/.test(combined);
}

export async function gitPull(dir: string): Promise<{ pulled: boolean; message: string; error?: boolean }> {
  const root = await findRepoRoot(dir);
  if (!root || !(await hasRemote(root))) {
    return {
      pulled: false,
      message: `No git remote configured — run \`git remote add origin <url>\` in ${dir}`,
    };
  }

  try {
    const { stdout, stderr } = await execFile('git', ['pull'], { cwd: root });
    return { pulled: true, message: stdout || stderr };
  } catch (error) {
    if (!isExecFileError(error)) throw error;
    const combined = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}`;

    if (/refusing to merge unrelated histories/.test(combined)) {
      try {
        const { stdout, stderr } = await execFile(
          'git',
          ['pull', '--allow-unrelated-histories'],
          { cwd: root },
        );
        return { pulled: true, message: stdout || stderr };
      } catch (retryError) {
        if (isExecFileError(retryError)) {
          const retryCombined = `${retryError.stdout ?? ''}${retryError.stderr ?? ''}${retryError.message}`;
          if (isMergeConflict(retryCombined)) {
            return { pulled: false, message: CONFLICT_MESSAGE, error: true };
          }
        }
        throw retryError;
      }
    }

    if (isMergeConflict(combined)) {
      return { pulled: false, message: CONFLICT_MESSAGE, error: true };
    }

    throw error;
  }
}
