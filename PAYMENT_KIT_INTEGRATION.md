# Payment Kit 集成流程指南

本文档详细说明如何在项目中集成和使用 Payment Kit，基于 AIGNE Hub 项目的实际实现。

## 目录

1. [概述](#概述)
2. [前置条件](#前置条件)
3. [安装依赖](#安装依赖)
4. [核心概念](#核心概念)
5. [集成步骤](#集成步骤)
6. [API 使用示例](#api-使用示例)
7. [事件监听](#事件监听)
8. [完整流程](#完整流程)

## 概述

Payment Kit 是一个独立的 Blocklet，用于处理支付相关的功能，包括：
- 客户管理
- 积分购买
- 结账流程
- 发票管理
- 订阅管理

## 前置条件

1. **Payment Kit Blocklet** 必须已安装并运行
2. **Payment Kit DID**: `z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk`
3. 项目需要运行在 Blocklet Server 环境中

## 安装依赖

```bash
npm install @blocklet/payment-js @blocklet/payment-react
# 或
pnpm add @blocklet/payment-js @blocklet/payment-react
```

## 核心概念

### 1. Meter（计量器）
用于计量用户的使用量，每个 Meter 对应一种货币单位。

### 2. Customer（客户）
代表使用服务的用户，通过 DID 标识。

### 3. Payment Link（支付链接）
用于用户购买积分的链接。

### 4. Meter Event（计量事件）
记录用户使用服务的事件，用于扣除积分。

### 5. Credit Grant（积分授予）
用户获得的积分，可以是购买获得或系统赠送。

## 集成步骤

### 步骤 1: 检测 Payment Kit 是否运行

```typescript
import { BlockletStatus } from '@blocklet/constant';
import config from '@blocklet/sdk/lib/config';

const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

export const isPaymentRunning = () => {
  return !!config.components.find(
    (i) => i.did === PAYMENT_DID && i.status === BlockletStatus.running
  );
};
```

### 步骤 2: 获取 Payment Kit 前缀 URL

```typescript
import { getComponentMountPoint } from '@blocklet/sdk';
import { joinURL } from 'ufo';

export const getPaymentKitPrefix = () => {
  return joinURL(config.env.appUrl, getComponentMountPoint(PAYMENT_DID));
};
```

### 步骤 3: 初始化 Payment Client

```typescript
import payment from '@blocklet/payment-js';

export const paymentClient = payment;
```

### 步骤 4: 创建或确保 Meter 存在

```typescript
const METER_NAME = 'agent-hub-ai-meter';
const METER_UNIT = 'AIGNE Hub Credits';

export const ensureMeter = async (forceRefresh = false) => {
  if (!isPaymentRunning()) return null;

  try {
    // 尝试获取已存在的 Meter
    const meter = await payment.meters.retrieve(METER_NAME);
    
    // 如果单位不匹配，更新 Meter
    if (meter && meter.unit !== METER_UNIT) {
      await payment.meters.update(meter.id, {
        unit: METER_UNIT,
      });
    }
    
    return meter;
  } catch (error) {
    // Meter 不存在，创建新的
    if (error.message.includes('is not running')) {
      return null;
    }
    
    const meter = await payment.meters.create({
      name: 'AIGNE Hub AI Meter',
      description: 'AIGNE Hub AI Meter',
      event_name: METER_NAME,
      unit: METER_UNIT,
      aggregation_method: 'sum',
    });
    
    return meter;
  }
};
```

### 步骤 5: 确保客户存在

```typescript
export async function ensureCustomer(userDid: string) {
  const customer = await payment.customers.retrieve(userDid, {
    create: true, // 如果不存在则自动创建
  });
  return customer;
}
```

### 步骤 6: 创建默认积分价格和支付链接

```typescript
const CREDIT_PRICE_KEY = 'DEFAULT_CREDIT_UNIT_PRICE';
const CREDIT_PAYMENT_LINK_KEY = 'DEFAULT_CREDIT_PAYMENT_LINK';

export async function ensureDefaultCreditPrice() {
  try {
    const price = await payment.prices.retrieve(CREDIT_PRICE_KEY);
    return price;
  } catch {
    // 价格不存在，创建新的
    const paymentCurrencies = await payment.paymentCurrencies.list({});
    if (paymentCurrencies.length === 0) {
      throw new Error('No payment currencies found');
    }
    
    const meter = await ensureMeter();
    if (!meter) {
      throw new Error('No meter found');
    }
    
    await payment.products.create({
      name: 'Basic AIGNE Hub Credit Packs',
      description: `It is a basic pack of ${METER_UNIT}`,
      type: 'credit',
      prices: [
        {
          type: 'one_time',
          unit_amount: '1',
          currency_id: paymentCurrencies[0].id,
          lookup_key: CREDIT_PRICE_KEY,
          nickname: 'Per Unit Credit For AIGNE Hub',
          metadata: {
            credit_config: {
              currency_id: meter.currency_id,
              credit_amount: '1',
            },
            meter_id: meter.id,
          },
        },
      ],
    });
    
    const price = await payment.prices.retrieve(CREDIT_PRICE_KEY);
    return price;
  }
}

export async function ensureDefaultCreditPaymentLink() {
  if (!isPaymentRunning()) return null;
  
  const price = await ensureDefaultCreditPrice();
  if (!price) {
    throw new Error('Default credit price not found');
  }
  
  try {
    const existingPaymentLink = await payment.paymentLinks.retrieve(
      CREDIT_PAYMENT_LINK_KEY
    );
    
    return joinURL(
      getPaymentKitPrefix(),
      'checkout/pay',
      existingPaymentLink.id
    );
  } catch (error) {
    // 支付链接不存在，创建新的
    const paymentLink = await payment.paymentLinks.create({
      name: price.product.name,
      lookup_key: CREDIT_PAYMENT_LINK_KEY,
      line_items: [
        {
          price_id: price.id,
          quantity: 1,
          adjustable_quantity: {
            enabled: true,
            minimum: 1,
            maximum: 100000000,
          },
        },
      ],
    });
    
    return joinURL(getPaymentKitPrefix(), 'checkout/pay', paymentLink.id);
  }
}
```

### 步骤 7: 配置通知设置

```typescript
const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';
const selfNotificationEvents = [
  'customer.credit_grant.granted',
  'checkout.session.completed',
];

export const ensureNotificationSettings = async () => {
  const settings = await payment.settings.retrieve(AIGNE_HUB_DID);
  const missingEvents = difference(
    selfNotificationEvents,
    settings?.settings?.include_events || []
  );
  
  if (settings && missingEvents.length > 0) {
    await payment.settings.update(settings.id, {
      settings: {
        ...settings.settings,
        include_events: selfNotificationEvents,
      },
    });
  }
  
  if (!settings) {
    const setting = await payment.settings.create({
      type: 'notification',
      mountLocation: AIGNE_HUB_DID,
      description: 'AIGNE Hub Notification Settings',
      settings: {
        self_handle: true,
        include_events: selfNotificationEvents,
      },
    });
    return setting;
  }
  
  return settings;
};
```

## API 使用示例

### 获取用户积分余额

```typescript
export async function getUserCredits({ userDid }: { userDid: string }) {
  if (!isPaymentRunning()) {
    return {
      balance: '0',
      currency: null,
      total: '0',
      grantCount: 0,
      pendingCredit: '0',
    };
  }
  
  const meter = await ensureMeter();
  if (!meter) {
    return {
      balance: '0',
      currency: null,
      total: '0',
      grantCount: 0,
      pendingCredit: '0',
    };
  }
  
  const customer = await ensureCustomer(userDid);
  if (!customer) {
    return {
      balance: '0',
      currency: meter.paymentCurrency,
      total: '0',
      grantCount: 0,
      pendingCredit: '0',
    };
  }
  
  const [creditBalance, pendingCredit] = await Promise.all([
    payment.creditGrants.summary({
      customer_id: customer.id,
    }),
    payment.meterEvents.pendingAmount({
      customer_id: customer.id,
    }),
  ]);
  
  const balance = creditBalance?.[meter.currency_id!]?.remainingAmount ?? '0';
  const pending = pendingCredit?.[meter.currency_id!] ?? '0';
  
  return {
    balance,
    currency: meter.paymentCurrency,
    total: creditBalance?.[meter.currency_id!]?.totalAmount ?? '0',
    grantCount: creditBalance?.[meter.currency_id!]?.grantCount ?? 0,
    pendingCredit: pending,
  };
}
```

### 检查用户积分余额

```typescript
import { toBN } from '@ocap/util';

export async function checkUserCreditBalance({ userDid }: { userDid: string }) {
  const { balance, pendingCredit } = await getUserCredits({ userDid });
  
  if (balance && toBN(balance).lte(toBN(0))) {
    // 检查是否可以自动购买
    const meter = await ensureMeter();
    if (!meter) {
      throw new Error('Meter not found');
    }
    
    const verifyResult = await payment.creditGrants.verifyAvailability({
      customer_id: userDid,
      currency_id: meter.currency_id as string,
      pending_amount: pendingCredit,
    });
    
    if (verifyResult.can_continue) {
      // 可以继续使用（自动购买）
      return;
    }
    
    // 余额不足，获取支付链接
    const link = await getCreditPaymentLink();
    throw new CreditError(402, CreditErrorType.NOT_ENOUGH, link ?? '');
  }
}
```

### 创建计量事件（扣费）

```typescript
export async function createMeterEvent({
  userDid,
  amount,
  metadata,
  sourceData,
}: {
  userDid: string;
  amount: number;
  metadata?: Record<string, any>;
  sourceData?: SourceData;
}) {
  if (!isPaymentRunning()) {
    throw new Error('Payment Kit is not running');
  }
  
  const meter = await ensureMeter();
  if (!meter) {
    throw new Error('Meter is not found');
  }
  
  if (Number(amount) === 0) {
    return undefined;
  }
  
  const now = Date.now();
  const meterEvent = await payment.meterEvents.create({
    event_name: meter.event_name,
    timestamp: Math.floor(now / 1000),
    payload: {
      customer_id: userDid,
      value: String(amount),
    },
    identifier: `${userDid}-${meter.event_name}-${now}`,
    metadata,
    source_data: sourceData,
  });
  
  return meterEvent;
}
```

### 获取积分授予记录

```typescript
export async function getCreditGrants(params: {
  customer_id: string;
  page?: number;
  pageSize?: number;
  start?: number;
  end?: number;
}) {
  const meter = await ensureMeter();
  if (!meter) {
    return {
      count: 0,
      list: [],
    };
  }
  
  let customerId = params.customer_id;
  if (!params.customer_id.startsWith('cus_')) {
    const customer = await ensureCustomer(params.customer_id);
    customerId = customer.id;
  }
  
  return payment.creditGrants.list({
    ...params,
    customer_id: customerId,
    currency_id: meter.currency_id,
  });
}
```

### 获取积分交易记录

```typescript
export async function getCreditTransactions(params: {
  customer_id: string;
  page?: number;
  pageSize?: number;
  start?: number;
  end?: number;
}) {
  const meter = await ensureMeter();
  if (!meter) {
    return {
      count: 0,
      list: [],
    };
  }
  
  let customerId = params.customer_id;
  if (!params.customer_id.startsWith('cus_')) {
    const customer = await ensureCustomer(params.customer_id);
    customerId = customer.id;
  }
  
  return payment.creditTransactions.list({
    ...params,
    meter_id: meter.id,
    customer_id: customerId,
  });
}
```

## 事件监听

### 订阅 Payment Kit 事件

```typescript
import { subscribe } from '@blocklet/sdk/lib/service/eventbus';

export async function subscribeEvents() {
  await subscribe((event: any) => {
    if (event.type === 'customer.credit_grant.granted') {
      const creditGrant = event.data.object;
      handleCreditGranted(creditGrant, event.data.object.extraParams);
    }
    
    if (event.type === 'checkout.session.completed') {
      // 处理支付完成事件
      handleCheckoutCompleted(event.data.object);
    }
  });
}
```

### 处理积分授予事件

```typescript
import { NotificationManager } from './notifications/manager';
import { CreditGrantedNotificationTemplate } from './notifications/templates/credit-granted';

export async function handleCreditGranted(creditGrant: any, extraParams?: any) {
  try {
    const customer = await ensureCustomer(creditGrant.customer_id);
    if (!customer) {
      logger.error('Customer not found', { customerId: creditGrant.customer_id });
      return;
    }
    
    // 发送通知
    const template = new CreditGrantedNotificationTemplate({
      creditGrantId: creditGrant.id,
      creditGrant,
    });
    
    await NotificationManager.sendTemplateNotification(template, customer.did);
  } catch (error) {
    logger.error('Failed to handle credit granted', { error, creditGrant });
  }
}
```

## 完整流程

### 初始化流程

1. **检测 Payment Kit 状态**
   ```typescript
   if (!isPaymentRunning()) {
     throw new Error('Payment Kit is not running');
   }
   ```

2. **确保 Meter 存在**
   ```typescript
   const meter = await ensureMeter();
   ```

3. **配置通知设置**
   ```typescript
   await ensureNotificationSettings();
   ```

4. **创建默认支付链接**
   ```typescript
   await ensureDefaultCreditPaymentLink();
   ```

### 用户使用服务流程

1. **用户发起请求**
   - 检查用户是否已认证
   - 检查 Payment Kit 是否运行

2. **检查积分余额**
   ```typescript
   await checkUserCreditBalance({ userDid });
   ```

3. **提供服务**
   - 执行实际业务逻辑
   - 计算使用成本

4. **创建计量事件（扣费）**
   ```typescript
   await createMeterEvent({
     userDid,
     amount: calculatedCost,
     metadata: { model, provider, type },
   });
   ```

### 用户购买积分流程

1. **获取支付链接**
   ```typescript
   const paymentLink = await getCreditPaymentLink();
   ```

2. **用户完成支付**
   - Payment Kit 处理支付
   - 创建积分授予

3. **接收事件通知**
   - 监听 `customer.credit_grant.granted` 事件
   - 发送通知给用户

### API 路由示例

```typescript
import { Router } from 'express';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';

const router = Router();
const user = sessionMiddleware({ accessKey: true });

// 获取用户积分余额
router.get('/credit/balance', user, async (req, res) => {
  const userDid = req.user?.did;
  if (!userDid) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  
  const creditBalance = await getUserCredits({ userDid });
  return res.json(creditBalance);
});

// 获取支付链接
router.get('/credit/payment-link', user, async (req, res) => {
  try {
    const creditPaymentLink = await getCreditPaymentLink();
    res.json(creditPaymentLink);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 获取积分授予记录
router.get('/credit/grants', user, async (req, res) => {
  const userDid = req.user?.did;
  if (!userDid) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  
  const creditGrants = await getCreditGrants({
    customer_id: userDid,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  
  return res.json(creditGrants);
});

// 获取积分交易记录
router.get('/credit/transactions', user, async (req, res) => {
  const userDid = req.user?.did;
  if (!userDid) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  
  const creditTransactions = await getCreditTransactions({
    customer_id: userDid,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  
  return res.json(creditTransactions);
});

export default router;
```

## 注意事项

1. **错误处理**
   - 始终检查 Payment Kit 是否运行
   - 处理 Meter 不存在的情况
   - 处理客户不存在的情况

2. **性能优化**
   - 缓存 Meter 信息（24小时 TTL）
   - 批量查询客户信息
   - 使用 Promise.all 并行查询

3. **安全性**
   - 验证用户身份
   - 检查权限
   - 验证输入参数

4. **货币单位**
   - 注意货币的小数位数（decimal）
   - 使用 `fromUnitToToken` 和 `toToken` 进行单位转换

5. **事件处理**
   - 确保事件处理是幂等的
   - 处理重复事件
   - 记录所有关键操作

## 参考资源

- Payment Kit 文档: [Blocklet Payment Kit](https://github.com/blocklet/payment-kit)
- Payment JS SDK: [@blocklet/payment-js](https://www.npmjs.com/package/@blocklet/payment-js)
- Payment React SDK: [@blocklet/payment-react](https://www.npmjs.com/package/@blocklet/payment-react)

## 订阅管理

### 查询用户订阅

**重要说明**：Payment Kit 中的订阅信息**不需要在本地保存**，可以直接通过 Payment Kit API 实时查询。订阅信息存储在 Payment Kit 中，包括订阅状态、到期时间、订阅项等。

#### 方式 1: 通过用户 DID 查询订阅

```typescript
import payment from '@blocklet/payment-js';
import { ensureCustomer } from './payment';

/**
 * 获取用户的所有订阅
 * @param userDid 用户 DID
 * @param status 订阅状态过滤，默认为 ['active', 'trialing']
 */
export async function getUserSubscriptions({
  userDid,
  status = ['active', 'trialing'],
}: {
  userDid: string;
  status?: string[];
}) {
  if (!isPaymentRunning()) {
    return {
      count: 0,
      list: [],
    };
  }

  // 确保客户存在
  const customer = await ensureCustomer(userDid);
  if (!customer) {
    return {
      count: 0,
      list: [],
    };
  }

  // 查询该客户的所有订阅
  const result = await payment.subscriptions.list({
    customer_id: customer.id,
  });

  // 过滤指定状态的订阅
  const filteredSubscriptions = result.list.filter((sub) =>
    status.includes(sub.status)
  );

  return {
    count: filteredSubscriptions.length,
    list: filteredSubscriptions,
  };
}

/**
 * 获取用户的活跃订阅（单个）
 * @param userDid 用户 DID
 */
export async function getActiveUserSubscription(userDid: string) {
  const result = await getUserSubscriptions({
    userDid,
    status: ['active', 'trialing', 'past_due'],
  });

  // 返回第一个活跃订阅
  return result.list[0] || null;
}

/**
 * 检查用户是否有活跃订阅
 * @param userDid 用户 DID
 */
export async function hasActiveSubscription(userDid: string): Promise<boolean> {
  const subscription = await getActiveUserSubscription(userDid);
  return !!subscription;
}
```

#### 方式 2: 通过 App ID 查询订阅（应用级订阅）

```typescript
/**
 * 获取应用的活跃订阅
 * 这种方式适用于应用级别的订阅，订阅信息存储在 metadata.appId 中
 * @param appId 应用 ID
 * @param status 订阅状态过滤
 */
export async function getActiveSubscriptionOfApp({
  appId,
  description,
  status = ['active', 'trialing'],
}: {
  appId: string;
  description?: string;
  status?: string[];
}) {
  if (!isPaymentRunning()) return undefined;

  // 通过 metadata.appId 查询订阅
  const result = await payment.subscriptions.list({
    'metadata.appId': appId,
  });

  // 查找匹配状态的订阅
  const subscription = result.list.find(
    (i) =>
      status.includes(i.status) &&
      i.items.some(
        (j) => j.price.product.id === Config.pricing?.subscriptionProductId
      )
  );

  // 可选：更新订阅描述
  if (description && subscription) {
    await payment.subscriptions.update(subscription.id, { description });
  }

  return subscription;
}

/**
 * 检查应用是否有活跃订阅
 * @param appId 应用 ID
 */
export async function checkSubscription({ appId }: { appId: string }) {
  const subscription = await getActiveSubscriptionOfApp({ appId });
  if (!subscription) {
    throw new SubscriptionError(SubscriptionErrorType.UNSUBSCRIBED);
  }
  return subscription;
}
```

#### 方式 3: 通过订阅 ID 查询

```typescript
/**
 * 通过订阅 ID 获取订阅详情
 * @param subscriptionId 订阅 ID
 */
export async function getSubscriptionById(subscriptionId: string) {
  if (!isPaymentRunning()) {
    return null;
  }

  try {
    const subscription = await payment.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error) {
    if (error.message.includes('not found')) {
      return null;
    }
    throw error;
  }
}
```

### 订阅状态说明

Payment Kit 中的订阅状态包括：

- `active`: 活跃状态，订阅正常
- `trialing`: 试用期，订阅在试用中
- `past_due`: 逾期，需要更新支付方式
- `canceled`: 已取消
- `unpaid`: 未支付
- `incomplete`: 不完整
- `incomplete_expired`: 不完整且已过期

### 订阅操作示例

#### 取消订阅

```typescript
/**
 * 取消用户的订阅
 * @param userDid 用户 DID
 */
export async function cancelUserSubscription(userDid: string) {
  const subscription = await getActiveUserSubscription(userDid);
  if (!subscription) {
    return null;
  }

  return await payment.subscriptions.cancel(subscription.id);
}
```

#### 恢复订阅

```typescript
/**
 * 恢复已取消的订阅
 * @param userDid 用户 DID
 */
export async function recoverUserSubscription(userDid: string) {
  const subscription = await getActiveUserSubscription(userDid);
  if (!subscription) {
    return null;
  }

  return await payment.subscriptions.recover(subscription.id);
}
```

#### 更新订阅

```typescript
/**
 * 更新订阅信息
 * @param subscriptionId 订阅 ID
 * @param updates 更新内容
 */
export async function updateSubscription(
  subscriptionId: string,
  updates: {
    description?: string;
    metadata?: Record<string, any>;
  }
) {
  return await payment.subscriptions.update(subscriptionId, updates);
}
```

### API 路由示例

```typescript
import { Router } from 'express';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';

const router = Router();
const user = sessionMiddleware({ accessKey: true });

// 获取用户订阅列表
router.get('/subscriptions', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const status = req.query.status
      ? (req.query.status as string).split(',')
      : ['active', 'trialing'];

    const subscriptions = await getUserSubscriptions({
      userDid,
      status,
    });

    return res.json(subscriptions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 检查用户是否有活跃订阅
router.get('/subscriptions/active', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const subscription = await getActiveUserSubscription(userDid);
    const hasActive = !!subscription;

    return res.json({
      hasActive,
      subscription: subscription || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 取消订阅
router.post('/subscriptions/cancel', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await cancelUserSubscription(userDid);
    if (!result) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    return res.json({ success: true, subscription: result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
```

### 订阅查询最佳实践

1. **不需要本地保存订阅信息**
   - Payment Kit 是订阅信息的唯一数据源
   - 所有订阅状态、到期时间等信息都存储在 Payment Kit 中
   - 直接通过 API 实时查询，确保数据准确性

2. **缓存策略（可选）**
   ```typescript
   // 如果需要提高性能，可以添加短期缓存
   const subscriptionCache = new Map<string, { data: any; timestamp: number }>();
   const CACHE_TTL = 60 * 1000; // 1分钟缓存

   export async function getActiveUserSubscriptionCached(userDid: string) {
     const cached = subscriptionCache.get(userDid);
     if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
       return cached.data;
     }

     const subscription = await getActiveUserSubscription(userDid);
     subscriptionCache.set(userDid, {
       data: subscription,
       timestamp: Date.now(),
     });

     return subscription;
   }
   ```

3. **监听订阅状态变化**
   ```typescript
   import { subscribe } from '@blocklet/sdk/lib/service/eventbus';

   export async function subscribeSubscriptionEvents() {
     await subscribe((event: any) => {
       if (event.type === 'subscription.created') {
         logger.info('Subscription created', { subscription: event.data.object });
       }
       if (event.type === 'subscription.updated') {
         logger.info('Subscription updated', { subscription: event.data.object });
         // 清除缓存
         const customerDid = event.data.object.customer?.did;
         if (customerDid) {
           subscriptionCache.delete(customerDid);
         }
       }
       if (event.type === 'subscription.canceled') {
         logger.info('Subscription canceled', { subscription: event.data.object });
       }
     });
   }
   ```

4. **错误处理**
   ```typescript
   export async function getUserSubscriptionsSafe({
     userDid,
     status = ['active', 'trialing'],
   }: {
     userDid: string;
     status?: string[];
   }) {
     try {
       return await getUserSubscriptions({ userDid, status });
     } catch (error) {
       if (error.message.includes('is not running')) {
         // Payment Kit 未运行
         return { count: 0, list: [] };
       }
       if (error.message.includes('not found')) {
         // 客户不存在
         return { count: 0, list: [] };
       }
       throw error;
     }
   }
   ```

## 总结

集成 Payment Kit 的核心步骤：

1. ✅ 安装依赖包
2. ✅ 检测 Payment Kit 运行状态
3. ✅ 创建/确保 Meter 存在
4. ✅ 确保客户存在
5. ✅ 创建支付链接
6. ✅ 配置通知设置
7. ✅ 实现积分余额查询
8. ✅ 实现积分扣费（创建 Meter Event）
9. ✅ 监听支付事件
10. ✅ 提供用户 API 接口
11. ✅ **实现订阅查询（不需要本地保存）**

### 关于订阅信息的存储

**重要结论**：
- ✅ **不需要在本地保存订阅信息**
- ✅ **可以直接通过用户 DID 或 App ID 实时查询**
- ✅ Payment Kit 是订阅信息的唯一数据源
- ✅ 订阅信息包括：状态、到期时间、订阅项、客户信息等
- ✅ 建议添加短期缓存以提高性能（可选）
- ✅ 监听订阅事件以清除缓存（可选）

按照以上步骤，您就可以在其他项目中成功集成 Payment Kit 了。
