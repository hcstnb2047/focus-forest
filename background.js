// Focus Forest - Background Script
// ポモドーロタイマー + 森育成システム

// タイマー設定
const POMODORO_WORK_TIME = 25 * 60; // 25分
const POMODORO_BREAK_TIME = 5 * 60; // 5分
const LONG_BREAK_TIME = 15 * 60; // 15分

// 森の成長設定
const TREE_GROWTH_STAGES = ['seed', 'sprout', 'sapling', 'young_tree', 'mature_tree', 'ancient_tree'];
const GROWTH_TIME_PER_STAGE = 5 * 60; // 5分で次のステージ

// 気が散るサイトのデフォルトリスト
const DEFAULT_DISTRACTION_SITES = [
  'youtube.com', 'twitter.com', 'facebook.com', 'instagram.com', 
  'tiktok.com', 'reddit.com', 'netflix.com', 'twitch.tv'
];

// グローバル状態
let currentSession = {
  isActive: false,
  type: 'work', // 'work', 'short_break', 'long_break'
  startTime: null,
  duration: POMODORO_WORK_TIME,
  completedPomodoros: 0,
  currentTree: null
};

let forestState = {
  trees: [], // 完成した木のコレクション
  totalFocusTime: 0, // 累計集中時間（秒）
  todayFocusTime: 0, // 今日の集中時間
  streakDays: 0, // 連続日数
  lastActiveDate: null
};

// 初期化
chrome.runtime.onInstalled.addListener(async () => {
  await loadState();
  await chrome.storage.local.set({
    enabled: true,
    distractionSites: DEFAULT_DISTRACTION_SITES,
    soundEnabled: true,
    notifications: true
  });
  
  chrome.action.setBadgeText({ text: '🌱' });
  chrome.action.setBadgeBackgroundColor({ color: '#2d5a27' });
});

// 状態の読み込み
async function loadState() {
  const data = await chrome.storage.local.get(['currentSession', 'forestState']);
  
  if (data.currentSession) {
    currentSession = { ...currentSession, ...data.currentSession };
  }
  
  if (data.forestState) {
    forestState = { ...forestState, ...data.forestState };
  }
  
  // 日付チェック
  const today = new Date().toDateString();
  if (forestState.lastActiveDate !== today) {
    // 新しい日
    if (forestState.lastActiveDate && isConsecutiveDay(forestState.lastActiveDate, today)) {
      forestState.streakDays++;
    } else if (forestState.lastActiveDate) {
      forestState.streakDays = 1;
    }
    forestState.todayFocusTime = 0;
    forestState.lastActiveDate = today;
    await saveState();
  }
}

// 状態の保存
async function saveState() {
  await chrome.storage.local.set({
    currentSession: currentSession,
    forestState: forestState
  });
}

// 連続日数チェック
function isConsecutiveDay(lastDate, currentDate) {
  const last = new Date(lastDate);
  const current = new Date(currentDate);
  const diffTime = current - last;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays === 1;
}

// ポモドーロセッション開始
async function startPomodoroSession() {
  currentSession.isActive = true;
  currentSession.startTime = Date.now();
  currentSession.currentTree = {
    id: generateTreeId(),
    stage: 0, // seedからスタート
    startTime: Date.now(),
    health: 100
  };
  
  // アラーム設定
  chrome.alarms.create('pomodoroTimer', { 
    delayInMinutes: currentSession.duration / 60 
  });
  
  // ブロックルール有効化
  await updateBlockingRules(true);
  
  // UI更新
  updateBadge();
  await saveState();
  
  // 通知
  if (await getSetting('notifications')) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/forest-icon-48.png',
      title: 'Focus Forest',
      message: `${currentSession.type === 'work' ? '作業' : '休憩'}セッションを開始しました！🌱`
    });
  }
}

// セッション終了
async function endPomodoroSession(completed = true) {
  if (!currentSession.isActive) return;
  
  const sessionDuration = (Date.now() - currentSession.startTime) / 1000;
  
  if (completed && currentSession.type === 'work') {
    // 作業セッション完了
    currentSession.completedPomodoros++;
    forestState.totalFocusTime += sessionDuration;
    forestState.todayFocusTime += sessionDuration;
    
    // 木を森に追加
    if (currentSession.currentTree) {
      const finalStage = Math.min(
        Math.floor(sessionDuration / GROWTH_TIME_PER_STAGE),
        TREE_GROWTH_STAGES.length - 1
      );
      
      forestState.trees.push({
        ...currentSession.currentTree,
        stage: finalStage,
        completedAt: Date.now(),
        duration: sessionDuration
      });
    }
    
    // 次は休憩
    const isLongBreak = currentSession.completedPomodoros % 4 === 0;
    currentSession.type = isLongBreak ? 'long_break' : 'short_break';
    currentSession.duration = isLongBreak ? LONG_BREAK_TIME : POMODORO_BREAK_TIME;
    
  } else if (completed && currentSession.type !== 'work') {
    // 休憩終了、次は作業
    currentSession.type = 'work';
    currentSession.duration = POMODORO_WORK_TIME;
  }
  
  currentSession.isActive = false;
  currentSession.startTime = null;
  currentSession.currentTree = null;
  
  // ブロック解除
  await updateBlockingRules(false);
  
  // アラームクリア
  chrome.alarms.clear('pomodoroTimer');
  
  updateBadge();
  await saveState();
  
  // 完了通知
  if (completed && await getSetting('notifications')) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/forest-icon-48.png',
      title: 'セッション完了！',
      message: currentSession.type === 'work' ? 
        '休憩時間です！🌳' : 
        '次の作業セッションを始めましょう！🌱'
    });
  }
}

// アラーム処理
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'pomodoroTimer') {
    await endPomodoroSession(true);
  }
});

// ブロックルール更新
async function updateBlockingRules(shouldBlock) {
  const config = await chrome.storage.local.get(['enabled', 'distractionSites']);
  
  if (!config.enabled || !shouldBlock || !config.distractionSites) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1]
    });
    return;
  }
  
  const rule = {
    id: 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { 
        url: chrome.runtime.getURL('blocked.html')
      }
    },
    condition: {
      urlFilter: '*',
      domains: config.distractionSites
    }
  };
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [rule],
    removeRuleIds: [1]
  });
}

// バッジ更新
function updateBadge() {
  if (currentSession.isActive) {
    const elapsed = Math.floor((Date.now() - currentSession.startTime) / 1000);
    const remaining = Math.max(0, currentSession.duration - elapsed);
    const minutes = Math.floor(remaining / 60);
    
    chrome.action.setBadgeText({ 
      text: minutes > 0 ? minutes.toString() : '🌳'
    });
    chrome.action.setBadgeBackgroundColor({ 
      color: currentSession.type === 'work' ? '#2d5a27' : '#27455a'
    });
  } else {
    chrome.action.setBadgeText({ text: '🌱' });
    chrome.action.setBadgeBackgroundColor({ color: '#2d5a27' });
  }
}

// 設定取得
async function getSetting(key) {
  const result = await chrome.storage.local.get([key]);
  return result[key];
}

// 木のID生成
function generateTreeId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 気が散るサイト検出
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!currentSession.isActive || currentSession.type !== 'work') return;
  if (changeInfo.status !== 'complete' || !tab.url) return;
  
  const config = await chrome.storage.local.get(['distractionSites']);
  const distractionSites = config.distractionSites || [];
  
  const url = new URL(tab.url);
  const isDistraction = distractionSites.some(site => 
    url.hostname.includes(site)
  );
  
  if (isDistraction && currentSession.currentTree) {
    // 木にダメージ
    currentSession.currentTree.health -= 20;
    
    if (currentSession.currentTree.health <= 0) {
      // 木が枯れた
      await endPomodoroSession(false);
      
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/forest-icon-48.png',
        title: '木が枯れました... 💀',
        message: '気が散るサイトを見てしまいました。新しいセッションを始めましょう。'
      });
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/forest-icon-48.png',
        title: '木にダメージ！',
        message: `木の体力: ${currentSession.currentTree.health}%`
      });
    }
    
    await saveState();
  }
});

// メッセージ処理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getState':
      sendResponse({
        currentSession: currentSession,
        forestState: forestState
      });
      break;
      
    case 'startSession':
      startPomodoroSession();
      sendResponse({ success: true });
      break;
      
    case 'endSession':
      endPomodoroSession(false);
      sendResponse({ success: true });
      break;
      
    case 'updateBadge':
      updateBadge();
      sendResponse({ success: true });
      break;
  }
  
  return true; // 非同期レスポンス
});

// 定期的な状態更新
setInterval(() => {
  updateBadge();
}, 30000); // 30秒ごと

// 初期読み込み
loadState();