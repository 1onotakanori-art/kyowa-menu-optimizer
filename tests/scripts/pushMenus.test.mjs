import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildCommitMessage, pushMenus } from '../../scripts/push-menus.js';

test('buildCommitMessage: 日付範囲を入れ、同じ年なら終了日の年を省く', () => {
  assert.equal(
    buildCommitMessage([
      'menus/available-dates.json',
      'menus/menus_2026-10-30.json',
      'menus/menus_2026-10-19.json',
    ]),
    'chore: メニューデータを自動更新（2026-10-19〜10-30）'
  );
});

test('buildCommitMessage: 1日だけ・年またぎ・日付なし', () => {
  assert.equal(buildCommitMessage(['menus/menus_2026-10-19.json']), 'chore: メニューデータを自動更新（2026-10-19）');
  assert.equal(
    buildCommitMessage(['menus/menus_2026-12-28.json', 'menus/menus_2027-01-05.json']),
    'chore: メニューデータを自動更新（2026-12-28〜2027-01-05）'
  );
  assert.equal(buildCommitMessage(['menus/available-dates.json']), 'chore: メニューデータを自動更新');
});

// --- 一時リポジトリ（bare の origin + 作業用クローン）で実際の git 動作を確かめる ---

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function configure(dir) {
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'core.autocrlf', 'false');
}

function setupRepos(t) {
  const root = mkdtempSync(join(tmpdir(), 'push-menus-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, work);
  configure(work);
  git(work, 'checkout', '-q', '-b', 'main');

  mkdirSync(join(work, 'menus'));
  writeFileSync(join(work, 'menus', 'available-dates.json'), '[]\n');
  writeFileSync(join(work, 'other.txt'), 'v1\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'init');
  git(work, 'push', '-q', '-u', 'origin', 'main');
  return { root, origin, work };
}

const originHead = origin => git(origin, 'rev-parse', 'main');
const originFiles = origin => git(origin, 'ls-tree', '-r', '--name-only', 'main').split('\n');

test('pushMenus: menus/ の変更だけをコミットして push する', t => {
  const { origin, work } = setupRepos(t);
  writeFileSync(join(work, 'menus', 'menus_2026-10-19.json'), '{}\n');
  writeFileSync(join(work, 'menus', 'available-dates.json'), '["2026-10-19"]\n');
  writeFileSync(join(work, 'other.txt'), 'v2\n'); // 未ステージの変更
  writeFileSync(join(work, 'staged.txt'), 'x\n');
  git(work, 'add', 'staged.txt'); // ステージ済みの変更

  pushMenus(work);

  assert.equal(git(origin, 'log', '-1', '--format=%s', 'main'), 'chore: メニューデータを自動更新（2026-10-19）');
  assert.ok(originFiles(origin).includes('menus/menus_2026-10-19.json'));
  assert.ok(!originFiles(origin).includes('staged.txt'));
  assert.equal(git(origin, 'show', 'main:other.txt'), 'v1');
  // menus/ 以外の変更は作業ツリーにそのまま残る
  assert.match(git(work, 'status', '--porcelain'), /other\.txt/);
  assert.match(git(work, 'status', '--porcelain'), /^A {2}staged\.txt/m);
});

test('pushMenus: 変更がなければ何もしない', t => {
  const { origin, work } = setupRepos(t);
  const before = originHead(origin);
  pushMenus(work);
  assert.equal(originHead(origin), before);
});

test('pushMenus: main 以外のブランチでは何もしない', t => {
  const { origin, work } = setupRepos(t);
  git(work, 'checkout', '-q', '-b', 'feature');
  writeFileSync(join(work, 'menus', 'menus_2026-10-19.json'), '{}\n');
  const before = originHead(origin);

  pushMenus(work);

  assert.equal(originHead(origin), before);
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'init');
});

test('pushMenus: menus/ 以外の未 push コミットがあれば push しない', t => {
  const { origin, work } = setupRepos(t);
  writeFileSync(join(work, 'other.txt'), 'local\n');
  git(work, 'commit', '-q', '-am', 'local work');
  writeFileSync(join(work, 'menus', 'menus_2026-10-19.json'), '{}\n');
  const before = originHead(origin);

  pushMenus(work);

  assert.equal(originHead(origin), before);
  // メニューのコミット自体はローカルに作られている
  assert.equal(git(work, 'log', '-1', '--format=%s'), 'chore: メニューデータを自動更新（2026-10-19）');
});

test('pushMenus: origin が先に進んでいても rebase して push する', t => {
  const { root, origin, work } = setupRepos(t);
  const other = join(root, 'other');
  git(root, 'clone', '-q', origin, other);
  configure(other);
  writeFileSync(join(other, 'README.md'), 'remote change\n');
  git(other, 'add', '-A');
  git(other, 'commit', '-q', '-m', 'remote change');
  git(other, 'push', '-q', 'origin', 'main');

  writeFileSync(join(work, 'menus', 'menus_2026-10-19.json'), '{}\n');
  pushMenus(work);

  assert.equal(git(origin, 'log', '-1', '--format=%s', 'main'), 'chore: メニューデータを自動更新（2026-10-19）');
  assert.equal(git(origin, 'log', '-1', '--format=%s', 'main~1'), 'remote change');
});
