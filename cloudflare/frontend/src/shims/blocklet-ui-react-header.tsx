import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { label: '首页', link: '/' },
  { label: '配置', link: '/config' },
  { label: '用量', link: '/usage' },
  { label: '沙盒', link: '/playground' },
  { label: '定价', link: '/pricing' },
  { label: 'API Keys', link: '/api-keys' },
];

interface HeaderProps {
  title?: string;
  brand?: ReactNode;
  children?: ReactNode;
  addons?: (existing: ReactNode[]) => ReactNode[];
  [key: string]: unknown;
}

// Load <blocklet-header> Web Component from blocklet-service
let headerScriptLoaded = false;
function ensureHeaderScript() {
  if (headerScriptLoaded) return;
  headerScriptLoaded = true;
  const script = document.createElement('script');
  script.src = '/.well-known/service/components/header.js';
  document.head.appendChild(script);
}

// eslint-disable-next-line react/prop-types
export default function Header({ title, children, addons, ...allProps }: HeaderProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { maxWidth, homeLink, sessionManagerProps, hideNavMenu, brand, ...rest } = allProps;
  const headerRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  let location: { pathname: string };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    location = useLocation();
  } catch {
    location = { pathname: '/' };
  }

  useEffect(() => {
    ensureHeaderScript();
  }, []);

  // Sync React Router with Web Component SPA nav
  useEffect(() => {
    const onPopState = () => {
      // When blocklet-header pushes state, sync React Router
      const newPath = window.location.pathname;
      if (newPath !== location.pathname) {
        navigate(newPath);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [location.pathname, navigate]);

  const extra = addons ? addons([]) : [];

  return (
    <div ref={headerRef} {...(rest as Record<string, unknown>)}>
      <blocklet-header
        app-name={title || 'AIGNE Hub'}
        app-logo=""
        nav-items={JSON.stringify(NAV_ITEMS)}
      />
      {extra}
      {children}
    </div>
  );
}

// TypeScript: declare the custom element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'blocklet-header': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        'app-name'?: string;
        'app-logo'?: string;
        'nav-items'?: string;
        theme?: string;
        'login-url'?: string;
        'team-url'?: string;
      }, HTMLElement>;
    }
  }
}
