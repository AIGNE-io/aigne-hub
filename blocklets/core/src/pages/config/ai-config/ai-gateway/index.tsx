import { getPrefix } from '@app/libs/util';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import {
  CloudQueue as GatewayIcon,
  CheckCircle,
  Cancel,
  OpenInNew,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useRequest } from 'ahooks';
import { useCallback, useEffect, useState } from 'react';
import { joinURL } from 'ufo';

import api from '@app/libs/api';

interface GatewaySettings {
  enabled: boolean;
  accountId: string;
  gatewayId: string;
  authToken?: string;
}

interface ProviderStatus {
  name: string;
  gatewaySlug: string | null;
  supported: boolean;
  optedOut: boolean;
  route: string;
}

interface GatewayData {
  settings: GatewaySettings;
  envFallback: { accountId: string; gatewayId: string };
  activeSource: string;
  supportedSlugs: Record<string, string>;
  providers: ProviderStatus[];
}

export default function AIGatewayConfig() {
  const { t } = useLocaleContext();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState<GatewaySettings>({
    enabled: false,
    accountId: '',
    gatewayId: '',
    authToken: '',
  });

  const {
    data,
    loading,
    refresh,
  } = useRequest<GatewayData, []>(async () => {
    const res = await api.get('/api/ai-providers/gateway-settings');
    return res.data;
  });

  useEffect(() => {
    if (data?.settings) {
      setForm({
        enabled: data.settings.enabled,
        accountId: data.settings.accountId || data.envFallback.accountId || '',
        gatewayId: data.settings.gatewayId || data.envFallback.gatewayId || '',
        authToken: data.settings.authToken || '',
      });
    }
  }, [data]);

  const handleSave = useCallback(async () => {
    if (form.enabled && (!form.accountId || !form.gatewayId)) {
      Toast.error('Account ID and Gateway ID are required');
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/ai-providers/gateway-settings', form);
      Toast.success('Gateway settings saved');
      setEditing(false);
      refresh();
    } catch (err: any) {
      Toast.error(err.response?.data?.error || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [form, refresh]);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setSaving(true);
      try {
        const newForm = { ...form, enabled };
        await api.put('/api/ai-providers/gateway-settings', newForm);
        setForm(newForm);
        Toast.success(enabled ? 'Gateway enabled' : 'Gateway disabled');
        refresh();
      } catch (err: any) {
        Toast.error(err.message || 'Failed to update');
      } finally {
        setSaving(false);
      }
    },
    [form, refresh]
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const gatewayActive = data?.settings.enabled && data?.settings.accountId;
  const supportedCount = data?.providers.filter((p) => p.supported && !p.optedOut).length || 0;
  const directCount = data?.providers.filter((p) => !p.supported || p.optedOut).length || 0;

  return (
    <Box sx={{ maxWidth: 800 }}>
      {/* Header */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <GatewayIcon sx={{ fontSize: 32, color: gatewayActive ? 'primary.main' : 'text.disabled' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            AI Gateway
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Route AI requests through Cloudflare AI Gateway for caching, analytics, and reliability
          </Typography>
        </Box>
        <Chip
          label={gatewayActive ? 'Active' : 'Inactive'}
          color={gatewayActive ? 'success' : 'default'}
          size="small"
        />
      </Stack>

      {/* Main Config Card */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2.5}>
            {/* Enable/Disable Toggle */}
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Enable Gateway
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  When enabled, supported models route through Gateway first with automatic fallback
                </Typography>
              </Box>
              <Switch
                checked={form.enabled}
                onChange={(e) => {
                  if (!editing) {
                    handleToggle(e.target.checked);
                  } else {
                    setForm((f) => ({ ...f, enabled: e.target.checked }));
                  }
                }}
                disabled={saving}
              />
            </Stack>

            <Divider />

            {/* Connection Settings */}
            <Box>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Connection
                </Typography>
                {!editing ? (
                  <Button size="small" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                ) : (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      onClick={() => {
                        setEditing(false);
                        if (data?.settings) {
                          setForm({
                            enabled: data.settings.enabled,
                            accountId: data.settings.accountId || '',
                            gatewayId: data.settings.gatewayId || '',
                            authToken: data.settings.authToken || '',
                          });
                        }
                      }}>
                      Cancel
                    </Button>
                    <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
                      {saving ? <CircularProgress size={16} /> : 'Save'}
                    </Button>
                  </Stack>
                )}
              </Stack>

              <Stack spacing={2}>
                <TextField
                  label="Account ID"
                  size="small"
                  fullWidth
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                  disabled={!editing}
                  placeholder="e.g. 7790d6810b003f5dd01c4a62db02f391"
                  helperText={
                    !editing && data?.activeSource === 'env'
                      ? 'Using value from environment variable'
                      : undefined
                  }
                />
                <TextField
                  label="Gateway ID"
                  size="small"
                  fullWidth
                  value={form.gatewayId}
                  onChange={(e) => setForm((f) => ({ ...f, gatewayId: e.target.value }))}
                  disabled={!editing}
                  placeholder="e.g. ai-gatway"
                />
                <TextField
                  label="Auth Token"
                  size="small"
                  fullWidth
                  type={showToken ? 'text' : 'password'}
                  value={form.authToken}
                  onChange={(e) => setForm((f) => ({ ...f, authToken: e.target.value }))}
                  disabled={!editing}
                  placeholder="cf-aig-authorization token (optional)"
                  helperText="Required if your Gateway has authentication enabled"
                  slotProps={{
                    input: {
                      endAdornment: (
                        <Tooltip title={showToken ? 'Hide' : 'Show'}>
                          <Box
                            component="span"
                            sx={{ cursor: 'pointer', display: 'flex' }}
                            onClick={() => setShowToken((s) => !s)}>
                            {showToken ? (
                              <VisibilityOff sx={{ fontSize: 20, color: 'text.secondary' }} />
                            ) : (
                              <Visibility sx={{ fontSize: 20, color: 'text.secondary' }} />
                            )}
                          </Box>
                        </Tooltip>
                      ),
                    },
                  }}
                />
              </Stack>
            </Box>

            {gatewayActive && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Gateway URL
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, mt: 0.5 }}>
                    https://gateway.ai.cloudflare.com/v1/{form.accountId}/{form.gatewayId}/compat/...
                  </Typography>
                </Box>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Provider Routing Status */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Provider Routing
            </Typography>
            <Stack direction="row" spacing={1}>
              <Chip
                icon={<GatewayIcon sx={{ fontSize: 14 }} />}
                label={`${supportedCount} Gateway`}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Chip label={`${directCount} Direct`} size="small" variant="outlined" />
            </Stack>
          </Stack>

          {!gatewayActive && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Enable Gateway to route supported providers through Cloudflare AI Gateway
            </Alert>
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 1,
            }}>
            {data?.providers.map((provider) => (
              <Stack
                key={provider.name}
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: gatewayActive && provider.route === 'gateway' ? 'primary.50' : 'transparent',
                }}>
                <Avatar
                  src={joinURL(getPrefix(), `/logo/${provider.name}.png`)}
                  sx={{ width: 24, height: 24 }}
                  alt={provider.name}
                />
                <Typography variant="body2" sx={{ flex: 1, textTransform: 'capitalize' }}>
                  {provider.name}
                </Typography>
                {provider.supported && !provider.optedOut ? (
                  <Tooltip title={gatewayActive ? `Gateway (${provider.gatewaySlug})` : 'Gateway supported'}>
                    <GatewayIcon
                      sx={{
                        fontSize: 16,
                        color: gatewayActive ? 'primary.main' : 'text.disabled',
                      }}
                    />
                  </Tooltip>
                ) : provider.optedOut ? (
                  <Tooltip title="Opted out (uses own credentials)">
                    <Cancel sx={{ fontSize: 16, color: 'text.disabled' }} />
                  </Tooltip>
                ) : (
                  <Tooltip title="Not supported by Gateway">
                    <Typography variant="caption" color="text.secondary">
                      Direct
                    </Typography>
                  </Tooltip>
                )}
              </Stack>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
