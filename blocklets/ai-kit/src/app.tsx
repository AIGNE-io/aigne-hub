import { LocaleProvider } from '@arcblock/ux/lib/Locale/context';
import { ToastProvider } from '@arcblock/ux/lib/Toast';
import { SubscribeButton } from '@blocklet/ai-kit/components';
import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Global, css } from '@emotion/react';
import { Box, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { ReactNode, Suspense, lazy } from 'react';
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';

import NotFoundView from './components/error/not-found';
import Loading from './components/loading';
import { SessionProvider, useIsRole } from './contexts/session';
import { translations } from './locales';
import { HomeLazy } from './pages/home';
import { ChatLazy } from './pages/playground';

const theme = createTheme({
  typography: {
    fontSize: 14,
    allVariants: {
      textTransform: 'none',
    },
  },
});

export default function App() {
  const basename = window.blocklet?.prefix || '/';

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline>
        <Global
          styles={css`
            html,
            body {
              font-size: 14px;
            }

            #app {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }
          `}
        />

        <ToastProvider>
          <LocaleProvider
            translations={translations}
            fallbackLocale="en"
            locale={undefined}
            onLoadingTranslation={undefined}
            languages={undefined}>
            <SessionProvider serviceHost={basename}>
              <Suspense fallback={<Loading />}>
                <AppRoutes basename={basename} />
              </Suspense>
            </SessionProvider>
          </LocaleProvider>
        </ToastProvider>
      </CssBaseline>
    </ThemeProvider>
  );
}

function AppRoutes({ basename }: { basename: string }) {
  const isAdmin = useIsRole('owner', 'admin');

  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route>
        <Route index element={<HomeLazy />} />
        <Route path="playground" element={isAdmin ? undefined : <Navigate to="/" />}>
          <Route index element={<Navigate to="/playground/chat" replace />} />
          <Route path="chat" element={<ChatLazy />} />
        </Route>
        <Route path="billing/*" element={<BillingRoutes />} />
        <Route
          path="*"
          element={
            <Layout>
              <Box flex={1}>
                <NotFoundView />
              </Box>
            </Layout>
          }
        />
      </Route>
    ),
    { basename }
  );

  return <RouterProvider router={router} />;
}

const BillingRoutes = lazy(() => import('./pages/billing'));

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        // @ts-ignore
        maxWidth={null}
        addons={(exists: ReactNode[]) => [<SubscribeButton />, ...exists]}
      />

      {children}

      <Footer
        // FIXME: remove following undefined props after issue https://github.com/ArcBlock/ux/issues/1136 solved
        meta={undefined}
        theme={undefined}
      />
    </>
  );
}
