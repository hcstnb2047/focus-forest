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
    leaves: document.getElementById('leaves'),
    // 新機能用要素
    aiInsights: document.getElementById('aiInsights'),
    focusScore: document.getElementById('focusScore'),
    optimalTime: document.getElementById('optimalTime'),
    recommendations: document.getElementById('recommendations'),
    projectSelect: document.getElementById('projectSelect'),
    addProjectBtn: document.getElementById('addProjectBtn'),
    moodSection: document.getElementById('moodSection'),
    energySlider: document.getElementById('energySlider'),
    energyValue: document.getElementById('energyValue')
};

// グローバル変数
let selectedMood = null;
let selectedProject = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    updateUI();
    startUpdateLoop();
    createFloatingLeaves();
    setupNewFeatures();
    
    // イベントリスナー
    elements.startBtn.addEventListener('click', startSession);
    elements.stopBtn.addEventListener('click', stopSession);
    elements.addProjectBtn.addEventListener('click', showAddProjectDialog);
    elements.projectSelect.addEventListener('change', (e) => {
        selectedProject = e.target.value || null;
    });
    elements.energySlider.addEventListener('input', (e) => {
        elements.energyValue.textContent = e.target.value;
    });
    
    // 気分ボタンのイベントリスナー
    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedMood = e.target.dataset.mood;
        });
    });
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
        // 気分記録（作業セッションの場合のみ）
        if (currentState?.currentSession?.type === 'work' && selectedMood) {
            await chrome.runtime.sendMessage({
                action: 'setMood',
                mood: selectedMood,
                energy: parseInt(elements.energySlider.value)
            });
        }
        
        // セッション開始（プロジェクトIDを含む）
        await chrome.runtime.sendMessage({ 
            action: 'startSession',
            projectId: selectedProject
        });
        
        await loadState();
        updateUI();
        
        // 気分セクションを非表示
        elements.moodSection.style.display = 'none';
        
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

// ========================
// 新機能実装
// ========================

// 新機能の初期化
async function setupNewFeatures() {
    await loadProjects();
    await updateAIInsights();
    await updateOptimalTime();
    await applySeasonalTheme();
    showMoodSectionIfNeeded();
}

// プロジェクト読み込み
async function loadProjects() {
    if (!currentState?.analyticsState?.projects) return;
    
    const projects = currentState.analyticsState.projects;
    elements.projectSelect.innerHTML = '<option value="">プロジェクトを選択（任意）</option>';
    
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        elements.projectSelect.appendChild(option);
    });
}

// AIインサイト更新
async function updateAIInsights() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getPersonalInsights' });
        if (!response?.insights) return;
        
        const insights = response.insights;
        
        elements.focusScore.textContent = insights.score || 0;
        
        // 推奨事項表示
        if (insights.suggestions && insights.suggestions.length > 0) {
            const suggestion = insights.suggestions[0];
            elements.recommendations.textContent = suggestion.message;
        } else {
            elements.recommendations.textContent = '集中を続けて、あなただけのパターンを見つけましょう！';
        }
        
        // 十分なデータがある場合のみ表示
        if (insights.score > 0) {
            elements.aiInsights.style.display = 'block';
        }
        
    } catch (error) {
        console.error('AIインサイト更新エラー:', error);
    }
}

// 最適時刻更新
async function updateOptimalTime() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getOptimalStartTime' });
        if (!response?.optimalTime) {
            elements.optimalTime.textContent = '最適な時刻を学習中...';
            return;
        }
        
        const optimalTime = new Date(response.optimalTime);
        const now = new Date();
        
        if (optimalTime > now) {
            const hours = optimalTime.getHours();
            const minutes = optimalTime.getMinutes();
            elements.optimalTime.textContent = `次の最適時刻: ${hours}:${minutes.toString().padStart(2, '0')}`;
        } else {
            elements.optimalTime.textContent = '今が集中に最適な時間です！';
        }
        
    } catch (error) {
        console.error('最適時刻更新エラー:', error);
    }
}

// 気分セクション表示判定
function showMoodSectionIfNeeded() {
    // 作業セッション開始前で、非アクティブ時に表示
    if (currentState?.currentSession?.type === 'work' && !currentState?.currentSession?.isActive) {
        elements.moodSection.style.display = 'block';
    }
}

// プロジェクト追加ダイアログ
async function showAddProjectDialog() {
    const projectName = prompt('プロジェクト名を入力してください:');
    if (!projectName || projectName.trim() === '') return;
    
    const colors = ['#4a7c59', '#1976d2', '#d32f2f', '#7b1fa2', '#f57c00', '#388e3c'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    try {
        await chrome.runtime.sendMessage({
            action: 'createProject',
            project: {
                name: projectName.trim(),
                color: color,
                description: ''
            }
        });
        
        await loadState();
        await loadProjects();
        
    } catch (error) {
        console.error('プロジェクト作成エラー:', error);
        alert('プロジェクトの作成に失敗しました。');
    }
}

// 季節テーマ適用
async function applySeasonalTheme() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getForestTheme' });
        if (!response?.theme) return;
        
        const theme = response.theme;
        const forestContainer = document.querySelector('.forest-container');
        const sun = document.querySelector('.sun');
        const ground = document.querySelector('.ground');
        
        // 背景グラデーション更新
        const skyColor = theme.colors.sky;
        const groundColor = theme.colors.ground;
        forestContainer.style.background = `linear-gradient(to bottom, ${skyColor} 0%, ${theme.colors.accent}20 40%, ${theme.colors.accent}40 70%, ${groundColor} 100%)`;
        
        // 地面の色更新
        ground.style.background = `linear-gradient(to bottom, ${groundColor} 0%, ${adjustBrightness(groundColor, -20)} 100%)`;
        
        // 太陽/月の表示調整
        if (theme.timeOfDay === 'night') {
            sun.style.background = 'radial-gradient(circle, #f5f5f5 60%, rgba(245, 245, 245, 0.3) 100%)';
            sun.style.boxShadow = '0 0 20px rgba(245, 245, 245, 0.5)';
            sun.innerHTML = '🌙';
        } else if (theme.timeOfDay === 'evening') {
            sun.style.background = 'radial-gradient(circle, #ff8a65 60%, rgba(255, 138, 101, 0.3) 100%)';
            sun.style.boxShadow = '0 0 20px rgba(255, 138, 101, 0.5)';
            sun.innerHTML = '';
        } else {
            sun.style.background = 'radial-gradient(circle, #ffc107 60%, rgba(255, 213, 79, 0.3) 100%)';
            sun.style.boxShadow = '0 0 20px rgba(255, 213, 79, 0.5)';
            sun.innerHTML = '';
        }
        
        // 季節エフェクト適用
        applySeasonalEffects(theme.effects);
        
        // 特別な日のエフェクト
        if (theme.specialDay) {
            applySpecialDayEffects(theme.specialDay);
        }
        
    } catch (error) {
        console.error('季節テーマ適用エラー:', error);
    }
}

// 季節エフェクト適用
function applySeasonalEffects(effects) {
    // 既存のエフェクトをクリア
    const existingEffects = document.querySelectorAll('.weather-effect, .seasonal-effect');
    existingEffects.forEach(el => el.remove());
    
    const forestContainer = document.querySelector('.forest-container');
    
    effects.forEach(effect => {
        switch (effect.type) {
            case 'rain':
                createRainEffect(forestContainer, effect.intensity);
                break;
            case 'snow':
                createSnowEffect(forestContainer, effect.intensity);
                break;
            case 'falling-leaves':
                createFallingLeavesEffect(forestContainer, effect.intensity);
                break;
            case 'petals':
                createPetalsEffect(forestContainer, effect.intensity);
                break;
            case 'fireflies':
                createFirefliesEffect(forestContainer, effect.intensity);
                break;
        }
    });
}

// 雨エフェクト作成
function createRainEffect(container, intensity) {
    const rainContainer = document.createElement('div');
    rainContainer.className = 'weather-effect rain-effect';
    rainContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
    `;
    
    for (let i = 0; i < Math.floor(intensity * 50); i++) {
        const raindrop = document.createElement('div');
        raindrop.style.cssText = `
            position: absolute;
            width: 2px;
            height: 20px;
            background: linear-gradient(to bottom, transparent, #87ceeb);
            left: ${Math.random() * 100}%;
            animation: fall ${1 + Math.random()}s linear infinite;
            animation-delay: ${Math.random() * 2}s;
        `;
        rainContainer.appendChild(raindrop);
    }
    
    container.appendChild(rainContainer);
}

// 雪エフェクト作成
function createSnowEffect(container, intensity) {
    const snowContainer = document.createElement('div');
    snowContainer.className = 'weather-effect snow-effect';
    snowContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
    `;
    
    for (let i = 0; i < Math.floor(intensity * 30); i++) {
        const snowflake = document.createElement('div');
        snowflake.textContent = '❄️';
        snowflake.style.cssText = `
            position: absolute;
            color: white;
            font-size: ${8 + Math.random() * 8}px;
            left: ${Math.random() * 100}%;
            animation: fall ${3 + Math.random() * 2}s linear infinite;
            animation-delay: ${Math.random() * 3}s;
        `;
        snowContainer.appendChild(snowflake);
    }
    
    container.appendChild(snowContainer);
}

// 落ち葉エフェクト作成
function createFallingLeavesEffect(container, intensity) {
    const leavesContainer = document.createElement('div');
    leavesContainer.className = 'seasonal-effect falling-leaves-effect';
    leavesContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
    `;
    
    const leafColors = ['🍂', '🍁', '🟫'];
    
    for (let i = 0; i < Math.floor(intensity * 15); i++) {
        const leaf = document.createElement('div');
        leaf.textContent = leafColors[Math.floor(Math.random() * leafColors.length)];
        leaf.style.cssText = `
            position: absolute;
            font-size: ${10 + Math.random() * 6}px;
            left: ${Math.random() * 100}%;
            animation: fall ${4 + Math.random() * 2}s ease-in-out infinite;
            animation-delay: ${Math.random() * 4}s;
        `;
        leavesContainer.appendChild(leaf);
    }
    
    container.appendChild(leavesContainer);
}

// 花びらエフェクト作成
function createPetalsEffect(container, intensity) {
    const petalsContainer = document.createElement('div');
    petalsContainer.className = 'seasonal-effect petals-effect';
    petalsContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
    `;
    
    for (let i = 0; i < Math.floor(intensity * 20); i++) {
        const petal = document.createElement('div');
        petal.textContent = '🌸';
        petal.style.cssText = `
            position: absolute;
            font-size: ${6 + Math.random() * 4}px;
            left: ${Math.random() * 100}%;
            animation: fall ${5 + Math.random() * 3}s ease-in-out infinite;
            animation-delay: ${Math.random() * 5}s;
        `;
        petalsContainer.appendChild(petal);
    }
    
    container.appendChild(petalsContainer);
}

// ホタルエフェクト作成
function createFirefliesEffect(container, intensity) {
    const firefliesContainer = document.createElement('div');
    firefliesContainer.className = 'seasonal-effect fireflies-effect';
    firefliesContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: hidden;
    `;
    
    for (let i = 0; i < Math.floor(intensity * 10); i++) {
        const firefly = document.createElement('div');
        firefly.style.cssText = `
            position: absolute;
            width: 3px;
            height: 3px;
            background: #ffff00;
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: glow ${2 + Math.random() * 2}s ease-in-out infinite alternate;
            box-shadow: 0 0 6px #ffff00;
        `;
        firefliesContainer.appendChild(firefly);
    }
    
    container.appendChild(firefliesContainer);
}

// 特別な日のエフェクト
function applySpecialDayEffects(specialDay) {
    const header = document.querySelector('.header h1');
    
    switch (specialDay) {
        case 'christmas':
            header.innerHTML = '🎄 Focus Forest 🎅';
            break;
        case 'halloween':
            header.innerHTML = '🎃 Focus Forest 👻';
            break;
        case 'sakura':
            header.innerHTML = '🌸 Focus Forest 🌸';
            break;
        case 'newyear':
            header.innerHTML = '🎊 Focus Forest 🎉';
            break;
    }
}

// 色の明度調整
function adjustBrightness(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// UIの定期更新に新機能を統合
const originalUpdateUI = updateUI;
updateUI = function() {
    originalUpdateUI();
    
    // 新機能の状態も更新
    showMoodSectionIfNeeded();
    
    // 定期的にAIインサイトを更新（10秒ごと）
    if (Math.floor(Date.now() / 1000) % 10 === 0) {
        updateAIInsights();
        updateOptimalTime();
    }
    
    // 1分ごとに季節テーマを更新
    if (Math.floor(Date.now() / 1000) % 60 === 0) {
        applySeasonalTheme();
    }
};

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