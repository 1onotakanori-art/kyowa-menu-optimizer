#!/usr/bin/env node
/**
 * menus/ に変更があれば main にコミットして push する
 *
 * 実行方法:
 *   node scripts/push-menus.js   （npm run menus:push）
 *
 * - コミットするのは menus/ 配下だけ（ml/data などの他の変更は含めない）
 * - main ブランチ以外で実行された場合は何もしない
 * - push に失敗しても exit 0（Supabase へのアップロードが本命なので週次処理は止めない）。
 *   コミットはローカルに残るので、次回実行時にまとめて push される
 */

const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const BRANCH = 'main';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || result.error?.message || '').trim(),
  };
}

/**
 * 変更ファイル一覧からコミットメッセージを作る
 * 例: ['menus/menus_2026-10-19.json', 'menus/menus_2026-10-30.json']
 *     → 'chore: メニューデータを自動更新（2026-10-19〜10-30）'
 */
function buildCommitMessage(changedFiles) {
  const dates = changedFiles
    .map(file => file.match(/menus_(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter(Boolean)
    .sort();

  const title = 'chore: メニューデータを自動更新';
  if (dates.length === 0) return title;

  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return `${title}（${first}）`;
  // 同じ年なら終了日の年を省略する
  const lastLabel = first.slice(0, 4) === last.slice(0, 4) ? last.slice(5) : last;
  return `${title}（${first}〜${lastLabel}）`;
}

/**
 * ローカルにあって origin/main にまだ無いコミットを push する
 */
function pushPending(cwd) {
  const pull = git(cwd, ['pull', '--rebase', '--autostash', 'origin', BRANCH]);
  if (!pull.ok) {
    git(cwd, ['rebase', '--abort']);
    console.warn(`⚠️  git pull に失敗したため push を見送りました（次回再試行）:\n${pull.stderr}`);
    return false;
  }

  // menus/ 以外の未 push コミットが混ざっていたら、勝手に公開しないよう push しない
  const outgoing = git(cwd, ['diff', '--name-only', `origin/${BRANCH}..HEAD`]);
  const others = outgoing.stdout.split('\n').filter(file => file && !file.startsWith('menus/'));
  if (others.length > 0) {
    console.warn(`⚠️  menus/ 以外の未 push の変更があるため、自動 push を見送りました:\n${others.join('\n')}`);
    return false;
  }

  const push = git(cwd, ['push', 'origin', BRANCH]);
  if (!push.ok) {
    console.warn(`⚠️  git push に失敗しました（次回再試行）:\n${push.stderr}`);
    return false;
  }
  return true;
}

function pushMenus(cwd = repoRoot) {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.ok || branch.stdout !== BRANCH) {
    console.warn(`⚠️  現在のブランチが ${BRANCH} ではない（${branch.stdout || '不明'}）ため、メニューの push をスキップします`);
    return;
  }

  git(cwd, ['add', '-A', '--', 'menus/']);
  const diff = git(cwd, ['diff', '--cached', '--name-only', '--', 'menus/']);
  const changedFiles = diff.stdout ? diff.stdout.split('\n') : [];

  if (changedFiles.length > 0) {
    const message = buildCommitMessage(changedFiles);
    // パス指定でコミットし、menus/ 以外にステージ済みの変更があっても含めない
    const commit = git(cwd, ['commit', '-m', message, '--', 'menus/']);
    if (!commit.ok) {
      console.warn(`⚠️  コミットに失敗しました:\n${commit.stderr || commit.stdout}`);
      return;
    }
    console.log(`📝 ${message}（${changedFiles.length} ファイル）`);
  }

  const ahead = git(cwd, ['rev-list', '--count', `origin/${BRANCH}..HEAD`]);
  if (ahead.ok && ahead.stdout === '0') {
    console.log('ℹ️  push するメニューの変更はありません');
    return;
  }

  if (pushPending(cwd)) {
    console.log(`🚀 メニューデータを origin/${BRANCH} に push しました`);
  }
}

if (require.main === module) {
  pushMenus();
}

module.exports = { buildCommitMessage, pushMenus };
