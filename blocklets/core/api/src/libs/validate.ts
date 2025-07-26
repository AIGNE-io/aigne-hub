import Joi from 'joi';
import { Op } from 'sequelize';

export function createListParamSchema<T>(schema: any, pageSize: number = 20) {
  return Joi.object<
    T & {
      page: number;
      pageSize: number;
      q?: string;
      o?: string;
    }
  >({
    page: Joi.number()
      .integer()
      .default(1)
      .custom((value) => (value < 1 ? 1 : value), 'page should be valid'),
    pageSize: Joi.number()
      .integer()
      .default(pageSize)
      .custom((value) => {
        if (value > 100) return 100;
        if (value < 1) return 1;
        return value;
      }, 'pageSize should be valid'),
    q: Joi.string().empty(''),
    o: Joi.string().valid('asc', 'desc').insensitive().empty(''),
    ...schema,
  });
}

export const getWhereFromKvQuery = (query?: string) => {
  if (!query) {
    return {};
  }
  const out: any = {};
  const likes: any = [];
  const fn = (kv: string) => {
    const [k, v] = kv.split(':');
    if (k && !v && !k.includes('like')) {
      out[k as string] = {
        [Op.in]: [],
      };
    }
    if (v) {
      let value = decodeURIComponent(v).replace('+', ' ');
      if (value.includes(',')) {
        value = {
          [Op.in]: v.split(','),
        } as any;
        out[k as string] = value;
      } else if ((k as any).includes('like')) {
        const kk = k?.slice(5);
        value = { [kk as any]: { [Op.like]: `%${v}%` } } as any;
        likes.push(value);
      } else {
        out[k as string] = value;
      }
    }
  };
  query.split(' ').forEach(fn);
  if (likes.length) {
    out[Op.or] = likes;
  }
  return out;
};
