import { useIsRole, useSessionContext } from '@app/contexts/session';
import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export default function Home() {
  const { session } = useSessionContext();
  const isAdmin = useIsRole('owner', 'admin');

  return (
    <>
      <Header maxWidth={null} />

      <Box flexGrow={1} mx={2}>
        <Box mx="auto" my={4} maxWidth={800}>
          {blocklet && (
            <Stack alignItems="center" justifyContent="center" gap={3} minHeight="60vh">
              <Box component="img" src={blocklet.appLogo} width={80} borderRadius={80} />
              <Typography variant="h4">AI Kit</Typography>
              <Typography variant="h5" component="div" color="text.secondary">
                The decentralized AI access solution for blocklets
              </Typography>

              <Stack direction="row" gap={3}>
                {isAdmin ? (
                  <Button component={Link} to="/playground" variant="contained">
                    Playground
                  </Button>
                ) : (
                  <Button onClick={session.user ? session.switchPassport : session.login} variant="contained">
                    Login as Admin to access playground
                  </Button>
                )}
              </Stack>
            </Stack>
          )}
        </Box>
      </Box>

      <Footer />
    </>
  );
}
