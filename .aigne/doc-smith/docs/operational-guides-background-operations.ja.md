# Cron ジョブ

このシステムは、スケジュールされたジョブマネージャー（`@abtnode/cron`）を利用して、重要なバックグラウンドタスクを自動化します。これらのジョブは、データ集計、システムメンテナンス、およびステータス監視を処理します。cron システムはクラスター対応で設計されており、マルチノード環境においてタスクが単一のインスタンスによって実行されることを保証し、冗長な操作を防ぎます。

## Cron ジョブの初期化

Cron ジョブは `index.ts` ファイルで初期化されます。システムは一連のジョブを定義し、それぞれに特定の名前、スケジュール、および関数があります。ジョブの実行中に発生した失敗をログに記録するためのエラー処理メカニズムが導入されています。

分散環境における重要な設計上の考慮事項は、スケジュールされたタスクが一度に1つのノードでのみ実行されるようにすることです。これは `shouldExecuteTask` 関数によって管理され、現在のインスタンスが特定のタスクを実行するために指定された「マスター」であるかどうかを判断します。これにより、クラスター全体での競合状態や冗長な処理が防止されます。

```typescript
// sourceId: blocklets/core/api/src/crons/index.ts
function init() {
  Cron.init({
    context: {},
    jobs: [
      // ジョブの定義...
    ],
    onError: (error: Error, name: string) => {
      logger.error('run job failed', { name, error });
    },
  });
}
```

---

## コアジョブ

### 1. モデルコール統計 (`model.call.stats`)

このジョブは、モデルコールのデータを1時間ごとの統計レコードに集計する役割を担います。これらの統計は、使用状況の監視、トレンドの分析、そして潜在的には課金目的のために不可欠です。

**スケジューリング:**
実行スケジュールは `MODEL_CALL_STATS_CRON_TIME` 環境変数によって決定されます。

**メカニズム:**
1.  **処理ギャップの特定:** ジョブはまず、どの時間帯が統計処理を必要とするかを判断します。最後に処理された時間単位の統計のタイムスタンプを見つけ、直近の完了した時間まで、その後すべての時間のリストを作成します。この「ウォームアップ」メカニズムにより、cron ジョブが一定期間非アクティブであったとしても、データが失われることはありません。以前の統計が存在しない場合は、前の時間から開始します。
2.  **アクティブユーザーの取得:** 過去7日間に少なくとも1回のモデルコールを行ったすべてのユニークユーザーのリストを取得します。これにより、関連性の高いアクティブなユーザーに処理を集中させます。
3.  **データ集計:** 特定された各時間と各アクティブユーザーに対して、ジョブは `ModelCallStat.getHourlyStats` を呼び出し、集計データを計算して保存します。これには、トークン数、画像生成数、消費クレジットなどのメトリクスが含まれます。

このプロセスは冪等かつ回復力があるように設計されており、データのバックフィルが可能で、一貫性のある最新の時間単位の分析を保証します。

```typescript
// sourceId: blocklets/core/api/src/crons/model-call-stats.ts
export async function createModelCallStats(hourTimestamp?: number) {
  const hours = hourTimestamp ? [hourTimestamp] : await getHoursToWarmup();

  // すべてのアクティブユーザーを取得（過去7日間にコールがあったユーザー）
  const activeUsers = (await sequelize.query(
    `
    SELECT DISTINCT "userDid" 
    FROM "ModelCalls" 
    WHERE "callTime" >= :sevenDaysAgo
  `,
    {
      type: 'SELECT',
      replacements: {
        sevenDaysAgo: getCurrentUnixTimestamp() - 7 * 24 * 60 * 60,
      },
    }
  )) as any[];

  await Promise.all(
    hours.map(async (hourTimestamp) => {
      await Promise.all(
        activeUsers.map(async (user) => {
          try {
            await ModelCallStat.getHourlyStats(user.userDid, hourTimestamp);
            // ... ロギング
          } catch (error) {
            // ... エラーロギング
          }
        })
      );
    })
  );
}
```

### 2. 古いモデルコールのクリーンアップ (`cleanup.stale.model.calls`)

これは、孤立した、あるいはスタックしたモデルコールレコードを処理することで、システムの堅牢性を維持するための重要なメンテナンスジョブです。サーバーインスタンスがクラッシュしたり、コールが「成功」または「失敗」としてマークされる前に未処理のエラーが発生した場合、モデルコールが「処理中」の状態でスタックすることがあります。

**スケジューリング:**
実行スケジュールは `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` 環境変数で設定されます。

**メカニズム:**
1.  **古いコールの特定:** ジョブはデータベースにクエリを発行し、`status` が `processing` であり、`callTime` が指定されたタイムアウト（デフォルトは30分）よりも古い `ModelCall` レコードを探します。
2.  **失敗としてマーク:** 古い各コールは `status` が `failed` に更新されます。`errorReason` はタイムアウトを示すように設定され、`duration` は開始時刻からクリーンアップ時刻までで計算されます。

この自動クリーンアップにより、無効な「処理中」レコードの蓄積が防がれ、システムメトリクスの整合性が確保され、分析やユーザー向けの状態で下流の問題が発生するのを防ぎます。

```typescript
// sourceId: blocklets/core/api/src/middlewares/model-call-tracker.ts
export async function cleanupStaleProcessingCalls(timeoutMinutes: number = 30): Promise<number> {
  try {
    const cutoffTime = getCurrentUnixTimestamp() - timeoutMinutes * 60;

    const staleCalls = await ModelCall.findAll({
      where: {
        status: 'processing',
        callTime: { [Op.lt]: cutoffTime },
      },
    });

    // ... コールを失敗としてマークする更新ロジック
    
    return results.length;
  } catch (error) {
    logger.error('Failed to cleanup stale processing calls', { error });
    return 0;
  }
}
```

### 3. モデルステータスの確認 (`check.model.status`)

このジョブは、利用可能なすべてのAIモデルのステータスを定期的に確認することを目的としています。

**スケジューリング:**
スケジュールは `CHECK_MODEL_STATUS_CRON_TIME` 環境変数によって定義されます。

**現在のステータス:**
現在の実装では、このジョブに関連付けられた関数はコメントアウトされています。したがって、この cron ジョブは**何もアクションを実行しません**。これは将来の機能のためのプレースホルダーとして存在します。