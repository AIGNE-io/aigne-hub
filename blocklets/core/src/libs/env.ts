import { joinURL } from 'ufo';

export const PAYMENT_DID = 'z2qaCNvKMv5GjouKdcDWexv6WqtHbpNPQDnAk';

export const OBSERVABILITY_DID = 'z2qa2GCqPJkufzqF98D8o7PWHrRRSHpYkNhEh';

export function getObservabilityBlocklet() {
  return window.blocklet.componentMountPoints.find(
    (point: any) => point.did === OBSERVABILITY_DID && point.status === 'running'
  );
}

export function getObservabilityUrl() {
  const blocklet = getObservabilityBlocklet();
  if (!blocklet) {
    return '';
  }
  return joinURL(window.location.origin, blocklet?.mountPoint ?? '/');
}

export function getPaymentBlocklet() {
  return window.blocklet.componentMountPoints.find(
    (point: any) => point.did === PAYMENT_DID && point.status === 'running'
  );
}

export function getPaymentUrl(path: string) {
  const blocklet = getPaymentBlocklet();
  if (!blocklet) {
    return '';
  }
  return joinURL(window.location.origin, blocklet?.mountPoint ?? '/', path || '/');
}
