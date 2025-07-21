import { getPrefix } from '@app/libs/util';
/* eslint-disable react-hooks/exhaustive-deps */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { InfoOutlined } from '@mui/icons-material';
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { joinURL } from 'ufo';

import FormInput from '../../../../components/form-input';
import { useSessionContext } from '../../../../contexts/session';
import { ModelOption, ModelRate, ModelRateFormData, Provider } from './types';
import { filterModelsByProviders, searchModels, useModelData } from './use-model-data';

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
  const [modelInputValue, setModelInputValue] = useState('');

  // 从 blocklet preferences 获取配置
  const baseCreditPrice = window.blocklet?.preferences?.baseCreditPrice || 0.00000025;
  const targetProfitMargin = window.blocklet?.preferences?.targetProfitMargin || 2;

  const { modelOptions: allModelOptions, loading: modelDataLoading, fetchModelData } = useModelData();

  const availableModelOptions = useMemo(() => {
    return filterModelsByProviders(allModelOptions, providers);
  }, [allModelOptions, providers]);

  const searchableModelOptions = useMemo(() => {
    return searchModels(availableModelOptions, modelInputValue);
  }, [availableModelOptions, modelInputValue]);

  // 在 searchableModelOptions 的基础上添加自定义选项
  const optionsWithCustom = useMemo(() => {
    const options = [...searchableModelOptions];

    // 如果用户输入了内容，但没有完全匹配的选项，添加"创建自定义模型"选项
    if (modelInputValue && !options.find((option) => option.name.toLowerCase() === modelInputValue.toLowerCase())) {
      options.unshift({
        name: modelInputValue,
        displayName: modelInputValue, // 不要把 "Create" 放到 displayName 里
        provider: 'custom',
        inputCost: undefined,
        outputCost: undefined,
        maxTokens: undefined,
        supportsVision: false,
        supportsFunctionCalling: false,
        isCustom: true, // 标记为自定义选项
      } as ModelOption & { isCustom: true });
    }

    return options;
  }, [searchableModelOptions, modelInputValue]);

  const methods = useForm<ModelRateFormData>({
    defaultValues: {
      modelName: rate?.model || '',
      modelDisplay: rate?.modelDisplay || '',
      rateType: rate?.type || 'chatCompletion',
      inputRate: rate?.inputRate || 0,
      outputRate: rate?.outputRate || 0,
      description: rate?.description || '',
      providers: [],
      unitCosts: {
        input: rate?.unitCosts?.input || 0,
        output: rate?.unitCosts?.output || 0,
      },
    },
  });

  const { handleSubmit, watch, setValue } = methods;
  const modelDisplay = watch('modelDisplay');
  const selectedModel = watch('modelName');
  const inputRate = watch('inputRate');
  const outputRate = watch('outputRate');

  // 获取当前选中模型的成本信息
  const selectedModelOption = useMemo(() => {
    return availableModelOptions.find((option) => option.name === selectedModel);
  }, [availableModelOptions, selectedModel]);

  // 计算预估收益率
  const calculateProfitRate = useCallback(
    (rate: number, actualCost: number) => {
      if (!actualCost || actualCost <= 0) return 0;
      return ((rate * baseCreditPrice - actualCost) / actualCost) * 100;
    },
    [baseCreditPrice]
  );

  // 自动计算费率的函数
  const autoCalculateRates = useCallback(() => {
    // 从当前选择的模型中查找成本信息
    const modelOption = availableModelOptions.find((option) => option.name === selectedModel);
    if (modelOption && modelOption.inputCost !== undefined && modelOption.outputCost !== undefined) {
      const calculatedInputRate = (modelOption.inputCost * (1 + targetProfitMargin / 100)) / baseCreditPrice;
      const calculatedOutputRate = (modelOption.outputCost * (1 + targetProfitMargin / 100)) / baseCreditPrice;

      setValue('inputRate', Number(calculatedInputRate.toFixed(6)));
      setValue('outputRate', Number(calculatedOutputRate.toFixed(6)));
    }
  }, [selectedModel, availableModelOptions, targetProfitMargin, baseCreditPrice, setValue]);

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
    fetchModelData();
  }, []);

  useEffect(() => {
    if (rate?.model) {
      setModelInputValue(rate.model);
    }
  }, [rate?.model]);

  const handleModelChange = (value: string | ModelOption | null) => {
    if (typeof value === 'string') {
      // 用户输入的自定义值
      setValue('modelName', value);
      setModelInputValue(value);

      // 自动生成显示名称
      if (value && !modelDisplay) {
        const displayName = value.split('/').pop();
        if (displayName) {
          const formattedName = displayName.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
          setValue('modelDisplay', formattedName);
        }
      }
    } else if (value && typeof value === 'object') {
      // 用户选择的模型选项
      setValue('modelName', value.name);
      setValue('modelDisplay', value.displayName);
      setModelInputValue(value.name);
      setValue('rateType', value.mode as any);
      setValue('unitCosts', {
        input: value.inputCost || 0,
        output: value.outputCost || 0,
      });
      const provider = providers.find((p) => p.name === value.provider);
      if (provider) {
        setSelectedProviders([provider.id]);
      }

      if (value.inputCost !== undefined) {
        const calculatedInputRate = (value.inputCost * (1 + targetProfitMargin / 100)) / baseCreditPrice;
        setValue('inputRate', Number(calculatedInputRate.toFixed(6)));
      } else {
        setValue('inputRate', 0);
      }
      if (value.outputCost !== undefined) {
        const calculatedOutputRate = (value.outputCost * (1 + targetProfitMargin / 100)) / baseCreditPrice;
        setValue('outputRate', Number(calculatedOutputRate.toFixed(6)));
      } else {
        setValue('outputRate', 0);
      }
    } else {
      // 清空
      setValue('modelName', '');
      setModelInputValue('');
    }
  };

  // 处理用户输入但没有选择选项的情况
  const handleInputBlur = () => {
    if (modelInputValue && !searchableModelOptions.find((option) => option.name === modelInputValue)) {
      // 用户输入了自定义模型名称
      setValue('modelName', modelInputValue);

      // 自动生成显示名称
      if (!modelDisplay) {
        const displayName = modelInputValue.split('/').pop();
        if (displayName) {
          const formattedName = displayName.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
          setValue('modelDisplay', formattedName);
        }
      }
    }
  };

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
                type="custom"
                label={t('config.modelRates.form.modelName.label')}
                required
                rules={{ required: t('config.modelRates.form.modelName.required') }}
                render={({ field, error, hasError }) => (
                  <Autocomplete
                    {...field}
                    freeSolo
                    loading={modelDataLoading}
                    disabled={!!rate}
                    options={optionsWithCustom}
                    getOptionLabel={(option) => {
                      if (typeof option === 'string') return option;
                      return option.name;
                    }}
                    renderOption={(props, option) => (
                      <Box component="li" {...props}>
                        <Stack sx={{ width: '100%' }}>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {(option as any).isCustom ? (
                              <span style={{ color: 'primary.main' }}>✨ {option.name}</span>
                            ) : (
                              option.name
                            )}
                          </Typography>
                          {!(option as any).isCustom && (
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                              <Avatar
                                src={joinURL(getPrefix(), `/logo/${option.provider}.png`)}
                                sx={{ width: 24, height: 24 }}
                                alt={option.provider}
                              />
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {option.provider}
                                {option.inputCost && option.outputCost && (
                                  <>
                                    {' '}
                                    • Input: ${option.inputCost} / Output: ${option.outputCost}
                                  </>
                                )}
                              </Typography>
                            </Stack>
                          )}
                        </Stack>
                      </Box>
                    )}
                    inputValue={modelInputValue}
                    onInputChange={(_, newInputValue) => {
                      setModelInputValue(newInputValue);
                    }}
                    onChange={(_, newValue) => {
                      handleModelChange(newValue);
                    }}
                    onBlur={handleInputBlur} // 添加失去焦点处理
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder={t('config.modelRates.form.modelName.placeholder')}
                        error={hasError}
                        helperText={hasError ? error : ''} // 移除 model found 的提示
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && modelInputValue) {
                            // 用户按 Enter 键创建自定义模型
                            handleModelChange(modelInputValue);
                          }
                        }}
                      />
                    )}
                    filterOptions={(options) => {
                      // 如果没有匹配的选项，显示提示
                      if (options.length === 0 && modelInputValue) {
                        return [];
                      }
                      return options.slice(0, 50);
                    }}
                  />
                )}
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
                    renderValue={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          variant="outlined"
                          label={option.displayName}
                          {...getTagProps({ index })}
                          key={option.id}
                        />
                      ))
                    }
                    renderOption={(props, option) => (
                      <Box component="li" {...props}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Avatar
                            src={joinURL(getPrefix(), `/logo/${option.name}.png`)}
                            sx={{ width: 24, height: 24 }}
                            alt={option.displayName}
                          />
                          <Typography variant="body2">{option.displayName}</Typography>
                        </Stack>
                      </Box>
                    )}
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

            {/* Credit Rates 配置框 */}
            <Box
              sx={{
                p: 3,
                bgcolor: 'background.paper',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: 1,
              }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  alignItems: 'center',
                  mb: 2,
                }}>
                <Typography variant="h6" sx={{ flex: 1, fontWeight: 600, cursor: 'help', display: 'flex', gap: 1 }}>
                  {t('config.modelRates.configInfo.aicRateConfig')}
                  <Tooltip
                    title={
                      <Box>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          <strong>{t('config.modelRates.configInfo.title')}</strong>
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          {t('config.modelRates.configInfo.creditValue')}
                          {baseCreditPrice}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          {t('config.modelRates.configInfo.profitMargin')}
                          {targetProfitMargin}%
                        </Typography>
                        <Typography variant="body2">
                          {t('config.modelRates.configInfo.adjustSettings')}{' '}
                          <Button
                            size="small"
                            variant="text"
                            component={Link}
                            to="/.well-known/service/admin/overview/components"
                            target="_blank">
                            {t('config.modelRates.configInfo.settingsLink')}
                          </Button>
                        </Typography>
                      </Box>
                    }
                    slotProps={{
                      tooltip: {
                        sx: {
                          bgcolor: 'background.paper',
                          color: 'text.primary',
                          boxShadow: 2,
                          padding: '10px 16px',
                          maxWidth: 480,
                          minWidth: 350,
                          wordBreak: 'break-word',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 2,
                        },
                      },
                    }}
                    placement="right">
                    <InfoOutlined fontSize="small" sx={{ opacity: 0.7, fontSize: '1rem' }} />
                  </Tooltip>
                </Typography>

                <Button
                  size="small"
                  variant="outlined"
                  onClick={autoCalculateRates}
                  disabled={
                    !selectedModel || !availableModelOptions.find((option) => option.name === selectedModel)?.inputCost
                  }
                  sx={{
                    minWidth: 'auto',
                    px: 2,
                    py: 0.5,
                    fontSize: '0.75rem',
                    textTransform: 'none',
                  }}>
                  {t('config.modelRates.configInfo.autoCalculate')}
                </Button>
              </Stack>

              {/* Input 和 Output 框 */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                <Box sx={{ flex: 1 }}>
                  <FormInput
                    name="inputRate"
                    label={t('config.modelRates.fields.inputRate')}
                    description={t('config.modelRates.configInfo.inputTokenConsumption')}
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
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'background.default',
                      },
                    }}
                  />

                  {selectedModelOption?.inputCost && (
                    <Box
                      sx={{
                        mt: 1,
                        p: 1,
                        bgcolor: 'background.default',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('config.modelRates.configInfo.currentModelCost')}: ${selectedModelOption.inputCost}
                        {t('config.modelRates.configInfo.perToken')}
                      </Typography>
                      {inputRate > 0 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color:
                              calculateProfitRate(inputRate, selectedModelOption.inputCost) >= 0
                                ? 'success.main'
                                : 'error.main',
                            display: 'block',
                            fontWeight: 500,
                          }}>
                          {t('config.modelRates.configInfo.estimatedProfitRate')}:{' '}
                          {calculateProfitRate(inputRate, selectedModelOption.inputCost).toFixed(1)}%
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>

                <Box sx={{ flex: 1 }}>
                  <FormInput
                    name="outputRate"
                    label={t('config.modelRates.fields.outputRate')}
                    required
                    description={t('config.modelRates.configInfo.outputTokenConsumption')}
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
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: 'background.default',
                      },
                    }}
                  />

                  {selectedModelOption?.outputCost && (
                    <Box
                      sx={{
                        mt: 1,
                        p: 1,
                        bgcolor: 'background.default',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t('config.modelRates.configInfo.currentModelCost')}: ${selectedModelOption.outputCost}
                        {t('config.modelRates.configInfo.perToken')}
                      </Typography>
                      {outputRate > 0 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color:
                              calculateProfitRate(outputRate, selectedModelOption.outputCost) >= 0
                                ? 'success.main'
                                : 'error.main',
                            display: 'block',
                            fontWeight: 500,
                          }}>
                          {t('config.modelRates.configInfo.estimatedProfitRate')}:{' '}
                          {calculateProfitRate(outputRate, selectedModelOption.outputCost).toFixed(1)}%
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              </Stack>
            </Box>

            {/* 第五行：描述 */}
            <FormInput
              name="description"
              label={t('config.modelRates.form.description.label')}
              placeholder={t('config.modelRates.form.description.placeholder')}
              multiline
              rows={2}
            />

            {/* 操作按钮 */}
            <Stack
              direction="row"
              spacing={2}
              sx={{
                justifyContent: 'flex-end',
                mt: 3,
              }}>
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
