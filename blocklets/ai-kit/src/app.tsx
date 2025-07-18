import Center from '@arcblock/ux/lib/Center';
import { ErrorFallback } from '@arcblock/ux/lib/ErrorBoundary';
import { LocaleProvider } from '@arcblock/ux/lib/Locale/context';
import { ThemeProvider } from '@arcblock/ux/lib/Theme';
import { ToastProvider } from '@arcblock/ux/lib/Toast';
import { CreditButton } from '@blocklet/ai-kit/components';
import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Global, css } from '@emotion/react';
import { Box, CircularProgress, CssBaseline } from '@mui/material';
import { ReactNode, Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';

import NotFoundView from './components/error/not-found';
import Loading from './components/loading';
import { TransitionProvider } from './components/loading/progress-bar';
import { SessionProvider, useIsRole } from './contexts/session';
import { translations } from './locales';
import { HomeLazy } from './pages/home';
import { ChatLazy } from './pages/playground';

const ConfigPage = lazy(() => import('./pages/config'));

export default function App() {
  const basename = window.blocklet?.prefix || '/';

  return (
    <ThemeProvider>
      <CssBaseline>
        <Global
          styles={css`
            #app {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }
          `}
        />
        <ErrorBoundary onReset={window.location.reload} FallbackComponent={ErrorFallback}>
          <Suspense fallback={<Loading />}>
            <ToastProvider>
              <LocaleProvider
                translations={translations}
                fallbackLocale="en"
                locale={undefined}
                onLoadingTranslation={undefined}
                languages={undefined}>
                <SessionProvider serviceHost={basename}>
                  <TransitionProvider>
                    <Suspense
                      fallback={
                        <Center>
                          <CircularProgress />
                        </Center>
                      }>
                      <AppRoutes basename={basename} />
                    </Suspense>
                  </TransitionProvider>
                </SessionProvider>
              </LocaleProvider>
            </ToastProvider>
          </Suspense>
        </ErrorBoundary>
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
        <Route key="config-index" path="/config" element={<ConfigPage />} />
        <Route key="config-tabs" path="/config/:group" element={<ConfigPage />} />
        <Route key="config-sub" path="/config/:group/:page" element={<ConfigPage />} />
        <Route key="config-fallback" path="/config/*" element={<ConfigPage />} />
        {/* <Route path="billing/*" element={<BillingRoutes />} /> */}
        <Route
          path="*"
          element={
            <Layout>
              <Box
                sx={{
                  flex: 1,
                }}>
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

function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        // @ts-ignore
        maxWidth={null}
        addons={(exists: ReactNode[]) => [<CreditButton />, ...exists]}
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
