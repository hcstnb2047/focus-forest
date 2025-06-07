// Focus Forest - Popup Script

let currentState = null;
let updateInterval = null;

// DOM要素
const elements = {
    timerTime: document.getElementById('timerTime'),
    timerLabel: document.getElementById('timerLabel'),
    progressFill: document.getElementById('progressFill'),
    treeHealth: document.getElementById('treeHealth'),
    healthFill: document.getElementById('healthFill'),
    healthText: document.getElementById('healthText'),
    completedPomodoros: document.getElementById('completedPomodoros'),
    todayTime: document.getElementById('todayTime'),
    totalTrees: document.getElementById('totalTrees'),
    streakDays: document.getElementById('streakDays'),
    totalHours: document.getElementById('totalHours'),
    efficiency: document.getElementById('efficiency'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    tree: document.getElementById('tree'),
    currentTree: document.getElementById('currentTree'),
    leaves: document.getElementById('leaves')
};

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    updateUI();
    startUpdateLoop();
    createFloatingLeaves();
    
    // イベントリスナー
    elements.startBtn.addEventListener('click', startSession);
    elements.stopBtn.addEventListener('click', stopSession);
});

// 状態読み込み
async function loadState() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getState' });
        currentState = response;
    } catch (error) {
        console.error('状態読み込みエラー:', error);
        // デフォルト状態
        currentState = {
            currentSession: {
                isActive: false,
                type: 'work',
                duration: 25 * 60,
                completedPomodoros: 0,
                currentTree: null
            },
            forestState: {
                trees: [],
                totalFocusTime: 0,
                todayFocusTime: 0,
                streakDays: 0
            }
        };
    }
}

// UI更新
function updateUI() {
    if (!currentState) return;
    
    const { currentSession, forestState } = currentState;
    
    // タイマー表示
    updateTimer();
    
    // セッション情報
    elements.completedPomodoros.textContent = currentSession.completedPomodoros;
    elements.todayTime.textContent = Math.floor(forestState.todayFocusTime / 60) + '分';
    
    // 統計情報
    elements.totalTrees.textContent = forestState.trees.length;
    elements.streakDays.textContent = forestState.streakDays;
    elements.totalHours.textContent = Math.floor(forestState.totalFocusTime / 3600);
    
    // 効率計算（完了したセッション数 / 開始したセッション数）
    const efficiency = forestState.trees.length > 0 ? 
        Math.round((forestState.trees.length / (forestState.trees.length + 1)) * 100) : 100;
    elements.efficiency.textContent = efficiency + '%';
    
    // ボタン状態
    if (currentSession.isActive) {
        elements.startBtn.disabled = true;
        elements.startBtn.textContent = '🌱 実行中...';
        elements.stopBtn.disabled = false;
    } else {
        elements.startBtn.disabled = false;
        elements.startBtn.textContent = currentSession.type === 'work' ? '🌱 集中開始' : '☕ 休憩開始';
        elements.stopBtn.disabled = true;
    }
    
    // 木の表示
    updateTreeDisplay();
    
    // ラベル更新
    elements.timerLabel.textContent = getSessionLabel(currentSession.type);
}

// タイマー更新
function updateTimer() {
    if (!currentState) return;
    
    const { currentSession } = currentState;
    let timeToDisplay = currentSession.duration;
    let progress = 0;
    
    if (currentSession.isActive && currentSession.startTime) {
        const elapsed = Math.floor((Date.now() - currentSession.startTime) / 1000);
        timeToDisplay = Math.max(0, currentSession.duration - elapsed);
        progress = Math.min(100, (elapsed / currentSession.duration) * 100);
    }
    
    // 時間表示
    const minutes = Math.floor(timeToDisplay / 60);
    const seconds = timeToDisplay % 60;
    elements.timerTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // プログレスバー
    elements.progressFill.style.width = progress + '%';
    
    // 木の体力表示
    if (currentSession.currentTree && currentSession.isActive && currentSession.type === 'work') {
        elements.treeHealth.style.display = 'flex';
        const health = currentSession.currentTree.health || 100;
        elements.healthFill.style.width = health + '%';
        elements.healthText.textContent = health + '%';
    } else {
        elements.treeHealth.style.display = 'none';
    }
}

// 木の表示更新
function updateTreeDisplay() {
    if (!currentState) return;
    
    const { currentSession } = currentState;
    
    if (currentSession.currentTree && currentSession.isActive) {
        // 現在育成中の木
        const elapsed = Math.floor((Date.now() - currentSession.currentTree.startTime) / 1000);
        const stage = Math.min(Math.floor(elapsed / (5 * 60)), 5); // 5分ごとに成長
        const stages = ['seed', 'sprout', 'sapling', 'young_tree', 'mature_tree', 'ancient_tree'];
        
        elements.tree.className = 'tree stage-' + stages[stage];
        elements.currentTree.style.display = 'block';
        
        // 体力に応じて色を変更
        const health = currentSession.currentTree.health || 100;
        if (health < 50) {
            elements.tree.style.filter = 'hue-rotate(-30deg) brightness(0.8)';
        } else if (health < 80) {
            elements.tree.style.filter = 'hue-rotate(-15deg) brightness(0.9)';
        } else {
            elements.tree.style.filter = 'none';
        }
    } else {
        // デフォルトの木（種）
        elements.tree.className = 'tree stage-seed';
        elements.currentTree.style.display = 'block';
        elements.tree.style.filter = 'none';
    }
}

// セッションラベル取得
function getSessionLabel(type) {
    switch (type) {
        case 'work': return '集中時間';
        case 'short_break': return '短い休憩';
        case 'long_break': return '長い休憩';
        default: return '集中時間';
    }
}

// セッション開始
async function startSession() {
    try {
        await chrome.runtime.sendMessage({ action: 'startSession' });
        await loadState();
        updateUI();
    } catch (error) {
        console.error('セッション開始エラー:', error);
    }
}

// セッション停止
async function stopSession() {
    try {
        await chrome.runtime.sendMessage({ action: 'endSession' });
        await loadState();
        updateUI();
    } catch (error) {
        console.error('セッション停止エラー:', error);
    }
}

// 更新ループ開始
function startUpdateLoop() {
    updateInterval = setInterval(async () => {
        await loadState();
        updateUI();
    }, 1000);
}

// 浮遊する葉っぱエフェクト
function createFloatingLeaves() {
    function createLeaf() {
        const leaf = document.createElement('div');
        leaf.className = 'leaf';
        leaf.style.left = Math.random() * 100 + '%';
        leaf.style.animationDelay = Math.random() * 3 + 's';
        leaf.style.animationDuration = (3 + Math.random() * 2) + 's';
        
        elements.leaves.appendChild(leaf);
        
        // アニメーション終了後に削除
        setTimeout(() => {
            if (leaf.parentNode) {
                leaf.parentNode.removeChild(leaf);
            }
        }, 5000);
    }
    
    // 定期的に葉っぱを生成
    setInterval(createLeaf, 2000);
}

// 時間フォーマット
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}時間${minutes}分`;
    } else {
        return `${minutes}分`;
    }
}

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (updateInterval) {
        clearInterval(updateInterval);
    }
});

// キーボードショートカット
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (currentState?.currentSession?.isActive) {
            stopSession();
        } else {
            startSession();
        }
    }
});