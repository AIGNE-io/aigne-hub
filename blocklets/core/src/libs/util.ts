import BigNumber from 'bignumber.js';
import { joinURL } from 'ufo';

export const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';
export const getPrefix = (): string => {
  const prefix = window.blocklet?.prefix || '/';
  const baseUrl = window.location?.origin; // required when use payment feature cross origin
  const componentId = (window.blocklet?.componentId || '').split('/').pop();
  if (componentId === AIGNE_HUB_DID) {
    return joinURL(baseUrl, prefix);
  }
  const component = (window.blocklet?.componentMountPoints || []).find((x: any) => x?.did === AIGNE_HUB_DID);
  if (component) {
    return joinURL(baseUrl, component.mountPoint);
  }

  return joinURL(baseUrl, prefix);
};

export const multiply = (a: number, b: number) => {
  const bn = new BigNumber(a).multipliedBy(b);
  return bn.toNumber();
};

export const divide = (a: number, b: number) => {
  const bn = new BigNumber(a).dividedBy(b);
  return bn.toNumber();
};

export const formatMillionTokenCost = (cost: number, precision = 2) => {
  const bn = new BigNumber(cost).multipliedBy(1000000);
  return parseFloat(bn.toFixed(precision));
};

export const parseMillionTokenCost = (cost: number | string) => {
  const bn = new BigNumber(cost);
  return bn.isNaN() ? 0 : bn.dividedBy(1000000).toNumber();
};

// Model pricing unit types
export type ModelPriceUnit = 'mtokens' | 'image' | 'second';

/**
 * Get the appropriate price unit based on model type
 * @param modelType - The type of the model (e.g., 'chatCompletion', 'imageGeneration', 'video')
 * @returns The unit type for pricing display
 */
export const getModelPriceUnit = (modelType: string): ModelPriceUnit => {
  if (modelType === 'imageGeneration' || modelType === 'image_generation') {
    return 'image';
  }
  if (modelType === 'video') {
    return 'second';
  }
  return 'mtokens';
};

/**
 * Get the localized label for a price unit
 * @param unit - The unit type
 * @param t - Translation function
 * @returns Localized unit label
 */
export const getUnitLabel = (unit: ModelPriceUnit, t: (key: string) => string): string => {
  const labelMap: Record<ModelPriceUnit, string> = {
    mtokens: t('config.modelRates.fields.perMillionTokens') || '/ 1M tokens',
    image: t('config.modelRates.fields.perImage') || '/ image',
    second: t('config.modelRates.fields.perSecond') || '/ second',
  };
  return labelMap[unit];
};

/**
 * Format price value based on unit type
 * For mtokens: multiply by 1,000,000 for display
 * For image/second: display as-is
 * @param price - The base price value
 * @param unit - The unit type
 * @param precision - Number of decimal places
 * @returns Formatted price value
 */
export const formatPriceByUnit = (price: number, unit: ModelPriceUnit, precision?: number): number => {
  const bn = new BigNumber(price);
  if (unit === 'mtokens') {
    // For million tokens, multiply by 1,000,000
    const result = bn.multipliedBy(1000000);
    return precision !== undefined ? parseFloat(result.toFixed(precision)) : result.toNumber();
  }
  // For image/second, return as-is
  return precision !== undefined ? parseFloat(bn.toFixed(precision)) : bn.toNumber();
};

/**
 * Parse displayed price value back to base value based on unit type
 * For mtokens: divide by 1,000,000
 * For image/second: return as-is
 * @param displayValue - The displayed price value
 * @param unit - The unit type
 * @returns Base price value
 */
export const parsePriceByUnit = (displayValue: number | string, unit: ModelPriceUnit): number => {
  const bn = new BigNumber(displayValue);
  if (bn.isNaN()) return 0;

  if (unit === 'mtokens') {
    // For million tokens, divide by 1,000,000
    return bn.dividedBy(1000000).toNumber();
  }
  // For image/second, return as-is
  return bn.toNumber();
};

/**
 * Format price with unit for display in pricing tables
 * @param price - The base price value
 * @param modelType - The model type
 * @param precision - Number of decimal places
 * @param rateType - Whether this is input or output rate (input always uses mtokens)
 * @returns Object with formatted value and unit
 */
export const formatModelPrice = (
  price: number,
  modelType: string,
  precision?: number,
  rateType: 'input' | 'output' = 'output'
): { value: number; unit: ModelPriceUnit } => {
  // Input always uses mtokens, output uses appropriate unit based on model type
  const unit = rateType === 'input' ? 'mtokens' : getModelPriceUnit(modelType);
  const value = formatPriceByUnit(price, unit, precision);
  return { value, unit };
};
