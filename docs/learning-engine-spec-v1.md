# Knowledge Village — 学習エンジン詳細仕様 v1.0
更新: 2026-10-18 / status: 設計基準案（未実装）
## 目的と責務
小学2年生から始め、学年一律ではなく能力単位で出題、習熟推定、復習を行う。ゲーム側とはイベント契約で分離する。算数の文章読解を初期重点領域とし、後から国語・英会話を追加。
## 原則
- 正答および数値計算は決定的ロジックで検証。AIは教材文案とヒント文案を支援するが、検証できない生成問題を自動採用しない。
- 算数・国語の読解練習は自動音読なし。英会話は別系統の音声機能。
- データは保護者管理。公開GitHub Pagesに個人識別情報・認証情報・宿題画像・APIキーを置かない。
- ヒント利用や誤答でゲーム報酬を下げるが、学習分析は独立。苦手単元の練習には報酬最適化による過度なスピード競争を避ける。
## 機能区分
- content: 単元、スキル、問題テンプレート、設問、解答・図解・ヒント
- assessment: セッション、回答試行、時間、初回正誤、ヒント、修正履歴
- mastery: 能力別推定、信頼度、復習期日、レベル推奨
- reward: 難易度＋時間ボーナス−ヒント−誤答（学力スコアとは別）
- game bridge: ミッションの目的数量・正解値・達成イベントを建築へ反映
## スキル階層
subject > domain > skill > objective。
初期算数:
CALC_ADD_SUB: たし算・ひき算の計算
REL_JOIN: 合併・増加
REL_PART: 全体・部分・残り
REL_COMPARE: 差・大小比較
REL_INVERSE: 逆向き数量関係
READ_GOAL: 文章で何を求めるか特定
MODEL_BAR: 棒図／部分全体図への対応
次期: MUL_GROUP, MUL_TABLE, DIV_EQUAL, DIV_MEASURE, MULTISTEP。
読解・立式・計算はそれぞれ別イベントで判定。
## 問題スキーマ（案）
id, template_id, version, subject, skill_ids[], grade_reference, difficulty(1..3),
reading_load, steps, number_constraints, context_variant, text, target_description,
known_quantities[], unknown_quantity, operation_tree, answer_value, answer_unit,
diagram_spec, hints[ordered], verification_cases[], published(boolean)。
テンプレートの数字・単位・数量方向を変えて生成。生成後は答えの整合、正の数量、学年範囲、選択肢の重複、文章の矛盾を検証。
## 出題ポリシー
- やさしい: 単一関係／小さい数／読み取り短め
- ふつう: 2〜3桁・比較／部分全体／条件の言い換え
- チャレンジ: 逆向き／複数条件／複数手順
- 同一セッションで同一インスタンスを再提示しない。最近使用したテンプレートを減点して選択。
- 単元解放: 直近の異なる初見問題10件以上、ヒントなし初回正解率80%以上、復習日をまたいだ正解を参考条件として評価。これは初期しきい値案であり運用実績で校正。
- 未学習の上位単元を強制解放しない。保護者が解放可能。
## 習熟度
skillごとにattempts_unique, correct_first_no_hint, assisted_correct, time_median, recency,
retention_checks, mastery_estimate(0..100), evidence_count, confidence(low/medium/high), next_review_atを保存。
初期推定: 直近の異なる問題の初回無ヒント正答に重み、複数日にまたがる復習と時間の安定性を加味。データ不足時は数字を強く表示せず「判定中」。
学年横断の単純順位ではなく、本人の過去との比較を主要グラフにする。
## タイマー
performance.now()等の単調時計で問題表示→意味確認→立式→計算→確定の各区間を計測。
ページ非表示／一時停止時間を別計上。再読み込み時の計測中断を記録。設問ごとに読む分量が違うので速度比較は同種・同程度の問題で行う。
練習: 時間記録のみ。チャレンジ: 追加報酬。模擬テスト: 時間上限を設定し終了時に結果表示。
## 報酬（仮設定・要AB検証）
base: difficulty 1=6, 2=10, 3=15（木材）。
hint_penalty: 3/回、wrong_penalty: 2/回、minimum: 2。
speed_bonus: 問題タイプ別に校正した目標時間を用い 0/1/3/5 の加点。
解答の速さだけを学力評価としない。ヒント／誤答を含む報酬計算はバックエンドまたは検証済みロジックで再現可能にする。
## 学習→ゲーム契約
mission{id,building_id,scenario,required_total,already_available,missing_target,skill_id}。
検証済み正解で missionSolved{mission_id,answer,unit,assistance,time_active,attempts,reward}を発火。
ゲーム側はanswerを不足建材数／施工ブロック数に正規化して視覚反映。学習ポイントの単なる加算に留めない。
セッションごとの獲得木材・石材は別記録。不正な答えで建築数量が変更されないこと。
## 保護者画面
教科→分野→能力の階層、初回無ヒント正答率、補助あり正答率、中央値解答秒数、苦手タイプ、復習候補、学習回数、推移。
「習熟度％」は根拠と件数を併記。サンプル数不足は判定中。
## 友達・クラス（将来。初期実装しない）
保護者承認制、ニックネーム、友達招待、村の公開と閲覧、個人情報や自由チャットなし。
公開ランキングは原則ゲーム内の達成・本人比の成長・共同制作等。生の学力・習熟度順位は公開しない。
努力ポイントには日次計上上限を設け、長時間利用を競わせない。ブロック・通報・公開停止・削除機能を設ける。
## データ分離
profiles(parent_owned), skills, problem_templates, problem_instances, sessions, attempts, mastery_snapshots, review_queue, reward_ledger, game_worlds, placed_objects, game_missions, parent_settings。
ローカル試作はバージョン付き保存と移行処理。クラウド同期時は専用SupabaseにRLS・保護者認証・削除・最小収集を実装。
## 受け入れ基準・次の工程
1. 問題難易度間のテンプレート重複を禁止し、初見の異なる設問を継続出題できる。
2. 読解・立式・計算の時刻/正誤/ヒントを個別記録。
3. 教材・報酬・習熟・ゲームの自動テスト。
4. 保護者用デモ集計（実データが少ない場合は判定中）。
5. 梨沙ちゃんに短いセッションで試してもらい、集中・自発性・初見問題の理解を観察。
6. その後ゲームの自由建築・室内表現を刷新。
