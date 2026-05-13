import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import FormInput from '../../../../components/form-input';
import { useSessionContext } from '../../../../contexts/session';

export interface CredentialValue {
  access_key_id?: string;
  secret_access_key?: string;
  api_key?: string;
  [key: string]: any;
}

export interface CredentialFormData {
  name: string;
  value: string | CredentialValue;
  credentialType: 'api_key' | 'access_key_pair' | 'custom';
  testModel?: string;
}

const CREDENTIAL_TYPE_OPTIONS = [
  { value: 'api_key', label: 'API Key' },
  { value: 'access_key_pair', label: 'Access Key Pair' },
  { value: 'custom', label: 'Custom' },
];

interface CredentialFormProps {
  loadingCredentials?: boolean;
  initialData?: Partial<CredentialFormData>;
  onSubmit: (data: CredentialFormData) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
  provider?: any;
  hideTitle?: boolean;
}

export default function CredentialForm({
  initialData = {},
  onSubmit,
  onCancel,
  isEdit = false,
  provider = null,
}: CredentialFormProps) {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [testModel, setTestModel] = useState('');
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  // Fetch default test model for this provider
  useEffect(() => {
    if (provider?.name) {
      api
        .get('/api/ai-providers/test-models')
        .then((res: any) => {
          const model = res.data?.[provider.name] || '';
          setTestModel(model);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.name]);

  // 根据provider类型设置默认凭证类型
  const getDefaultCredentialType = () => {
    if (provider?.name === 'bedrock') {
      return 'access_key_pair';
    }
    return initialData.credentialType || 'api_key';
  };

  const methods = useForm<CredentialFormData>({
    defaultValues: {
      name: initialData.name || 'Credential 1',
      value: initialData.value || (provider?.name === 'bedrock' ? { access_key_id: '', secret_access_key: '' } : ''),
      credentialType: getDefaultCredentialType(),
    },
  });

  const { handleSubmit, watch } = methods;
  const credentialType = watch('credentialType');

  const handleFormSubmit = async (data: CredentialFormData) => {
    setLoading(true);
    try {
      await onSubmit({ ...data, testModel: testModel || undefined });
    } catch (error: any) {
      Toast.error(error.message || t('submitFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const isValid = await methods.trigger();
    if (!isValid) return;

    const data = methods.getValues();
    setTesting(true);
    setTestResult(null);
    try {
      await api.post(`/api/ai-providers/${provider.id}/credentials/test`, {
        value: data.value,
        credentialType: data.credentialType,
        testModel: testModel || undefined,
      });
      setTestResult({ success: true });
      Toast.success(t('testConnectionSuccess'));
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error.message || t('testConnectionFailed');
      setTestResult({ success: false, error: detail });
    } finally {
      setTesting(false);
    }
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPassword((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const renderValueFields = () => {
    if (credentialType === 'access_key_pair') {
      return (
        <Stack spacing={2}>
          <FormInput
            name="value.access_key_id"
            label={t('accessKeyId')}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            required
            rules={{ required: t('credentialValueRequired') }}
          />
          <FormInput
            name="value.secret_access_key"
            label={t('secretAccessKey')}
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            required
            rules={{ required: t('credentialValueRequired') }}
            slotProps={{
              htmlInput: {
                type: showPassword.secret_access_key ? 'text' : 'password',
              },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => togglePasswordVisibility('secret_access_key')}>
                      {showPassword.secret_access_key ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Stack>
      );
    }

    return (
      <FormInput
        name="value"
        label={t('credentialValue')}
        placeholder={credentialType === 'api_key' ? 'sk-...' : t('enterCredentialValue')}
        required
        rules={{ required: t('credentialValueRequired') }}
        slotProps={{
          htmlInput: {
            type: showPassword.value ? 'text' : 'password',
          },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => togglePasswordVisibility('value')}>
                  {showPassword.value ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    );
  };

  return (
    <FormProvider {...methods}>
      <Box component="form" onSubmit={handleSubmit(handleFormSubmit)}>
        <Stack spacing={3} sx={{ py: 1 }}>
          <FormInput
            name="name"
            label={t('credentialName')}
            required
            rules={{ required: t('credentialNameRequired') }}
          />

          {!provider && (
            <FormInput
              name="credentialType"
              type="custom"
              label={t('credentialType')}
              required
              rules={{ required: t('credentialTypeRequired') }}
              render={({ field, error, hasError }) => (
                <FormControl fullWidth error={hasError}>
                  <Select {...field} size="small">
                    {CREDENTIAL_TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                  {hasError && <FormHelperText>{error}</FormHelperText>}
                </FormControl>
              )}
            />
          )}

          {renderValueFields()}

          {provider && (
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  label={t('testModel')}
                  value={testModel}
                  onChange={(e) => setTestModel(e.target.value)}
                  helperText={t('testModelHelp')}
                  fullWidth
                />
                <Button
                  variant="outlined"
                  onClick={handleTestConnection}
                  disabled={testing || loading}
                  sx={{ whiteSpace: 'nowrap', minWidth: 'auto', mt: '1px !important' }}>
                  {testing ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                  {t('testConnection')}
                </Button>
              </Stack>
              {testResult && !testResult.success && (
                <Typography variant="body2" sx={{ color: 'error.main', fontSize: 12, mt: 1 }}>
                  {testResult.error}
                </Typography>
              )}
            </Box>
          )}

          <Stack
            direction="row"
            spacing={2}
            sx={{
              justifyContent: 'flex-end',
            }}>
            <Button onClick={onCancel} disabled={loading}>
              {t('cancel')}
            </Button>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? (
                <>
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                  {t('loading')}
                </>
              ) : isEdit ? (
                t('update')
              ) : (
                t('create')
              )}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </FormProvider>
  );
}
