/**
 * GitHub API ユーティリティ関数
 * 
 * 機能:
 * - GitHub リポジトリからファイル取得
 * - GitHub リポジトリへファイルアップロード
 * - ローカルとリモートのdiff比較
 */

const fs = require('fs');
const path = require('path');

// GitHub設定
const GITHUB_OWNER = '1onotakanori-art';
const GITHUB_REPO = 'kyowa-menu-history';

/**
 * GitHub Personal Access Token を取得
 * 環境変数 GITHUB_TOKEN から読み込み
 * 
 * @returns {string} GitHub token
 * @throws {Error} トークンが設定されていない場合
 */
function getGitHubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN 環境変数が設定されていません。\n' +
      '設定方法:\n' +
      '  export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"'
    );
  }
  return token;
}

/**
 * GitHub API: ファイル一覧を取得
 * 
 * @param {string} dirPath - リポジトリ内のディレクトリパス (例: "data/history")
 * @returns {Promise<Array<{name: string, path: string, sha: string}>>} ファイル一覧
 */
async function listGitHubFiles(dirPath) {
  const token = getGitHubToken();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${dirPath}`;
  
  console.log(`GitHub からファイル一覧を取得: ${dirPath}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      console.log(`ディレクトリが見つかりません: ${dirPath}`);
      return [];
    }
    const error = await response.json();
    throw new Error(`GitHub API エラー: ${error.message}`);
  }
  
  const files = await response.json();
  return files.filter(f => f.type === 'file');
}

/**
 * GitHub API: ファイル内容を取得
 * 
 * @param {string} filePath - リポジトリ内のファイルパス
 * @returns {Promise<{content: string, sha: string}>} ファイル内容とSHA
 */
async function getGitHubFile(filePath) {
  const token = getGitHubToken();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.json();
    throw new Error(`GitHub API エラー: ${error.message}`);
  }
  
  const file = await response.json();
  const content = Buffer.from(file.content, 'base64').toString('utf-8');
  
  return {
    content: content,
    sha: file.sha
  };
}

/**
 * GitHub API: ファイルをアップロード（作成/更新）
 * 
 * @param {string} filePath - リポジトリ内のファイルパス
 * @param {string} content - ファイル内容
 * @param {string} message - コミットメッセージ
 * @param {string} [existingSha] - 既存ファイルのSHA（更新時のみ）
 * @returns {Promise<Object>} GitHub APIのレスポンス
 */
async function uploadToGitHub(filePath, content, message, existingSha = null) {
  const token = getGitHubToken();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  
  const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');
  
  const requestBody = {
    message: message,
    content: contentBase64,
    branch: 'main'
  };
  
  if (existingSha) {
    requestBody.sha = existingSha;
  }
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub API エラー: ${error.message}`);
  }
  
  return await response.json();
}

/**
 * ローカルファイルとGitHubファイルの内容を比較
 * 
 * @param {string} localPath - ローカルファイルパス
 * @param {string} remoteContent - GitHubのファイル内容
 * @returns {boolean} 内容が異なる場合 true
 */
function hasContentChanged(localPath, remoteContent) {
  if (!fs.existsSync(localPath)) {
    return true; // ローカルファイルがない場合は変更あり
  }
  
  const localContent = fs.readFileSync(localPath, 'utf-8');
  
  // JSON の場合は正規化して比較
  try {
    const localJson = JSON.parse(localContent);
    const remoteJson = JSON.parse(remoteContent);
    return JSON.stringify(localJson) !== JSON.stringify(remoteJson);
  } catch (error) {
    // JSON パースエラーの場合は文字列比較
    return localContent.trim() !== remoteContent.trim();
  }
}

/**
 * ディレクトリが存在しない場合は作成
 * 
 * @param {string} dirPath - ディレクトリパス
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  getGitHubToken,
  listGitHubFiles,
  getGitHubFile,
  uploadToGitHub,
  hasContentChanged,
  ensureDir,
  GITHUB_OWNER,
  GITHUB_REPO
};
