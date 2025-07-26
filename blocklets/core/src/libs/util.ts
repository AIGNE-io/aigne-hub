import BigNumber from 'bignumber.js';
import { joinURL } from 'ufo';

export const formatError = (err: any) => {
  if (!err) {
    return 'Unknown error';
  }

  const { details, errors, response } = err;

  // graphql error
  if (Array.isArray(errors)) {
    return errors.map((x) => x.message).join('\n');
  }

  // joi validate error
  if (Array.isArray(details)) {
    const formatted = details.map((e) => {
      const errorMessage = e.message.replace(/["]/g, "'");
      const errorPath = e.path.join('.');
      return `${errorPath}: ${errorMessage}`;
    });

    return `Validate failed: ${formatted.join(';')}`;
  }

  // axios error
  if (response) {
    return response.data?.error || `${err.message}: ${JSON.stringify(response.data)}`;
  }

  return err.message;
};

const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';
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
