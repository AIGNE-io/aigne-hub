import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { formatError } from '@blocklet/error';
import { Alert, AlertProps, Stack } from '@mui/material';

import { CreditErrorType } from '../../api/error';
import withLocaleProvider from '../../utils/withLocaleProvider';
import CreditButton from './button';

interface CreditError {
  type: CreditErrorType;
  message: string;
}

function CreditErrorAlert({ error, ...props }: { error: CreditError } & AlertProps) {
  const { t } = useLocaleContext();

  const isCreditError = error?.type === CreditErrorType.NOT_ENOUGH;

  if (!isCreditError) {
    return (
      <Alert severity="error" {...props}>
        {formatError(error) || t('unknownError')}
      </Alert>
    );
  }

  return (
    <Alert
      severity="warning"
      {...props}
      sx={{
        px: 1,
        py: 0,
        '& .MuiAlert-message': {
          width: '100%',
        },
        ...props.sx,
      }}>
      {t('creditNotEnoughTip')}

      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <CreditButton shouldOpenInNewTab size="small" variant="outlined" color="warning">
          {t('buyCreditsNow')}
        </CreditButton>
      </Stack>
    </Alert>
  );
}

export default withLocaleProvider(CreditErrorAlert, {
  translations: {
    en: {
      unknownError: 'An unknown error occurred',
      creditNotEnoughTip: 'Your credit balance is insufficient. Please buy more credits to continue using AI services.',
      buyCreditsNow: 'Buy Credits Now',
    },
    zh: {
      unknownError: '发生了未知错误',
      creditNotEnoughTip: '您的额度不足。请购买更多额度以继续使用AI服务。',
      buyCreditsNow: '立即购买额度',
    },
  },
});
