# Usage Stats API 性能优化方案

## 问题分析

### 原始问题
当查询大时间跨度（如30天）的 `/app/api/user/usage-stats` 接口时，会出现 30 秒超时。

### 问题定位

#### 1. 海量并发查询
```typescript
// 原代码
const hours = generateHourRangeFromTimestamps(startTime, endTime); // 30天 = 720小时
await Promise.all(hours.map(hour => ModelCallStat.getHourlyStats(userDid, hour))); // 720个并发查询！
```

**问题**：
- 30天时间跨度生成 720 个小时
- 每个小时触发一个数据库查询
- 同时发起 720 个并发查询，可能导致：
  - 数据库连接池耗尽
  - 数据库 CPU 飙升
  - 查询相互阻塞

#### 2. 缺少关键索引

**ModelCallStats 表原索引**：
- `(userDid, timestamp)` - uk_user_date
- `(userDid)` - idx_model_call_stats_user_did
- `(timestamp)` - idx_model_call_stats_stat_date

**查询条件**：
```sql
WHERE userDid = ? AND timeType = 'hour' AND timestamp IN (...)
```

**问题**：索引不包含 `timeType` 字段，导致：
- 需要扫描所有匹配 `(userDid, timestamp)` 的行
- 然后用 `timeType` 进行额外过滤
- 大大降低了查询效率

#### 3. 重复计算
- 趋势对比功能还要查询前一个周期（又是 30 天 = 720 小时）
- 总共需要查询 1440 个小时的数据
- 如果缓存未命中，每个小时都会触发对 ModelCalls 表的聚合查询

## 优化方案

### 1. 添加数据库索引（最关键）

新增迁移文件：`20251203000000-optimize-model-call-stats-indexes.ts`

```typescript
// 最关键：用户 + 时间类型 + 时间戳的复合索引
CREATE INDEX idx_model_call_stats_user_type_time ON ModelCallStats (userDid, timeType, timestamp);

// 管理员查询优化：时间类型 + 时间戳
CREATE INDEX idx_model_call_stats_type_time ON ModelCallStats (timeType, timestamp);

// ModelCalls 表查询优化
CREATE INDEX idx_model_calls_user_time_type ON ModelCalls (userDid, callTime, type);
```

**效果**：
- 查询 `WHERE userDid = ? AND timeType = 'hour' AND timestamp IN (...)` 可以完全使用索引
- 将表扫描变为索引扫描，性能提升 10-100 倍

### 2. 批量查询替代逐个查询

**优化前**：
```typescript
// 720 个并发查询
await Promise.all(hours.map(hour => ModelCallStat.getHourlyStats(userDid, hour)));
```

**优化后**：
```typescript
// 单次批量查询
const cachedStats = await ModelCallStat.findAll({
  where: {
    userDid,
    timeType: 'hour',
    timestamp: { [Op.in]: hours }, // 一次查询所有小时
  },
  raw: true,
});
```

**效果**：
- 将 720 个数据库查询减少到 1 个
- 大幅降低网络往返时间
- 避免连接池耗尽

### 3. 分批处理缺失数据

```typescript
const BATCH_SIZE = 50;
for (let i = 0; i < missingHours.length; i += BATCH_SIZE) {
  const batch = missingHours.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.all(
    batch.map(async (hour) => {
      const stats = await ModelCallStat.getHourlyStats(userDid, hour);
      return { hour, stats };
    })
  );
  missingStats.push(...batchResults);
}
```

**效果**：
- 控制并发数量，避免资源耗尽
- 对于未缓存的小时数据，最多同时查询 50 个
- 提高系统稳定性

### 4. 区分实时和历史数据

```typescript
const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
const missingHistoricalHours = missingHours.filter((hour) => hour < currentHour);
const currentHours = missingHours.filter((hour) => hour >= currentHour);

// 历史数据：触发缓存生成
// 当前小时：实时计算（因为数据还在变化）
```

**效果**：
- 历史数据会被缓存，下次查询直接命中
- 当前小时总是实时计算，确保数据准确性

### 5. 优化趋势对比查询

```typescript
// 批量查询当前和前一周期的数据
const [currentCachedStats, previousCachedStats] = await Promise.all([
  ModelCallStat.findAll({
    where: { userDid, timeType: 'hour', timestamp: { [Op.in]: currentHours } },
    raw: true,
  }),
  ModelCallStat.findAll({
    where: { userDid, timeType: 'hour', timestamp: { [Op.in]: previousHours } },
    raw: true,
  }),
]);
```

**效果**：
- 将两个周期的查询并行执行
- 每个周期只用一个批量查询
- 从 1440 个查询减少到 2 个

## 性能提升预期

### 查询次数
- **优化前**：1440+ 次数据库查询（当前 720 + 前期 720）
- **优化后**：2-4 次批量查询 + 少量缺失数据查询
- **提升**：减少 99%+ 的查询次数

### 响应时间
- **优化前**：30 秒超时
- **优化后（有缓存）**：< 1 秒
- **优化后（无缓存）**：5-10 秒
- **提升**：3-30 倍

### 数据库负载
- **索引优化**：表扫描 → 索引扫描
- **并发控制**：从 720 降到 50
- **查询合并**：单次批量查询替代多次小查询

## 部署步骤

### 1. 运行数据库迁移
```bash
# 应用新的索引迁移
npm run migrate
```

### 2. 验证索引创建
```sql
-- 检查索引是否创建成功
SHOW INDEX FROM ModelCallStats;
SHOW INDEX FROM ModelCalls;
```

### 3. 重启服务
```bash
# 重启 API 服务以应用代码更改
npm restart
```

### 4. 预热缓存（可选但推荐）
```bash
# 确保 cron 任务正在运行，预生成小时统计数据
# 查看 src/crons/model-call-stats.ts
```

### 5. 监控和验证

**监控指标**：
- API 响应时间
- 数据库查询次数
- 数据库 CPU 使用率
- 数据库慢查询日志

**测试命令**：
```bash
# 测试 30 天查询
curl "https://hub.aigne.io/app/api/user/usage-stats?startTime=1762099200&endTime=1764691199" \
  -H "Cookie: your-session-cookie" \
  -w "\nTime: %{time_total}s\n"
```

## 后续优化建议

### 1. 添加查询结果缓存
```typescript
// 使用 Redis 缓存完整的查询结果
const cacheKey = `usage-stats:${userDid}:${startTime}:${endTime}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... 执行查询 ...

await redis.setex(cacheKey, 300, JSON.stringify(result)); // 缓存 5 分钟
```

### 2. 数据预聚合
- 除了小时级别，考虑添加天级别、周级别的预聚合
- 减少长时间跨度查询的小时数量

### 3. 分页支持
- 如果前端支持，可以分页加载统计数据
- 首屏只加载最近几天，按需加载更多

### 4. 数据库分区
- 按时间对 ModelCalls 表进行分区
- 提高历史数据查询性能

## 注意事项

1. **索引空间**：新索引会占用额外的磁盘空间，请确保有足够的存储
2. **写入性能**：索引会略微降低插入速度，但对读多写少的场景影响很小
3. **缓存一致性**：当前小时的数据总是实时计算，确保数据准确性
4. **向后兼容**：所有更改都保持了 API 接口的向后兼容性

## 回滚方案

如果优化后出现问题，可以：

1. **回滚代码**：
```bash
git revert <commit-hash>
```

2. **删除索引**（如果索引导致问题）：
```sql
DROP INDEX idx_model_call_stats_user_type_time ON ModelCallStats;
DROP INDEX idx_model_call_stats_type_time ON ModelCallStats;
DROP INDEX idx_model_calls_user_time_type ON ModelCalls;
```

3. **保留索引，回滚查询逻辑**：索引不会造成负面影响，只回滚查询代码即可

## 总结

通过这次优化：
1. **添加关键索引** - 查询效率提升 10-100 倍
2. **批量查询** - 减少 99% 的数据库往返
3. **并发控制** - 避免资源耗尽
4. **智能缓存** - 历史数据命中缓存，当前数据实时计算

预期将 30 秒超时问题降低到 1-5 秒的正常响应时间。

