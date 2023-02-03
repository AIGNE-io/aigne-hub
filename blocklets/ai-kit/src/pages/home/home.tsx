import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Box, Typography } from '@mui/material';

export default function Home() {
  return (
    <>
      <Header maxWidth={null} />

      <Box flexGrow={1} mx={2}>
        <Box mx="auto" my={4} maxWidth={800}>
          {blocklet && (
            <Box textAlign="center">
              <Box component="img" src={blocklet.appLogo} width={80} />
              <Typography variant="h4">{blocklet.appName}</Typography>
              <Typography variant="caption" component="div">
                v{blocklet.version}
              </Typography>
              <Typography variant="body1" component="div">
                {blocklet.appDescription}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Footer />
    </>
  );
}
