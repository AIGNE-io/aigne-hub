import Center from '@arcblock/ux/lib/Center';
import { ErrorFallback } from '@arcblock/ux/lib/ErrorBoundary';
import { LocaleProvider } from '@arcblock/ux/lib/Locale/context';
import { ThemeProvider } from '@arcblock/ux/lib/Theme';
import { ToastProvider } from '@arcblock/ux/lib/Toast';
import { CreditButton } from '@blocklet/aigne-hub/components';
import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Global, css } from '@emotion/react';
import { Box, CircularProgress, CssBaseline } from '@mui/material';
import { ReactNode, Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';

import NotFoundView from './components/error/not-found';
import UserLayout from './components/layout/user';
import Loading from './components/loading';
import { TransitionProvider } from './components/loading/progress-bar';
import { SessionProvider } from './contexts/session';
import { translations } from './locales';
import { HomeLazy } from './pages/home';

const ConfigPage = lazy(() => import('./pages/config'));
const CreditBoardPage = lazy(() => import('./pages/customer/usage'));
const PricingPage = lazy(() => import('./pages/pricing'));

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
  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route>
        <Route index element={<HomeLazy />} />
        <Route path="/config">
          <Route index element={<ConfigPage />} />
          <Route path=":group" element={<ConfigPage />} />
          <Route path=":group/:page" element={<ConfigPage />} />
          <Route path="*" element={<ConfigPage />} />
        </Route>
        <Route
          key="credit-board"
          path="/credit-usage"
          element={
            <UserLayout>
              <CreditBoardPage />
            </UserLayout>
          }
        />
        <Route key="pricing" path="/pricing" element={<PricingPage />} />
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
