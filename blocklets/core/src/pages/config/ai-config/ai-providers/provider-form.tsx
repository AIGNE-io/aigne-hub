import { getPrefix } from '@app/libs/util';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { FormLabel } from '@blocklet/aigne-hub/components';
import {
  Add as AddIcon,
  DeleteOutlineOutlined,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import {
  Avatar,
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { joinURL } from 'ufo';

import Collapse from '../../../../components/collapse';
import FormInput from '../../../../components/form-input';

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
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { value: 'bedrock', label: 'AWS Bedrock', region: 'us-east-1' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { value: 'google', label: 'Google AI', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/' },
  { value: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/api' },
  { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'xai', label: 'xAI', baseUrl: 'https://api.x.ai/v1' },
];

interface Props {
  provider?: any;
  onSubmit: (data: ProviderFormData) => void;
  onCancel: () => void;
}

function isValidCredentialType(value: any): value is 'api_key' | 'access_key_pair' | 'custom' {
  return ['api_key', 'access_key_pair', 'custom'].includes(value);
}

export default function ProviderForm({ provider = null, onSubmit, onCancel }: Props) {
  const { t } = useLocaleContext();
  const [credentials, setCredentials] = useState<CredentialData[]>(
    provider?.credentials?.map((cred: any) => ({
      name: cred.name || `Credential ${Math.random().toString(36).substr(2, 9)}`,
      value: cred.credentialValue || {},
      credentialType: isValidCredentialType(cred.credentialType) ? cred.credentialType : 'api_key',
    })) || [
      // When adding a provider, there is a default credential
      {
        name: 'Credential 1',
        value: '',
        credentialType: 'api_key' as const,
      },
    ]
  );
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [expandedSection, setExpandedSection] = useState<'provider' | 'credentials'>('provider');

  const methods = useForm<ProviderFormData>({
    defaultValues: {
      name: provider?.name || '',
      displayName: provider?.displayName || '',
      baseUrl: provider?.baseUrl || '',
      region: provider?.region || '',
      enabled: provider?.enabled ?? true,
      config: provider?.config || {},
    },
  });

  const { handleSubmit, watch, setValue } = methods;
  const watchedName = watch('name');

  // 当选择provider时，自动设置displayName
  const handleProviderNameChange = (value: string) => {
    const selectedProvider = PROVIDER_OPTIONS.find((option) => option.value === value);
    if (selectedProvider && !provider) {
      setValue('displayName', selectedProvider.label);
      setValue('baseUrl', selectedProvider.baseUrl);
      setValue('region', selectedProvider.region);
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
          <Box>
            <FormLabel>{t('accessKeyId')}</FormLabel>
            <TextField
              value={value.access_key_id || ''}
              onChange={(e) => updateCredential(index, 'value', { ...value, access_key_id: e.target.value })}
              placeholder="AKIAIOSFODNN7EXAMPLE"
              fullWidth
              size="small"
            />
          </Box>
          <Box>
            <FormLabel>{t('secretAccessKey')}</FormLabel>
            <TextField
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
              size="small"
            />
          </Box>
        </Stack>
      );
    }

    return (
      <Box>
        <FormLabel>{t('credentialValue')}</FormLabel>
        <TextField
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
          size="small"
        />
      </Box>
    );
  };

  return (
    <FormProvider {...methods}>
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
            <Paper elevation={0} sx={{ boxShadow: 'none' }}>
              <Stack spacing={2}>
                <FormInput
                  name="name"
                  type="custom"
                  label={t('providerName')}
                  required
                  rules={{ required: t('providerNameRequired') }}
                  render={({ field, error, hasError }) => (
                    <FormControl fullWidth error={hasError}>
                      <Select
                        {...field}
                        size="small"
                        disabled={!!provider}
                        onChange={(e) => {
                          field.onChange(e);
                          handleProviderNameChange(e.target.value as string);
                        }}>
                        {PROVIDER_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                              <Avatar
                                src={joinURL(getPrefix(), `/logo/${option.value}.png`)}
                                sx={{ width: 24, height: 24 }}
                                alt={option.label}
                              />
                              <Typography variant="body2">{option.label}</Typography>
                            </Stack>
                          </MenuItem>
                        ))}
                      </Select>
                      {hasError && <FormHelperText>{error}</FormHelperText>}
                    </FormControl>
                  )}
                />

                {/* 非bedrock时显示baseUrl */}
                {watchedName !== 'bedrock' && <FormInput name="baseUrl" label={t('baseUrl')} required />}

                {watchedName === 'bedrock' && (
                  <Stack spacing={1}>
                    <FormInput
                      name="region"
                      label={t('region')}
                      placeholder="us-east-1"
                      required
                      rules={{ required: t('regionRequired') }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',

                        a: {
                          textDecoration: 'none',
                        },
                      }}>
                      <Link href="https://docs.aws.amazon.com/general/latest/gr/bedrock.html" target="_blank">
                        {t('awsRegionDesc')}
                      </Link>
                    </Typography>
                  </Stack>
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
                  <Collapse
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${index}`}
                    value={`credential-${index}`}
                    trigger={credential.name}
                    expanded
                    addons={
                      <IconButton onClick={() => removeCredential(index)} color="error" size="small">
                        <DeleteOutlineOutlined />
                      </IconButton>
                    }>
                    <Stack spacing={2} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2, px: 2 }}>
                      <Box>
                        <FormLabel>{t('credentialName')}</FormLabel>
                        <TextField
                          value={credential.name}
                          onChange={(e) => updateCredential(index, 'name', e.target.value)}
                          size="small"
                          fullWidth
                        />
                      </Box>
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

          <Stack
            direction="row"
            spacing={2}
            sx={{
              justifyContent: 'flex-end',
            }}>
            <Button onClick={onCancel}>{t('cancel')}</Button>
            <Button variant="contained" onClick={handleSubmit(handleFormSubmit)}>
              {provider ? t('update') : t('create')}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </FormProvider>
  );
}
