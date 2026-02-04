# Credit 赠送功能与展示规格说明

## 1. 概述

### 产品定位
为 AIGNE Hub 平台添加 Credit 赠送能力和赠送额度消耗统计的可视化展示，帮助用户区分赠送额度和付费额度的使用情况。

### 核心概念
- 调用 payment-kit 的 client SDK 实现 Credit 赠送和统计查询
- 在 Project Detail 页面展示赠送额度信息
- 在趋势图中分别展示赠送额度消耗和付费额度消耗

### 优先级
中等优先级 - 增强用户对额度使用情况的可见性

### 目标用户
- 同一 blocklet 站点群内的用户/管理员（赠送额度）
- Admin/Owner 角色用户（查询赠送额度统计）
- 需要查看赠送额度使用情况的用户

### 项目范围
**包含：**
- 新增 `/api/credit/grant` 接口（赠送额度，需站点群权限）
- 新增 `/api/credit/grant-usage` 接口（查询赠送额度消耗统计，需 Admin 权限）
- 实现站点群权限校验中间件（仅用于 `/grant` 接口）
- 修改 Project Detail 页面的 Credit 总用量指标 subLabel
- 修改趋势图组件，添加赠送额度消耗曲线（堆叠面积图）

**不包含：**
- Payment-kit SDK 的升级或修改
- 赠送额度的审批流程
- 赠送额度的撤销功能
- 导出赠送记录功能

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │         Project Detail Page                       │  │
│  │  - Credit 总用量 Card (更新 subLabel)             │  │
│  │  - 趋势图组件 (堆叠面积图)                        │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│                          │ API 调用                      │
│                          ▼                               │
└──────────────────────────┼───────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────┐
│                    Backend (Express)                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │  /api/credit Router                                │ │
│  │  - POST /grant (赠送额度)                          │ │
│  │     ├─ Middleware: verifySiteGroup (站点群校验)   │ │
│  │  - GET  /grant-usage (查询赠送额度消耗统计)       │ │
│  │     ├─ Middleware: isAdminRole (Admin 权限校验)   │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                               │
│                          ▼                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  payment-kit Client SDK                            │ │
│  │  - payment.creditGrants.create()                   │ │
│  │  - payment.creditGrants.usageStats()               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          │
                          ▼
                ┌──────────────────┐
                │   Payment-Kit    │
                │   (Blocklet)     │
                └──────────────────┘
```

### 2.2 数据层

#### 2.2.1 后端接口数据流

**赠送额度接口：**
```
POST /api/credit/grant
├─ Request Body: { userId: string, amount: number, reason?: string, grantorDid: string }
├─ Middleware: verifySiteGroup (站点群校验，当前直接放行)
├─ SDK Call: payment.creditGrants.create()
└─ Response: { success: boolean, grantId?: string, error?: string }
```

**查询赠送额度消耗统计接口：**
```
GET /api/credit/grant-usage?startTime=xxx&endTime=xxx&grantorDid=xxx
├─ Query Params: { startTime: number, endTime: number, grantorDid: string }
├─ Middleware: isAdminRole (Admin/Owner 权限校验)
├─ SDK Call: payment.creditGrants.stats({
│    currency_id: CURRENCY_ID,
│    start_date: startTime,
│    end_date: endTime,
│    grantor_by: grantorDid,  // 由前端传入
│    group_by_date: true
│  })
└─ Response: {
     summary: { totalGranted, totalUsed, ... },
     daily_stats: [{ date: 'YYYY-MM-DD', granted_amount, used_amount, ... }]
   }
```

#### 2.2.2 前端数据获取

前端需要调用两个接口获取趋势图数据：
1. **现有接口** `/api/usage/projects/:appDid/trends` - 获取总消耗额度趋势
2. **新增接口** `/api/credit/grant-usage` - 获取赠送额度消耗趋势

前端合并两个数据源，生成堆叠面积图。

---

## 3. 详细行为说明

### 3.1 赠送 Credit 流程

```
用户发起赠送请求（包含 grantorDid）
    ↓
验证站点群权限 (verifySiteGroup middleware，当前直接放行)
    ↓
调用 payment.creditGrants.create({
  userId: req.body.userId,
  amount: req.body.amount,
  reason: req.body.reason,
  grantorDid: req.body.grantorDid  // 前端传入的赠送方 DID
})
    ↓
┌─────────────────────┐
│ 成功                │  失败 (网络/权限/参数错误)
│ 返回 200 + grantId  │  静默降级，返回 200 + { success: false, error: msg }
└─────────────────────┘
```

### 3.2 查询赠送额度消耗统计流程

```
前端请求 /api/credit/grant-usage?startTime=xxx&endTime=xxx&grantorDid=xxx
    ↓
验证 Admin/Owner 权限 (复用现有 isAdminRole 校验)
    ↓
获取 currency_id
    ↓
调用 payment.creditGrants.stats({
  currency_id: meter.currency_id,
  start_date: startTime,
  end_date: endTime,
  grantor_by: grantorDid,  // 由前端传入
  group_by_date: true
})
    ↓
┌─────────────────────────────┐
│ 成功                        │  失败 (网络/权限错误)
│ 返回包含 summary 和         │  静默降级，返回 200 + { daily_stats: [] }
│ daily_stats 的数据          │  前端只显示付费额度曲线
└─────────────────────────────┘
```

### 3.3 错误处理策略

#### 静默降级原则
- **赠送失败**：不阻断用户操作，返回 `{ success: false, error: "..." }`，前端展示错误提示
- **查询失败**：返回空数据 `{ data: [] }`，前端趋势图只显示付费额度曲线，不影响核心功能

#### 典型错误场景
| 错误类型 | 后端处理 | 前端展示 |
|---------|---------|---------|
| 站点群权限不足 (/grant) | 返回 200 + `{ success: false, error: "Permission denied" }` | Toast 提示对应错误信息 |
| Admin 权限不足 (/grant-usage) | 返回 403 + `{ error: "Insufficient permissions. Admin or owner role required." }` | Toast 提示对应错误信息 |
| Payment-kit 未运行 | 返回 200 + `{ success: false, error: "Payment service is not available" }` | Toast 提示对应错误信息 |
| 网络超时 | 返回 200 + `{ success: false, error: "Request timeout" }` | Toast 提示对应错误信息 |
| 查询统计失败 | 返回 200 + `{ daily_stats: [] }` | 趋势图只显示付费额度曲线 |

---

## 4. 用户体验设计

### 4.1 Project Detail 页面变更

#### 4.1.1 Credit 总用量指标 subLabel

**变更前：**
```
┌─────────────────────────────┐
│ Credit 总用量               │
│ 1,234.56 Credits            │
│ subLabel: "最近 30 天"      │
└─────────────────────────────┘
```

**变更后：**
```
┌─────────────────────────────────────────────┐
│ Credit 总用量                               │
│ 1,234.56 Credits                            │
│ 含赠送额度 $100 / $600 (带下划线，可 hover) │
│                                             │
│ Hover 提示：                                │
│ • $100: 已消耗的赠送额度                    │
│ • $600: 总赠送额度                          │
└─────────────────────────────────────────────┘
```

**实现细节：**
- subLabel 文案：`含赠送额度 $<已消耗> / $<总赠送>`
- 下划线样式：`text-decoration: underline dotted`
- Hover 时显示 Tooltip，说明两个数值的含义

#### 4.1.2 趋势图变更

**变更前：**
```
┌─────────────────────────────────────┐
│ Credit 消耗趋势                     │
│                                     │
│  ▲                                  │
│  │     ╱╲                           │
│  │    ╱  ╲    ╱╲                    │
│  │   ╱    ╲  ╱  ╲                   │
│  │  ╱      ╲╱    ╲                  │
│  └──────────────────────────▶      │
│     单一曲线：总消耗额度             │
└─────────────────────────────────────┘
```

**变更后（堆叠面积图）：**
```
┌─────────────────────────────────────┐
│ Credit 消耗趋势                     │
│                                     │
│  ▲  ┌─────────────┐                 │
│  │  │ 付费额度    │ (深色)          │
│  │  │ 赠送额度    │ (浅色)          │
│  │  └─────────────┘                 │
│  │                                  │
│  │     ████████  (付费额度)         │
│  │    ░░░░░░░░░   (赠送额度)        │
│  │   ░░░░░░░░░░                     │
│  │  ░░░░░░░░░░░                     │
│  └──────────────────────────▶      │
│                                     │
│  Tooltip (hover 时):                │
│  2024-01-15                         │
│  • 赠送额度消耗: 50 Credits         │
│  • 付费额度消耗: 150 Credits        │
│  • 总消耗: 200 Credits              │
└─────────────────────────────────────┘
```

**实现方式：**
- 使用现有图表组件（如 Recharts 的 `<AreaChart>` + `<Area stackId="1">`）
- 两个 `<Area>` 组件：
  - `dataKey="grantedUsage"` - 赠送额度消耗（浅色，如 `#FFA726`）
  - `dataKey="paidUsage"` - 付费额度消耗（深色，如 `#42A5F5`）
- 数据合并逻辑（以日期作为 key）：
  ```typescript
  // 1. 将赠送额度数据转换为 Map，以日期为 key
  const grantUsageMap = new Map(
    grantUsageTrends.daily_stats?.map(item => [item.date, item.used_amount]) || []
  );

  // 2. 合并数据
  const mergedData = totalUsageTrends.map(item => {
    const dateKey = new Date(item.timestamp * 1000).toISOString().split('T')[0]; // 转为 YYYY-MM-DD
    const grantedUsage = Number(grantUsageMap.get(dateKey) || 0);
    const paidUsage = Math.max(0, item.totalCredits - grantedUsage);

    return {
      timestamp: item.timestamp,
      date: dateKey,
      grantedUsage,
      paidUsage,
      total: item.totalCredits,
      // 保留环比数据（仅总额度）
      comparison: item.comparison
    };
  });
  ```
- Tooltip 展示逻辑：
  ```typescript
  // 当前日期显示拆分后的数据
  Current: 2024-01-15
  • Granted Credit Usage: 50 Credits
  • Paid Credit Usage: 150 Credits
  • Total: 200 Credits

  // 环比日期只显示总额度
  Previous: 2024-01-14
  • Total: 180 Credits
  ```

---

## 5. 技术实现指南

### 5.1 项目结构

```
blocklets/core/
├── api/
│   └── src/
│       ├── routes/
│       │   ├── credit.ts          (新增：Credit 相关路由)
│       │   └── usage.ts           (现有：复用 isAdminRole 函数)
│       ├── middlewares/
│       │   └── verify-site-group.ts  (新增：站点群权限校验)
│       └── libs/
│           └── payment.ts         (现有：复用 paymentClient)
└── src/
    └── pages/
        └── project-detail/
            ├── components/
            │   ├── credit-usage-card.tsx     (修改：更新 subLabel)
            │   └── usage-trend-chart.tsx     (修改：堆叠面积图)
            └── hooks/
                └── use-grant-usage.ts        (新增：查询赠送额度消耗)
```

### 5.2 后端代码示例

#### 5.2.1 站点群权限校验中间件

**文件：** `blocklets/core/api/src/middlewares/verify-site-group.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { getComponentInfo } from '@blocklet/sdk';
import logger from '../libs/logger';

/**
 * 校验请求是否来自同一个 blocklet 站点群
 * TODO: 具体实现待调研后补充
 *
 * 注：当前直接放行所有请求，后续将根据 grantorDid 进行站点群校验
 */
export async function verifySiteGroup(req: Request, res: Response, next: NextFunction) {
  // 暂时放行所有请求，后续补充站点群校验逻辑
  // 未来实现：验证 req.body.grantorDid 是否与当前站点群匹配
  next();
}
```

#### 5.2.2 Credit 路由实现

**文件：** `blocklets/core/api/src/routes/credit.ts`

```typescript
import { Router } from 'express';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import Joi from 'joi';
import { paymentClient } from '../libs/payment';
import { verifySiteGroup } from '../middlewares/verify-site-group';
import logger from '../libs/logger';

const router = Router();
const user = sessionMiddleware({ accessKey: true });

// 复用现有的 isAdminRole 函数（从 usage.ts 中提取）
function isAdminRole(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

// 赠送额度请求体校验
const grantCreditSchema = Joi.object({
  userId: Joi.string().required(),
  amount: Joi.number().positive().required(),
  reason: Joi.string().optional().allow(''),
  grantorDid: Joi.string().required(), // 赠送方 DID，由前端传入
});

/**
 * POST /api/credit/grant
 * 赠送 Credit 给指定用户（需要站点群权限）
 */
router.post('/grant', user, verifySiteGroup, async (req, res) => {
  try {
    // 校验请求参数
    const { userId, amount, reason, grantorDid } = await grantCreditSchema.validateAsync(req.body);

    logger.info('Granting credit', { userId, amount, reason, grantorDid, by: req.user?.did });

    // 调用 payment-kit SDK 赠送额度
    // grantorDid 由前端传入，verifySiteGroup 中间件会校验（当前直接放行）
    const result = await paymentClient.creditGrants.create({
      customer_id: userId,
      amount: String(amount),
      reason: reason || 'Credit grant from AIGNE Hub',
      grantor_by: grantorDid, // 使用前端传入的赠送方 DID
      metadata: {
        grantedBy: req.user?.did,
        grantedAt: new Date().toISOString(),
      },
    });

    logger.info('Credit granted successfully', { grantId: result.id, userId, amount });

    return res.json({
      success: true,
      grantId: result.id,
      amount: result.amount,
    });
  } catch (error: any) {
    // 静默降级：返回 200 但标记失败
    logger.error('Failed to grant credit', { error, body: req.body });

    return res.json({
      success: false,
      error: error.message || 'Failed to grant credit. Please try again.',
    });
  }
});

/**
 * GET /api/credit/grant-usage
 * 查询赠送额度的消耗统计（需要 Admin/Owner 权限）
 */
router.get('/grant-usage', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 复用现有的 Admin 权限校验
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions. Admin or owner role required.'
      });
    }

    const startTime = parseInt(req.query.startTime as string, 10);
    const endTime = parseInt(req.query.endTime as string, 10);
    const grantorDid = req.query.grantorDid as string;

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !grantorDid) {
      return res.json({
        success: false,
        error: 'Invalid parameters: startTime, endTime and grantorDid are required',
        daily_stats: [],
      });
    }

    logger.info('Querying grant usage stats', { startTime, endTime, grantorDid, by: userDid });

    // 获取 meter 信息以获取 currency_id
    const meter = await ensureMeter();
    if (!meter || !meter.currency_id) {
      logger.warn('Meter or currency_id not found');
      return res.json({
        success: false,
        error: 'Currency configuration not found',
        daily_stats: [],
      });
    }

    // 调用 payment-kit SDK 查询赠送额度消耗统计
    // grantor_by 由前端传入
    const stats = await paymentClient.creditGrants.stats({
      currency_id: meter.currency_id,
      start_date: startTime,
      end_date: endTime,
      grantor_by: grantorDid, // 使用前端传入的赠送方 DID
      group_by_date: true,
    });

    // 返回包含汇总和每日统计的数据
    return res.json({
      summary: stats.stats?.[0] || {},
      daily_stats: stats.daily_stats || [],
    });
  } catch (error: any) {
    // 静默降级：返回空数据，前端只显示付费额度曲线
    logger.error('Failed to query grant usage', { error, query: req.query });

    return res.json({
      success: false,
      error: error.message || 'Failed to query grant usage stats',
      daily_stats: [],
    });
  }
});

export default router;
```

#### 5.2.3 注册路由

**文件：** `blocklets/core/api/src/routes/index.ts`

```typescript
import creditRouter from './credit';

// ... existing routes

router.use('/credit', creditRouter);
```

### 5.3 前端代码示例

#### 5.3.1 查询赠送额度消耗 Hook

**文件：** `blocklets/core/src/pages/project-detail/hooks/use-grant-usage.ts`

```typescript
import { useRequest } from 'ahooks';
import axios from 'axios';

interface DailyGrantStat {
  date: string; // YYYY-MM-DD
  granted_amount: string;
  used_amount: string;
  remaining_amount: string;
}

interface GrantUsageStats {
  summary: {
    total_granted: string;
    total_used: string;
    total_remaining: string;
  };
  daily_stats: DailyGrantStat[];
}

interface UseGrantUsageParams {
  startTime: number;
  endTime: number;
  grantorDid: string; // 赠送方 DID
}

export function useGrantUsage({ startTime, endTime, grantorDid }: UseGrantUsageParams) {
  return useRequest(
    async () => {
      if (!startTime || !endTime || !grantorDid) {
        return { daily_stats: [] };
      }

      try {
        const response = await axios.get<GrantUsageStats>('/api/credit/grant-usage', {
          params: { startTime, endTime, grantorDid },
        });

        // 如果查询失败，返回空数据（静默降级）
        if ('success' in response.data && response.data.success === false) {
          console.warn('Grant usage query failed:', (response.data as any).error);
          return { daily_stats: [] };
        }

        return response.data;
      } catch (err: any) {
        console.error('Failed to fetch grant usage:', err);
        // 失败时返回空数据，不影响付费额度曲线展示
        return { daily_stats: [] };
      }
    },
    {
      refreshDeps: [startTime, endTime, grantorDid],
      ready: !!startTime && !!endTime && !!grantorDid,
    }
  );
}
```

#### 5.3.2 更新 Credit 总用量 Card 的 subLabel

**文件：** `blocklets/core/src/pages/project-detail/components/credit-usage-card.tsx`

```tsx
import { Tooltip, Typography } from '@mui/material';
import { useGrantUsage } from '../hooks/use-grant-usage';

interface CreditUsageCardProps {
  projectId: string;
  totalCredits: number;
  startTime: number;
  endTime: number;
  grantorDid: string; // 赠送方 DID
}

export function CreditUsageCard({
  projectId,
  totalCredits,
  startTime,
  endTime,
  grantorDid
}: CreditUsageCardProps) {
  const { data: grantUsageStats } = useGrantUsage({ startTime, endTime, grantorDid });

  // 从 summary 中获取赠送额度总量和已消耗量
  const totalGrantedAmount = parseFloat(grantUsageStats?.summary?.total_granted || '0');
  const totalGrantedUsage = parseFloat(grantUsageStats?.summary?.total_used || '0');

  const subLabelContent = (
    <Tooltip
      title={
        <>
          <div>${totalGrantedUsage.toFixed(2)}: 已消耗的赠送额度</div>
          <div>${totalGrantedAmount.toFixed(2)}: 总赠送额度</div>
        </>
      }
    >
      <Typography
        variant="caption"
        sx={{
          textDecoration: 'underline dotted',
          cursor: 'help',
        }}
      >
        含赠送额度 ${totalGrantedUsage.toFixed(2)} / ${totalGrantedAmount.toFixed(2)}
      </Typography>
    </Tooltip>
  );

  return (
    <div>
      <h3>Credit 总用量</h3>
      <p>{totalCredits.toFixed(2)} Credits</p>
      {subLabelContent}
    </div>
  );
}
```

#### 5.3.3 修改趋势图组件（堆叠面积图）

**文件：** `blocklets/core/src/pages/project-detail/components/usage-trend-chart.tsx`

```tsx
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useGrantUsage } from '../hooks/use-grant-usage';

interface UsageTrendChartProps {
  projectId: string;
  totalUsageTrends: Array<{ timestamp: number; totalCredits: number }>;
  startTime: number;
  endTime: number;
  grantorDid: string; // 赠送方 DID
}

export function UsageTrendChart({
  projectId,
  totalUsageTrends,
  startTime,
  endTime,
  grantorDid
}: UsageTrendChartProps) {
  const { data: grantUsageStats } = useGrantUsage({ startTime, endTime, grantorDid });

  // 合并两个数据源：总消耗 + 赠送额度消耗（以日期为 key）
  const mergedData = useMemo(() => {
    // 1. 将赠送额度数据转换为 Map，以日期为 key
    const grantUsageMap = new Map(
      grantUsageStats?.daily_stats?.map(item => [
        item.date,
        parseFloat(item.used_amount || '0')
      ]) || []
    );

    // 2. 合并数据
    return totalUsageTrends.map((item) => {
      const dateKey = new Date(item.timestamp * 1000).toISOString().split('T')[0]; // YYYY-MM-DD
      const grantedUsage = grantUsageMap.get(dateKey) || 0;
      const paidUsage = Math.max(0, item.totalCredits - grantedUsage);

      return {
        timestamp: item.timestamp,
        date: dateKey,
        grantedUsage, // 赠送额度消耗
        paidUsage,    // 付费额度消耗
        total: item.totalCredits,
        comparison: item.comparison, // 保留环比数据
      };
    });
  }, [totalUsageTrends, grantUsageStats]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={mergedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(ts) => new Date(ts * 1000).toLocaleDateString()}
        />
        <YAxis />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;

            const data = payload[0].payload;
            const currentDate = new Date(data.timestamp * 1000).toLocaleDateString();

            return (
              <div style={{ background: 'white', border: '1px solid #ccc', padding: '10px' }}>
                <p style={{ margin: 0, fontWeight: 'bold' }}>Current: {currentDate}</p>
                <p style={{ margin: '5px 0', color: '#FFA726' }}>
                  • Granted Credit Usage: {data.grantedUsage.toFixed(2)} Credits
                </p>
                <p style={{ margin: '5px 0', color: '#42A5F5' }}>
                  • Paid Credit Usage: {data.paidUsage.toFixed(2)} Credits
                </p>
                <p style={{ margin: '5px 0' }}>
                  • Total: {data.total.toFixed(2)} Credits
                </p>

                {data.comparison && (
                  <>
                    <hr style={{ margin: '10px 0' }} />
                    <p style={{ margin: 0, fontWeight: 'bold' }}>
                      Previous: {new Date(data.comparison.timestamp * 1000).toLocaleDateString()}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      • Total: {data.comparison.totalCredits.toFixed(2)} Credits
                    </p>
                  </>
                )}
              </div>
            );
          }}
        />
        <Legend />

        {/* 堆叠面积图：赠送额度在下层，付费额度在上层 */}
        <Area
          type="monotone"
          dataKey="grantedUsage"
          stackId="1"
          stroke="#FFA726"
          fill="#FFA726"
          fillOpacity={0.6}
          name="赠送额度消耗"
        />
        <Area
          type="monotone"
          dataKey="paidUsage"
          stackId="1"
          stroke="#42A5F5"
          fill="#42A5F5"
          fillOpacity={0.6}
          name="付费额度消耗"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

---

## 6. 决策总结

| 决策点 | 选择 | 理由 |
|-------|------|------|
| 接口路由位置 | 创建新的 `/api/credit` 路由 | 与现有 payment 路由分离，职责更清晰 |
| /grant 权限校验 | 单独实现站点群校验中间件 | 可复用，便于未来扩展其他站点群相关接口 |
| /grant-usage 权限校验 | 复用现有 isAdminRole 校验 | 与现有 usage 路由权限保持一致，减少重复代码 |
| 查询统计数据结构 | 透传 payment-kit 返回的数据 | 减少转换逻辑，降低维护成本 |
| 错误处理策略 | 静默降级，返回 200 + error 标记 | 不影响用户核心功能，提供更好的容错性 |
| 趋势图展示方式 | 堆叠面积图 | 直观展示总消耗和分类消耗，用户可快速理解占比 |
| 前端数据获取 | 两个独立接口分别查询 | 符合现有架构，便于独立缓存和错误处理 |
| SubLabel 交互方式 | 下划线 + Hover Tooltip | 不占用额外空间，提供详细说明 |

---

## 7. MVP 范围

### 包含功能
✅ 赠送 Credit 接口（参数：userId, amount, reason, grantorDid，需站点群权限，当前直接放行）
✅ 查询赠送额度消耗统计接口（参数：startTime, endTime, grantorDid，需 Admin/Owner 权限）
✅ 站点群权限校验中间件（仅用于 /grant，当前为空实现）
✅ 复用现有 Admin 权限校验（用于 /grant-usage）
✅ Project Detail 页面 subLabel 更新
✅ 趋势图堆叠面积图展示
✅ 静默降级错误处理

### 不包含功能
❌ 批量赠送功能
❌ 赠送记录查询和导出
❌ 赠送额度撤销
❌ 赠送额度过期时间设置
❌ 赠送通知功能
❌ 赠送审批流程

---

## 8. 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| payment-kit SDK API 变更 | 接口调用失败 | 1. 在调用前检查 SDK 版本<br>2. 添加兼容性测试<br>3. 静默降级处理 |
| 站点群校验逻辑不准确 | 权限控制失效 | 1. 与 payment-kit 团队确认校验方式<br>2. 添加审计日志<br>3. 定期安全审查 |
| 赠送额度和付费额度统计数据不一致 | 趋势图显示错误 | 1. 添加数据校验逻辑<br>2. 记录异常日志<br>3. 前端做数据合法性检查 |
| 大量赠送请求导致 payment-kit 压力 | 服务响应慢/超时 | 1. 添加请求频率限制<br>2. 异步处理赠送请求<br>3. 监控 payment-kit 性能指标 |
| 前端合并两个数据源时时间戳不对齐 | 趋势图数据错位 | 1. 统一时间戳格式和精度<br>2. 添加时间戳对齐逻辑<br>3. 缺失数据点补 0 处理 |

---

## 9. 开放问题

1. **站点群校验的具体实现细节待后续调研**
   - 当前 `verifySiteGroup` 中间件直接放行所有请求
   - 未来需要根据 `grantorDid` 验证是否与当前站点群匹配
   - 可能需要与 payment-kit 团队确认站点群校验的最佳实践

2. **前端组件集成细节**
   - `grantorDid` 由调用方（前端）传入，具体值由业务场景决定
   - 总赠送额度信息从 `creditGrants.stats()` 的 `summary` 字段获取（`total_granted`）
   - 需要确认 Project Detail 页面如何确定要查询哪个 `grantorDid` 的数据

---

## 10. 下一步行动

1. **与 payment-kit 团队沟通**，确认：
   - 站点群校验的实现方式
   - `creditGrants.create()` 和 `creditGrants.usageStats()` 的具体 API 签名
   - 数据返回格式

2. **实现后端接口**：
   - 创建 `verify-site-group.ts` 中间件
   - 实现 `credit.ts` 路由
   - 编写单元测试

3. **实现前端组件**：
   - 创建 `use-grant-usage.ts` Hook
   - 修改 `credit-usage-card.tsx`
   - 修改 `usage-trend-chart.tsx`

4. **集成测试**：
   - 测试赠送额度流程
   - 测试趋势图数据展示
   - 测试错误处理和静默降级

5. **文档和发布**：
   - 更新 API 文档
   - 添加用户使用说明
   - 发布版本更新日志
