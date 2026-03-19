/**
 * Pricing Comparison Engine
 *
 * Thin wrapper around core/pricing-core.mjs — delegates all computation to the shared module.
 * Keeps TypeScript types and CLI-specific output (printTable).
 */

// Re-export core functions for backward compatibility
import {
  calcDrift as _calcDrift,
  compare as _compare,
  formatPrice as _formatPrice,
  isTypeCompatible as _isTypeCompatible,
  lookupOfficialPricing as _lookupOfficialPricing,
  pickBestCost as _pickBestCost,
} from './core/pricing-core.mjs';
import type { DbRate, ExternalRate } from './fetch-sources';
import type { CacheTier, OfficialPricingEntry, PricingUnit } from './pricing-schema';

// ─── Types ───────────────────────────────────────────────────────────────────

type LocalPricingUnit = 'per-token' | 'per-image' | 'per-second';

export interface ComparisonResult {
  provider: string;
  model: string;
  type: string;
  pricingUnit: LocalPricingUnit;
  dbInput: number;
  dbOutput: number;
  litellmInput?: number;
  litellmOutput?: number;
  litellmDrift?: number;
  openrouterInput?: number;
  openrouterOutput?: number;
  openrouterDrift?: number;
  providerPageInput?: number;
  providerPageOutput?: number;
  providerPageDrift?: number;
  providerPageUrl?: string;
  maxDrift: number;
  exceedsThreshold: boolean;
  dbCacheWrite?: number;
  dbCacheRead?: number;
  litellmCacheWrite?: number;
  litellmCacheRead?: number;
  cacheDrift?: number;
  inputRate?: number;
  outputRate?: number;
  inputRateIssue?: number;
  outputRateIssue?: number;
  hasPricingIssue: boolean;
  litellmInputPerImage?: number;
  litellmOutputPerImage?: number;
  litellmOutputPerSecond?: number;
  resolutionTiers?: { quality: string; size: string; costPerImage: number }[];
  tieredPricing?: { threshold: string; input?: number; output?: number }[];
  officialCacheWrite?: number;
  officialCacheRead?: number;
  officialCacheTiers?: CacheTier[];
  tierMaxInput?: number;
  tierMaxOutput?: number;
  tierInputDrift?: number;
  tierOutputDrift?: number;
  cacheTierMaxWrite?: number;
  cacheTierMaxRead?: number;
  cacheTierWriteDrift?: number;
  cacheTierReadDrift?: number;
  bestCostInput?: number;
  bestCostOutput?: number;
  bestCostSource?: 'provider-page' | 'openrouter' | 'litellm';
  bestCostSourceLabel?: string;
  bestCostUrl?: string;
  inputMargin?: number;
  outputMargin?: number;
}

// ─── Delegated Functions ─────────────────────────────────────────────────────

export const calcDrift: (a: number, b: number) => number = _calcDrift;

export function formatCost(cost: number, unit: LocalPricingUnit = 'per-token'): string {
  return _formatPrice(cost, unit) as string;
}

export function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

export function compare(
  dbRates: DbRate[],
  litellm: Map<string, ExternalRate>,
  openrouter: Map<string, ExternalRate>,
  providerPages: Map<string, OfficialPricingEntry>,
  threshold: number
): ComparisonResult[] {
  return _compare(dbRates, litellm, openrouter, providerPages, threshold) as ComparisonResult[];
}

// ─── Table Output (CLI-only) ─────────────────────────────────────────────────

export function printTable(results: ComparisonResult[], threshold: number): void {
  const costDriftErrors = results.filter((r) => r.exceedsThreshold);
  const pricingErrors = results.filter((r) => !r.exceedsThreshold && r.hasPricingIssue);
  const fullyCorrect = results.filter((r) => !r.exceedsThreshold && !r.hasPricingIssue);
  const totalErrors = costDriftErrors.length + pricingErrors.length;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚨 AIGNE Hub 定价错误报告`);
  console.log(`${'='.repeat(80)}\n`);

  if (totalErrors > 0) {
    console.log(`⚠️  发现 ${totalErrors} 个模型存在定价问题：\n`);
  }

  if (costDriftErrors.length > 0) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`❌ 1. 成本设置错误（${costDriftErrors.length} 个）`);
    console.log(`   成本价格与外部数据源差异超过 ${(threshold * 100).toFixed(0)}%\n`);
    for (let i = 0; i < costDriftErrors.length; i++) {
      const r = costDriftErrors[i];
      const pu = r.pricingUnit;
      const unitLabel = pu === 'per-image' ? ' [按张计费]' : pu === 'per-second' ? ' [按秒计费]' : '';
      console.log(`${i + 1}. ${r.provider}/${r.model} (${r.type})${unitLabel}`);
      console.log(`   ❌ AIGNE Hub 当前设置：`);
      console.log(`      输入成本：${formatCost(r.dbInput)}`);
      console.log(`      输出成本：${formatCost(r.dbOutput, pu)}`);
      if (r.dbCacheWrite || r.dbCacheRead) {
        console.log(`      缓存写入：${formatCost(r.dbCacheWrite || 0)}`);
        console.log(`      缓存读取：${formatCost(r.dbCacheRead || 0)}`);
      }

      const hasLiteLLM = r.litellmInput !== undefined;
      const hasOpenRouter = r.openrouterInput !== undefined;

      if (hasLiteLLM || hasOpenRouter) {
        const source = hasLiteLLM ? 'LiteLLM' : 'OpenRouter';
        const correctInput = hasLiteLLM ? r.litellmInput! : r.openrouterInput!;
        const correctOutput = hasLiteLLM ? r.litellmOutput! : r.openrouterOutput!;

        console.log(`   ✅ 建议更新为（基于 ${source}）：`);
        console.log(`      输入成本：${formatCost(correctInput)}`);
        if (pu === 'per-token') {
          console.log(`      输出成本：${formatCost(correctOutput)}`);
        } else {
          console.log(
            `      输出成本：${formatCost(r.dbOutput, pu)} (${pu === 'per-image' ? '按张' : '按秒'}计费，外部源为按token，不可直接对比)`
          );
        }

        const inputDiff = correctInput !== 0 ? ((r.dbInput - correctInput) / correctInput) * 100 : 0;
        const outputDiff = correctOutput !== 0 ? ((r.dbOutput - correctOutput) / correctOutput) * 100 : 0;

        if (Math.abs(inputDiff) > threshold * 100) {
          console.log(`   📊 输入成本差异：${inputDiff > 0 ? '高出' : '低了'} ${Math.abs(inputDiff).toFixed(1)}%`);
        }
        if (pu === 'per-token' && Math.abs(outputDiff) > threshold * 100) {
          console.log(`   📊 输出成本差异：${outputDiff > 0 ? '高出' : '低了'} ${Math.abs(outputDiff).toFixed(1)}%`);
        }

        if (r.bestCostCacheWrite && r.dbCacheWrite) {
          const writeDiff = ((r.dbCacheWrite - r.bestCostCacheWrite) / r.bestCostCacheWrite) * 100;
          if (Math.abs(writeDiff) > threshold * 100)
            console.log(
              `   📊 缓存写入差异：${writeDiff > 0 ? '高出' : '低了'} ${Math.abs(writeDiff).toFixed(1)}% (DB: ${formatCost(r.dbCacheWrite)} vs ${r.bestCostSourceLabel}: ${formatCost(r.bestCostCacheWrite)})`
            );
        }
        if (r.bestCostCacheRead && r.dbCacheRead) {
          const readDiff = ((r.dbCacheRead - r.bestCostCacheRead) / r.bestCostCacheRead) * 100;
          if (Math.abs(readDiff) > threshold * 100)
            console.log(
              `   📊 缓存读取差异：${readDiff > 0 ? '高出' : '低了'} ${Math.abs(readDiff).toFixed(1)}% (DB: ${formatCost(r.dbCacheRead)} vs ${r.bestCostSourceLabel}: ${formatCost(r.bestCostCacheRead)})`
            );
        }
      }

      if (r.tierMaxInput !== undefined || r.tierMaxOutput !== undefined) {
        console.log(`   📶 阶梯定价风险（DB 使用基础价，高量时实际成本更高）：`);
        if (r.tieredPricing) {
          for (const t of r.tieredPricing) {
            const parts: string[] = [];
            if (t.input !== undefined && t.input > r.dbInput) {
              const pct = ((t.input - r.dbInput) / r.dbInput) * 100;
              parts.push(`输入 ${formatCost(t.input)} (+${pct.toFixed(0)}%)`);
            }
            if (t.output !== undefined && t.output > r.dbOutput) {
              const pct = ((t.output - r.dbOutput) / r.dbOutput) * 100;
              parts.push(`输出 ${formatCost(t.output)} (+${pct.toFixed(0)}%)`);
            }
            if (parts.length > 0) {
              console.log(`      >${t.threshold} tokens: ${parts.join(', ')} 🔴 潜在亏损`);
            }
          }
        }
      }

      if (r.cacheTierMaxWrite !== undefined || r.cacheTierMaxRead !== undefined) {
        console.log(`   🗄️ 缓存 tier 风险：`);
        if (r.officialCacheTiers) {
          for (const ct of r.officialCacheTiers) {
            if (ct.label.includes('write')) {
              const dbVal = r.dbCacheWrite ?? 0;
              if (ct.costPerToken > dbVal) {
                const pct = dbVal > 0 ? ((ct.costPerToken - dbVal) / dbVal) * 100 : 100;
                console.log(
                  `      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} (+${pct.toFixed(0)}%) 🔴`
                );
              } else {
                console.log(`      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} ✅`);
              }
            }
          }
          for (const ct of r.officialCacheTiers) {
            if (ct.label === 'read' || ct.label === 'cached-input') {
              const dbVal = r.dbCacheRead ?? 0;
              if (ct.costPerToken > dbVal) {
                const pct = dbVal > 0 ? ((ct.costPerToken - dbVal) / dbVal) * 100 : 100;
                console.log(
                  `      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} (+${pct.toFixed(0)}%) 🔴`
                );
              } else {
                console.log(`      ${ct.label}: ${formatCost(ct.costPerToken)} vs DB ${formatCost(dbVal)} ✅`);
              }
            }
          }
        }
      }

      if (r.inputRate !== undefined || r.outputRate !== undefined) {
        console.log(`   💰 当前实际应用价格：`);
        if (r.inputRate) console.log(`      输入：${formatCost(r.inputRate)}`);
        if (r.outputRate) console.log(`      输出：${formatCost(r.outputRate, pu)}`);

        const correctInput = hasLiteLLM ? r.litellmInput! : hasOpenRouter ? r.openrouterInput! : r.dbInput;
        const correctOutput = hasLiteLLM ? r.litellmOutput! : hasOpenRouter ? r.openrouterOutput! : r.dbOutput;

        if (r.inputRate && correctInput) {
          const newMargin = ((r.inputRate - correctInput) / correctInput) * 100;
          const status = newMargin < -5 ? ' 🔴 过低' : newMargin < 0 ? ' ⚠️' : ' ✅';
          console.log(`   📈 更新成本后利润率（输入）：${newMargin.toFixed(1)}%${status}`);
        }
        if (r.outputRate && correctOutput && pu === 'per-token') {
          const newMargin = ((r.outputRate - correctOutput) / correctOutput) * 100;
          const status = newMargin < -5 ? ' 🔴 过低' : newMargin < 0 ? ' ⚠️' : ' ✅';
          console.log(`   📈 更新成本后利润率（输出）：${newMargin.toFixed(1)}%${status}`);
        }
      }

      console.log('');
    }
  }

  if (pricingErrors.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`❌ 2. 售价偏差错误（${pricingErrors.length} 个）`);
    console.log(`   售价与成本的偏差超过 ±2% 阈值\n`);
    console.log(
      padRight('Provider', 15) +
        padRight('Model', 30) +
        padRight('成本', 14) +
        padRight('售价', 14) +
        padRight('偏差', 12) +
        padRight('状态', 15)
    );
    console.log('-'.repeat(100));

    for (const r of pricingErrors) {
      if (r.inputRateIssue !== undefined && Math.abs(r.inputRateIssue) > 2) {
        const status = r.inputRateIssue < 0 ? '🔴 亏损' : '🟡 盈利过高';
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (input)`, 30) +
            padRight(formatCost(r.dbInput), 14) +
            padRight(formatCost(r.inputRate!), 14) +
            padRight(`${r.inputRateIssue.toFixed(1)}%`, 12) +
            padRight(status, 15)
        );
      }
      if (r.outputRateIssue !== undefined && Math.abs(r.outputRateIssue) > 2) {
        const status = r.outputRateIssue < 0 ? '🔴 亏损' : '🟡 盈利过高';
        console.log(
          padRight(r.provider, 15) +
            padRight(`${r.model} (output)`, 30) +
            padRight(formatCost(r.dbOutput), 14) +
            padRight(formatCost(r.outputRate!), 14) +
            padRight(`${r.outputRateIssue.toFixed(1)}%`, 12) +
            padRight(status, 15)
        );
      }
    }
    console.log(`\nℹ️  偏差说明：负数=亏损（售价<成本），正数=盈利（售价>成本）\n`);
    console.log(`ℹ️  阈值：售价应控制在成本的 ±2% 范围内\n`);
  }

  console.log(`${'='.repeat(80)}`);
  console.log(`✅ 定价完全正确（${fullyCorrect.length} 个）`);
  console.log(`   成本设置准确 + 售价偏差在 ±2% 内`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`总计检查：${results.length} 个模型\n`);

  if (costDriftErrors.length > 0) {
    console.log(`${'='.repeat(80)}`);
    console.log('建议的批量更新 API 调用（成本设置错误）:');
    console.log(`${'='.repeat(80)}\n`);

    const updates = costDriftErrors
      .filter((r) => r.litellmInput !== undefined || r.openrouterInput !== undefined)
      .map((r) => {
        const source = r.litellmInput !== undefined ? 'litellm' : 'openrouter';
        const input = source === 'litellm' ? r.litellmInput! : r.openrouterInput!;
        const output = source === 'litellm' ? r.litellmOutput! : r.openrouterOutput!;
        return {
          provider: r.provider,
          model: r.model,
          type: r.type,
          unitCosts: { input, output },
          source,
        };
      });

    console.log('POST /api/ai-providers/bulk-rate-update');
    console.log(JSON.stringify({ rates: updates }, null, 2));
  }
}
