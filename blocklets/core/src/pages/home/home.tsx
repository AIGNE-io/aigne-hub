import { useIsRole, useSessionContext } from '@app/contexts/session';
import { getPrefix } from '@app/libs/util';
import Dialog from '@arcblock/ux/lib/Dialog';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { CreditButton } from '@blocklet/aigne-hub/components';
import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Assessment, AttachMoney, Code, ContentCopy } from '@mui/icons-material';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { joinURL } from 'ufo';

export default function Home() {
  const { session } = useSessionContext();
  const { t } = useLocaleContext();
  const isAdmin = useIsRole('owner', 'admin');
  const navigate = useNavigate();
  const [showCodeModal, setShowCodeModal] = useState(false);

  const isCreditBillingEnabled = window.blocklet?.preferences?.creditBasedBillingEnabled;

  const codeExample = `import { AIGNEHubChatModel } from "@aigne/aigne-hub";

const model = new AIGNEHubChatModel({
  url: "${window.location.origin}",
  accessKey: "your-oauth-access-key", 
  model: "openai/gpt-4o-mini",
});

const result = await model.invoke({
  messages: [{ role: "user", content: "Hello!" }],
});`;

  const copyCode = () => {
    navigator.clipboard.writeText(codeExample);
    Toast.success(t('codeCopied'));
  };

  return (
    <>
      <Header
        // @ts-ignore
        maxWidth={null}
        addons={(exists: ReactNode[]) => [<CreditButton />, ...exists]}
      />
      <Box
        sx={{
          flexGrow: 1,
          mx: 2,
        }}>
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 600,
            textAlign: 'center',
          }}>
          {window.blocklet && (
            <Stack
              sx={{
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                minHeight: '60vh',
              }}>
              <Box
                component="img"
                src={window.blocklet.appLogo}
                sx={{
                  width: 80,
                  borderRadius: 80,
                }}
              />
              <Typography variant="h4">AIGNE Hub</Typography>
              <Typography
                variant="h5"
                component="div"
                sx={{
                  color: 'text.secondary',
                  textAlign: 'center',
                }}>
                {t('homeSubtitle')}
              </Typography>

              {/* Action Buttons */}
              <Stack
                direction="row"
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  justifyContent: { xs: 'center', sm: 'flex-start' },
                  gap: 2,
                }}>
                {isAdmin ? (
                  <>
                    <Button component={Link} to="/config" variant="contained">
                      {t('configuration')}
                    </Button>
                    <Button component={Link} to="/config/playground" variant="outlined">
                      {t('playground')}
                    </Button>
                  </>
                ) : session.user ? (
                  isCreditBillingEnabled ? (
                    <>
                      <CreditButton variant="contained" />
                      <Button
                        component={Link}
                        to={`${joinURL(getPrefix(), '/credit-usage')}`}
                        variant="outlined"
                        startIcon={<Assessment />}>
                        {t('creditUsage')}
                      </Button>
                      <Button variant="text" startIcon={<Code />} onClick={() => setShowCodeModal(true)}>
                        {t('integration')}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outlined" startIcon={<Code />} onClick={() => setShowCodeModal(true)}>
                      {t('integration')}
                    </Button>
                  )
                ) : (
                  <Button onClick={session?.login} variant="contained" size="large">
                    {t('loginToAccess')}
                  </Button>
                )}
              </Stack>

              {isCreditBillingEnabled && (
                <Box
                  sx={{
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    pt: 2,
                    mt: 4,
                    width: '100%',
                  }}>
                  <Typography
                    variant="body2"
                    sx={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      color: 'text.secondary',
                    }}
                    onClick={() => {
                      navigate('/pricing');
                    }}>
                    <AttachMoney />
                    {t('viewPricing')}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      </Box>
      {/* Code Modal */}
      <Dialog
        open={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        maxWidth="md"
        fullWidth
        title={
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}>
            <Code color="primary" />
            <span>{t('quickIntegration')}</span>
          </Stack>
        }>
        <Box
          component="pre"
          sx={{
            bgcolor: 'grey.50',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            border: '1px solid',
            borderColor: 'grey.200',
            position: 'relative',
          }}>
          <IconButton
            onClick={copyCode}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: 'background.paper',
              boxShadow: 1,
              '&:hover': { bgcolor: 'grey.100' },
            }}
            size="small">
            <ContentCopy fontSize="small" />
          </IconButton>
          <code>{codeExample}</code>
        </Box>
      </Dialog>
      <Footer meta={undefined} theme={undefined} />
    </>
  );
}
