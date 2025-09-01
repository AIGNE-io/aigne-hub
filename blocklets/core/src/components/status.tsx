import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Button, ButtonProps, CircularProgress, Stack, Tooltip, Typography } from '@mui/material';

export function Status({
  t,
  model,
}: {
  t: any;
  model: { status?: { available?: boolean; error?: { message?: string } }; loading?: boolean };
}) {
  const map = {
    available: 'success.main',
    pending: 'grey.500',
    warning: 'warning.main',
  };

  const getStatus = () => {
    if (model.status?.available === true) {
      return 'available';
    }

    if (model.status?.available === false) {
      return 'warning';
    }

    return 'available';
  };
  const status = getStatus();

  if (model.loading) {
    return <CircularProgress size={14} />;
  }

  return (
    <Tooltip title={model.status?.error?.message}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ width: 6, height: 6, bgcolor: status ? map[status] : map.available, borderRadius: '50%' }} />
        <Typography variant="body2" sx={{ color: status ? map[status] : map.available }}>
          {t(`pricing.status.${status}`)}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

export function TestModelButton({
  statusLoading,
  ...props
}: {
  statusLoading: boolean;
} & ButtonProps) {
  const { t } = useLocaleContext();
  return (
    <Button variant="outlined" sx={{ alignSelf: 'flex-end' }} disabled={statusLoading} {...props}>
      {statusLoading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
      {statusLoading ? t('testStatus') : t('testStatus')}
    </Button>
  );
}
