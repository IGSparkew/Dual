import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

export async function ensureGitRepo(dir: string): Promise<void> {
  if (fs.existsSync(path.join(dir, '.git'))) return;
  await execFile('git', ['init'], { cwd: dir });
}

export async function hasRemote(dir: string): Promise<boolean> {
  try {
    const { stdout } = await execFile('git', ['remote'], { cwd: dir });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function gitCommit(
  dir: string,
  message: string,
): Promise<{ committed: boolean; output: string }> {
  await ensureGitRepo(dir);
  await execFile('git', ['add', '-A'], { cwd: dir });

  try {
    const { stdout } = await execFile('git', ['commit', '-m', message], { cwd: dir });
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

export async function gitPush(dir: string): Promise<{ pushed: boolean; message: string }> {
  if (!(await hasRemote(dir))) {
    return {
      pushed: false,
      message: 'No git remote configured — run `git remote add origin <url>` in userdata/projects',
    };
  }

  const { stdout, stderr } = await execFile('git', ['push'], { cwd: dir });
  return { pushed: true, message: stdout || stderr };
}
