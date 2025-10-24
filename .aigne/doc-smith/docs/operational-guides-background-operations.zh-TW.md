# 排程任務

本系統利用排程任務管理器 (`@abtnode/cron`) 來自動化必要的背景任務。這些任務處理資料彙總、系統維護和狀態監控。此排程系統設計為具備叢集感知能力，確保在多節點環境中，任務僅由單一實例執行，以避免重複操作。

## 排程任務初始化

排程任務在 `index.ts` 檔案中進行初始化。系統定義了一系列任務，每個任務都有特定的名稱、排程和函式。並設有錯誤處理機制，用以記錄任務執行期間的任何失敗。

在分散式環境中，一個關鍵的設計考量是確保排程任務一次只在一個節點上運行。這由 `shouldExecuteTask` 函式管理，該函式決定當前實例是否為執行特定任務的指定「主節點」。這可以防止競爭條件和跨叢集的重複處理。

```typescript
// sourceId: blocklets/core/api/src/crons/index.ts
function init() {
  Cron.init({
    context: {},
    jobs: [
      // 任務定義...
    ],
    onError: (error: Error, name: string) => {
      logger.error('run job failed', { name, error });
    },
  });
}
```

---

## 核心任務

### 1. 模型呼叫統計 (`model.call.stats`)

此任務負責將模型呼叫資料彙總為每小時的統計記錄。這些統計資料對於監控使用情況、分析趨勢以及可能的計費目的至關重要。

**排程：**
執行排程由 `MODEL_CALL_STATS_CRON_TIME` 環境變數決定。

**機制：**
1.  **識別處理間隙：** 該任務首先確定哪些小時需要進行統計處理。它會找到最後處理的小時統計資料的時間戳，並建立一個包含其後所有小時直到最近完成的小時的列表。這種「暖機」機制確保即使排程任務曾有一段時間未啟用，也不會遺漏任何資料。如果不存在先前的統計資料，則從前一個小時開始。
2.  **擷取活躍使用者：** 它會擷取在過去 7 天內至少進行過一次模型呼叫的所有不重複使用者列表。這使得處理能集中在相關的活躍使用者上。
3.  **彙總資料：** 對於每個識別出的小時和每個活躍使用者，任務會呼叫 `ModelCallStat.getHourlyStats` 來計算並儲存彙總後的資料。這包括 token 數量、圖片生成次數和消耗的點數等指標。

此過程設計為冪等且具備彈性，能夠回填資料並確保小時分析資料的一致性和即時性。

```typescript
// sourceId: blocklets/core/api/src/crons/model-call-stats.ts
export async function createModelCallStats(hourTimestamp?: number) {
  const hours = hourTimestamp ? [hourTimestamp] : await getHoursToWarmup();

  // 取得所有活躍使用者 (過去 7 天內有呼叫記錄的使用者)
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
            // ... 記錄日誌
          } catch (error) {
            // ... 記錄錯誤日誌
          }
        })
      );
    })
  );
}
```

### 2. 清理過時模型呼叫 (`cleanup.stale.model.calls`)

這是一項關鍵的維護任務，透過處理孤立或卡住的模型呼叫記錄，確保系統保持穩健。如果伺服器實例崩潰或在呼叫被標記為「成功」或「失敗」之前發生未處理的錯誤，模型呼叫可能會卡在「處理中」的狀態。

**排程：**
執行排程由 `CLEANUP_STALE_MODEL_CALLS_CRON_TIME` 環境變數設定。

**機制：**
1.  **識別過時呼叫：** 任務會查詢資料庫中 `ModelCall` 的記錄，找出狀態為 `processing` 且 `callTime` 早於指定逾時時間（預設為 30 分鐘）的記錄。
2.  **標記為失敗：** 每個過時的呼叫都會被更新為 `failed` 狀態。`errorReason` 會被設定為表示逾時，而 `duration` 則根據其開始時間到清理時間計算得出。

這種自動化清理避免了無效的「處理中」記錄累積，確保了系統指標的完整性，並防止了分析或使用者端狀態的下游問題。

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

    // ... 更新邏輯，將呼叫標記為失敗
    
    return results.length;
  } catch (error) {
    logger.error('Failed to cleanup stale processing calls', { error });
    return 0;
  }
}
```

### 3. 檢查模型狀態 (`check.model.status`)

此任務旨在定期檢查所有可用 AI 模型的狀態。

**排程：**
排程由 `CHECK_MODEL_STATUS_CRON_TIME` 環境變數定義。

**目前狀態：**
在目前的實作中，與此任務相關的函式已被註解掉。因此，此排程任務**不執行任何操作**。它的存在是為了未來的功能預留位置。