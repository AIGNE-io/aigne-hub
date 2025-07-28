import { Alert, Stack } from '@mui/material';

export default function NotFoundView() {
  return (
    <Stack
      sx={{
        gap: 2,
        my: 10,
        alignItems: 'center',
      }}>
      <Alert severity="error">This router is not found, please check the URL.</Alert>
    </Stack>
  );
}
