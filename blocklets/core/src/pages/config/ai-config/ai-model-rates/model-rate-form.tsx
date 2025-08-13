import UnitDisplay from '@app/components/unit-display';
import { formatMillionTokenCost, getPrefix, parseMillionTokenCost } from '@app/libs/util';
/* eslint-disable react-hooks/exhaustive-deps */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { FormLabel } from '@blocklet/aigne-hub/components';
import { ExpandLess, ExpandMore, InfoOutlined } from '@mui/icons-material';
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  InputAdornment,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import BigNumber from 'bignumber.js';
import { ChangeEvent, FocusEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { joinURL } from 'ufo';

import CustomAutocomplete from '../../../../components/custom-autocomplete';
import EnterHint from '../../../../components/enter-hint';
import FormInput from '../../../../components/form-input';
import { useSessionContext } from '../../../../contexts/session';
import { ModelOption, ModelRate, ModelRateFormData, Provider } from './types';
import { filterModelsByProviders, searchModels, useModelData } from './use-model-data';

interface Props {
  rate?: ModelRate | null;
  onSubmit: (data: ModelRateFormData) => void;
  onCancel: () => void;
}

function TokenCostInput({
  label,
  costValue = 0,
  onCostChange,
}: {
  label: string;
  costValue: number;
  onCostChange: (value: number) => void;
}) {
  const [value, setValue] = useState<number | string>(costValue || 0);

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    onCostChange(parseMillionTokenCost(e.target.value));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  useEffect(() => {
    setValue(formatMillionTokenCost(costValue));
  }, [costValue]);

  return (
    <Box>
      <FormLabel>{label}</FormLabel>
      <TextField
        value={value}
        onBlur={handleBlur}
        onChange={handleChange}
        size="small"
        slotProps={{
          htmlInput: { type: 'number', step: 0.01, min: 0 },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <UnitDisplay value="" type="token" addon="Tokens" />
              </InputAdornment>
            ),
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          },
        }}
      />
    </Box>
  );
}

const pricingLinks = {
  openai: {
    name: 'OpenAI',
    url: 'https://platform.openai.com/docs/pricing',
  },
  anthropic: {
    name: 'Anthropic',
    url: 'https://docs.anthropic.com/en/docs/about-claude/pricing',
  },
  xai: {
    name: 'xAI',
    url: 'https://docs.x.ai/docs/models',
  },
  bedrock: {
    name: 'AWS Bedrock',
    url: 'https://aws.amazon.com/bedrock/pricing/',
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
  google: {
    name: 'Google AI',
    url: 'https://ai.google.dev/pricing',
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/models',
  },
  ollama: {
    name: 'Ollama',
    url: 'https://ollama.ai/library',
  },
};

export default function ModelRateForm({ rate = null, onSubmit, onCancel }: Props) {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [modelInputValue, setModelInputValue] = useState('');
  const [qualityInputValue, setQualityInputValue] = useState('');
  const [sizeInputValue, setSizeInputValue] = useState('');
  const [styleInputValue, setStyleInputValue] = useState('');
  const [pricingMenuAnchor, setPricingMenuAnchor] = useState<null | HTMLElement>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const baseCreditPrice = window.blocklet?.preferences?.baseCreditPrice || 0.0000025;
  const targetProfitMargin = window.blocklet?.preferences?.targetProfitMargin || 0;

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
      model: rate?.model || '',
      modelDisplay: rate?.modelDisplay || '',
      type: rate?.type || 'chatCompletion',
      inputRate: rate?.inputRate || 0,
      outputRate: rate?.outputRate || 0,
      description: rate?.description || '',
      providers: [],
      unitCosts: {
        input: rate?.unitCosts?.input || 0,
        output: rate?.unitCosts?.output || 0,
      },
      modelMetadata: {
        maxTokens: rate?.modelMetadata?.maxTokens,
        features: rate?.modelMetadata?.features || [],
        imageGeneration: {
          max: rate?.modelMetadata?.imageGeneration?.max,
          quality: rate?.modelMetadata?.imageGeneration?.quality || [],
          size: rate?.modelMetadata?.imageGeneration?.size || [],
          style: rate?.modelMetadata?.imageGeneration?.style || [],
        },
      },
    },
  });

  const { handleSubmit, watch, setValue } = methods;
  const modelDisplay = watch('modelDisplay');
  const inputRate = watch('inputRate');
  const outputRate = watch('outputRate');
  const unitCostsInput = watch('unitCosts.input');
  const unitCostsOutput = watch('unitCosts.output');
  const rateType = watch('type');

  // 计算预估收益率
  const calculateProfitRate = useCallback(
    (rate: number, actualCost: number) => {
      if (!actualCost || actualCost <= 0) return 0;
      return new BigNumber(rate)
        .multipliedBy(baseCreditPrice)
        .minus(actualCost)
        .dividedBy(actualCost)
        .multipliedBy(100)
        .toNumber();
    },
    [baseCreditPrice]
  );

  // 自动计算费率的函数
  const autoCalculateRates = () => {
    const calculatedInputRate = new BigNumber(unitCostsInput)
      .multipliedBy(1 + targetProfitMargin / 100)
      .dividedBy(baseCreditPrice)
      .toNumber();
    const calculatedOutputRate = new BigNumber(unitCostsOutput)
      .multipliedBy(1 + targetProfitMargin / 100)
      .dividedBy(baseCreditPrice)
      .toNumber();
    setValue('inputRate', Number(calculatedInputRate.toFixed(6)));
    setValue('outputRate', Number(calculatedOutputRate.toFixed(6)));
  };

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
      setValue('model', value);
      setModelInputValue(value);

      // 自动生成显示名称
      if (value) {
        const displayName = value.split('/').pop();
        if (displayName) {
          const formattedName = displayName.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
          setValue('modelDisplay', formattedName);
        }
      }
    } else if (value && typeof value === 'object') {
      // 用户选择的模型选项
      setValue('model', value.name);
      if (value.provider === 'custom' && value.displayName) {
        const formattedName = value.displayName.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
        setValue('modelDisplay', formattedName);
      } else {
        setValue('modelDisplay', value.displayName);
      }
      setModelInputValue(value.name);
      setValue('type', (value.mode as any) || 'chatCompletion');
      setValue('unitCosts', {
        input: value.inputCost || 0,
        output: value.outputCost || 0,
      });
      const provider = providers.find((p) => p.name === value.provider);
      if (provider) {
        setSelectedProviders([provider.id]);
      }

      if (value.inputCost !== undefined) {
        const calculatedInputRate = new BigNumber(value.inputCost)
          .multipliedBy(1 + targetProfitMargin / 100)
          .dividedBy(baseCreditPrice)
          .toNumber();
        setValue('inputRate', Number(calculatedInputRate.toFixed(6)));
      } else {
        setValue('inputRate', 0);
      }
      if (value.outputCost !== undefined) {
        const calculatedOutputRate = new BigNumber(value.outputCost)
          .multipliedBy(1 + targetProfitMargin / 100)
          .dividedBy(baseCreditPrice)
          .toNumber();
        setValue('outputRate', Number(calculatedOutputRate.toFixed(6)));
      } else {
        setValue('outputRate', 0);
      }
      const features: ('tools' | 'thinking' | 'vision')[] = [];
      if (value.supportsVision) {
        features.push('vision');
      }
      if (value.supportsToolChoice) {
        features.push('tools');
      }
      // 设置 modelMetadata
      setValue('modelMetadata', {
        maxTokens: value.maxTokens,
        features,
      });
    } else {
      // 清空
      setValue('model', '');
      setModelInputValue('');
    }
  };

  // 处理用户输入但没有选择选项的情况
  const handleInputBlur = () => {
    if (modelInputValue && !searchableModelOptions.find((option) => option.name === modelInputValue)) {
      // 用户输入了自定义模型名称
      setValue('model', modelInputValue);

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

    const formData = {
      ...data,
      providers: rate ? [rate.provider.id] : selectedProviders,
      unitCosts: {
        input: data.unitCosts?.input || 0,
        output: data.unitCosts?.output || 0,
      },
      modelMetadata: {
        maxTokens: data.modelMetadata?.maxTokens || undefined,
        features: data.modelMetadata?.features || [],
        imageGeneration: {
          max: data.modelMetadata?.imageGeneration?.max || undefined,
          quality: data.modelMetadata?.imageGeneration?.quality || [],
          size: data.modelMetadata?.imageGeneration?.size || [],
          style: data.modelMetadata?.imageGeneration?.style || [],
        },
      },
    };

    onSubmit(formData);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Drawer Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          flexShrink: 0,
        }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {rate ? t('config.modelRates.actions.edit') : t('config.modelRates.actions.add')}
        </Typography>
      </Box>

      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(onFormSubmit)}
          style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ flex: 1, overflow: 'auto', p: 2, pb: 6, minHeight: 0 }}>
            <Stack spacing={3}>
              <Stack spacing={2}>
                <FormInput
                  name="model"
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
                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    width: '100%',
                                  }}>
                                  <Typography variant="body1" sx={{ fontWeight: 500, color: 'primary.main' }}>
                                    ✨ {option.name}
                                  </Typography>
                                  <EnterHint />
                                </Box>
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
                                  {option.provider} • Input: ${formatMillionTokenCost(option.inputCost ?? 0)} / 1M
                                  Output: ${formatMillionTokenCost(option.outputCost ?? 0)} / 1M
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
                      onBlur={handleInputBlur}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size="small"
                          placeholder={t('config.modelRates.form.modelName.placeholder')}
                          error={hasError}
                          helperText={hasError ? error : ''}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && modelInputValue) {
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
                  name="type"
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
                            label={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Avatar
                                  src={joinURL(getPrefix(), `/logo/${option.name}.png`)}
                                  sx={{ width: 24, height: 24 }}
                                  alt={option.displayName}
                                />
                                <Typography variant="body2">{option.displayName}</Typography>
                              </Box>
                            }
                            sx={{
                              borderColor: 'divider',
                              backgroundColor: 'grey.100',
                            }}
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

              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: 1,
                  backgroundColor: 'background.paper',
                }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', mb: 0.5, justifyContent: 'space-between' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {t('config.modelRates.configInfo.customModelCost')}
                  </Typography>
                  <Button
                    size="small"
                    variant="text"
                    onClick={(e) => setPricingMenuAnchor(e.currentTarget)}
                    sx={{ color: 'primary.main' }}>
                    {t('config.modelRates.configInfo.viewPricing')}
                  </Button>
                  <Menu
                    anchorEl={pricingMenuAnchor}
                    open={Boolean(pricingMenuAnchor)}
                    onClose={() => setPricingMenuAnchor(null)}>
                    <Box>
                      {Object.entries(pricingLinks).map(([key, link]) => (
                        <MenuItem
                          key={key}
                          component="a"
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setPricingMenuAnchor(null)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            borderRadius: 1,
                            minWidth: 200,
                            '&:hover': {
                              backgroundColor: 'action.hover',
                            },
                          }}>
                          <Avatar
                            src={joinURL(getPrefix(), `/logo/${key}.png`)}
                            sx={{ width: 24, height: 24 }}
                            alt={link.name}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {link.name}
                          </Typography>
                        </MenuItem>
                      ))}
                    </Box>
                  </Menu>
                </Stack>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {t('config.modelRates.configInfo.customModelCostDesc')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1.5 }}>
                  <TokenCostInput
                    costValue={unitCostsInput}
                    label={t('config.modelRates.fields.inputRate')}
                    onCostChange={(value) => setValue('unitCosts.input', value)}
                  />
                  <TokenCostInput
                    costValue={unitCostsOutput}
                    label={t('config.modelRates.fields.outputRate')}
                    onCostChange={(value) => setValue('unitCosts.output', value)}
                  />
                </Stack>
              </Box>

              {/* Credit Rates 配置框 */}
              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  boxShadow: 1,
                  backgroundColor: 'background.paper',
                }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: { xs: 'space-between', sm: 'space-between' },
                    mb: 1.5,
                  }}>
                  <Typography
                    variant="h6"
                    sx={{
                      flex: { sm: 1 },
                      fontWeight: 600,
                      cursor: 'help',
                      display: 'flex',
                      gap: 1,
                      width: { xs: 'auto', sm: 'auto' },
                    }}>
                    {t('config.modelRates.configInfo.aicRateConfig')}
                    <Tooltip
                      title={
                        <Box>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            <strong>{t('config.modelRates.configInfo.title')}</strong>
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            {t('config.modelRates.configInfo.creditValue')}${formatMillionTokenCost(baseCreditPrice)} /
                            1M
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
                    sx={{
                      minWidth: 'auto',
                      px: 2,
                      py: 0.5,
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      alignSelf: { xs: 'flex-end', sm: 'auto' },
                    }}>
                    {t('config.modelRates.configInfo.autoCalculate')}
                  </Button>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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
                        input: {
                          endAdornment: <InputAdornment position="end">Credits / Token</InputAdornment>,
                        },
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'background.default',
                        },
                      }}
                    />

                    {inputRate > 0 && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: calculateProfitRate(inputRate, unitCostsInput) >= 0 ? 'success.main' : 'error.main',
                          display: 'block',
                          fontWeight: 500,
                          mt: 1,
                        }}>
                        {t('config.modelRates.configInfo.estimatedProfitRate')}:{' '}
                        {calculateProfitRate(inputRate, unitCostsInput).toFixed(1)}%
                      </Typography>
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
                        input: {
                          endAdornment: <InputAdornment position="end">Credits / Token</InputAdornment>,
                        },
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          backgroundColor: 'background.default',
                        },
                      }}
                    />
                    {outputRate > 0 && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: calculateProfitRate(outputRate, unitCostsOutput) >= 0 ? 'success.main' : 'error.main',
                          display: 'block',
                          fontWeight: 500,
                          mt: 1,
                        }}>
                        {t('config.modelRates.configInfo.estimatedProfitRate')}:{' '}
                        {calculateProfitRate(outputRate, unitCostsOutput).toFixed(1)}%
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </Box>

              <FormInput
                name="description"
                label={t('config.modelRates.form.description.label')}
                placeholder={t('config.modelRates.form.description.placeholder')}
                multiline
                rows={2}
                sx={{ mb: 1 }}
              />

              {/* 高级选项 */}
              <Box>
                <Button
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  startIcon={showAdvancedOptions ? <ExpandLess /> : <ExpandMore />}
                  variant="text"
                  sx={{
                    mb: 2,
                    textTransform: 'none',
                    justifyContent: 'flex-start',
                    width: 'fit-content',
                    borderColor: 'divider',
                    color: 'text.primary',
                    '&:hover': {
                      backgroundColor: 'transparent',
                    },
                  }}>
                  {t('config.modelRates.form.advancedOptions') || 'Advanced Options'}
                </Button>

                <Collapse in={showAdvancedOptions} timeout={300}>
                  <Stack spacing={2} sx={{ px: 2 }}>
                    {/* Image Generation Options */}
                    {rateType === 'imageGeneration' ? (
                      <Stack spacing={2}>
                        {/* Max Images */}
                        <Box>
                          <FormInput
                            name="modelMetadata.imageGeneration.max"
                            label={t('config.modelRates.form.imageGeneration.max.label') || 'Max Images'}
                            placeholder={
                              t('config.modelRates.form.imageGeneration.max.placeholder') ||
                              'Enter max number of images'
                            }
                            slotProps={{
                              htmlInput: {
                                type: 'number',
                                min: 1,
                              },
                            }}
                          />
                        </Box>

                        {/* Quality */}
                        <CustomAutocomplete
                          label={t('config.modelRates.form.imageGeneration.quality.label') || 'Quality'}
                          placeholder={
                            t('config.modelRates.form.imageGeneration.quality.placeholder') ||
                            'Enter quality options (press Enter to create custom)'
                          }
                          options={['low', 'medium', 'high', 'hd', 'standard', 'auto']}
                          value={watch('modelMetadata.imageGeneration.quality') || []}
                          onChange={(newValue) => {
                            setValue('modelMetadata.imageGeneration.quality', newValue);
                          }}
                          inputValue={qualityInputValue}
                          onInputChange={setQualityInputValue}
                        />

                        {/* Size */}
                        <CustomAutocomplete
                          label={t('config.modelRates.form.imageGeneration.size.label') || 'Size'}
                          placeholder={
                            t('config.modelRates.form.imageGeneration.size.placeholder') ||
                            'Enter size options (press Enter to create custom)'
                          }
                          options={[
                            '256x256',
                            '512x512',
                            '1024x1024',
                            '1024x1792',
                            '1792x1024',
                            '1024x1536',
                            '1536x1024',
                            'auto',
                          ]}
                          value={watch('modelMetadata.imageGeneration.size') || []}
                          onChange={(newValue) => {
                            setValue('modelMetadata.imageGeneration.size', newValue);
                          }}
                          inputValue={sizeInputValue}
                          onInputChange={setSizeInputValue}
                        />

                        {/* Style */}
                        <CustomAutocomplete
                          label={t('config.modelRates.form.imageGeneration.style.label') || 'Style'}
                          placeholder={
                            t('config.modelRates.form.imageGeneration.style.placeholder') ||
                            'Enter style options (press Enter to create custom)'
                          }
                          options={['vivid', 'natural']}
                          value={watch('modelMetadata.imageGeneration.style') || []}
                          onChange={(newValue) => {
                            setValue('modelMetadata.imageGeneration.style', newValue);
                          }}
                          inputValue={styleInputValue}
                          onInputChange={setStyleInputValue}
                        />
                      </Stack>
                    ) : (
                      <>
                        {/* Max Tokens */}
                        <FormInput
                          name="modelMetadata.maxTokens"
                          label={t('config.modelRates.form.maxTokens.label') || 'Max Tokens'}
                          placeholder={t('config.modelRates.form.maxTokens.placeholder') || 'Enter max tokens'}
                          slotProps={{
                            htmlInput: {
                              type: 'number',
                              min: 1,
                            },
                          }}
                        />
                        {/* Features */}
                        <Box>
                          <FormLabel sx={{ mb: 1, display: 'block' }}>
                            {t('config.modelRates.form.features.label') || 'Features'}
                          </FormLabel>
                          <FormGroup row sx={{ gap: 2 }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={watch('modelMetadata.features')?.includes('tools') || false}
                                  onChange={(e) => {
                                    const currentFeatures = watch('modelMetadata.features') || [];
                                    if (e.target.checked) {
                                      setValue('modelMetadata.features', [...currentFeatures, 'tools']);
                                    } else {
                                      setValue(
                                        'modelMetadata.features',
                                        currentFeatures.filter((f) => f !== 'tools')
                                      );
                                    }
                                  }}
                                />
                              }
                              label={t('config.modelRates.form.features.tools') || 'Tools'}
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={watch('modelMetadata.features')?.includes('thinking') || false}
                                  onChange={(e) => {
                                    const currentFeatures = watch('modelMetadata.features') || [];
                                    if (e.target.checked) {
                                      setValue('modelMetadata.features', [...currentFeatures, 'thinking']);
                                    } else {
                                      setValue(
                                        'modelMetadata.features',
                                        currentFeatures.filter((f) => f !== 'thinking')
                                      );
                                    }
                                  }}
                                />
                              }
                              label={t('config.modelRates.form.features.thinking') || 'Thinking'}
                            />
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={watch('modelMetadata.features')?.includes('vision') || false}
                                  onChange={(e) => {
                                    const currentFeatures = watch('modelMetadata.features') || [];
                                    if (e.target.checked) {
                                      setValue('modelMetadata.features', [...currentFeatures, 'vision']);
                                    } else {
                                      setValue(
                                        'modelMetadata.features',
                                        currentFeatures.filter((f) => f !== 'vision')
                                      );
                                    }
                                  }}
                                />
                              }
                              label={t('config.modelRates.form.features.vision') || 'Vision'}
                            />
                          </FormGroup>
                        </Box>
                      </>
                    )}
                  </Stack>
                </Collapse>
              </Box>
            </Stack>
          </Box>

          {/* 固定在底部的操作按钮 */}
          <Box
            sx={{
              p: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
              flexShrink: 0,
              position: 'sticky',
              bottom: 0,
              zIndex: 10,
            }}>
            <Stack
              direction="row"
              spacing={2}
              sx={{
                justifyContent: 'flex-end',
              }}>
              <Button onClick={onCancel} color="inherit" size="large">
                {t('config.modelRates.actions.cancel')}
              </Button>
              <Button type="submit" variant="contained" size="large">
                {rate ? t('config.modelRates.actions.save') : t('config.modelRates.actions.save')}
              </Button>
            </Stack>
          </Box>
        </form>
      </FormProvider>
    </Box>
  );
}
