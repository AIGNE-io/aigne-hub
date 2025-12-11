import trimEnd from 'lodash/trimEnd';
import numbro from 'numbro';

// Decimal places for credit display in UI (different from backend calculation precision)
export const CREDIT_DISPLAY_DECIMAL_PLACES = 4;

export function formatNumber(
  n: number | string,
  precision: number = 6,
  trim: boolean = true,
  thousandSeparated: boolean = true
) {
  if (!n || n === '0') {
    return '0';
  }
  const num = numbro(n);
  const options = {
    thousandSeparated,
    ...((precision || precision === 0) && { mantissa: precision }),
  };
  const result = num.format(options);
  if (!trim) {
    return result;
  }
  const [left, right] = result.split('.');
  return right ? [left, trimEnd(right, '0')].filter(Boolean).join('.') : left;
}
