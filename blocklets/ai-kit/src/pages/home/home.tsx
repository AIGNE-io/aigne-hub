import { useIsRole, useSessionContext } from '@app/contexts/session';
import { CreditButton } from '@blocklet/ai-kit/components';
import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const { session } = useSessionContext();
  const isAdmin = useIsRole('owner', 'admin');

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
            my: 4,
            maxWidth: 800,
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
                The decentralized AI access solution for blocklets
              </Typography>

              <Stack
                direction="row"
                sx={{
                  gap: 3,
                }}>
                {isAdmin ? (
                  <Stack direction="row" spacing={2}>
                    <Button component={Link} to="/config" variant="contained">
                      Config
                    </Button>
                    <Button component={Link} to="/playground" variant="outlined">
                      Playground
                    </Button>
                  </Stack>
                ) : (
                  <Button onClick={session?.user ? session?.switchDid : session?.login} variant="contained">
                    Login as Admin to access playground
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </Box>
      </Box>
      <Footer
        // FIXME: remove following undefined props after issue https://github.com/ArcBlock/ux/issues/1136 solved
        meta={undefined}
        theme={undefined}
      />
    </>
  );
}
