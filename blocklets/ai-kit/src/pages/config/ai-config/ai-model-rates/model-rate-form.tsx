import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import FormInput from '../../../../components/form-input';
import { useSessionContext } from '../../../../contexts/session';
import { ModelRate, ModelRateFormData, Provider } from './types';

interface Props {
  rate?: ModelRate | null;
  onSubmit: (data: ModelRateFormData) => void;
  onCancel: () => void;
}

export default function ModelRateForm({ rate = null, onSubmit, onCancel }: Props) {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const methods = useForm<ModelRateFormData>({
    defaultValues: {
      modelName: rate?.model || '',
      modelDisplay: rate?.modelDisplay || '',
      rateType: rate?.type || 'text',
      inputRate: rate?.inputRate || 0,
      outputRate: rate?.outputRate || 0,
      description: rate?.description || '',
      providers: [],
    },
  });

  const { handleSubmit, watch, setValue } = methods;
  const modelName = watch('modelName');
  const modelDisplay = watch('modelDisplay');
  // 获取提供商列表
  const fetchProviders = async () => {
    try {
      const response = await api.get('/api/ai-providers');
      const enabledProviders = (response.data || []).filter((provider: Provider) => provider.enabled);
      setProviders(enabledProviders);
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    }
  };

  useEffect(() => {
    fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 表单提交
  const onFormSubmit = (data: ModelRateFormData) => {
    if (!rate && selectedProviders.length === 0) {
      return;
    }
    onSubmit({
      ...data,
      providers: rate ? [rate.provider.id] : selectedProviders,
    });
  };

  return (
    <Box sx={{ p: 1 }}>
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Stack spacing={3}>
            <Stack spacing={2}>
              <FormInput
                name="modelName"
                label={t('config.modelRates.form.modelName.label')}
                placeholder={t('config.modelRates.form.modelName.placeholder')}
                required
                disabled={!!rate}
                rules={{ required: t('config.modelRates.form.modelName.required') }}
                sx={{ flex: 1 }}
                onBlur={() => {
                  if (modelName && !modelDisplay) {
                    setValue('modelDisplay', modelName);
                    const displayName = modelName.split('/').pop();
                    if (displayName) {
                      const formattedName = displayName
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, (char) => char.toUpperCase());
                      setValue('modelDisplay', formattedName);
                    }
                  }
                }}
              />
              <FormInput
                name="modelDisplay"
                label={t('config.modelRates.form.modelDisplay.label')}
                placeholder={t('config.modelRates.form.modelDisplay.placeholder')}
                tooltip={t('config.modelRates.form.modelDisplay.description')}
                sx={{ flex: 1 }}
              />
            </Stack>

            <Box>
              <FormInput
                name="rateType"
                type="custom"
                label={t('config.modelRates.form.rateType.label')}
                required
                rules={{ required: t('config.modelRates.form.rateType.required') }}
                render={({ field, error, hasError }) => (
                  <FormControl error={hasError} disabled={!!rate} fullWidth>
                    <Select {...field} size="small">
                      <MenuItem value="chatCompletion">
                        {t('config.modelRates.form.rateType.options.chatCompletion')}
                      </MenuItem>
                      <MenuItem value="imageGeneration">
                        {t('config.modelRates.form.rateType.options.imageGeneration')}
                      </MenuItem>
                      <MenuItem value="embedding">{t('config.modelRates.form.rateType.options.embedding')}</MenuItem>
                    </Select>
                    {hasError && <FormHelperText>{error}</FormHelperText>}
                  </FormControl>
                )}
              />
            </Box>

            {!rate ? (
              <FormInput
                name="providers"
                type="custom"
                label={t('config.modelRates.form.providers.label')}
                tooltip={t('config.modelRates.form.providers.tooltip')}
                required
                rules={{
                  validate: () => selectedProviders.length > 0 || t('config.modelRates.form.providers.required'),
                }}
                render={({ error, hasError }) => (
                  <Autocomplete
                    size="small"
                    multiple
                    limitTags={3}
                    options={providers}
                    getOptionLabel={(option) => option.displayName}
                    value={providers.filter((provider) => selectedProviders.includes(provider.id))}
                    onChange={(_, newValue) => {
                      setSelectedProviders(newValue.map((provider) => provider.id));
                    }}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          variant="outlined"
                          label={option.displayName}
                          {...getTagProps({ index })}
                          key={option.id}
                        />
                      ))
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder={selectedProviders.length === 0 ? t('selectProviders') : ''}
                        error={hasError}
                        helperText={hasError ? error : ''}
                      />
                    )}
                  />
                )}
              />
            ) : (
              <FormInput
                name="provider"
                label={t('config.modelRates.fields.provider')}
                value={rate.provider.displayName}
                disabled
              />
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormInput
                name="inputRate"
                label={t('config.modelRates.form.inputRate.label')}
                placeholder={t('config.modelRates.form.inputRate.placeholder')}
                required
                rules={{
                  required: t('config.modelRates.form.inputRate.required'),
                  min: { value: 0, message: 'Must be >= 0' },
                }}
                slotProps={{
                  htmlInput: {
                    type: 'number',
                    step: 0.001,
                    min: 0,
                  },
                }}
                sx={{ flex: 1 }}
              />

              <FormInput
                name="outputRate"
                label={t('config.modelRates.form.outputRate.label')}
                placeholder={t('config.modelRates.form.outputRate.placeholder')}
                required
                rules={{
                  required: t('config.modelRates.form.outputRate.required'),
                  min: { value: 0, message: 'Must be >= 0' },
                }}
                slotProps={{
                  htmlInput: {
                    type: 'number',
                    step: 0.001,
                    min: 0,
                  },
                }}
                sx={{ flex: 1 }}
              />
            </Stack>

            {/* 第五行：描述 */}
            <FormInput
              name="description"
              label={t('config.modelRates.form.description.label')}
              placeholder={t('config.modelRates.form.description.placeholder')}
              multiline
              rows={2}
            />

            {/* 操作按钮 */}
            <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
              <Button onClick={onCancel} color="inherit">
                {t('config.modelRates.actions.cancel')}
              </Button>
              <Button type="submit" variant="contained">
                {rate ? t('config.modelRates.actions.save') : t('config.modelRates.actions.save')}
              </Button>
            </Stack>
          </Stack>
        </form>
      </FormProvider>
    </Box>
  );
}
