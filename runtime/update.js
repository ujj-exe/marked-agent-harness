import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

async function git(root, args) {
  const { stdout } = await exec('git', ['-C', root, ...args], { timeout: 3_000, maxBuffer: 65_536 });
  return stdout.trim();
}

/** Return the remote commit when this installed checkout is behind or different. */
export async function checkForUpdate(root, run = args => git(root, args)) {
  try {
    const [local, branch] = await Promise.all([
      run(['rev-parse', 'HEAD']),
      run(['branch', '--show-current']),
    ]);
    if (!local || !branch) return null;
    const remote = (await run(['ls-remote', 'origin', `refs/heads/${branch}`])).split(/\s+/)[0];
    return remote && remote !== local ? { local, remote, branch } : null;
  } catch {
    return null;
  }
}
