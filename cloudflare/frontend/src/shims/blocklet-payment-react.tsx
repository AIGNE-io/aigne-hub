import type { ReactNode } from 'react';

// Stub PaymentProvider - wraps children without payment functionality
export function PaymentProvider({ children }: { children: ReactNode }) {
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
}

// Stub AutoTopup - renders nothing
export function AutoTopup() {
  return null;
}

// Stub SafeGuard - passthrough
export function SafeGuard({ children }: { children: ReactNode }) {
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
}

// Stub stopEvent
export function stopEvent(e: Event) {
  e.stopPropagation();
  e.preventDefault();
}

// Stub translations
export const translations: Record<string, Record<string, string>> = {
  en: {},
  zh: {},
};

export default { PaymentProvider, AutoTopup, SafeGuard, stopEvent, translations };
