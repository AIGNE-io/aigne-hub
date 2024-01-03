import { Alert, Stack } from '@mui/material';

export default function NotFoundView() {
  return (
    <Stack gap={2} my={10} alignItems="center">
      <Alert severity="error">Not Found</Alert>
    </Stack>
  );
}
