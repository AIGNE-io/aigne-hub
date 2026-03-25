import { getPrefix } from '@app/libs/util';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { useSessionContext } from '@app/contexts/session';
import {
  Add as AddIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { joinURL } from 'ufo';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
}

const apiBase = () => {
  const prefix = getPrefix();
  return joinURL(prefix, '/api');
};

function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/api-keys`, { credentials: 'include' });
      if (res.ok) {
        setKeys(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async (name: string) => {
    const res = await fetch(`${apiBase()}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create key' }));
      throw new Error(err.error || 'Failed to create key');
    }
    const data = await res.json();
    await fetchKeys();
    return data;
  };

  const deleteKey = async (id: string) => {
    await fetch(`${apiBase()}/api-keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await fetchKeys();
  };

  return { keys, loading, createKey, deleteKey };
}

function CodeSnippet({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        component="pre"
        sx={{
          p: 2,
          borderRadius: 1,
          bgcolor: 'grey.900',
          color: 'grey.100',
          overflow: 'auto',
          fontSize: '0.85rem',
          lineHeight: 1.6,
          fontFamily: 'monospace',
        }}>
        <code>{code}</code>
      </Box>
      <Tooltip title="Copy">
        <IconButton
          size="small"
          onClick={onCopy}
          sx={{ position: 'absolute', top: 8, right: 8, color: 'grey.400' }}>
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function IntegrationExamples({ keyPreview }: { keyPreview: string }) {
  const { t } = useLocaleContext();
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const baseUrl = getPrefix();
  const apiKeyPlaceholder = keyPreview || 'YOUR_API_KEY';

  const snippets = [
    {
      label: 'curl',
      code: `# Model format: provider/model (recommended)
# Examples: openai/gpt-4, google/gemini-2.5-flash, openrouter/anthropic/claude-sonnet-4
curl ${baseUrl}/api/v2/chat/completions \\
  -H "Authorization: Bearer ${apiKeyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
    },
    {
      label: 'JavaScript',
      code: `// Model format: "provider/model" (recommended)
// Examples: "openai/gpt-4", "google/gemini-2.5-flash"
const response = await fetch('${baseUrl}/api/v2/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKeyPlaceholder}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`,
    },
    {
      label: 'Python (OpenAI SDK)',
      code: `from openai import OpenAI

# Compatible with OpenAI SDK - just change base_url
client = OpenAI(
    api_key="${apiKeyPlaceholder}",
    base_url="${baseUrl}/api/v2",
)

# Model format: "provider/model" (recommended)
response = client.chat.completions.create(
    model="openai/gpt-4",
    messages=[
        {"role": "user", "content": "Hello!"}
    ],
)
print(response.choices[0].message.content)`,
    },
  ];

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {t('apiKeys.integration')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {t('apiKeys.baseUrl')}: <code>{baseUrl}</code>
      </Typography>
      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          {snippets.map((s) => (
            <Tab key={s.label} label={s.label} />
          ))}
        </Tabs>
        <Box sx={{ p: 0 }}>
          <CodeSnippet
            code={snippets[tab]?.code ?? ''}
            onCopy={() => handleCopy(snippets[tab]?.code ?? '')}
          />
        </Box>
      </Paper>
      {copied && (
        <Typography variant="caption" sx={{ color: 'success.main', mt: 0.5, display: 'block' }}>
          {t('apiKeys.copied')}
        </Typography>
      )}
      <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('apiKeys.modelFormat')}</Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          <code>provider/model</code> — {t('apiKeys.modelFormatRecommended')}<br />
          <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', display: 'block', mt: 0.5, lineHeight: 1.8 }}>
            openai/gpt-4 &nbsp;&nbsp; google/gemini-2.5-flash &nbsp;&nbsp; openrouter/anthropic/claude-sonnet-4
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}

export default function ApiKeysPage() {
  const { t } = useLocaleContext();
  const { session } = useSessionContext();
  const { keys, loading, createKey, deleteKey } = useApiKeys();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session?.user) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          {t('apiKeys.title')}
        </Typography>
        <Typography color="text.secondary">Please log in to manage your API keys.</Typography>
      </Box>
    );
  }

  const handleCreate = async () => {
    try {
      setError(null);
      const result = await createKey(newKeyName || 'default');
      setCreatedKey(result.apiKey);
      setCreateDialogOpen(false);
      setNewKeyName('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteKey(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleCopyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Stack spacing={4} sx={{ pb: 10 }}>
        {/* Header */}
        <Stack>
          <Typography variant="h3">{t('apiKeys.title')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('apiKeys.description')}
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Key Management */}
        <Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            disabled={keys.length >= 5}
            sx={{ mb: 2 }}>
            {t('apiKeys.createKey')}
          </Button>
          {keys.length >= 5 && (
            <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
              {t('apiKeys.maxKeysReached')}
            </Typography>
          )}

          {!loading && keys.length === 0 && (
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">{t('apiKeys.noKeys')}</Typography>
            </Paper>
          )}

          <Stack spacing={1}>
            {keys.map((key) => (
              <Paper
                key={key.id}
                variant="outlined"
                sx={{
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Box>
                  <Typography variant="subtitle2">{key.name}</Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {key.keyPreview}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {new Date(key.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>
                <IconButton
                  color="error"
                  size="small"
                  onClick={() => setDeleteTarget(key)}>
                  <DeleteIcon />
                </IconButton>
              </Paper>
            ))}
          </Stack>
        </Box>

        {/* Integration Examples */}
        <IntegrationExamples keyPreview={keys[0]?.keyPreview || ''} />
      </Stack>

      {/* Create Key Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('apiKeys.createKey')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t('apiKeys.keyName')}
            placeholder={t('apiKeys.keyNamePlaceholder')}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>{t('gateway.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate}>
            {t('apiKeys.createKey')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Created Key Display Dialog */}
      <Dialog open={!!createdKey} maxWidth="sm" fullWidth>
        <DialogTitle>{t('apiKeys.keyCreated')}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('apiKeys.saveWarning')}
          </Alert>
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              bgcolor: 'grey.100',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              wordBreak: 'break-all',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}>
            <Box sx={{ flex: 1 }}>{createdKey}</Box>
            <IconButton size="small" onClick={handleCopyKey}>
              <CopyIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setCreatedKey(null)}>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('apiKeys.deleteConfirm')}</DialogTitle>
        <DialogContent>
          <Typography>
            {deleteTarget?.name} ({deleteTarget?.keyPreview})
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('gateway.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
