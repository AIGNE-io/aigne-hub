import Dialog from '@arcblock/ux/lib/Dialog';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { formatError } from '@blocklet/error';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Collapse, Fade, IconButton, Slide, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { useSessionContext } from '../../../../contexts/session';
import CredentialForm, { CredentialFormData } from './credential-form';

// Date formatting utility
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString();
};

export interface Credential {
  id: string;
  name: string;
  credentialType: string;
  displayText: string;
  maskedValue: Record<string, string>;
  active: boolean;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  credentialValue: Record<string, string>;
}

interface CredentialDialogProps {
  provider: any;
  onClose: () => void;
  onCredentialChange: () => void;
}

export default function CredentialDialog({ provider, onClose, onCredentialChange }: CredentialDialogProps) {
  const { t } = useLocaleContext();
  const { api } = useSessionContext();
  const [showForm, setShowForm] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [deleteCredential, setDeleteCredential] = useState<Credential | null>(null);
  const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(null);

  const handleCreateCredential = async (data: CredentialFormData) => {
    try {
      await api.post(`/api/ai-providers/${provider.id}/credentials`, data);
      onCredentialChange();
      setShowForm(false);
    } catch (error: any) {
      Toast.error(formatError(error) || t('createCredentialFailed'));
    }
  };

  const handleUpdateCredential = async (data: CredentialFormData) => {
    if (!editingCredential) return;
    try {
      await api.put(`/api/ai-providers/${provider.id}/credentials/${editingCredential.id}`, data);
      onCredentialChange();
      setEditingCredential(null);
    } catch (error: any) {
      Toast.error(formatError(error) || t('updateCredentialFailed'));
    }
  };

  const handleDeleteCredential = async (credential: Credential) => {
    try {
      setDeletingCredentialId(credential.id);
      await api.delete(`/api/ai-providers/${provider.id}/credentials/${credential.id}`);

      // 等待动画完成后再更新数据
      setTimeout(() => {
        onCredentialChange();
        setDeleteCredential(null);
        setDeletingCredentialId(null);
      }, 300);
    } catch (error: any) {
      setDeletingCredentialId(null);
      Toast.error(formatError(error) || t('deleteCredentialFailed'));
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingCredential(null);
    setDeleteCredential(null);
    onClose();
  };

  const getCredentialDisplayValue = (credential: Credential) => {
    return credential.displayText || credential.name;
  };

  if (showForm) {
    return (
      <Dialog open onClose={handleClose} fullWidth title={t('addCredential')}>
        <CredentialForm
          provider={provider}
          onSubmit={handleCreateCredential}
          onCancel={() => setShowForm(false)}
          hideTitle
          initialData={{
            name: `Credential ${(provider.credentials?.length || 0) + 1}`,
          }}
        />
      </Dialog>
    );
  }

  if (editingCredential) {
    return (
      <Dialog open onClose={handleClose} fullWidth title={t('editCredential')}>
        <CredentialForm
          initialData={{
            name: editingCredential.name,
            value:
              editingCredential.credentialType === 'access_key_pair'
                ? {
                    access_key_id: editingCredential.credentialValue.access_key_id,
                  }
                : '', // 重置敏感值
            credentialType: editingCredential.credentialType as any,
          }}
          onSubmit={handleUpdateCredential}
          onCancel={() => setEditingCredential(null)}
          isEdit
          provider={provider}
        />
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open
        onClose={handleClose}
        fullWidth
        title={`${t('manageCredentials')} - ${provider.displayName}`}
        maxWidth="sm">
        <Stack spacing={3}>
          <Stack
            direction="row"
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <Typography variant="body1">
              {t('credentials')} ({provider.credentials?.length || 0})
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowForm(true)}>
              {t('addCredential')}
            </Button>
          </Stack>

          {provider.credentials?.length === 0 ? (
            <Fade in timeout={300}>
              <Alert severity="info">{t('noCredentials')}</Alert>
            </Fade>
          ) : (
            <Stack spacing={2}>
              {provider.credentials?.map((credential: Credential, index: number) => (
                <Slide key={credential.id} direction="up" in timeout={300 + index * 100} unmountOnExit>
                  <Box>
                    <Collapse in={deletingCredentialId !== credential.id} timeout={300} unmountOnExit>
                      <Box
                        sx={{
                          p: 2,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          transition: 'all 0.2s ease-in-out',
                          '&:hover': {
                            borderColor: 'primary.main',
                            boxShadow: 1,
                          },
                        }}>
                        <Box sx={{ position: 'relative' }}>
                          <Box sx={{ flex: 1 }}>
                            <Stack
                              direction="row"
                              spacing={2}
                              sx={{
                                alignItems: 'center',
                                mb: 1,
                              }}>
                              <Typography
                                variant="subtitle1"
                                sx={{
                                  fontWeight: 'medium',
                                }}>
                                {credential.name}
                              </Typography>
                              <Chip
                                label={credential.credentialType}
                                size="small"
                                variant="outlined"
                                color={credential.active ? 'success' : 'default'}
                              />
                            </Stack>

                            <Typography
                              variant="body2"
                              sx={{
                                color: 'text.secondary',
                                mb: 1,
                              }}>
                              {getCredentialDisplayValue(credential)}
                            </Typography>

                            <Stack
                              sx={{
                                fontSize: '0.875rem',
                                color: 'text.secondary',
                                display: 'flex',
                                flexDirection: { xs: 'column', sm: 'row' },
                                justifyContent: 'flex-start',
                                gap: {
                                  xs: 1,
                                  sm: 3,
                                },
                              }}>
                              <Box>
                                <strong>{t('usageCount')}:</strong> {credential.usageCount}
                              </Box>
                              <Box>
                                <strong>{t('created')}:</strong> {formatDate(credential.createdAt)}
                              </Box>
                            </Stack>
                          </Box>

                          <Stack direction="row" spacing={1} sx={{ position: 'absolute', right: '-8px', top: '-8px' }}>
                            <IconButton
                              size="small"
                              onClick={() => setEditingCredential(credential)}
                              sx={{
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                  backgroundColor: 'primary.light',
                                  color: 'primary.main',
                                },
                              }}>
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setDeleteCredential(credential)}
                              color="error"
                              sx={{
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.main',
                                },
                              }}>
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        </Box>
                      </Box>
                    </Collapse>
                  </Box>
                </Slide>
              ))}
            </Stack>
          )}
        </Stack>
      </Dialog>
      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleteCredential}
        onClose={() => setDeleteCredential(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          style: { minHeight: 'auto' },
        }}
        title={t('deleteCredential')}
        actions={
          <Stack direction="row" spacing={2}>
            <Button onClick={() => setDeleteCredential(null)}>{t('cancel')}</Button>
            <Button
              onClick={() => deleteCredential && handleDeleteCredential(deleteCredential)}
              color="error"
              variant="contained">
              {t('delete')}
            </Button>
          </Stack>
        }>
        {t('deleteCredentialConfirm')} "{deleteCredential?.name}"?
      </Dialog>
    </>
  );
}
