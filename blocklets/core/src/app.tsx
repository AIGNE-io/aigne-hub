import Center from '@arcblock/ux/lib/Center';
import { ErrorFallback } from '@arcblock/ux/lib/ErrorBoundary';
import { LocaleProvider } from '@arcblock/ux/lib/Locale/context';
import { ThemeProvider } from '@arcblock/ux/lib/Theme';
import { ToastProvider } from '@arcblock/ux/lib/Toast';
import { Global, css } from '@emotion/react';
import { Box, CircularProgress, CssBaseline } from '@mui/material';
import { Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom';

import NotFoundView from './components/error/not-found';
import PageLayout from './components/layout/page-layout';
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
const ApiKeysPage = lazy(() => import('./pages/api-keys/index'));

const isCfMode = !window.blocklet?.appId;

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
      isCfMode ? (
        // CF mode: flat navigation, no Dashboard wrapper
        <Route>
          <Route index element={<HomeLazy />} />
          <Route
            path="/config"
            element={
              <PageLayout>
                <ConfigAIConfigPage />
              </PageLayout>
            }
          />
          <Route
            path="/config/:page"
            element={
              <PageLayout>
                <ConfigAIConfigPage />
              </PageLayout>
            }
          />
          <Route
            path="/usage"
            element={
              <PageLayout>
                <ConfigUsagePage />
              </PageLayout>
            }
          />
          <Route
            path="/usage/projects/:appDid"
            element={
              <PageLayout>
                <ProjectPage isAdmin />
              </PageLayout>
            }
          />
          <Route
            path="/api-keys"
            element={
              <PageLayout>
                <ApiKeysPage />
              </PageLayout>
            }
          />
          <Route key="pricing" path="/pricing" element={<PricingPage />} />
          <Route
            path="/playground"
            element={
              <PageLayout fullHeight showFooter={false}>
                <Box sx={{ pt: 4, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <ChatLazy />
                </Box>
              </PageLayout>
            }
          />
          <Route
            path="/credit-usage"
            element={
              <PageLayout>
                <CreditBoardPage />
              </PageLayout>
            }
          />
          <Route path="/config/ai-config" element={<Navigate to="/config" replace />} />
          <Route path="/config/ai-config/:page" element={<Navigate to="/config/:page" replace />} />
          <Route path="/config/usage" element={<Navigate to="/usage" replace />} />
          <Route path="/config/playground" element={<Navigate to="/playground" replace />} />
          <Route path="/config/projects/:appDid" element={<Navigate to="/usage/projects/:appDid" replace />} />
          <Route
            path="*"
            element={
              <PageLayout>
                <Box sx={{ flex: 1 }}>
                  <NotFoundView />
                </Box>
              </PageLayout>
            }
          />
        </Route>
      ) : (
        // Blocklet mode: original Dashboard layout
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
            path="/credit-usage"
            element={
              <PageLayout>
                <CreditBoardPage />
              </PageLayout>
            }
          />
          <Route
            path="/api-keys"
            element={
              <PageLayout>
                <ApiKeysPage />
              </PageLayout>
            }
          />
          <Route
            path="/usage/projects/:appDid"
            element={
              <PageLayout>
                <ProjectPage isAdmin={false} />
              </PageLayout>
            }
          />
          <Route key="pricing" path="/pricing" element={<PricingPage />} />
          <Route
            path="/playground"
            element={
              <PageLayout fullHeight showFooter={false}>
                <Box sx={{ pt: 4, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <ChatLazy />
                </Box>
              </PageLayout>
            }
          />
          <Route
            path="*"
            element={
              <PageLayout>
                <Box sx={{ flex: 1 }}>
                  <NotFoundView />
                </Box>
              </PageLayout>
            }
          />
        </Route>
      )
    ),
    { basename }
  );

  return <RouterProvider router={router} />;
}

