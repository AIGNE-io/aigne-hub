import { Toast } from '@arcblock/ux';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

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
}

const CREDENTIAL_TYPE_OPTIONS = [
  { value: 'api_key', label: 'API Key' },
  { value: 'access_key_pair', label: 'Access Key Pair' },
  { value: 'custom', label: 'Custom' },
];

interface CredentialFormProps {
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
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  // 根据provider类型设置默认凭证类型
  const getDefaultCredentialType = () => {
    if (provider?.name === 'bedrock') {
      return 'access_key_pair';
    }
    return initialData.credentialType || 'api_key';
  };

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CredentialFormData>({
    defaultValues: {
      name: initialData.name || 'Credential 1',
      value: initialData.value || (provider?.name === 'bedrock' ? { access_key_id: '', secret_access_key: '' } : ''),
      credentialType: getDefaultCredentialType(),
    },
  });

  const credentialType = watch('credentialType');

  const handleFormSubmit = async (data: CredentialFormData) => {
    setLoading(true);
    try {
      await onSubmit(data);
    } catch (error: any) {
      Toast.error(error.message || t('submitFailed'));
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPassword((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  const renderValueFields = () => {
    if (credentialType === 'access_key_pair') {
      return (
        <Stack spacing={2}>
          <Controller
            name="value"
            control={control}
            rules={{ required: t('credentialValueRequired') }}
            render={({ field }) => {
              const value = (field.value as CredentialValue) || {};
              return (
                <Stack spacing={2}>
                  <TextField
                    label={t('accessKeyId')}
                    value={value.access_key_id || ''}
                    onChange={(e) => field.onChange({ ...value, access_key_id: e.target.value })}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    error={!!errors.value}
                    fullWidth
                  />
                  <TextField
                    label={t('secretAccessKey')}
                    value={value.secret_access_key || ''}
                    onChange={(e) => field.onChange({ ...value, secret_access_key: e.target.value })}
                    type={showPassword.secret_access_key ? 'text' : 'password'}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    slotProps={{
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
                    error={!!errors.value}
                    fullWidth
                  />
                </Stack>
              );
            }}
          />
        </Stack>
      );
    }

    return (
      <Controller
        name="value"
        control={control}
        rules={{ required: t('credentialValueRequired') }}
        render={({ field }) => (
          <TextField
            {...field}
            label={t('credentialValue')}
            type={showPassword.value ? 'text' : 'password'}
            placeholder={credentialType === 'api_key' ? 'sk-...' : t('enterCredentialValue')}
            slotProps={{
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
            error={!!errors.value}
            helperText={errors.value?.message}
            fullWidth
          />
        )}
      />
    );
  };

  const formContent = (
    <>
      <Controller
        name="name"
        control={control}
        rules={{ required: t('credentialNameRequired') }}
        render={({ field }) => (
          <TextField
            {...field}
            label={t('credentialName')}
            error={!!errors.name}
            helperText={errors.name?.message}
            fullWidth
          />
        )}
      />

      {!provider && (
        <Controller
          name="credentialType"
          control={control}
          rules={{ required: t('credentialTypeRequired') }}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.credentialType}>
              <InputLabel>{t('credentialType')}</InputLabel>
              <Select {...field} label={t('credentialType')}>
                {CREDENTIAL_TYPE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
              {errors.credentialType && <FormHelperText>{errors.credentialType.message}</FormHelperText>}
            </FormControl>
          )}
        />
      )}

      {renderValueFields()}

      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <Button onClick={onCancel} disabled={loading}>
          {t('cancel')}
        </Button>
        <Button type="submit" variant="contained" disabled={loading}>
          {isEdit ? t('update') : t('create')}
        </Button>
      </Stack>
    </>
  );

  return (
    <Box component="form" onSubmit={handleSubmit(handleFormSubmit)}>
      <Stack spacing={3} sx={{ py: 1 }}>
        {formContent}
      </Stack>
    </Box>
  );
}
