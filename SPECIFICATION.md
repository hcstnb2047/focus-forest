# Focus Forest 拡張機能 - 技術仕様書

## 概要

Focus Forest は、ポモドーロテクニックと森育成ゲームを組み合わせたChrome拡張機能です。集中作業中に気を散らすサイトをブロックし、集中時間に応じて仮想の木を育てることで、生産性の向上とモチベーションの維持を図ります。

## 基本情報

- **名称**: Focus Forest - ポモドーロ森育成
- **バージョン**: 1.0.0
- **対応ブラウザ**: Chrome（Manifest V3）
- **言語**: 日本語
- **ファイル構成**:
  - `manifest.json` - 拡張機能の設定
  - `background.js` - バックグラウンドスクリプト
  - `popup.html/js` - ポップアップUI
  - `blocked.html` - ブロックページ
  - `rules.json` - サイトブロックルール
  - `icons/` - アイコンファイル

## 主要機能

### 1. ポモドーロタイマー機能

#### 基本設定
- **作業時間**: 25分（1500秒）
- **短い休憩**: 5分（300秒）
- **長い休憩**: 15分（900秒）
- **長い休憩の条件**: 4回の作業セッション完了後

#### 動作フロー
1. ユーザーが「開始」ボタンをクリック
2. タイマー開始、アラーム設定
3. 作業時間中はサイトブロック有効化
4. 時間終了時に通知とセッション切り替え
5. 休憩時間はサイトブロック無効化

### 2. 森育成システム

#### 木の成長段階
1. **seed** (種) - 開始時
2. **sprout** (芽) - 5分後
3. **sapling** (苗木) - 10分後
4. **young_tree** (若木) - 15分後
5. **mature_tree** (成木) - 20分後
6. **ancient_tree** (古木) - 25分後

#### 成長メカニズム
- 5分ごとに次の段階に成長
- 作業セッション完了時に森のコレクションに追加
- 木の体力システム（初期値100%）

#### 体力システム
- 気を散らすサイト訪問時に20%減少
- 体力0%で木が枯れてセッション強制終了
- 体力に応じて木の外観が変化

### 3. サイトブロック機能

#### ブロック対象（デフォルト）
- YouTube (`youtube.com`, `www.youtube.com`)
- Twitter/X (`twitter.com`, `x.com`)
- Facebook (`facebook.com`)
- Instagram (`instagram.com`)
- TikTok (`tiktok.com`)
- Reddit (`reddit.com`)
- Netflix (`netflix.com`)
- Twitch (`twitch.tv`)
- Discord (`discord.com`)
- LinkedIn (`linkedin.com`)

#### ブロック機能
- 作業セッション中のみ有効
- `declarativeNetRequest` APIを使用
- ブロックページ（`blocked.html`）にリダイレクト
- 動的ルール更新による柔軟な制御

### 4. 統計・進捗管理

#### 記録データ
- **完了したポモドーロ数**: セッション内累計
- **今日の集中時間**: 分単位で表示
- **育てた木の数**: 完了した作業セッション数
- **連続日数**: 毎日使用した場合のストリーク
- **総集中時間**: 累計時間（時間単位）
- **集中効率**: 完了率の目安

#### データ永続化
- `chrome.storage.local` APIを使用
- セッション状態とフォレスト状態を分離管理
- 日付チェックによる自動リセット機能

### 5. ユーザーインターフェース

#### ポップアップUI（420px × 600px）
- **ヘッダー**: タイトルとサブタイトル
- **森の風景**: アニメーション付きの可視化エリア
  - 太陽、地面、浮遊する葉っぱエフェクト
  - 現在育成中の木の表示
  - 成長段階に応じた視覚的変化
- **タイマー表示**: 大きな時間表示とラベル
- **プログレスバー**: 進捗の可視化
- **木の体力表示**: 作業中のみ表示
- **統計カード**: 2×2グリッドレイアウト
- **操作ボタン**: 開始/停止ボタン
- **森の統計**: 総合的なデータ表示

#### ブロックページUI
- **フルスクリーン表示**: 没入感のあるデザイン
- **森の風景**: 背景に複数の木を配置
- **浮遊パーティクル**: アニメーション効果
- **残り時間表示**: リアルタイム更新
- **モチベーションメッセージ**: 30秒ごとに変更
- **統計表示**: 今日の成果を表示
- **操作ボタン**: 拡張機能を開く、緊急停止

### 6. 通知システム

#### 通知タイプ
- **セッション開始**: 作業/休憩開始時
- **セッション完了**: 時間終了時
- **木へのダメージ**: 気を散らすサイト訪問時
- **木が枯れた**: 体力0%到達時

#### 通知設定
- 有効/無効の切り替え可能
- アイコン付きのリッチ通知
- 適切なタイトルとメッセージ

### 7. バッジ表示機能

#### 表示内容
- **非アクティブ時**: 🌱 アイコン
- **作業中**: 残り分数または🌳（1分未満）
- **休憩中**: 別色での残り時間表示

#### 更新頻度
- 30秒ごとの自動更新
- 状態変更時の即座更新

## 技術仕様

### ファイル構成詳細

#### manifest.json
```json
{
  "manifest_version": 3,
  "name": "Focus Forest - ポモドーロ森育成",
  "version": "1.0.0",
  "permissions": [
    "storage", "tabs", "declarativeNetRequest", 
    "activeTab", "alarms"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" },
  "declarative_net_request": {
    "rule_resources": [
      {
        "id": "distraction_blocker",
        "enabled": true,
        "path": "rules.json"
      }
    ]
  }
}
```

#### データ構造

**CurrentSession**:
```javascript
{
  isActive: boolean,
  type: 'work' | 'short_break' | 'long_break',
  startTime: number | null,
  duration: number,
  completedPomodoros: number,
  currentTree: {
    id: string,
    stage: number,
    startTime: number,
    health: number
  } | null
}
```

**ForestState**:
```javascript
{
  trees: [
    {
      id: string,
      stage: number,
      startTime: number,
      completedAt: number,
      duration: number,
      health: number
    }
  ],
  totalFocusTime: number,
  todayFocusTime: number,
  streakDays: number,
  lastActiveDate: string | null
}
```

### API使用詳細

#### Chrome APIs
- **chrome.storage.local**: データ永続化
- **chrome.alarms**: タイマー機能
- **chrome.declarativeNetRequest**: サイトブロック
- **chrome.notifications**: 通知機能
- **chrome.action**: バッジ表示
- **chrome.tabs**: タブ監視
- **chrome.runtime**: メッセージ通信

#### 主要関数

**background.js**:
- `startPomodoroSession()`: セッション開始
- `endPomodoroSession(completed)`: セッション終了
- `updateBlockingRules(shouldBlock)`: ブロックルール更新
- `updateBadge()`: バッジ表示更新
- `loadState()` / `saveState()`: 状態管理

**popup.js**:
- `updateUI()`: UI状態更新
- `updateTimer()`: タイマー表示更新
- `updateTreeDisplay()`: 木の表示更新
- `createFloatingLeaves()`: アニメーション効果

### パフォーマンス考慮事項

#### 更新頻度
- UI更新: 1秒間隔
- バッジ更新: 30秒間隔
- 状態保存: 変更時のみ
- 葉っぱアニメーション: 2秒間隔で新規生成

#### メモリ使用量
- 最小限のデータ構造
- 不要なイベントリスナーの除去
- アニメーション要素の適切な削除

## セキュリティ・プライバシー

### データ保護
- すべてのデータはローカルストレージに保存
- 外部サーバーへの通信なし
- 個人情報の収集なし

### 権限の最小化
- 必要最小限の権限のみ要求
- `<all_urls>`は サイトブロック機能のみに使用
- ユーザーデータの外部送信なし

## 今後の拡張可能性

### 機能追加案
- カスタムブロックサイト設定
- 作業カテゴリー別の統計
- 音声通知とアラーム音設定
- 森のテーマ変更機能
- エクスポート/インポート機能
- 週間/月間レポート
- 達成バッジシステム

### 技術改善案
- Progressive Web App対応
- オフライン機能強化
- パフォーマンス最適化
- アクセシビリティ改善
- 多言語対応

## トラブルシューティング

### よくある問題
1. **ブロックが効かない**: manifest.jsonのパス確認
2. **統計がリセットされる**: 日付処理の確認
3. **通知が表示されない**: 権限確認
4. **アイコンが表示されない**: ファイルパス確認

### デバッグ方法
- Developer Tools での Console確認
- `chrome://extensions/` での拡張機能状態確認
- Storage Area Explorer での データ確認
- Network タブでのリクエスト確認

---

この仕様書は Focus Forest 拡張機能の完全な技術文書として、開発・メンテナンス・機能拡張の際の参考資料となります。