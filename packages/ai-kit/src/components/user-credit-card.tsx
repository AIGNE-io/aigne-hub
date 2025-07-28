import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import UserCard from '@arcblock/ux/lib/UserCard';
import { formatError } from '@blocklet/error';
import { Alert, Box, Button, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { useRequest } from 'ahooks';

import { UserInfoResult } from '../api/types/user';
import { getUserInfo } from '../api/user';
import { formatNumber } from '../utils/util';
import withLocaleProvider from '../utils/withLocaleProvider';

interface UserCreditCardProps {
  baseUrl: string;
  accessKey: string;
  onSuccess?: (userInfo: UserInfoResult) => void;
  onError?: (error: Error) => void;
  mode?: 'default' | 'custom';
  render?: (userInfo: UserInfoResult) => React.ReactNode | null;
}

function UserCreditCard({
  baseUrl,
  accessKey,
  onSuccess = () => {},
  onError = () => {},
  mode = 'default',
  render = () => null,
}: UserCreditCardProps) {
  const { t } = useLocaleContext();

  const { data: userInfoData, loading } = useRequest(() => getUserInfo({ baseUrl, accessKey }), {
    refreshDeps: [baseUrl, accessKey],
    onError: (err) => {
      Toast.error(formatError(err));
      onError?.(err);
    },
    onSuccess: (data) => {
      onSuccess?.(data);
    },
  });

  if (loading) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('loadingUserInfo')}
        </Typography>
      </Box>
    );
  }

  if (!userInfoData) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
          {t('noUserData')}
        </Alert>
      </Box>
    );
  }

  if (mode === 'custom') {
    return render(userInfoData);
  }

  return (
    <Stack
      sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, width: '100%' }}
      spacing={2}
      className="user-credit-card">
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" color="text.secondary">
          {t('username')}
        </Typography>
        <UserCard
          user={userInfoData.user as any}
          showHoverCard
          popupShowDid
          sx={{
            border: 'none',
            p: 0,
            minWidth: 0,
          }}
          avatarProps={{
            size: 24,
          }}
        />
      </Stack>
      {userInfoData?.enableCredit ? (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {t('creditBalance')}
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              {formatNumber(userInfoData?.creditBalance?.balance || '0')} {userInfoData.currency?.symbol ?? 'AHC'}
            </Typography>
          </Stack>

          {userInfoData.creditBalance?.pendingCredit && Number(userInfoData.creditBalance.pendingCredit) > 0 && (
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {t('pendingCredit')}
              </Typography>
              <Typography variant="h6" fontWeight="bold" sx={{ color: 'error.main' }}>
                {formatNumber(userInfoData.creditBalance.pendingCredit)} {userInfoData.currency?.symbol ?? 'AHC'}
              </Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
            {userInfoData?.paymentLink && (
              <Button
                variant="outlined"
                onClick={() => {
                  window.open(userInfoData?.paymentLink || '', '_blank');
                }}
                sx={{
                  flex: 1,
                }}>
                {t('recharge')}
              </Button>
            )}

            <Button
              variant="text"
              onClick={() => {
                window.open(userInfoData?.profileLink || '', '_blank');
              }}
              sx={{
                borderColor: 'primary.main',
                color: 'primary.main',
              }}>
              {t('manage')}
            </Button>
          </Stack>
        </>
      ) : (
        <Alert
          severity="info"
          sx={{
            textAlign: 'left',
          }}>
          {t('creditNotEnabled')}
          <Typography
            sx={{
              display: 'inline-block',
              fontSize: 'inherit',
              lineHeight: 'inherit',
              ml: 1,
              a: {
                textDecoration: 'none',
              },
              '& .MuiButtonBase-root': { p: 0, minWidth: 'auto' },
            }}>
            <Link href={userInfoData?.profileLink || ''} target="_blank">
              {t('viewProfile')}
            </Link>
          </Typography>
        </Alert>
      )}
    </Stack>
  );
}

export default withLocaleProvider(UserCreditCard, {
  translations: {
    en: {
      username: 'User',
      creditBalance: 'Credit Balance',
      pendingCredit: 'Outstanding Charges',
      recharge: 'Buy Credits',
      manage: 'Manage',
      creditNotEnabled: 'AIGNE Hub Credit billing is not enabled. You can use AI services directly.',
      loadingUserInfo: 'Loading user information...',
      fetchUserInfoFailed: 'Failed to fetch user information',
      unknownUser: 'Unknown User',
      noUserData: 'No user data available',
      retry: 'Retry',
      viewProfile: 'View Profile',
    },
    zh: {
      username: '用户',
      creditBalance: '信用额度',
      pendingCredit: '待结清额度',
      recharge: '购买额度',
      manage: '管理额度',
      creditNotEnabled: 'AIGNE Hub 未启用 Credit 计费功能，您可以直接使用AI服务。',
      loadingUserInfo: '正在加载用户信息...',
      fetchUserInfoFailed: '获取用户信息失败',
      unknownUser: '未知用户',
      noUserData: '暂无用户数据',
      retry: '重试',
      viewProfile: '查看用户信息',
    },
  },
});
