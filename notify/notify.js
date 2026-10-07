/**
 * メニュー通知設定ページ（notify.html）
 * - Supabase Auth のマジックリンクでログイン / 新規登録
 * - 通知設定（profiles）と通知ルール（notification_rules）の編集
 * - 直近のメニューでルールがどれだけヒットするかのプレビュー
 */

import {
  NUTRITION_FIELDS,
  NUTRITION_UNITS,
  ALLERGEN_FIELDS,
  validateConditions,
  describeConditions,
  evaluateRules,
} from '../supabase/functions/_shared/matchRules.js';
import { emptyForm, formToConditions, conditionsToForm } from './ruleForm.js';

const SUPABASE_URL = 'https://zzleqjendqkoizbdvblw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6bGVxamVuZHFrb2l6YmR2Ymx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjA0ODYsImV4cCI6MjA5MDAzNjQ4Nn0.OwuE6oJYLuA9nzEm-lAKq6BNc-J9RWv1ylZ9cH34vY8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WEEKDAYS = [
  [1, '月'],
  [2, '火'],
  [3, '水'],
  [4, '木'],
  [5, '金'],
  [6, '土'],
  [7, '日'],
];

/** プレビューに使うメニューの範囲（今日を基準に） */
const PREVIEW_PAST_DAYS = 14;
const PREVIEW_FUTURE_DAYS = 21;

const STATUS_LABELS = {
  sent: '送信済み',
  skipped: '該当なし',
  failed: '送信失敗',
  pending: '送信中',
};

const state = {
  session: null,
  profile: null,
  rules: [],
  /** @type {Map<string, Array<{name: string, nutrition: object}>>} 日付 → メニュー */
  menusByDate: new Map(),
  /** 編集中のルール ID（新規は null） */
  editingRuleId: null,
};

// ---------------------------------------------------------------------------
// 小さなユーティリティ
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);

/** 要素を組み立てる（文字列は必ず textContent として入れる） */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (typeof value === 'boolean') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

function show(id, visible) {
  $(id).classList.toggle('hidden', !visible);
}

function showMessage(text, type = 'info') {
  const box = $('global-message');
  box.textContent = text;
  box.className = `message message-${type}`;
  if (type === 'info') {
    setTimeout(() => box.classList.add('hidden'), 4000);
  }
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Asia/Tokyo の日付を YYYY-MM-DD で返す */
function jstDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${weekday})`;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------

function showAuthErrorFromUrl() {
  // マジックリンクの期限切れなどは URL のハッシュにエラーが付いて戻ってくる
  const params = new URLSearchParams(location.hash.slice(1));
  const description = params.get('error_description');
  if (description) {
    showMessage(`ログインに失敗しました: ${description}（もう一度リンクを送ってください）`, 'error');
    history.replaceState(null, '', location.pathname + location.search);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = $('login-email').value.trim();
  if (!email) return;

  const button = $('login-button');
  button.disabled = true;
  button.textContent = '送信中...';
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    const sent = $('login-sent');
    sent.textContent = `${email} にログイン用のメールを送りました。メール内のリンクを開いてください（迷惑メールフォルダもご確認ください）。`;
    show('login-sent', true);
  } catch (error) {
    showMessage(`メールを送信できませんでした: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'ログインリンクを送る';
  }
}

async function handleLogout() {
  await supabase.auth.signOut();
}

async function onSessionChanged(session) {
  const previousUserId = state.session?.user?.id;
  state.session = session;
  show('loading-view', false);

  const loggedIn = Boolean(session);
  show('login-view', !loggedIn);
  show('app-view', loggedIn);
  show('logout-button', loggedIn);
  show('user-email', loggedIn);

  if (!loggedIn) return;
  $('user-email').textContent = session.user.email;
  // トークン更新のたびに読み直さない
  if (previousUserId === session.user.id) return;
  await loadAll();
}

// ---------------------------------------------------------------------------
// データ読み込み
// ---------------------------------------------------------------------------

async function loadAll() {
  try {
    await Promise.all([loadProfile(), loadRules(), loadMenus(), loadHistory()]);
    renderProfile();
    renderRules();
  } catch (error) {
    showMessage(`読み込みに失敗しました: ${error.message}`, 'error');
  }
}

async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('email_enabled, notify_weekdays')
    .eq('user_id', state.session.user.id)
    .maybeSingle();
  if (error) throw error;
  state.profile = data ?? { email_enabled: true, notify_weekdays: [1, 2, 3, 4, 5] };
}

async function loadRules() {
  const { data, error } = await supabase
    .from('notification_rules')
    .select('id, name, enabled, conditions')
    .order('created_at', { ascending: true });
  if (error) throw error;
  state.rules = data;
}

async function loadMenus() {
  // 1回の取得上限（1000件）を超えるため、ページを分けて取得する
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('menus')
      .select('date, menu_name, nutrition')
      .gte('date', jstDate(-PREVIEW_PAST_DAYS))
      .lte('date', jstDate(PREVIEW_FUTURE_DAYS))
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  state.menusByDate = new Map();
  for (const row of rows) {
    if (!state.menusByDate.has(row.date)) state.menusByDate.set(row.date, []);
    state.menusByDate.get(row.date).push({ name: row.menu_name, nutrition: row.nutrition });
  }

  const names = [...new Set(rows.map(r => r.menu_name))].sort((a, b) => a.localeCompare(b, 'ja'));
  $('menu-name-list').replaceChildren(...names.map(name => el('option', { value: name })));
}

async function loadHistory() {
  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('menu_date, status, matched')
    .order('menu_date', { ascending: false })
    .limit(10);
  if (error) throw error;
  renderHistory(data);
}

// ---------------------------------------------------------------------------
// 通知設定
// ---------------------------------------------------------------------------

function renderProfile() {
  $('email-enabled').checked = state.profile.email_enabled;
  const selected = new Set(state.profile.notify_weekdays);
  $('weekday-chips').replaceChildren(
    ...WEEKDAYS.map(([value, label]) =>
      el('label', { className: 'chip' },
        el('input', { type: 'checkbox', value, checked: selected.has(value) }),
        label)
    )
  );
}

async function saveProfile() {
  const weekdays = [...$('weekday-chips').querySelectorAll('input:checked')].map(input => Number(input.value));
  const emailEnabled = $('email-enabled').checked;
  const { error } = await supabase
    .from('profiles')
    .update({ email_enabled: emailEnabled, notify_weekdays: weekdays })
    .eq('user_id', state.session.user.id);
  if (error) {
    showMessage(`保存できませんでした: ${error.message}`, 'error');
    return;
  }
  state.profile = { email_enabled: emailEnabled, notify_weekdays: weekdays };
  showMessage(
    emailEnabled && weekdays.length > 0 ? '通知設定を保存しました。' : '保存しました（通知は届かない設定です）。'
  );
}

// ---------------------------------------------------------------------------
// ルール一覧
// ---------------------------------------------------------------------------

/** ルールが今日以降のメニューで何日ヒットするか */
function countUpcomingHitDays(rule) {
  const today = jstDate();
  let days = 0;
  for (const [date, menus] of state.menusByDate) {
    if (date < today) continue;
    if (evaluateRules(menus, [{ ...rule, enabled: true }]).length > 0) days++;
  }
  return days;
}

function renderRules() {
  const list = $('rule-list');
  if (state.rules.length === 0) {
    list.replaceChildren(el('p', { className: 'empty-state' }, 'まだルールがありません。「＋ 追加」から作成してください。'));
    return;
  }

  list.replaceChildren(
    ...state.rules.map(rule => {
      const hitDays = countUpcomingHitDays(rule);
      return el('div', { className: `rule-item${rule.enabled ? '' : ' disabled'}` },
        el('div', { className: 'rule-head' },
          el('input', {
            type: 'checkbox',
            checked: rule.enabled,
            title: '有効 / 無効',
            onChange: event => toggleRule(rule, event.target.checked),
          }),
          el('span', { className: 'rule-name' }, rule.name)
        ),
        el('div', { className: 'rule-summary' }, describeConditions(rule.conditions).join(' ／ ')),
        el('div', { className: `rule-hits${hitDays ? '' : ' none'}` },
          hitDays ? `今後のメニューで ${hitDays} 日該当` : '今後のメニューには該当なし'),
        el('div', { className: 'rule-actions' },
          el('button', { type: 'button', className: 'small-button', onClick: () => openEditor(rule) }, '編集'),
          el('button', { type: 'button', className: 'small-button danger', onClick: () => deleteRule(rule) }, '削除')
        )
      );
    })
  );
}

async function toggleRule(rule, enabled) {
  const { error } = await supabase.from('notification_rules').update({ enabled }).eq('id', rule.id);
  if (error) {
    showMessage(`更新できませんでした: ${error.message}`, 'error');
  } else {
    rule.enabled = enabled;
  }
  renderRules();
}

async function deleteRule(rule) {
  if (!confirm(`ルール「${rule.name}」を削除しますか？`)) return;
  const { error } = await supabase.from('notification_rules').delete().eq('id', rule.id);
  if (error) {
    showMessage(`削除できませんでした: ${error.message}`, 'error');
    return;
  }
  state.rules = state.rules.filter(r => r.id !== rule.id);
  renderRules();
  showMessage('ルールを削除しました。');
}

// ---------------------------------------------------------------------------
// ルール編集
// ---------------------------------------------------------------------------

function buildEditorControls() {
  $('nutrition-grid').replaceChildren(
    ...NUTRITION_FIELDS.flatMap(field => [
      el('span', {}, field),
      el('input', { className: 'form-input', type: 'text', inputmode: 'decimal', 'data-field': field, 'data-bound': 'min', placeholder: '下限', 'aria-label': `${field}の下限` }),
      el('span', {}, '〜'),
      el('input', { className: 'form-input', type: 'text', inputmode: 'decimal', 'data-field': field, 'data-bound': 'max', placeholder: '上限', 'aria-label': `${field}の上限` }),
      el('span', { className: 'unit' }, NUTRITION_UNITS[field]),
    ])
  );
  $('allergen-chips').replaceChildren(
    ...ALLERGEN_FIELDS.map(allergen =>
      el('label', { className: 'chip' }, el('input', { type: 'checkbox', value: allergen }), allergen)
    )
  );
}

function readForm() {
  const form = emptyForm();
  form.nameMode = $('name-mode').value;
  form.nameText = $('name-text').value;
  form.excludeText = $('exclude-text').value;
  for (const input of $('nutrition-grid').querySelectorAll('input')) {
    form.nutrition[input.dataset.field][input.dataset.bound] = input.value;
  }
  form.allergens = [...$('allergen-chips').querySelectorAll('input:checked')].map(input => input.value);
  return form;
}

function writeForm(form) {
  $('name-mode').value = form.nameMode;
  $('name-text').value = form.nameText;
  $('exclude-text').value = form.excludeText;
  for (const input of $('nutrition-grid').querySelectorAll('input')) {
    input.value = form.nutrition[input.dataset.field][input.dataset.bound];
  }
  const allergens = new Set(form.allergens);
  for (const input of $('allergen-chips').querySelectorAll('input')) {
    input.checked = allergens.has(input.value);
  }
  updateNameInput();
}

function updateNameInput() {
  const mode = $('name-mode').value;
  const input = $('name-text');
  input.disabled = mode === 'none';
  input.placeholder = { none: '', equals: '例: モチコチキン（候補から選べます）', contains: '例: カレー 唐揚げ' }[mode];
  // 候補リストは「一致」のときだけ出す
  if (mode === 'equals') input.setAttribute('list', 'menu-name-list');
  else input.removeAttribute('list');
}

function openEditor(rule = null) {
  state.editingRuleId = rule?.id ?? null;
  $('editor-title').textContent = rule ? 'ルールを編集' : 'ルールを追加';
  $('rule-name').value = rule?.name ?? '';
  writeForm(rule ? conditionsToForm(rule.conditions) : emptyForm());
  show('rules-section', false);
  show('editor-section', true);
  updatePreview();
  $('editor-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  state.editingRuleId = null;
  show('editor-section', false);
  show('rules-section', true);
}

function updatePreview() {
  const conditions = formToConditions(readForm());
  const { ok, errors } = validateConditions(conditions);
  const errorBox = $('rule-errors');
  const preview = $('rule-preview');

  // 何も入力していない段階ではエラーを出さず案内だけ表示する
  if (conditions.all.length === 0) {
    show('rule-errors', false);
    preview.replaceChildren('条件を入力すると、直近のメニューで該当するものがここに表示されます。');
    return;
  }
  if (!ok) {
    errorBox.replaceChildren(...errors.map(e => el('div', {}, e)));
    show('rule-errors', true);
    preview.replaceChildren();
    return;
  }
  show('rule-errors', false);

  const today = jstDate();
  const upcoming = [];
  let pastHitDays = 0;
  let pastDays = 0;
  for (const [date, menus] of state.menusByDate) {
    const [result] = evaluateRules(menus, [{ name: '', conditions }]);
    if (date < today) {
      pastDays++;
      if (result) pastHitDays++;
    } else if (result) {
      upcoming.push([date, result.menus]);
    }
  }

  preview.replaceChildren(
    el('h4', {}, describeConditions(conditions).join(' ／ ')),
    upcoming.length > 0
      ? el('div', {},
          upcoming.map(([date, menus]) =>
            el('div', {},
              el('span', { className: 'preview-date' }, date === today ? `今日 ${formatDate(date)}` : formatDate(date)),
              `：${menus.map(m => m.name).join('、')}`)
          ))
      : el('div', {}, '今後のメニュー（取得済みの範囲）には該当がありません。'),
    el('div', { style: 'margin-top: 6px; color: #666;' },
      `参考: 過去${pastDays}営業日のうち ${pastHitDays} 日が該当`)
  );
}

async function saveRule(event) {
  event.preventDefault();
  const name = $('rule-name').value.trim();
  const conditions = formToConditions(readForm());
  const { ok, errors } = validateConditions(conditions);
  if (!name) {
    showMessage('ルール名を入力してください。', 'error');
    $('rule-name').focus();
    return;
  }
  if (!ok) {
    showMessage(errors.join(' / '), 'error');
    return;
  }

  const button = $('save-rule-button');
  button.disabled = true;
  try {
    const query = state.editingRuleId
      ? supabase.from('notification_rules').update({ name, conditions }).eq('id', state.editingRuleId)
      : supabase.from('notification_rules').insert({ name, conditions });
    const { error } = await query;
    if (error) throw error;
    await loadRules();
    closeEditor();
    renderRules();
    showMessage('ルールを保存しました。');
  } catch (error) {
    showMessage(`保存できませんでした: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// 送信履歴
// ---------------------------------------------------------------------------

function renderHistory(rows) {
  if (rows.length === 0) {
    $('history').replaceChildren(el('p', { className: 'empty-state' }, 'まだ通知はありません。'));
    return;
  }
  $('history').replaceChildren(
    el('table', { className: 'history-table' },
      el('tbody', {},
        rows.map(row =>
          el('tr', {},
            el('td', {}, formatDate(row.menu_date)),
            el('td', {}, STATUS_LABELS[row.status] ?? row.status),
            el('td', {}, (row.matched ?? []).map(hit => hit.ruleName).join('、'))
          )
        )))
  );
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

function init() {
  buildEditorControls();
  showAuthErrorFromUrl();

  $('login-form').addEventListener('submit', handleLogin);
  $('logout-button').addEventListener('click', handleLogout);
  $('save-profile-button').addEventListener('click', saveProfile);
  $('new-rule-button').addEventListener('click', () => openEditor());
  $('cancel-rule-button').addEventListener('click', closeEditor);
  $('rule-form').addEventListener('submit', saveRule);
  $('name-mode').addEventListener('change', () => {
    updateNameInput();
    updatePreview();
  });
  $('rule-form').addEventListener('input', debounce(updatePreview, 250));
  $('allergen-chips').addEventListener('change', updatePreview);

  // INITIAL_SESSION を含め、ログイン状態の変化はすべてここで受ける
  supabase.auth.onAuthStateChange((_event, session) => {
    // コールバック内で Supabase を await するとデッドロックするため、処理を後回しにする
    setTimeout(() => onSessionChanged(session), 0);
  });
}

init();
