import Dialog from '@arcblock/ux/lib/Dialog';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
/* eslint-disable react/no-unstable-nested-components */
import Toast from '@arcblock/ux/lib/Toast';
import { Table } from '@blocklet/ai-kit/components';
import styled from '@emotion/styled';
import { Add as AddIcon } from '@mui/icons-material';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import { useSessionContext } from '../../../../contexts/session';
import ModelRateForm from './model-rate-form';
import { ModelRate, ModelRateFormData } from './types';

export default function AIModelRates() {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [modelRates, setModelRates] = useState<ModelRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRate, setEditingRate] = useState<ModelRate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rateToDelete, setRateToDelete] = useState<ModelRate | null>(null);

  // 获取所有模型费率
  const fetchModelRates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/ai-providers/model-rates');
      setModelRates(response.data || []);
    } catch (error: any) {
      Toast.error(error.message || t('config.modelRates.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModelRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      });

      Toast.success(t('config.modelRates.createSuccess'));

      await fetchModelRates();
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
      await fetchModelRates();
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
      await fetchModelRates();
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
        customBodyRender: (value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Typography variant="body2" fontWeight="medium">
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
        customBodyRender: (value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return <Typography variant="body2">{rate.provider.displayName}</Typography>;
        },
      },
    },
    {
      name: 'type',
      label: t('config.modelRates.fields.type'),
      options: {
        customBodyRender: (value: any, tableMeta: any) => {
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
        customBodyRender: (value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return <Typography variant="body2">{rate.inputRate}</Typography>;
        },
      },
    },
    {
      name: 'outputRate',
      label: t('config.modelRates.fields.outputRate'),
      options: {
        customBodyRender: (value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return <Typography variant="body2">{rate.outputRate}</Typography>;
        },
      },
    },
    {
      name: 'description',
      label: t('config.modelRates.fields.description'),
      options: {
        customBodyRender: (value: any, tableMeta: any) => {
          const rate = modelRates[tableMeta.rowIndex];
          if (!rate) return null;

          return (
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200 }} noWrap>
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
        customBodyRender: (value: any, tableMeta: any) => {
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
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
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
          data={modelRates}
          columns={columns}
          toolbar={false}
          options={{
            elevation: 0,
            rowsPerPage: 10,
            rowsPerPageOptions: [10, 25, 50, 100],
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
          <Stack direction="row" spacing={2} justifyContent="flex-end">
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
