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
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';

import NotFoundView from './components/error/not-found';
import UserLayout from './components/layout/user';
import Loading from './components/loading';
import { TransitionProvider } from './components/loading/progress-bar';
import { SessionProvider, useIsRole } from './contexts/session';
import { translations } from './locales';
import { HomeLazy } from './pages/home';
import { ChatLazy } from './pages/playground';

const ConfigLayout = lazy(() => import('./pages/config'));
const ConfigOverviewPage = lazy(() => import('./pages/config/overview'));
const ConfigAIConfigPage = lazy(() => import('./pages/config/ai-config'));
const ConfigUsagePage = lazy(() => import('./pages/admin/usage'));
const CreditBoardPage = lazy(() => import('./pages/customer/usage'));
const PricingPage = lazy(() => import('./pages/pricing'));
const ProjectPage = lazy(() => import('./pages/usage/projects/project-page'));

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

function ConfigProjectRoute() {
  const isAdmin = useIsRole('owner', 'admin');
  return <ProjectPage isAdmin={isAdmin} />;
}

function AppRoutes({ basename }: { basename: string }) {
  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route>
        <Route index element={<HomeLazy />} />
        <Route path="/config" element={<ConfigLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<ConfigOverviewPage />} />
          <Route path="ai-config" element={<ConfigAIConfigPage />} />
          <Route path="ai-config/:page" element={<ConfigAIConfigPage />} />
          <Route path="usage" element={<ConfigUsagePage />} />
          <Route path="projects" element={<ConfigProjectRoute />} />
          <Route path="projects/:appDid" element={<ConfigProjectRoute />} />
          <Route path="playground" element={<ChatLazy />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
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
        <Route
          key="project"
          path="/usage/projects/:appDid"
          element={
            <UserLayout>
              <ProjectPage isAdmin={false} />
            </UserLayout>
          }
        />
        <Route key="pricing" path="/pricing" element={<PricingPage />} />
        <Route
          key="playground"
          path="/playground"
          element={
            <Box
              component="main"
              sx={{
                overflow: 'hidden',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                pb: { xs: 0.5, md: 2 },
              }}>
              <Header
                // @ts-ignore
                maxWidth={null}
                addons={(exists: ReactNode[]) => [<CreditButton />, ...exists]}
              />
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', pt: 4 }}>
                <ChatLazy />
              </Box>
            </Box>
          }
        />
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
