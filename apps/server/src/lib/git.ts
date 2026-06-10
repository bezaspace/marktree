import simpleGit, { type SimpleGit } from 'simple-git';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export async function initGitRepo(repoPath: string): Promise<void> {
  mkdirSync(repoPath, { recursive: true });
  const git = simpleGit(repoPath);
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    await git.init();
    await git.addConfig('user.name', 'Marktree');
    await git.addConfig('user.email', 'system@marktree.local');
  }
}

export async function writeAndCommit(
  repoPath: string,
  filePath: string,
  content: string,
  message: string,
  author?: { name: string; email: string }
): Promise<string> {
  const git = simpleGit(repoPath);
  const fullPath = join(repoPath, filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  await git.add(filePath);

  const commitOpts: Record<string, string> = {};
  if (author) {
    commitOpts['--author'] = `${author.name} <${author.email}>`;
  }

  const result = await git.commit(message, filePath, commitOpts);
  return result.commit || 'unknown';
}

export async function getHistory(repoPath: string, filePath: string) {
  const git = simpleGit(repoPath);
  try {
    const log = await git.log({ file: filePath });
    return log.all.map((entry) => ({
      hash: entry.hash,
      author: entry.author_name,
      email: entry.author_email,
      date: entry.date,
      message: entry.message,
    }));
  } catch {
    return [];
  }
}

export async function getDiff(
  repoPath: string,
  filePath: string,
  fromHash: string,
  toHash: string
): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const diff = await git.diff([fromHash, toHash, '--', filePath]);
    return diff;
  } catch {
    return '';
  }
}

export async function getContentAtCommit(
  repoPath: string,
  filePath: string,
  commitHash: string
): Promise<string | null> {
  const git = simpleGit(repoPath);
  try {
    const result = await git.show([`${commitHash}:${filePath}`]);
    return result;
  } catch {
    return null;
  }
}
