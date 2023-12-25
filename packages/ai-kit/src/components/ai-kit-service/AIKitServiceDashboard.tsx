import Toast from '@arcblock/ux/lib/Toast';
import { CheckCircleOutlineRounded, ErrorOutlineRounded } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, CircularProgress, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';

import { appRegister } from '../../api/ai-kit';
import { useAIKitServiceStatus } from './state';

export default function AIKitServiceDashboard() {
  const { app, loading, fetch } = useAIKitServiceStatus();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const linkToAiKit = useCallback(async () => {
    const res = await appRegister();
    if (res.paymentLink) {
      window.location.href = res.paymentLink;
    }
  }, []);

  if (loading) {
    return (
      <Stack alignItems="center" py={10}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  return (
    <Box>
      <UseAIKitServiceSwitch />

      {app?.subscription?.status === 'active' ? (
        <Stack alignItems="center" py={10}>
          <Typography>Subscribed</Typography>
        </Stack>
      ) : (
        <Stack alignItems="center">
          <LoadingButton variant="contained" onClick={linkToAiKit}>
            Subscribe
          </LoadingButton>
        </Stack>
      )}
    </Box>
  );
}

function UseAIKitServiceSwitch() {
  const { app, setConfig } = useAIKitServiceStatus();

  const [updating, setUpdating] = useState<boolean | 'success' | 'error'>(false);

  if (!app) return null;

  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Box flex={1} overflow="hidden">
        <FormControlLabel
          key={app.aiKitServiceConfig.useAIKitService?.toString()}
          labelPlacement="start"
          label="Use AI Kit Service"
          control={
            <Switch
              defaultChecked={app.aiKitServiceConfig.useAIKitService}
              onChange={async (_, checked) => {
                try {
                  setUpdating(true);
                  await setConfig({ useAIKitService: checked });
                  setUpdating('success');
                } catch (error) {
                  setUpdating('error');
                  Toast.error(error.message);
                  throw error;
                }
              }}
            />
          }
        />
      </Box>

      <Stack justifyContent="center" alignItems="center" width={24} height={24}>
        {updating === true ? (
          <CircularProgress size={20} />
        ) : updating === 'success' ? (
          <CheckCircleOutlineRounded color="success" sx={{ fontSize: 24 }} />
        ) : updating === 'error' ? (
          <ErrorOutlineRounded color="error" sx={{ fontSize: 24 }} />
        ) : null}
      </Stack>
    </Stack>
  );
}
