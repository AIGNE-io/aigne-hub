import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import Collapse from '../../../../components/collapse';

export interface CredentialValue {
  access_key_id?: string;
  secret_access_key?: string;
  api_key?: string;
  [key: string]: any;
}

export interface CredentialData {
  name: string;
  value: CredentialValue | string;
  credentialType: 'api_key' | 'access_key_pair' | 'custom';
}

export interface ProviderFormData {
  name: string;
  displayName: string;
  baseUrl?: string;
  region?: string;
  enabled: boolean;
  config?: Record<string, any>;
  credentials?: CredentialData[];
}

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openRouter', label: 'OpenRouter' },
  { value: 'xai', label: 'xAI' },
];

interface Props {
  provider?: any;
  onSubmit: (data: ProviderFormData) => void;
  onCancel: () => void;
}

export default function ProviderForm({ provider = null, onSubmit, onCancel }: Props) {
  const { t } = useLocaleContext();
  const [credentials, setCredentials] = useState<CredentialData[]>(
    provider?.credentials?.map((cred: any) => ({
      name: cred.name || `Credential ${Math.random().toString(36).substr(2, 9)}`,
      value: cred.credentialValue || {},
      credentialType: (cred.credentialType || 'api_key') as 'api_key' | 'access_key_pair' | 'custom',
    })) || [
      // 添加提供商时默认有一个凭证
      {
        name: 'Credential 1',
        value: '',
        credentialType: 'api_key' as const,
      },
    ]
  );
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [expandedSection, setExpandedSection] = useState<'provider' | 'credentials'>('provider');

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProviderFormData>({
    defaultValues: {
      name: provider?.name || '',
      displayName: provider?.displayName || '',
      baseUrl: provider?.baseUrl || '',
      region: provider?.region || '',
      enabled: provider?.enabled ?? true,
      config: provider?.config || {},
    },
  });

  const watchedName = watch('name');

  // 当选择provider时，自动设置displayName
  const handleProviderNameChange = (value: string) => {
    const selectedProvider = PROVIDER_OPTIONS.find((option) => option.value === value);
    if (selectedProvider && !provider) {
      setValue('displayName', selectedProvider.label);
    }

    // 如果是bedrock，设置默认凭证类型为access_key_pair
    if (value === 'bedrock' && credentials.length > 0) {
      const updatedCredentials = credentials.map((cred) => ({
        ...cred,
        credentialType: 'access_key_pair' as const,
        value: { access_key_id: '', secret_access_key: '' },
      }));
      setCredentials(updatedCredentials);
    }
  };

  const handleFormSubmit = (data: ProviderFormData) => {
    const formData = {
      ...data,
      credentials: credentials.filter((cred) => {
        if (cred.credentialType === 'access_key_pair') {
          const value = cred.value as CredentialValue;
          return value.access_key_id && value.secret_access_key;
        }
        return cred.value && (typeof cred.value === 'string' ? cred.value.trim() : Object.keys(cred.value).length > 0);
      }),
    };
    onSubmit(formData);
  };

  const addCredential = () => {
    const newCredential: CredentialData = {
      name: `Credential ${credentials.length + 1}`,
      value: watchedName === 'bedrock' ? { access_key_id: '', secret_access_key: '' } : '',
      credentialType: watchedName === 'bedrock' ? 'access_key_pair' : 'api_key',
    };
    setCredentials([...credentials, newCredential]);
  };

  const removeCredential = (index: number) => {
    setCredentials(credentials.filter((_, i) => i !== index));
  };

  const updateCredential = (index: number, field: keyof CredentialData, value: any) => {
    const newCredentials = [...credentials];
    newCredentials[index] = { ...newCredentials[index], [field]: value } as CredentialData;
    setCredentials(newCredentials);
  };

  const togglePasswordVisibility = (credentialIndex: number, fieldName: string) => {
    const key = `${credentialIndex}-${fieldName}`;
    setShowPasswordMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderCredentialFields = (credential: CredentialData, index: number) => {
    if (credential.credentialType === 'access_key_pair') {
      const value = credential.value as CredentialValue;
      return (
        <Stack spacing={2}>
          <TextField
            label={t('accessKeyId')}
            value={value.access_key_id || ''}
            onChange={(e) => updateCredential(index, 'value', { ...value, access_key_id: e.target.value })}
            placeholder="AKIAIOSFODNN7EXAMPLE"
            fullWidth
          />
          <TextField
            label={t('secretAccessKey')}
            value={value.secret_access_key || ''}
            onChange={(e) => updateCredential(index, 'value', { ...value, secret_access_key: e.target.value })}
            type={showPasswordMap[`${index}-secret_access_key`] ? 'text' : 'password'}
            placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => togglePasswordVisibility(index, 'secret_access_key')}>
                      {showPasswordMap[`${index}-secret_access_key`] ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            fullWidth
          />
        </Stack>
      );
    }

    return (
      <TextField
        label={t('credentialValue')}
        value={credential.value as string}
        onChange={(e) => updateCredential(index, 'value', e.target.value)}
        type={showPasswordMap[`${index}-value`] ? 'text' : 'password'}
        placeholder={credential.credentialType === 'api_key' ? 'sk-...' : t('enterCredentialValue')}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => togglePasswordVisibility(index, 'value')}>
                  {showPasswordMap[`${index}-value`] ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
        fullWidth
      />
    );
  };

  return (
    <Box>
      <Stack spacing={3}>
        <Collapse
          expanded={expandedSection === 'provider'}
          value="provider"
          onChange={(_, expanded) => {
            if (expanded) {
              setExpandedSection('provider');
            }
          }}
          card
          trigger={t('providerInfo')}>
          <Paper elevation={0}>
            <Stack spacing={2}>
              <Controller
                name="name"
                control={control}
                disabled={!!provider}
                rules={{ required: t('providerNameRequired') }}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.name}>
                    <InputLabel>{t('providerName')}</InputLabel>
                    <Select
                      {...field}
                      label={t('providerName')}
                      onChange={(e) => {
                        field.onChange(e);
                        handleProviderNameChange(e.target.value as string);
                      }}>
                      {PROVIDER_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.name && <FormHelperText>{errors.name.message}</FormHelperText>}
                  </FormControl>
                )}
              />

              {/* 非bedrock时显示baseUrl */}
              {watchedName !== 'bedrock' && (
                <Controller
                  name="baseUrl"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={t('baseUrl')}
                      error={!!errors.baseUrl}
                      helperText={errors.baseUrl?.message}
                      fullWidth
                    />
                  )}
                />
              )}

              {watchedName === 'bedrock' && (
                <Controller
                  name="region"
                  control={control}
                  rules={{ required: t('regionRequired') }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={t('region')}
                      error={!!errors.region}
                      helperText={errors.region?.message}
                      placeholder="us-east-1"
                      fullWidth
                    />
                  )}
                />
              )}
            </Stack>
          </Paper>
        </Collapse>

        {/* 只在添加模式下显示凭证部分 */}
        {!provider && (
          <Collapse
            expanded={expandedSection === 'credentials'}
            value="credentials"
            onChange={(_, expanded) => {
              if (expanded) {
                setExpandedSection('credentials');
              }
            }}
            card
            trigger={
              expandedSection === 'credentials' ? t('credentials') : `${t('credentials')} (${credentials.length})`
            }>
            <Stack spacing={2} sx={{ px: 2 }}>
              {credentials.map((credential, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Collapse key={index} value={`credential-${index}`} trigger={credential.name} expanded>
                  <Stack spacing={2} sx={{ p: 2 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <TextField
                        label={t('credentialName')}
                        value={credential.name}
                        onChange={(e) => updateCredential(index, 'name', e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                      />
                      <IconButton onClick={() => removeCredential(index)} color="error" size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Stack>

                    {renderCredentialFields(credential, index)}
                  </Stack>
                </Collapse>
              ))}

              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addCredential}
                sx={{ alignSelf: 'flex-start' }}>
                {t('addCredential')}
              </Button>
            </Stack>
          </Collapse>
        )}

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit(handleFormSubmit)}>
            {provider ? t('update') : t('create')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
