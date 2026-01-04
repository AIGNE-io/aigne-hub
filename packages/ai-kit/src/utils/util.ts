import trimEnd from 'lodash/trimEnd';
import numbro from 'numbro';

export function formatNumber(
  n: number | string,
  precision: number = 2,
  trim: boolean = false,
  thousandSeparated: boolean = true,
  maxPrecision: number = 6
) {
  const num = numbro(n || 0);
  const value = num.value();

  if (!value) {
    return '0';
  }

  const trimZeros = (valueString: string) => {
    const [left, right] = valueString.split('.');
    return right ? [left, trimEnd(right, '0')].filter(Boolean).join('.') : left;
  };
  const isZeroString = (valueString: string) => {
    const trimmed = trimZeros(valueString);
    return trimmed === '0' || trimmed === '-0';
  };

  let result = value.toString();

  for (let p = precision; p <= maxPrecision; p += 1) {
    result = num.format({ thousandSeparated, mantissa: p });
    if (!isZeroString(result)) break;
  }

  if (!trim) {
    return result;
  }
  return trimZeros(result);
}
