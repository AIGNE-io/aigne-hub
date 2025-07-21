import { formatError, getPrefix } from '@app/libs/util';
import Dialog from '@arcblock/ux/lib/Dialog';
/* eslint-disable react/no-unstable-nested-components */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { Switch, Table } from '@blocklet/aigne-hub/components';
import styled from '@emotion/styled';
import { Add as AddIcon } from '@mui/icons-material';
import { Avatar, Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { joinURL } from 'ufo';

import { useSessionContext } from '../../../../contexts/session';
import CredentialDialog, { Credential } from './credential-dialog';
import ProviderForm, { ProviderFormData } from './provider-form';

export interface Provider {
  id: string;
  name: string;
  displayName: string;
  baseUrl?: string;
  region?: string;
  enabled: boolean;
  config?: Record<string, any>;
  credentials?: Credential[];
  createdAt: string;
  updatedAt: string;
}

export default function AIProviders() {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [credentialsProvider, setCredentialsProvider] = useState<Provider | null>(null);

  // 获取AI Provider列表
  const fetchProviders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/ai-providers');
      setProviders(response.data || []);
    } catch (error: any) {
      Toast.error(formatError(error) || t('fetchProvidersFailed'));
    } finally {
      setLoading(false);
    }
  };

  // 处理凭证变更
  const handleCredentialChange = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/ai-providers');
      const updatedProviders = response.data || [];
      setProviders(updatedProviders);

      if (credentialsProvider) {
        const updatedProvider = updatedProviders.find((p: Provider) => p.id === credentialsProvider.id);
        if (updatedProvider) {
          setCredentialsProvider(updatedProvider);
        }
      }
    } catch (error: any) {
      Toast.error(formatError(error) || t('fetchProvidersFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 创建Provider和凭证
  const handleCreateProvider = async (data: ProviderFormData) => {
    try {
      const response = await api.post('/api/ai-providers/', {
        name: data.name,
        displayName: data.displayName,
        baseUrl: data.baseUrl,
        region: data.region,
        enabled: data.enabled,
        config: data.config,
      });

      const providerId = response.data.id;

      // 创建凭证
      if (data.credentials && data.credentials.length > 0) {
        for (const credential of data.credentials) {
          let credentialValue: any;

          if (credential.credentialType === 'access_key_pair') {
            credentialValue = credential.value;
          } else if (typeof credential.value === 'string') {
            const stringValue = credential.value as string;
            if (stringValue.trim()) {
              credentialValue = stringValue.trim();
            }
          } else if (
            typeof credential.value === 'object' &&
            credential.value &&
            Object.keys(credential.value).length > 0
          ) {
            credentialValue = credential.value;
          }

          if (credentialValue) {
            api.post(`/api/ai-providers/${providerId}/credentials`, {
              name: credential.name,
              _value: credentialValue,
              credentialType: credential.credentialType,
            });
          }
        }
      }

      await fetchProviders();
      Toast.success(t('providerCreated'));
      setShowForm(false);
      setEditingProvider(null);
    } catch (error: any) {
      Toast.error(formatError(error) || t('createProviderFailed'));
    }
  };

  // 更新Provider
  const handleUpdateProvider = async (data: ProviderFormData) => {
    if (!editingProvider) return;
    try {
      await api.put(`/api/ai-providers/${editingProvider.id}`, {
        name: data.name,
        displayName: data.displayName,
        baseUrl: data.baseUrl,
        region: data.region,
        enabled: data.enabled,
        config: data.config,
      });
      await fetchProviders();
      setEditingProvider(null);
      setShowForm(false);
      Toast.success(t('providerUpdated'));
    } catch (error: any) {
      Toast.error(formatError(error) || t('updateProviderFailed'));
    }
  };

  // 切换Provider状态
  const toggleProvider = async (provider: Provider) => {
    try {
      await api.put(`/api/ai-providers/${provider.id}`, {
        ...provider,
        enabled: !provider.enabled,
      });
      await fetchProviders();
      Toast.success(provider.enabled ? t('providerDisabled') : t('providerEnabled'));
    } catch (error: any) {
      Toast.error(formatError(error) || t('updateProviderFailed'));
    }
  };

  // 编辑Provider
  const handleEditProvider = (provider: Provider) => {
    setEditingProvider(provider);
    setShowForm(true);
  };

  // 表格列定义
  const columns = [
    {
      name: 'provider',
      label: t('provider'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const provider = providers[tableMeta.rowIndex];
          if (!provider) return null;

          return (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Avatar
                src={joinURL(getPrefix(), `/logo/${provider.name}.png`)}
                sx={{ width: 24, height: 24 }}
                alt={provider.displayName}
              />
              <Typography variant="body2">{provider.displayName}</Typography>
            </Stack>
          );
        },
      },
    },
    {
      name: 'endpoint',
      label: t('endpointRegion'),
      width: 280,
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const provider = providers[tableMeta.rowIndex];
          if (!provider) return null;

          // 如果是AWS Bedrock，只显示region
          if (provider.name === 'bedrock') {
            return <Typography variant="body2">{provider.region || '-'}</Typography>;
          }

          return (
            <Box>
              {provider.baseUrl && (
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {provider.baseUrl}
                </Typography>
              )}
              {provider.region && (
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                  }}>
                  Region: {provider.region}
                </Typography>
              )}
            </Box>
          );
        },
      },
    },
    {
      name: 'credentials',
      label: t('credentials'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const provider = providers[tableMeta.rowIndex];
          if (!provider) return null;

          const credentialCount = provider.credentials?.length || 0;
          if (credentialCount === 0) {
            return (
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                }}>
                0 {t('credentialCount')}
              </Typography>
            );
          }

          return (
            <Typography
              variant="body2"
              sx={{ cursor: 'pointer', color: 'primary.main' }}
              onClick={() => setCredentialsProvider(provider)}>
              {credentialCount} {t('credentialCount')}
            </Typography>
          );
        },
      },
    },
    {
      name: 'status',
      label: t('status'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const provider = providers[tableMeta.rowIndex];
          if (!provider) return null;

          const isConnected = provider.enabled && (provider.credentials?.length || 0) > 0;
          return (
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: 'center',
              }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isConnected ? 'success.main' : 'error.main',
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {isConnected ? t('connected') : t('disconnected')}
              </Typography>
            </Stack>
          );
        },
      },
    },
    {
      name: 'enabled',
      label: t('enableStatus'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const provider = providers[tableMeta.rowIndex];
          if (!provider) return null;

          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch checked={provider.enabled} onChange={() => toggleProvider(provider)} size="small" />
            </Box>
          );
        },
      },
    },
    {
      name: 'actions',
      label: t('actions'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const provider = providers[tableMeta.rowIndex];
          if (!provider) return null;

          return (
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => handleEditProvider(provider)} sx={{ minWidth: 'auto', px: 1 }}>
                {t('edit')}
              </Button>
              <Button size="small" onClick={() => setCredentialsProvider(provider)} sx={{ minWidth: 'auto', px: 1 }}>
                {t('configureCredentials')}
              </Button>
            </Stack>
          );
        },
      },
    },
  ];

  return (
    <Box>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          gap: 2,
          flexWrap: 'wrap',
        }}>
        <Typography variant="body1">{t('aiProvidersDesc')}</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setShowForm(true);
            setEditingProvider(null);
          }}>
          {t('addProvider')}
        </Button>
      </Stack>
      <Root>
        <Table
          data={providers}
          columns={columns}
          footer={false}
          toolbar={false}
          options={{
            elevation: 0,
            rowsPerPage: 100,
            rowsPerPageOptions: [10, 25, 50],
          }}
          mobileTDFlexDirection="row"
          loading={loading}
        />
      </Root>
      {/* Add/Edit Provider Dialog */}
      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        fullWidth
        maxWidth="sm"
        title={editingProvider ? t('editProvider') : t('addProvider')}>
        <ProviderForm
          provider={editingProvider}
          onSubmit={editingProvider ? handleUpdateProvider : handleCreateProvider}
          onCancel={() => {
            setShowForm(false);
            setEditingProvider(null);
          }}
        />
      </Dialog>
      {/* Credentials Management Dialog */}
      {credentialsProvider && (
        <CredentialDialog
          provider={credentialsProvider}
          onClose={() => setCredentialsProvider(null)}
          onCredentialChange={handleCredentialChange}
        />
      )}
    </Box>
  );
}

const Root = styled(Box)`
  @media (max-width: ${({ theme }: { theme: any }) => theme.breakpoints.values.md}px) {
    .MuiTable-root > .MuiTableBody-root > .MuiTableRow-root > td.MuiTableCell-root {
      > div {
        width: fit-content;
        flex: inherit;
        font-size: 14px;
      }
    }
    .invoice-summary {
      padding-right: 20px;
    }
  }
`;
