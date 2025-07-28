import { CreditRateFormula } from '@app/components/credit-rate-farmula';
import UnitDisplay from '@app/components/unit-display';
import { formatMillionTokenCost, getPrefix, multiply } from '@app/libs/util';
import { getDurableData } from '@arcblock/ux/lib/Datatable';
import Dialog from '@arcblock/ux/lib/Dialog';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
/* eslint-disable react/no-unstable-nested-components */
import Toast from '@arcblock/ux/lib/Toast';
import { Table } from '@blocklet/aigne-hub/components';
import { formatError } from '@blocklet/error';
import styled from '@emotion/styled';
import { Add as AddIcon, InfoOutlined } from '@mui/icons-material';
import { Avatar, Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useLocalStorageState, useRequest } from 'ahooks';
import BigNumber from 'bignumber.js';
import { useState } from 'react';
import { joinURL } from 'ufo';

import { useSessionContext } from '../../../../contexts/session';
import ModelRateForm from './model-rate-form';
import { ModelRate, ModelRateFormData, ModelRatesQuery } from './types';

export default function AIModelRates() {
  const listKey = 'ai-model-rates';
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [showForm, setShowForm] = useState(false);
  const [editingRate, setEditingRate] = useState<ModelRate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rateToDelete, setRateToDelete] = useState<ModelRate | null>(null);

  // 从 blocklet preferences 获取配置
  const baseCreditPrice = window.blocklet?.preferences?.baseCreditPrice || 0.0000025;
  const targetProfitMargin = window.blocklet?.preferences?.targetProfitMargin || 0;

  const persisted = getDurableData(listKey);
  const [search, setSearch] = useLocalStorageState<ModelRatesQuery>(listKey, {
    defaultValue: {
      pageSize: persisted.rowsPerPage || 10,
      page: persisted.page ? persisted.page + 1 : 1,
      q: '',
      providerId: persisted.providerId || '',
    },
  });

  const fetchData = (params: ModelRatesQuery = {}): Promise<any> => {
    const search = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const v = params[key as keyof ModelRatesQuery];
      if (v !== undefined && v !== '') {
        search.set(key, String(v));
      }
    });
    return api.get(`/api/ai-providers/model-rates?${search.toString()}`).then((res: any) => res.data);
  };

  const {
    data = { list: [], count: 0, paging: { page: 1, pageSize: 20 } },
    loading,
    refresh,
  } = useRequest(() => fetchData(search), {
    refreshDeps: [search],
    onError: (error: any) => {
      Toast.error(formatError(error));
    },
  });
  const modelRates = data?.list || [];

  // 创建模型费率
  const handleCreateModelRate = async (data: ModelRateFormData) => {
    try {
      await api.post('/api/ai-providers/model-rates', {
        model: data.modelName,
        modelDisplay: data.modelDisplay,
        type: data.rateType,
        inputRate: data.inputRate,
        outputRate: data.outputRate,
        description: data.description,
        providers: data.providers,
        unitCosts: data.unitCosts,
      });

      Toast.success(t('config.modelRates.createSuccess'));
      refresh();
      setShowForm(false);
      setEditingRate(null);
    } catch (error: any) {
      // Handle detailed error messages from the API
      const errorMessage = error.response?.data?.error || error.message || t('config.modelRates.createFailed');
      Toast.error(errorMessage);
    }
  };

  // 更新模型费率
  const handleUpdateModelRate = async (data: ModelRateFormData) => {
    if (!editingRate) return;
    try {
      await api.put(`/api/ai-providers/${editingRate.provider.id}/model-rates/${editingRate.id}`, {
        modelDisplay: data.modelDisplay,
        inputRate: data.inputRate,
        outputRate: data.outputRate,
        description: data.description,
      });
      refresh();
      setEditingRate(null);
      setShowForm(false);
      Toast.success(t('config.modelRates.updateSuccess'));
    } catch (error: any) {
      Toast.error(error.message || t('config.modelRates.updateFailed'));
    }
  };

  // 删除费率
  const handleDeleteRate = async () => {
    if (!rateToDelete) return;
    try {
      await api.delete(`/api/ai-providers/${rateToDelete.provider.id}/model-rates/${rateToDelete.id}`);
      refresh();
      Toast.success(t('config.modelRates.deleteSuccess'));
      setDeleteDialogOpen(false);
      setRateToDelete(null);
    } catch (error: any) {
      Toast.error(error.message || t('config.modelRates.deleteFailed'));
    }
  };

  const handleEditRate = (rate: ModelRate) => {
    setEditingRate(rate);
    setShowForm(true);
  };

  const handleDeleteClick = (rate: ModelRate) => {
    setRateToDelete(rate);
    setDeleteDialogOpen(true);
  };

  const getRateTypeColor = (type: string) => {
    switch (type) {
      case 'chatCompletion':
        return 'primary';
      case 'imageGeneration':
        return 'secondary';
      case 'embedding':
        return 'success';
      default:
        return 'default';
    }
  };

  const getRateTypeText = (type: string) => {
    switch (type) {
      case 'chatCompletion':
        return t('config.modelRates.types.chatCompletion');
      case 'imageGeneration':
        return t('config.modelRates.types.imageGeneration');
      case 'embedding':
        return t('config.modelRates.types.embedding');
      default:
        return type;
    }
  };

  // 表格列定义
  const columns = [
    {
      name: 'modelDisplay',
      label: t('config.modelRates.fields.modelName'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Typography
              variant="body2"
              sx={{
                fontWeight: 'medium',
              }}>
              {rate.modelDisplay || rate.model}
            </Typography>
          );
        },
      },
    },
    {
      name: 'provider',
      label: t('config.modelRates.fields.provider'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Avatar
                src={joinURL(getPrefix(), `/logo/${rate.provider.name}.png`)}
                sx={{ width: 24, height: 24 }}
                alt={rate.provider.displayName}
              />
              <Typography variant="body2">{rate.provider.displayName}</Typography>
            </Stack>
          );
        },
      },
    },
    {
      name: 'type',
      label: t('config.modelRates.fields.type'),

      options: {
        customHeaderRender: () => {
          return (
            <Typography variant="body2">
              {t('config.modelRates.fields.type')}
              <Tooltip title={t('config.modelRates.fields.type.tooltip')}>
                <InfoOutlined sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
              </Tooltip>
            </Typography>
          );
        },
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Chip
              label={getRateTypeText(rate.type)}
              color={getRateTypeColor(rate.type) as any}
              size="small"
              variant="filled"
            />
          );
        },
      },
    },
    {
      name: 'inputRate',
      label: t('config.modelRates.fields.inputRate'),
      options: {
        customHeadLabelRender: () => {
          return (
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {t('config.modelRates.fields.inputRate')}
              <Tooltip title={t('config.modelRates.configInfo.inputTokenConsumption')}>
                <InfoOutlined sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
              </Tooltip>
            </Typography>
          );
        },
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          const actualInputCost = Number(rate.unitCosts?.input || 0);

          const profitRate =
            actualInputCost > 0
              ? new BigNumber(rate.inputRate)
                  .multipliedBy(baseCreditPrice)
                  .minus(actualInputCost)
                  .dividedBy(actualInputCost)
                  .multipliedBy(100)
                  .toNumber()
              : 0;

          return (
            <Tooltip
              title={
                <Stack>
                  <Typography variant="caption">
                    <strong>{t('config.modelRates.configInfo.creditCost')}</strong>$
                    {formatMillionTokenCost(multiply(rate.inputRate, baseCreditPrice))} / 1M Tokens
                  </Typography>
                  <Typography variant="caption">
                    <strong>{t('config.modelRates.configInfo.actualCost')}</strong>$
                    {formatMillionTokenCost(actualInputCost)} / 1M Tokens
                  </Typography>
                  <Typography variant="caption">
                    <strong>{t('config.modelRates.configInfo.profitRate')}</strong>
                    {parseFloat(profitRate.toFixed(2))}%
                  </Typography>
                </Stack>
              }
              slotProps={{
                tooltip: {
                  sx: {
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    boxShadow: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  },
                },
              }}
              placement="bottom">
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="body2">{rate.inputRate}</Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: profitRate >= 0 ? 'success.main' : 'error.main',
                    display: 'block',
                  }}>
                  {profitRate >= 0 ? '+' : ''}
                  {profitRate === 0 ? '0' : parseFloat(profitRate.toFixed(2))}%
                </Typography>
              </Stack>
            </Tooltip>
          );
        },
      },
    },
    {
      name: 'outputRate',
      label: t('config.modelRates.fields.outputRate'),
      options: {
        customHeadLabelRender: () => {
          return (
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {t('config.modelRates.fields.outputRate')}
              <Tooltip title={t('config.modelRates.configInfo.outputTokenConsumption')}>
                <InfoOutlined sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
              </Tooltip>
            </Typography>
          );
        },
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          const actualOutputCost = Number(rate.unitCosts?.output || 0);
          const profitRate =
            actualOutputCost > 0
              ? new BigNumber(rate.outputRate)
                  .multipliedBy(baseCreditPrice)
                  .minus(actualOutputCost)
                  .dividedBy(actualOutputCost)
                  .multipliedBy(100)
                  .toNumber()
              : 0;
          return (
            <Tooltip
              title={
                <Stack>
                  <Typography variant="caption">
                    <strong>{t('config.modelRates.configInfo.creditCost')}</strong>$
                    {formatMillionTokenCost(multiply(rate.outputRate, baseCreditPrice))} / 1M Tokens
                  </Typography>
                  <Typography variant="caption">
                    <strong>{t('config.modelRates.configInfo.actualCost')}</strong>$
                    {formatMillionTokenCost(actualOutputCost)} / 1M Tokens
                  </Typography>
                  <Typography variant="caption">
                    <strong>{t('config.modelRates.configInfo.profitRate')}</strong>
                    {parseFloat(profitRate.toFixed(2))}%
                  </Typography>
                </Stack>
              }
              placement="bottom"
              slotProps={{
                tooltip: {
                  sx: {
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                    boxShadow: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                  },
                },
              }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="body2">{rate.outputRate}</Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: profitRate >= 0 ? 'success.main' : 'error.main',
                    display: 'block',
                  }}>
                  {profitRate >= 0 ? '+' : ''}
                  {parseFloat(profitRate.toFixed(2))}%
                </Typography>
              </Stack>
            </Tooltip>
          );
        },
      },
    },
    {
      name: 'description',
      label: t('config.modelRates.fields.description'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Typography
              variant="body2"
              noWrap
              sx={{
                color: 'text.secondary',
                maxWidth: 200,
              }}>
              {rate.description || '-'}
            </Typography>
          );
        },
      },
    },
    {
      name: 'actions',
      label: t('config.modelRates.fields.actions'),
      options: {
        customBodyRender: (_value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => handleEditRate(rate)} sx={{ minWidth: 'auto', px: 1 }}>
                {t('edit')}
              </Button>
              <Button
                size="small"
                onClick={() => handleDeleteClick(rate)}
                color="error"
                sx={{ minWidth: 'auto', px: 1 }}>
                {t('config.modelRates.actions.delete')}
              </Button>
            </Stack>
          );
        },
      },
    },
  ];

  return (
    <Box>
      {/* Configuration Info */}
      <Box
        sx={{
          mb: 3,
          p: 2,
          bgcolor: 'background.paper',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: 1,
        }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 2, sm: 0 }}
          sx={{
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
          }}>
          <Box sx={{ flex: 1 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('config.modelRates.configInfo.title')}
              </Typography>
              <Tooltip
                title={<CreditRateFormula />}
                arrow
                placement="right"
                slotProps={{
                  tooltip: {
                    sx: {
                      bgcolor: 'background.paper',
                      color: 'text.primary',
                      boxShadow: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      width: 'fit-content',
                      minWidth: { xs: 'auto', sm: 500 },
                    },
                  },
                }}>
                <InfoOutlined
                  sx={{
                    fontSize: 16,
                    color: 'text.secondary',
                    cursor: 'help',
                    '&:hover': {
                      color: 'primary.main',
                    },
                  }}
                />
              </Tooltip>
            </Stack>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}>
              <Typography component="span">AHC Price: $</Typography>
              <UnitDisplay value={formatMillionTokenCost(baseCreditPrice)} type="credit" />
              <Typography component="span" sx={{ ml: 1 }}>
                • {t('config.modelRates.configInfo.profitMargin')}
                {targetProfitMargin}%
              </Typography>
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            sx={{
              textTransform: 'none',
              fontWeight: 500,
            }}
            onClick={() => window.open('/.well-known/service/admin/overview/components', '_blank')}>
            {t('config.modelRates.configInfo.settingsLink')}
          </Button>
        </Stack>
      </Box>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}>
        <Typography variant="body1">{t('config.modelRates.description')}</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setShowForm(true);
            setEditingRate(null);
          }}>
          {t('config.modelRates.actions.add')}
        </Button>
      </Stack>
      <Root>
        <Table
          hasSearch
          durable={`__${listKey}__`}
          durableKeys={['searchText']}
          data={modelRates}
          columns={columns}
          toolbar={false}
          options={{
            count: data?.count || 0,
            page: (search?.page || 1) - 1,
            rowsPerPage: search?.pageSize || 10,
            onSearchChange: (text: string) => {
              if (text) {
                setSearch((x) => ({
                  ...x!,
                  q: text,
                  page: 1,
                }));
              } else {
                setSearch((x) => ({
                  ...x!,
                  page: 1,
                  q: '',
                }));
              }
            },
          }}
          onChange={({ page, rowsPerPage }: { page: number; rowsPerPage: number }) => {
            if (search?.pageSize !== rowsPerPage) {
              setSearch((x) => ({ ...x!, pageSize: rowsPerPage, page: 1 }));
            } else if (search?.page !== page + 1) {
              setSearch((x) => ({ ...x!, page: page + 1 }));
            }
          }}
          mobileTDFlexDirection="row"
          loading={loading}
        />
      </Root>
      {/* Add/Edit Model Rate Dialog */}
      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        fullWidth
        maxWidth="sm"
        title={editingRate ? t('config.modelRates.actions.edit') : t('config.modelRates.actions.add')}>
        <ModelRateForm
          rate={editingRate}
          onSubmit={editingRate ? handleUpdateModelRate : handleCreateModelRate}
          onCancel={() => {
            setShowForm(false);
            setEditingRate(null);
          }}
        />
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title={t('config.modelRates.deleteDialog.title')}
        maxWidth="sm"
        PaperProps={{
          style: {
            minHeight: 'auto',
          },
        }}
        actions={
          <Stack
            direction="row"
            spacing={2}
            sx={{
              justifyContent: 'flex-end',
            }}>
            <Button onClick={() => setDeleteDialogOpen(false)}>{t('config.modelRates.deleteDialog.cancel')}</Button>
            <Button variant="contained" color="error" onClick={handleDeleteRate}>
              {t('config.modelRates.deleteDialog.confirm')}
            </Button>
          </Stack>
        }>
        <Typography variant="body1">{t('config.modelRates.deleteDialog.message')}</Typography>
      </Dialog>
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
  }
`;
