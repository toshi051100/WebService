/* =========================================================
   かんたん投稿シミュレーター
   「処理」「保存」「共有」の3ステップを、実際に動かしながら
   目に見える形で体験させるための学習用アプリ。
   GitHub Pages（サーバーなし）だけで完結する。
========================================================= */

/* ---------- 設定・データ ---------- */

const STORAGE_KEY = 'sns_sim_posts_v1';

// 「クラス全体に公開」だけは、あえて自動配信ができない仕様にしてある。
// これは実装のミスではなく、"サーバーが無いと何ができないか" に
// 生徒自身が気づくための、意図的な仕掛け。
const VISIBILITY_LABELS = {
  private: '自分だけ',
  friend: '友達にリンクで共有',
  class: 'クラス全体に公開'
};

const FORBIDDEN_WORDS = ['しね', 'ばか', 'うざい'];

/* ---------- 小さなユーティリティ ---------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateTime(date) {
  return date.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function makePostId() {
  return 'p_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}

/* ---------- localStorage（＝「保存」の実体） ---------- */

function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

/* ---------- 画面要素 ---------- */

const els = {
  composeView: $('#composeView'),
  receivedView: $('#receivedView'),
  form: $('#postForm'),
  imagePicker: $('#imagePicker'),
  commentInput: $('#commentInput'),
  submitBtn: $('#submitBtn'),
  stepTracker: $('#stepTracker'),
  console: $('#console'),
  consoleBody: $('#consoleBody'),
  result: $('#result'),
  postList: $('#postList'),
  resetBtn: $('#resetBtn'),
  receivedPost: $('#receivedPost'),
  receivedRaw: $('#receivedRaw'),
  backToComposeBtn: $('#backToComposeBtn'),
};

let selectedEmoji = null;

/* ---------- 画像選択 ---------- */

els.imagePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.image-picker__item');
  if (!btn) return;
  $all('.image-picker__item', els.imagePicker).forEach(item => {
    item.classList.remove('is-selected');
    item.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('is-selected');
  btn.setAttribute('aria-pressed', 'true');
  selectedEmoji = btn.dataset.emoji;
});

/* ---------- ステップトラッカーの制御 ---------- */

function resetStepTracker() {
  $all('.step-tracker__item', els.stepTracker).forEach(item => {
    item.classList.remove('is-active', 'is-done', 'is-warn', 'is-fail');
    item.querySelector('.step-tracker__circle').textContent =
      { process: '1', save: '2', share: '3' }[item.dataset.step];
  });
  $all('.step-tracker__line', els.stepTracker).forEach(line => {
    line.classList.remove('is-filled');
  });
}

function setStepState(stepName, state) {
  const item = $(`.step-tracker__item[data-step="${stepName}"]`, els.stepTracker);
  if (!item) return;
  item.classList.remove('is-active', 'is-done', 'is-warn', 'is-fail');
  item.classList.add(state);
  const circle = item.querySelector('.step-tracker__circle');
  if (state === 'is-done') circle.textContent = '✓';
  if (state === 'is-fail') circle.textContent = '✕';
  if (state === 'is-warn') circle.textContent = '!';
  if (state === 'is-active') circle.textContent = { process: '1', save: '2', share: '3' }[stepName];
}

function fillLineAfter(stepName) {
  const lineIndex = { process: 1, save: 2 }[stepName];
  if (!lineIndex) return;
  const line = $(`.step-tracker__line[data-line="${lineIndex}"]`, els.stepTracker);
  if (line) line.classList.add('is-filled');
}

/* ---------- ログパネルへの出力 ---------- */

function clearConsole() {
  els.consoleBody.innerHTML = '';
  els.console.hidden = false;
}

function logLine(text, type = '') {
  const line = document.createElement('div');
  line.className = 'console-line' + (type ? ' ' + type : '');
  line.textContent = text;
  els.consoleBody.appendChild(line);
  els.consoleBody.scrollTop = els.consoleBody.scrollHeight;
  return line;
}

// 「処理」段階で、1つの入力を複数のデータ項目に分割していく過程を
// 1行ずつ見せる。これが今回のキモ：投稿は1つの塊ではなく、
// 「本文」「画像」「公開範囲」「ID」「日時」に分けて扱われている、
// ということを目で確認させる。
async function revealDividedData(divided) {
  const grid = document.createElement('div');
  grid.className = 'data-grid';
  els.consoleBody.appendChild(grid);

  const rows = [
    ['投稿ID', divided.id],
    ['本文', divided.text],
    ['画像', divided.image],
    ['公開範囲', VISIBILITY_LABELS[divided.visibility]],
    ['投稿日時', divided.createdAt],
  ];

  for (const [key, val] of rows) {
    const row = document.createElement('div');
    row.className = 'data-grid__row';
    row.innerHTML =
      `<span class="data-grid__key">${escapeHtml(key)}</span>` +
      `<span class="data-grid__val">${escapeHtml(val)}</span>`;
    grid.appendChild(row);
    els.consoleBody.scrollTop = els.consoleBody.scrollHeight;
    await delay(260);
  }
}

/* ---------- 結果パネル ---------- */

function showResult(html, variant) {
  els.result.hidden = false;
  els.result.className = 'result ' + (variant ? 'is-' + variant : '');
  els.result.innerHTML = html;
}

function hideResult() {
  els.result.hidden = true;
  els.result.innerHTML = '';
}

/* ---------- 共有リンクの生成・解析 ---------- */

function buildShareUrl(divided) {
  const json = JSON.stringify(divided);
  const encoded = encodeURIComponent(json);
  return `${location.origin}${location.pathname}?post=${encoded}`;
}

function parseSharedPostFromUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('post')) return null;
  try {
    return JSON.parse(decodeURIComponent(params.get('post')));
  } catch (e) {
    return null;
  }
}

/* ---------- 投稿一覧の描画（＝保存の結果を見せる） ---------- */

function renderPostList() {
  const posts = loadPosts();
  els.postList.innerHTML = '';

  if (posts.length === 0) {
    els.postList.innerHTML = '<p class="post-list__empty">まだ投稿がありません。上のフォームから投稿してみましょう。</p>';
    return;
  }

  posts.slice().reverse().forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.innerHTML = `
      <span class="post-card__emoji">${escapeHtml(post.image)}</span>
      <div class="post-card__body">
        <p class="post-card__text">${escapeHtml(post.text)}</p>
        <div class="post-card__meta">
          <span class="post-card__tag">${escapeHtml(VISIBILITY_LABELS[post.visibility] || post.visibility)}</span>
          <span>${escapeHtml(post.createdAt)}</span>
        </div>
      </div>
    `;
    els.postList.appendChild(card);
  });
}

els.resetBtn.addEventListener('click', () => {
  if (confirm('保存されている投稿をすべて削除します。よろしいですか？')) {
    localStorage.removeItem(STORAGE_KEY);
    renderPostList();
  }
});

/* ---------- バリデーション（＝「処理」の中身） ---------- */

function validateDraft(text, image) {
  if (!image) {
    return '画像が選ばれていません。';
  }
  if (text.length === 0) {
    return 'コメントが入力されていません。';
  }
  if (text.length > 20) {
    return `コメントが長すぎます（20文字まで／現在${text.length}文字）。`;
  }
  const hit = FORBIDDEN_WORDS.find(word => text.includes(word));
  if (hit) {
    return `禁止ワード「${hit}」が含まれています。`;
  }
  return null;
}

/* ---------- メインフロー：投稿ボタンを押したときの一連の流れ ---------- */

async function runPostFlow(text, image, visibility) {
  els.submitBtn.disabled = true;
  resetStepTracker();
  hideResult();
  clearConsole();

  // ---- ① 処理 ----
  setStepState('process', 'is-active');
  logLine('▶ 投稿ボタンが押されました', 'dim');
  await delay(350);
  logLine('🔍 入力データをチェックしています…');
  await delay(600);

  const error = validateDraft(text, image);
  if (error) {
    logLine('❌ 処理エラー：' + error, 'err');
    setStepState('process', 'is-fail');
    showResult(
      `<h3>❌ 処理でストップしました</h3><p>${escapeHtml(error)}</p><p style="color:var(--ink-soft);font-size:0.85rem;">処理でエラーになったため、保存も共有も行われません。内容を直して、もう一度投稿してみましょう。</p>`,
      'blocked'
    );
    els.submitBtn.disabled = false;
    return;
  }
  logLine('✅ 入力チェックOK', 'ok');
  await delay(350);

  logLine('📦 データを分割して整理しています…');
  await delay(300);

  const divided = {
    id: makePostId(),
    text,
    image,
    visibility,
    createdAt: formatDateTime(new Date()),
  };
  await revealDividedData(divided);
  await delay(200);

  setStepState('process', 'is-done');
  fillLineAfter('process');

  // ---- ② 保存 ----
  setStepState('save', 'is-active');
  await delay(300);
  logLine('💾 端末（ブラウザ）に保存しています…');
  await delay(650);

  const posts = loadPosts();
  posts.push(divided);
  savePosts(posts);

  logLine(`✅ 保存完了！（この端末に ${posts.length} 件保存されています）`, 'ok');
  setStepState('save', 'is-done');
  fillLineAfter('save');
  await delay(300);

  // ---- ③ 共有 ----
  setStepState('share', 'is-active');
  await delay(300);

  if (visibility === 'private') {
    logLine('🔒 「自分だけ」が選ばれています', 'dim');
    await delay(400);
    logLine('共有リンクは作成されません。', 'dim');
    setStepState('share', 'is-done');
    showResult(
      `<h3>🔒 自分だけの投稿です</h3><p>共有リンクは作られません。この端末の「保存されている投稿」一覧にだけ表示されます。</p>`,
      'locked'
    );

  } else if (visibility === 'friend') {
    logLine('🔗 共有リンクを作成しています…');
    await delay(600);
    const url = buildShareUrl(divided);
    logLine('✅ リンクが完成しました！', 'ok');
    setStepState('share', 'is-done');
    showResult(
      `<h3>🔗 共有リンクができました</h3>
       <p>このリンクを友達に送ってみましょう。開くと同じ投稿が表示されます。</p>
       <div class="share-link-box">
         <input type="text" readonly value="${escapeHtml(url)}" id="shareUrlInput">
         <button type="button" id="copyLinkBtn">コピー</button>
         <button type="button" id="openLinkBtn">開いてみる</button>
       </div>`,
      'success'
    );
    $('#copyLinkBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        $('#copyLinkBtn').textContent = 'コピーしました';
        setTimeout(() => { $('#copyLinkBtn').textContent = 'コピー'; }, 1500);
      } catch (e) {
        $('#shareUrlInput').select();
      }
    });
    $('#openLinkBtn').addEventListener('click', () => window.open(url, '_blank'));

  } else if (visibility === 'class') {
    logLine('📢 クラス全体に自動で届けようとしています…');
    await delay(650);
    logLine('⚠️ 自動配信はできませんでした', 'warn');
    await delay(300);
    logLine('理由：クラス全員に届けるには、みんなの投稿を1か所に集めて管理する「サーバー」が必要です。', 'warn');
    await delay(200);
    logLine('このアプリはサーバーを使わない仕組み（GitHub Pages）なので、自動配信はできません。', 'warn');
    setStepState('share', 'is-warn');
    showResult(
      `<h3>⚠️ ここではできませんでした</h3>
       <p>「友達にリンクで共有」であれば1対1でリンクを渡せますが、<strong>クラス全員に自動で届ける</strong>には、投稿をまとめて管理する<strong>サーバー</strong>が必要です。</p>
       <p style="color:var(--ink-soft);font-size:0.85rem;">本物のInstagramやBeRealでは、会社が運用する大きなサーバーがこの役割をしています。</p>`,
      'blocked'
    );
  }

  renderPostList();
  els.submitBtn.disabled = false;
}

/* ---------- フォーム送信 ---------- */

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.commentInput.value.trim();
  const visibility = $('input[name="visibility"]:checked', els.form).value;
  runPostFlow(text, selectedEmoji, visibility);
});

/* ---------- 共有リンクから開かれた場合の表示 ---------- */

function showReceivedView(divided) {
  els.composeView.hidden = true;
  els.receivedView.hidden = false;

  els.receivedPost.innerHTML = `
    <div class="post-card" style="border-left-color:var(--berry);">
      <span class="post-card__emoji">${escapeHtml(divided.image || '❔')}</span>
      <div class="post-card__body">
        <p class="post-card__text">${escapeHtml(divided.text || '（本文がありません）')}</p>
        <div class="post-card__meta">
          <span class="post-card__tag">${escapeHtml(VISIBILITY_LABELS[divided.visibility] || '不明')}</span>
          <span>${escapeHtml(divided.createdAt || '')}</span>
        </div>
      </div>
    </div>
  `;

  els.receivedRaw.textContent = JSON.stringify(divided, null, 2);
}

els.backToComposeBtn.addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  els.receivedView.hidden = true;
  els.composeView.hidden = false;
});

/* ---------- 初期化 ---------- */

function init() {
  const shared = parseSharedPostFromUrl();
  if (shared) {
    showReceivedView(shared);
  } else {
    renderPostList();
  }
}

init();
