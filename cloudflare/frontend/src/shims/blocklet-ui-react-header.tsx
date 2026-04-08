import type { ReactNode } from 'react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { SessionContext } from './did-connect-react-session';

interface HeaderProps {
  title?: string;
  brand?: ReactNode;
  children?: ReactNode;
  addons?: (existing: ReactNode[]) => ReactNode[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Script loader — state machine with error handling
// ---------------------------------------------------------------------------
let scriptState: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
const pendingCallbacks: Array<(ok: boolean) => void> = [];

function loadHeaderScript(): Promise<boolean> {
  if (scriptState === 'loaded') return Promise.resolve(true);
  if (scriptState === 'error') return Promise.resolve(false);

  return new Promise((resolve) => {
    if (scriptState === 'loading') {
      pendingCallbacks.push(resolve);
      return;
    }
    scriptState = 'loading';
    pendingCallbacks.push(resolve);

    const script = document.createElement('script');
    script.src = '/.well-known/service/components/header.js';
    script.onload = () => {
      scriptState = 'loaded';
      pendingCallbacks.forEach((cb) => cb(true));
      pendingCallbacks.length = 0;
    };
    script.onerror = () => {
      scriptState = 'error';
      pendingCallbacks.forEach((cb) => cb(false));
      pendingCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// i18n + role-based nav items
// ---------------------------------------------------------------------------
function getLocale(): string {
  const lang = document.documentElement.lang || navigator.language || 'en';
  return lang.startsWith('zh') ? 'zh' : 'en';
}

function getNavItems(locale: string, role?: string, isLoggedIn?: boolean) {
  const isAdmin = role === 'admin' || role === 'owner';
  return [
    { label: locale === 'zh' ? '首页' : 'Home', link: '/' },
    ...(isAdmin ? [{ label: locale === 'zh' ? '控制台' : 'Console', link: '/config' }] : []),
    ...(isAdmin ? [{ label: locale === 'zh' ? '用量' : 'Usage', link: '/usage' }] : []),
    ...(isLoggedIn ? [{ label: locale === 'zh' ? '沙盒' : 'Playground', link: '/playground' }] : []),
    { label: locale === 'zh' ? '定价' : 'Pricing', link: '/pricing' },
    ...(isLoggedIn ? [{ label: 'API Keys', link: '/api-keys' }] : []),
  ];
}

// ---------------------------------------------------------------------------
// Fallback header (shown when blocklet-service script fails to load)
// ---------------------------------------------------------------------------
function FallbackHeader({
  title,
  navItems,
  locale,
  isLoggedIn,
  location,
  navigate,
}: {
  title: string;
  navItems: Array<{ label: string; link: string }>;
  locale: string;
  isLoggedIn: boolean;
  location: { pathname: string };
  navigate: (path: string) => void;
}) {
  return (
    <div
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate('/');
        }}
        style={{ fontWeight: 600, fontSize: 16, textDecoration: 'none', color: '#111' }}>
        {title}
      </a>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {navItems.map((item) => (
          <a
            key={item.link}
            href={item.link}
            onClick={(e) => {
              e.preventDefault();
              navigate(item.link);
            }}
            style={{
              color: location.pathname === item.link ? '#2563eb' : '#6b7280',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: location.pathname === item.link ? 600 : 500,
              padding: '6px 12px',
              borderRadius: 6,
            }}>
            {item.label}
          </a>
        ))}
        {!isLoggedIn && (
          <button
            type="button"
            onClick={() => {
              window.location.href = '/.well-known/service/login';
            }}
            style={{
              padding: '6px 16px',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}>
            {locale === 'zh' ? '登录' : 'Sign In'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Header component
// ---------------------------------------------------------------------------
// eslint-disable-next-line react/prop-types
export default function Header({ title, children, addons, ...allProps }: HeaderProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxWidth, homeLink, sessionManagerProps, hideNavMenu, brand, sx, ...rest } = allProps;
  const headerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [scriptLoaded, setScriptLoaded] = useState(scriptState === 'loaded');

  // Session for role-based nav filtering
  const { session } = useContext(SessionContext);
  const userRole = session?.user?.role;
  const isLoggedIn = !!session?.user;

  const locale = getLocale();

  let location: { pathname: string };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    location = useLocation();
  } catch {
    location = { pathname: '/' };
  }

  // Load the <blocklet-header> Web Component script from blocklet-service
  useEffect(() => {
    loadHeaderScript().then(setScriptLoaded);
  }, []);

  // Sync React Router with Web Component SPA navigation
  // The <blocklet-header> uses pushState + dispatchEvent(PopStateEvent) for nav
  useEffect(() => {
    const onPopState = () => {
      const newPath = window.location.pathname;
      if (newPath !== location.pathname) {
        navigate(newPath);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [location.pathname, navigate]);

  const navItems = useMemo(() => getNavItems(locale, userRole, isLoggedIn), [locale, userRole, isLoggedIn]);
  const extra = addons ? addons([]) : [];
  const appTitle = title || 'AIGNE Hub';

  // Fallback: script failed to load — render pure React header
  if (!scriptLoaded && scriptState === 'error') {
    return (
      <div ref={headerRef}>
        <FallbackHeader
          title={appTitle}
          navItems={navItems}
          locale={locale}
          isLoggedIn={isLoggedIn}
          location={location}
          navigate={navigate}
        />
        {extra}
        {children}
      </div>
    );
  }

  // Loading: 56px placeholder to avoid layout shift
  if (!scriptLoaded) {
    return (
      <div ref={headerRef}>
        <div style={{ height: 56, borderBottom: '1px solid #e5e7eb' }} />
        {extra}
        {children}
      </div>
    );
  }

  // Normal: render the <blocklet-header> Web Component
  // - omit app-logo to use blocklet-service default (/.well-known/service/blocklet/logo)
  // - Web Component handles login/logout/user menu/theme internally
  // - nav-items are i18n + role-filtered from React SessionContext
  return (
    <div ref={headerRef} {...(rest as Record<string, unknown>)}>
      <blocklet-header app-name={appTitle} nav-items={JSON.stringify(navItems)} />
      {extra}
      {children}
    </div>
  );
}

// TypeScript: declare the custom element for React JSX
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'blocklet-header': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'app-name'?: string;
          'app-logo'?: string;
          'nav-items'?: string;
          theme?: string;
          'login-url'?: string;
          'team-url'?: string;
        },
        HTMLElement
      >;
    }
  }
}
