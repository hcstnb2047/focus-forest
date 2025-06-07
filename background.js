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
  currentTree: null,
  currentProject: null // プロジェクト管理用
};

let forestState = {
  trees: [], // 完成した木のコレクション
  totalFocusTime: 0, // 累計集中時間（秒）
  todayFocusTime: 0, // 今日の集中時間
  streakDays: 0, // 連続日数
  lastActiveDate: null
};

// AI分析用のデータ構造
let analyticsState = {
  sessions: [], // 全セッションの詳細データ
  patterns: {
    hourlyPerformance: new Array(24).fill(0), // 時間別パフォーマンス
    dailyPerformance: new Array(7).fill(0), // 曜日別パフォーマンス
    optimalSessionLength: POMODORO_WORK_TIME, // 最適セッション長
    focusScore: 0, // 総合集中度スコア
    lastAnalysisDate: null // 最終分析日
  },
  insights: {
    bestHours: [], // 最適時間帯
    worstHours: [], // 集中困難時間帯
    recommendations: [], // パーソナライズ提案
    nextOptimalStart: null // 次回最適開始時刻
  },
  projects: [], // プロジェクト管理
  moods: [] // 気分記録
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
  const data = await chrome.storage.local.get(['currentSession', 'forestState', 'analyticsState']);
  
  if (data.currentSession) {
    currentSession = { ...currentSession, ...data.currentSession };
  }
  
  if (data.forestState) {
    forestState = { ...forestState, ...data.forestState };
  }
  
  if (data.analyticsState) {
    analyticsState = { ...analyticsState, ...data.analyticsState };
    // 配列の初期化チェック
    if (!analyticsState.patterns.hourlyPerformance) analyticsState.patterns.hourlyPerformance = new Array(24).fill(0);
    if (!analyticsState.patterns.dailyPerformance) analyticsState.patterns.dailyPerformance = new Array(7).fill(0);
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
    
    // 毎日のAI分析実行
    await performDailyAnalysis();
  }
}

// 状態の保存
async function saveState() {
  await chrome.storage.local.set({
    currentSession: currentSession,
    forestState: forestState,
    analyticsState: analyticsState
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
  
  // セッションデータを記録（AI分析用）
  const sessionData = {
    id: generateTreeId(),
    type: currentSession.type,
    startTime: currentSession.startTime,
    endTime: Date.now(),
    duration: sessionDuration,
    planned: currentSession.duration,
    completed: completed,
    hour: new Date().getHours(),
    dayOfWeek: new Date().getDay(),
    focusScore: calculateFocusScore(sessionDuration, currentSession.currentTree?.health || 100),
    interruptions: currentSession.currentTree ? Math.max(0, Math.floor((100 - currentSession.currentTree.health) / 20)) : 0,
    projectId: currentSession.currentProject || null,
    treeHealth: currentSession.currentTree?.health || 100
  };
  
  analyticsState.sessions.push(sessionData);
  
  // 古いセッションデータをクリーンアップ（30日以上前）
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  analyticsState.sessions = analyticsState.sessions.filter(s => s.startTime > thirtyDaysAgo);
  
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
        duration: sessionDuration,
        projectId: currentSession.currentProject
      });
    }
    
    // リアルタイムAI分析
    await updatePersonalPatterns(sessionData);
    
    // 次は休憩
    const isLongBreak = currentSession.completedPomodoros % 4 === 0;
    currentSession.type = isLongBreak ? 'long_break' : 'short_break';
    currentSession.duration = isLongBreak ? LONG_BREAK_TIME : POMODORO_BREAK_TIME;
    
  } else if (completed && currentSession.type !== 'work') {
    // 休憩終了、次は作業
    currentSession.type = 'work';
    currentSession.duration = analyticsState.patterns.optimalSessionLength || POMODORO_WORK_TIME;
  }
  
  currentSession.isActive = false;
  currentSession.startTime = null;
  currentSession.currentTree = null;
  currentSession.currentProject = null;
  
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
        forestState: forestState,
        analyticsState: analyticsState
      });
      break;
      
    case 'startSession':
      if (request.projectId) {
        currentSession.currentProject = request.projectId;
      }
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
      
    case 'getOptimalStartTime':
      const optimalTime = getOptimalStartTime();
      sendResponse({ optimalTime: optimalTime });
      break;
      
    case 'getPersonalInsights':
      const insights = generatePersonalInsights();
      sendResponse({ insights: insights });
      break;
      
    case 'setMood':
      if (request.mood) {
        recordMood(request.mood, request.energy);
      }
      sendResponse({ success: true });
      break;
      
    case 'createProject':
      if (request.project) {
        createProject(request.project);
      }
      sendResponse({ success: true });
      break;
      
    case 'getForestTheme':
      const theme = getCurrentForestTheme();
      sendResponse({ theme: theme });
      break;
      
    case 'getMoodAnalysis':
      const moodAnalysis = analyzeMoodProductivityCorrelation();
      sendResponse({ analysis: moodAnalysis });
      break;
      
    case 'getDetailedReport':
      const timeframe = request.timeframe || 'week';
      const report = generateDetailedReport(timeframe);
      sendResponse({ report: report });
      break;
      
    case 'getPersonalizedGoals':
      const goals = generatePersonalizedGoals();
      sendResponse({ goals: goals });
      break;
      
    case 'getBreakSuggestion':
      const suggestion = generateBreakSuggestion();
      sendResponse({ suggestion: suggestion });
      break;
  }
  
  return true; // 非同期レスポンス
});

// 定期的な状態更新
setInterval(() => {
  updateBadge();
}, 30000); // 30秒ごと

// ========================
// AI分析機能
// ========================

// 集中度スコア計算
function calculateFocusScore(duration, treeHealth) {
  const completionRate = Math.min(duration / POMODORO_WORK_TIME, 1);
  const healthScore = treeHealth / 100;
  return Math.round((completionRate * 0.7 + healthScore * 0.3) * 100);
}

// 個人パターン更新（リアルタイム学習）
async function updatePersonalPatterns(sessionData) {
  if (sessionData.type !== 'work' || !sessionData.completed) return;
  
  const hour = sessionData.hour;
  const dayOfWeek = sessionData.dayOfWeek;
  const focusScore = sessionData.focusScore;
  
  // 時間別パフォーマンスの更新（移動平均）
  analyticsState.patterns.hourlyPerformance[hour] = 
    (analyticsState.patterns.hourlyPerformance[hour] * 0.8) + (focusScore * 0.2);
  
  // 曜日別パフォーマンスの更新
  analyticsState.patterns.dailyPerformance[dayOfWeek] = 
    (analyticsState.patterns.dailyPerformance[dayOfWeek] * 0.8) + (focusScore * 0.2);
  
  // 最適セッション長の学習
  if (focusScore > 80) {
    const optimalLength = analyticsState.patterns.optimalSessionLength;
    const newLength = sessionData.duration;
    analyticsState.patterns.optimalSessionLength = Math.round(
      (optimalLength * 0.9) + (newLength * 0.1)
    );
  }
  
  // 総合集中度スコア更新
  const allWorkSessions = analyticsState.sessions.filter(s => s.type === 'work' && s.completed);
  if (allWorkSessions.length > 0) {
    const avgScore = allWorkSessions.reduce((sum, s) => sum + s.focusScore, 0) / allWorkSessions.length;
    analyticsState.patterns.focusScore = Math.round(avgScore);
  }
  
  await saveState();
}

// 毎日のAI分析
async function performDailyAnalysis() {
  const sessions = analyticsState.sessions;
  const workSessions = sessions.filter(s => s.type === 'work' && s.completed);
  
  if (workSessions.length < 3) return; // データが少ない場合はスキップ
  
  // 最適時間帯の特定
  const hourlyScores = {};
  workSessions.forEach(session => {
    const hour = session.hour;
    if (!hourlyScores[hour]) hourlyScores[hour] = [];
    hourlyScores[hour].push(session.focusScore);
  });
  
  const hourlyAverages = Object.entries(hourlyScores).map(([hour, scores]) => ({
    hour: parseInt(hour),
    avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
    count: scores.length
  })).filter(h => h.count >= 2);
  
  hourlyAverages.sort((a, b) => b.avgScore - a.avgScore);
  
  analyticsState.insights.bestHours = hourlyAverages.slice(0, 3).map(h => h.hour);
  analyticsState.insights.worstHours = hourlyAverages.slice(-3).map(h => h.hour);
  
  // 推奨事項の生成
  generateRecommendations();
  
  // 次回最適開始時刻の予測
  analyticsState.insights.nextOptimalStart = predictOptimalStartTime();
  
  analyticsState.patterns.lastAnalysisDate = new Date().toDateString();
  await saveState();
}

// 推奨事項生成
function generateRecommendations() {
  const recommendations = [];
  const patterns = analyticsState.patterns;
  const insights = analyticsState.insights;
  
  // 時間帯の推奨
  if (insights.bestHours.length > 0) {
    const bestHour = insights.bestHours[0];
    recommendations.push({
      type: 'timing',
      title: '最適な作業時間',
      message: `${bestHour}時台があなたの最も集中できる時間です`,
      action: 'schedule_work',
      priority: 'high'
    });
  }
  
  // セッション長の推奨
  const optimalLength = patterns.optimalSessionLength;
  if (optimalLength !== POMODORO_WORK_TIME) {
    const minutes = Math.round(optimalLength / 60);
    recommendations.push({
      type: 'duration',
      title: 'セッション時間の最適化',
      message: `${minutes}分セッションがあなたに最適です`,
      action: 'adjust_timer',
      priority: 'medium'
    });
  }
  
  // 集中度向上の提案
  if (patterns.focusScore < 70) {
    recommendations.push({
      type: 'focus',
      title: '集中度向上のヒント',
      message: '集中を妨げる要因を見直してみましょう',
      action: 'review_distractions',
      priority: 'high'
    });
  }
  
  analyticsState.insights.recommendations = recommendations;
}

// 最適開始時刻予測
function predictOptimalStartTime() {
  const now = new Date();
  const currentHour = now.getHours();
  const bestHours = analyticsState.insights.bestHours;
  
  if (bestHours.length === 0) return null;
  
  // 今日の残り時間で最適な時間を探す
  for (let i = 0; i < bestHours.length; i++) {
    const hour = bestHours[i];
    if (hour > currentHour) {
      const nextStart = new Date();
      nextStart.setHours(hour, 0, 0, 0);
      return nextStart.getTime();
    }
  }
  
  // 今日に最適時間がない場合は明日の最適時間
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(bestHours[0], 0, 0, 0);
  return tomorrow.getTime();
}

// 最適開始時刻取得
function getOptimalStartTime() {
  return analyticsState.insights.nextOptimalStart;
}

// パーソナルインサイト生成
function generatePersonalInsights() {
  const sessions = analyticsState.sessions;
  const workSessions = sessions.filter(s => s.type === 'work' && s.completed);
  
  if (workSessions.length === 0) {
    return {
      summary: 'もっとデータを集めて、あなただけの集中パターンを見つけましょう！',
      score: 0,
      trends: [],
      suggestions: []
    };
  }
  
  const avgFocusScore = workSessions.reduce((sum, s) => sum + s.focusScore, 0) / workSessions.length;
  const totalHours = workSessions.reduce((sum, s) => sum + s.duration, 0) / 3600;
  
  // 最近7日間のトレンド
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentSessions = workSessions.filter(s => s.startTime > sevenDaysAgo);
  const recentAvgScore = recentSessions.length > 0 ? 
    recentSessions.reduce((sum, s) => sum + s.focusScore, 0) / recentSessions.length : 0;
  
  const trend = recentAvgScore > avgFocusScore ? 'improving' : 
                recentAvgScore < avgFocusScore ? 'declining' : 'stable';
  
  return {
    summary: `集中度スコア: ${Math.round(avgFocusScore)}/100`,
    score: Math.round(avgFocusScore),
    totalHours: Math.round(totalHours * 10) / 10,
    trend: trend,
    bestTime: analyticsState.insights.bestHours[0] || null,
    suggestions: analyticsState.insights.recommendations.slice(0, 3)
  };
}

// 気分記録
function recordMood(mood, energy) {
  analyticsState.moods.push({
    mood: mood, // 'happy', 'neutral', 'stressed', 'tired', 'excited'
    energy: energy, // 1-5 scale
    timestamp: Date.now(),
    hour: new Date().getHours()
  });
  
  // 古い気分データを削除（7日以上前）
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  analyticsState.moods = analyticsState.moods.filter(m => m.timestamp > sevenDaysAgo);
}

// プロジェクト作成
function createProject(project) {
  const newProject = {
    id: generateTreeId(),
    name: project.name,
    color: project.color || '#4a7c59',
    description: project.description || '',
    createdAt: Date.now(),
    totalTime: 0,
    completedSessions: 0
  };
  
  analyticsState.projects.push(newProject);
}

// ========================
// 季節・テーマ機能
// ========================

// 現在の森のテーマを取得
function getCurrentForestTheme() {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();
  
  // 季節判定
  let season = 'spring';
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'autumn';
  else season = 'winter';
  
  // 時間帯判定
  let timeOfDay = 'day';
  if (hour >= 6 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 20) timeOfDay = 'evening';
  else timeOfDay = 'night';
  
  // 特別な日付チェック
  let specialDay = null;
  if (month === 11 && day >= 20 && day <= 26) specialDay = 'christmas';
  else if (month === 0 && day === 1) specialDay = 'newyear';
  else if (month === 3 && day >= 1 && day <= 10) specialDay = 'sakura';
  else if (month === 9 && day === 31) specialDay = 'halloween';
  
  // 天気効果（ランダム）
  let weather = 'clear';
  const weatherRandom = Math.random();
  if (weatherRandom < 0.1) weather = 'rain';
  else if (weatherRandom < 0.15 && season === 'winter') weather = 'snow';
  else if (weatherRandom < 0.05) weather = 'mist';
  
  return {
    season,
    timeOfDay,
    specialDay,
    weather,
    colors: getThemeColors(season, timeOfDay, specialDay),
    effects: getThemeEffects(weather, season)
  };
}

// テーマカラー取得
function getThemeColors(season, timeOfDay, specialDay) {
  const themes = {
    spring: {
      morning: { sky: '#e8f5e8', ground: '#8bc34a', accent: '#4caf50' },
      afternoon: { sky: '#c8e6c9', ground: '#66bb6a', accent: '#4caf50' },
      evening: { sky: '#ffccbc', ground: '#ff8a65', accent: '#f44336' },
      night: { sky: '#1a237e', ground: '#283593', accent: '#3f51b5' }
    },
    summer: {
      morning: { sky: '#e1f5fe', ground: '#4caf50', accent: '#009688' },
      afternoon: { sky: '#b3e5fc', ground: '#66bb6a', accent: '#00bcd4' },
      evening: { sky: '#ffab91', ground: '#ff7043', accent: '#ff5722' },
      night: { sky: '#0d47a1', ground: '#1565c0', accent: '#2196f3' }
    },
    autumn: {
      morning: { sky: '#fff3e0', ground: '#ff8a65', accent: '#ff5722' },
      afternoon: { sky: '#ffe0b2', ground: '#ffab40', accent: '#ff9800' },
      evening: { sky: '#d7ccc8', ground: '#a1887f', accent: '#795548' },
      night: { sky: '#2e2e2e', ground: '#424242', accent: '#616161' }
    },
    winter: {
      morning: { sky: '#f3e5f5', ground: '#e1bee7', accent: '#9c27b0' },
      afternoon: { sky: '#e8eaf6', ground: '#c5cae9', accent: '#673ab7' },
      evening: { sky: '#e0e0e0', ground: '#bdbdbd', accent: '#757575' },
      night: { sky: '#1a1a1a', ground: '#2e2e2e', accent: '#424242' }
    }
  };
  
  if (specialDay === 'christmas') {
    return { sky: '#c8e6c9', ground: '#4caf50', accent: '#f44336' };
  } else if (specialDay === 'halloween') {
    return { sky: '#ff8a65', ground: '#ff5722', accent: '#ff9800' };
  } else if (specialDay === 'sakura') {
    return { sky: '#fce4ec', ground: '#f8bbd9', accent: '#e91e63' };
  }
  
  return themes[season][timeOfDay];
}

// テーマエフェクト取得
function getThemeEffects(weather, season) {
  const effects = [];
  
  if (weather === 'rain') {
    effects.push({ type: 'rain', intensity: 0.7 });
  } else if (weather === 'snow') {
    effects.push({ type: 'snow', intensity: 0.5 });
  } else if (weather === 'mist') {
    effects.push({ type: 'mist', opacity: 0.3 });
  }
  
  // 季節固有のエフェクト
  if (season === 'autumn') {
    effects.push({ type: 'falling-leaves', intensity: 0.8 });
  } else if (season === 'spring') {
    effects.push({ type: 'petals', intensity: 0.4 });
  } else if (season === 'summer') {
    effects.push({ type: 'fireflies', intensity: 0.3 });
  }
  
  return effects;
}

// 気分と生産性の相関分析
function analyzeMoodProductivityCorrelation() {
  const sessions = analyticsState.sessions.filter(s => s.type === 'work' && s.completed);
  const moods = analyticsState.moods;
  
  if (sessions.length < 5 || moods.length < 5) return null;
  
  const correlations = {};
  
  sessions.forEach(session => {
    // セッション開始時刻の前後30分以内の気分を探す
    const sessionStart = session.startTime;
    const relevantMood = moods.find(mood => 
      Math.abs(mood.timestamp - sessionStart) < 30 * 60 * 1000
    );
    
    if (relevantMood) {
      if (!correlations[relevantMood.mood]) {
        correlations[relevantMood.mood] = { scores: [], energies: [] };
      }
      correlations[relevantMood.mood].scores.push(session.focusScore);
      correlations[relevantMood.mood].energies.push(relevantMood.energy);
    }
  });
  
  // 平均スコア計算
  const results = {};
  Object.entries(correlations).forEach(([mood, data]) => {
    if (data.scores.length >= 2) {
      results[mood] = {
        avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        avgEnergy: data.energies.reduce((a, b) => a + b, 0) / data.energies.length,
        sampleCount: data.scores.length
      };
    }
  });
  
  return results;
}

// ========================
// 高度な統計分析機能
// ========================

// 詳細統計レポート生成
function generateDetailedReport(timeframe = 'week') {
  const sessions = analyticsState.sessions.filter(s => s.type === 'work' && s.completed);
  const now = Date.now();
  
  // 期間設定
  let startTime;
  switch (timeframe) {
    case 'day':
      startTime = now - (24 * 60 * 60 * 1000);
      break;
    case 'week':
      startTime = now - (7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startTime = now - (30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startTime = 0;
  }
  
  const periodSessions = sessions.filter(s => s.startTime >= startTime);
  
  if (periodSessions.length === 0) {
    return {
      timeframe,
      summary: '指定期間内にデータがありません',
      sessions: [],
      insights: []
    };
  }
  
  // 基本統計
  const totalSessions = periodSessions.length;
  const totalTime = periodSessions.reduce((sum, s) => sum + s.duration, 0);
  const avgFocusScore = periodSessions.reduce((sum, s) => sum + s.focusScore, 0) / totalSessions;
  const avgInterruptions = periodSessions.reduce((sum, s) => sum + s.interruptions, 0) / totalSessions;
  
  // 時間帯分析
  const hourlyData = {};
  periodSessions.forEach(session => {
    const hour = session.hour;
    if (!hourlyData[hour]) {
      hourlyData[hour] = { count: 0, totalScore: 0, totalTime: 0 };
    }
    hourlyData[hour].count++;
    hourlyData[hour].totalScore += session.focusScore;
    hourlyData[hour].totalTime += session.duration;
  });
  
  const hourlyAnalysis = Object.entries(hourlyData).map(([hour, data]) => ({
    hour: parseInt(hour),
    avgScore: Math.round(data.totalScore / data.count),
    totalTime: Math.round(data.totalTime / 60), // 分に変換
    sessionCount: data.count
  })).sort((a, b) => b.avgScore - a.avgScore);
  
  // 曜日分析
  const weeklyData = {};
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  periodSessions.forEach(session => {
    const day = session.dayOfWeek;
    if (!weeklyData[day]) {
      weeklyData[day] = { count: 0, totalScore: 0, totalTime: 0 };
    }
    weeklyData[day].count++;
    weeklyData[day].totalScore += session.focusScore;
    weeklyData[day].totalTime += session.duration;
  });
  
  const weeklyAnalysis = Object.entries(weeklyData).map(([day, data]) => ({
    day: parseInt(day),
    dayName: dayNames[day],
    avgScore: Math.round(data.totalScore / data.count),
    totalTime: Math.round(data.totalTime / 60),
    sessionCount: data.count
  })).sort((a, b) => b.avgScore - a.avgScore);
  
  // プロジェクト分析
  const projectData = {};
  periodSessions.forEach(session => {
    const projectId = session.projectId || 'unassigned';
    if (!projectData[projectId]) {
      projectData[projectId] = { count: 0, totalScore: 0, totalTime: 0 };
    }
    projectData[projectId].count++;
    projectData[projectId].totalScore += session.focusScore;
    projectData[projectId].totalTime += session.duration;
  });
  
  const projectAnalysis = Object.entries(projectData).map(([projectId, data]) => {
    const project = analyticsState.projects.find(p => p.id === projectId);
    return {
      projectId,
      projectName: project ? project.name : '未分類',
      avgScore: Math.round(data.totalScore / data.count),
      totalTime: Math.round(data.totalTime / 60),
      sessionCount: data.count
    };
  }).sort((a, b) => b.totalTime - a.totalTime);
  
  // トレンド分析
  const trendData = generateTrendAnalysis(periodSessions, timeframe);
  
  // インサイト生成
  const insights = generateAdvancedInsights(periodSessions, hourlyAnalysis, weeklyAnalysis, projectAnalysis, trendData);
  
  return {
    timeframe,
    period: {
      start: new Date(startTime).toLocaleDateString('ja-JP'),
      end: new Date(now).toLocaleDateString('ja-JP')
    },
    summary: {
      totalSessions,
      totalTime: Math.round(totalTime / 60), // 分
      avgFocusScore: Math.round(avgFocusScore),
      avgInterruptions: Math.round(avgInterruptions * 10) / 10
    },
    hourlyAnalysis,
    weeklyAnalysis,
    projectAnalysis,
    trendData,
    insights
  };
}

// トレンド分析
function generateTrendAnalysis(sessions, timeframe) {
  if (sessions.length < 3) return null;
  
  // 時系列データを作成
  const timeSlots = {};
  const slotDuration = timeframe === 'day' ? 60 * 60 * 1000 : // 1時間
                      timeframe === 'week' ? 24 * 60 * 60 * 1000 : // 1日
                      7 * 24 * 60 * 60 * 1000; // 1週間
  
  sessions.forEach(session => {
    const slotKey = Math.floor(session.startTime / slotDuration) * slotDuration;
    if (!timeSlots[slotKey]) {
      timeSlots[slotKey] = { scores: [], times: [], count: 0 };
    }
    timeSlots[slotKey].scores.push(session.focusScore);
    timeSlots[slotKey].times.push(session.duration);
    timeSlots[slotKey].count++;
  });
  
  const trendPoints = Object.entries(timeSlots).map(([timestamp, data]) => ({
    timestamp: parseInt(timestamp),
    avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
    avgTime: data.times.reduce((a, b) => a + b, 0) / data.times.length,
    sessionCount: data.count
  })).sort((a, b) => a.timestamp - b.timestamp);
  
  // トレンド方向計算
  if (trendPoints.length >= 2) {
    const firstHalf = trendPoints.slice(0, Math.floor(trendPoints.length / 2));
    const secondHalf = trendPoints.slice(Math.floor(trendPoints.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, p) => sum + p.avgScore, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, p) => sum + p.avgScore, 0) / secondHalf.length;
    
    const trendDirection = secondAvg > firstAvg ? 'improving' : 
                          secondAvg < firstAvg ? 'declining' : 'stable';
    const trendStrength = Math.abs(secondAvg - firstAvg) / firstAvg;
    
    return {
      points: trendPoints,
      direction: trendDirection,
      strength: trendStrength,
      improvement: secondAvg - firstAvg
    };
  }
  
  return { points: trendPoints, direction: 'stable', strength: 0 };
}

// 高度なインサイト生成
function generateAdvancedInsights(sessions, hourlyAnalysis, weeklyAnalysis, projectAnalysis, trendData) {
  const insights = [];
  
  // 最適時間帯の特定
  if (hourlyAnalysis.length > 0) {
    const bestHour = hourlyAnalysis[0];
    const worstHour = hourlyAnalysis[hourlyAnalysis.length - 1];
    
    insights.push({
      type: 'peak_performance',
      title: '最高パフォーマンス時間',
      message: `${bestHour.hour}時台が最も集中できる時間です（スコア: ${bestHour.avgScore}）`,
      score: bestHour.avgScore,
      actionable: true
    });
    
    if (bestHour.avgScore - worstHour.avgScore > 20) {
      insights.push({
        type: 'time_optimization',
        title: '時間帯の最適化',
        message: `${bestHour.hour}時台と${worstHour.hour}時台では集中度に${bestHour.avgScore - worstHour.avgScore}点の差があります`,
        actionable: true
      });
    }
  }
  
  // 曜日パターン分析
  if (weeklyAnalysis.length > 0) {
    const bestDay = weeklyAnalysis[0];
    insights.push({
      type: 'weekly_pattern',
      title: '週間パフォーマンス',
      message: `${bestDay.dayName}曜日が最も生産的です（スコア: ${bestDay.avgScore}）`,
      actionable: true
    });
  }
  
  // プロジェクト効率分析
  if (projectAnalysis.length > 1) {
    const mostEfficient = projectAnalysis.sort((a, b) => b.avgScore - a.avgScore)[0];
    insights.push({
      type: 'project_efficiency',
      title: 'プロジェクト効率',
      message: `「${mostEfficient.projectName}」で最も高い集中度を記録しています`,
      actionable: false
    });
  }
  
  // トレンド分析
  if (trendData && trendData.direction !== 'stable') {
    const improvement = trendData.direction === 'improving' ? '向上' : '低下';
    const strength = trendData.strength > 0.1 ? '大幅に' : 'わずかに';
    
    insights.push({
      type: 'trend_analysis',
      title: 'パフォーマンストレンド',
      message: `最近の集中度が${strength}${improvement}しています`,
      trend: trendData.direction,
      change: Math.round(trendData.improvement),
      actionable: trendData.direction === 'declining'
    });
  }
  
  // 集中度別の推奨事項
  const avgScore = sessions.reduce((sum, s) => sum + s.focusScore, 0) / sessions.length;
  if (avgScore < 60) {
    insights.push({
      type: 'improvement_needed',
      title: '集中度改善の提案',
      message: '平均集中度が60点を下回っています。環境の見直しを検討してください',
      actionable: true,
      priority: 'high'
    });
  } else if (avgScore > 85) {
    insights.push({
      type: 'excellent_performance',
      title: '優秀なパフォーマンス',
      message: '素晴らしい集中力を維持できています！',
      actionable: false,
      priority: 'positive'
    });
  }
  
  return insights;
}

// パーソナライズド目標提案
function generatePersonalizedGoals() {
  const sessions = analyticsState.sessions.filter(s => s.type === 'work' && s.completed);
  
  if (sessions.length < 5) {
    return [{
      type: 'data_collection',
      title: 'データ収集',
      description: 'まずは5回以上のセッションを完了して、パターンを分析しましょう',
      target: 5 - sessions.length,
      current: sessions.length
    }];
  }
  
  const goals = [];
  const avgScore = sessions.reduce((sum, s) => sum + s.focusScore, 0) / sessions.length;
  const weeklyTime = forestState.todayFocusTime / 60; // 分
  
  // 集中度向上目標
  if (avgScore < 80) {
    goals.push({
      type: 'focus_improvement',
      title: '集中度向上',
      description: `平均集中度を${Math.round(avgScore)}点から85点に向上させましょう`,
      target: 85,
      current: Math.round(avgScore),
      timeframe: '2週間'
    });
  }
  
  // 時間目標
  if (weeklyTime < 150) { // 2.5時間未満
    goals.push({
      type: 'time_goal',
      title: '集中時間増加',
      description: '週150分（2.5時間）の集中時間を目指しましょう',
      target: 150,
      current: Math.round(weeklyTime),
      timeframe: '1週間'
    });
  }
  
  // 継続性目標
  goals.push({
    type: 'consistency',
    title: '継続性向上',
    description: '毎日最低1セッションを継続しましょう',
    target: 7,
    current: forestState.streakDays,
    timeframe: '継続中'
  });
  
  return goals;
}

// ========================
// インテリジェントな休憩提案システム
// ========================

// 休憩提案生成
function generateBreakSuggestion() {
  const now = new Date();
  const hour = now.getHours();
  const recentSessions = analyticsState.sessions.filter(s => 
    s.startTime > Date.now() - (2 * 60 * 60 * 1000) && s.type === 'work'
  );
  
  // 最近の作業強度を評価
  let workIntensity = 'normal';
  if (recentSessions.length >= 3) {
    workIntensity = 'high';
  } else if (recentSessions.length === 0) {
    workIntensity = 'low';
  }
  
  // 時間帯別の休憩提案
  const timeBasedSuggestions = getTimeBasedBreakSuggestions(hour);
  
  // 作業強度別の休憩提案
  const intensityBasedSuggestions = getIntensityBasedBreakSuggestions(workIntensity);
  
  // 個人パターンに基づく提案
  const personalizedSuggestions = getPersonalizedBreakSuggestions();
  
  // 最適な提案を選択
  const allSuggestions = [
    ...timeBasedSuggestions,
    ...intensityBasedSuggestions,
    ...personalizedSuggestions
  ];
  
  // 重複除去とランキング
  const uniqueSuggestions = Array.from(
    new Map(allSuggestions.map(s => [s.type, s])).values()
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  
  return {
    workIntensity,
    currentTime: hour,
    mainSuggestion: uniqueSuggestions[0] || getDefaultBreakSuggestion(),
    alternatives: uniqueSuggestions.slice(1, 4),
    personalizedTip: generatePersonalizedBreakTip()
  };
}

// 時間帯別休憩提案
function getTimeBasedBreakSuggestions(hour) {
  const suggestions = [];
  
  if (hour >= 6 && hour < 10) {
    // 朝
    suggestions.push({
      type: 'morning_stretch',
      title: '朝のストレッチ',
      description: '軽いストレッチで体を目覚めさせましょう',
      duration: '5-10分',
      activity: 'stretch',
      priority: 8
    });
  } else if (hour >= 10 && hour < 12) {
    // 午前中
    suggestions.push({
      type: 'hydration_break',
      title: '水分補給タイム',
      description: '水分を取って脳をリフレッシュしましょう',
      duration: '2-3分',
      activity: 'hydration',
      priority: 6
    });
  } else if (hour >= 12 && hour < 14) {
    // 昼食時間
    suggestions.push({
      type: 'lunch_walk',
      title: 'ランチ散歩',
      description: '外の空気を吸いながら軽い散歩をしましょう',
      duration: '15-20分',
      activity: 'walk',
      priority: 9
    });
  } else if (hour >= 14 && hour < 16) {
    // 午後
    suggestions.push({
      type: 'power_nap',
      title: 'パワーナップ',
      description: '15分の短い仮眠で午後の集中力を回復',
      duration: '10-15分',
      activity: 'rest',
      priority: 7
    });
  } else if (hour >= 16 && hour < 18) {
    // 夕方
    suggestions.push({
      type: 'eye_rest',
      title: '目の休憩',
      description: '画面から目を離して遠くを見つめましょう',
      duration: '3-5分',
      activity: 'eye_care',
      priority: 8
    });
  } else {
    // 夜間
    suggestions.push({
      type: 'wind_down',
      title: 'リラックスタイム',
      description: '深呼吸やリラクゼーションで心を落ち着けましょう',
      duration: '5-10分',
      activity: 'relaxation',
      priority: 7
    });
  }
  
  return suggestions;
}

// 作業強度別休憩提案
function getIntensityBasedBreakSuggestions(intensity) {
  const suggestions = [];
  
  switch (intensity) {
    case 'high':
      suggestions.push(
        {
          type: 'active_break',
          title: '積極的休憩',
          description: '軽い運動や散歩で血行を促進しましょう',
          duration: '10-15分',
          activity: 'exercise',
          priority: 9
        },
        {
          type: 'meditation',
          title: 'マインドフルネス',
          description: '瞑想や深呼吸でストレスを軽減しましょう',
          duration: '5-10分',
          activity: 'meditation',
          priority: 8
        }
      );
      break;
      
    case 'normal':
      suggestions.push(
        {
          type: 'social_break',
          title: 'コミュニケーション',
          description: '同僚や家族との軽い会話でリフレッシュ',
          duration: '5-10分',
          activity: 'social',
          priority: 6
        },
        {
          type: 'creative_break',
          title: 'クリエイティブ休憩',
          description: '音楽を聴いたり、簡単な創作活動を',
          duration: '10-15分',
          activity: 'creative',
          priority: 5
        }
      );
      break;
      
    case 'low':
      suggestions.push(
        {
          type: 'motivation_boost',
          title: 'モチベーション向上',
          description: '目標を見直したり、進捗を確認しましょう',
          duration: '5分',
          activity: 'reflection',
          priority: 7
        }
      );
      break;
  }
  
  return suggestions;
}

// 個人パターンに基づく休憩提案
function getPersonalizedBreakSuggestions() {
  const suggestions = [];
  const sessions = analyticsState.sessions.filter(s => s.type === 'work' && s.completed);
  
  if (sessions.length < 3) return suggestions;
  
  // 最近の集中度が低下している場合
  const recentSessions = sessions.slice(-5);
  const avgRecentScore = recentSessions.reduce((sum, s) => sum + s.focusScore, 0) / recentSessions.length;
  const overallAvg = sessions.reduce((sum, s) => sum + s.focusScore, 0) / sessions.length;
  
  if (avgRecentScore < overallAvg - 10) {
    suggestions.push({
      type: 'focus_recovery',
      title: '集中力回復',
      description: '最近集中度が下がっています。長めの休憩を取りましょう',
      duration: '15-20分',
      activity: 'extended_rest',
      priority: 9
    });
  }
  
  // 中断が多い場合
  const avgInterruptions = recentSessions.reduce((sum, s) => sum + s.interruptions, 0) / recentSessions.length;
  if (avgInterruptions > 2) {
    suggestions.push({
      type: 'environment_check',
      title: '環境整備',
      description: '集中を妨げる要因がないか環境をチェックしましょう',
      duration: '5分',
      activity: 'environment',
      priority: 8
    });
  }
  
  // 気分データに基づく提案
  const moodAnalysis = analyzeMoodProductivityCorrelation();
  if (moodAnalysis) {
    const bestMood = Object.entries(moodAnalysis).sort((a, b) => b[1].avgScore - a[1].avgScore)[0];
    if (bestMood) {
      suggestions.push({
        type: 'mood_optimization',
        title: '気分向上',
        description: `${bestMood[0]}な気分の時に最高のパフォーマンスを発揮しています`,
        duration: '3-5分',
        activity: 'mood_boost',
        priority: 6
      });
    }
  }
  
  return suggestions;
}

// デフォルト休憩提案
function getDefaultBreakSuggestion() {
  return {
    type: 'standard_break',
    title: '標準的な休憩',
    description: '少し立ち上がって体を動かしましょう',
    duration: '5分',
    activity: 'general',
    priority: 5
  };
}

// パーソナライズドな休憩のコツ
function generatePersonalizedBreakTip() {
  const tips = [
    '休憩中は作業のことを考えず、完全にリフレッシュしましょう',
    '自然光を浴びるか、緑の植物を見ると目と心が休まります',
    '深呼吸を3回するだけでもストレスが軽減されます',
    '水分補給は集中力の維持に重要です',
    '短時間の瞑想は脳の疲労回復に効果的です',
    '軽いストレッチで血行を促進しましょう',
    '好きな音楽を聴くと気分がリフレッシュされます',
    '15分以上の昼寝は逆に疲れるので避けましょう',
    'スマホやPCを見ずに目を休めることが大切です',
    '窓の外を眺めて遠くに焦点を合わせましょう'
  ];
  
  return tips[Math.floor(Math.random() * tips.length)];
}

// 初期読み込み
loadState();