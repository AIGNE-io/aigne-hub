import { getPrefix } from '@app/libs/util';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { CloudQueue as GatewayIcon, ExpandMore, Search as SearchIcon } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useRequest } from 'ahooks';
import { useCallback, useMemo, useState } from 'react';
import { joinURL } from 'ufo';

import api from '@app/libs/api';

interface CatalogEntry {
  provider: string;
  model: string;
  displayName: string;
  type: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  alreadyAdded: boolean;
  dbProviderId: string | null;
}

interface CatalogData {
  totalModels: number;
  providers: string[];
  groups: Record<string, CatalogEntry[]>;
}

export default function ImportCatalogDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useLocaleContext();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useGateway, setUseGateway] = useState(true);
  const [importing, setImporting] = useState(false);

  const { data: catalog, loading } = useRequest<CatalogData, []>(
    async () => {
      const res = await api.get('/api/ai-providers/model-catalog');
      return res.data;
    },
    { refreshDeps: [open], ready: open }
  );

  const filteredGroups = useMemo(() => {
    if (!catalog) return {};
    const q = search.toLowerCase();
    const result: Record<string, CatalogEntry[]> = {};
    for (const [provider, entries] of Object.entries(catalog.groups)) {
      const filtered = q
        ? entries.filter(
            (e) =>
              e.model.toLowerCase().includes(q) ||
              e.displayName.toLowerCase().includes(q) ||
              provider.toLowerCase().includes(q)
          )
        : entries;
      if (filtered.length > 0) result[provider] = filtered;
    }
    return result;
  }, [catalog, search]);

  const toggleModel = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleProvider = useCallback(
    (provider: string, entries: CatalogEntry[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const available = entries.filter((e) => !e.alreadyAdded);
        const allSelected = available.every((e) => next.has(`${e.provider}/${e.model}`));
        for (const e of available) {
          const key = `${e.provider}/${e.model}`;
          if (allSelected) next.delete(key);
          else next.add(key);
        }
        return next;
      });
    },
    []
  );

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const models = Array.from(selected).map((key) => {
        const [provider, ...rest] = key.split('/');
        return { provider, model: rest.join('/') };
      });
      const res = await api.post('/api/ai-providers/import-from-catalog', { models, useGateway });
      const { created, skipped, errors } = res.data;
      Toast.success(`Imported ${created} models${skipped ? `, ${skipped} skipped` : ''}${errors?.length ? `, ${errors.length} errors` : ''}`);
      setSelected(new Set());
      onImported();
      onClose();
    } catch (err: any) {
      Toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const formatPrice = (cost: number) => {
    const perMillion = cost * 1e6;
    if (perMillion >= 1) return `$${perMillion.toFixed(2)}`;
    return `$${perMillion.toFixed(4)}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { height: '80vh' } }}>
      <DialogTitle>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Import Models from Catalog</Typography>
          <Chip label={`${selected.size} selected`} color="primary" size="small" />
        </Stack>
      </DialogTitle>

      <Box sx={{ px: 3, pb: 1 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 20 }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flex: 1 }}
          />
          <FormControlLabel
            control={<Switch checked={useGateway} onChange={(e) => setUseGateway(e.target.checked)} size="small" />}
            label={
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <GatewayIcon sx={{ fontSize: 16 }} />
                <Typography variant="body2">AI Gateway</Typography>
              </Stack>
            }
          />
        </Stack>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          Object.entries(filteredGroups).map(([provider, entries]) => {
            const available = entries.filter((e) => !e.alreadyAdded);
            const selectedCount = available.filter((e) => selected.has(`${e.provider}/${e.model}`)).length;
            const allSelected = available.length > 0 && selectedCount === available.length;

            return (
              <Accordion key={provider} defaultExpanded={entries.length <= 20}>
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', width: '100%' }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={selectedCount > 0 && !allSelected}
                      onChange={() => toggleProvider(provider, entries)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                    />
                    <Avatar
                      src={joinURL(getPrefix(), `/logo/${provider}.png`)}
                      sx={{ width: 24, height: 24 }}
                      alt={provider}
                    />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                      {provider}
                    </Typography>
                    <Chip label={`${entries.length} models`} size="small" variant="outlined" />
                    {selectedCount > 0 && (
                      <Chip label={`${selectedCount} selected`} size="small" color="primary" />
                    )}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 0.5,
                    }}>
                    {entries.map((entry) => {
                      const key = `${entry.provider}/${entry.model}`;
                      const isSelected = selected.has(key);
                      return (
                        <Box
                          key={key}
                          onClick={() => !entry.alreadyAdded && toggleModel(key)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 1,
                            cursor: entry.alreadyAdded ? 'default' : 'pointer',
                            opacity: entry.alreadyAdded ? 0.5 : 1,
                            bgcolor: isSelected ? 'primary.50' : 'transparent',
                            '&:hover': entry.alreadyAdded ? {} : { bgcolor: isSelected ? 'primary.100' : 'grey.50' },
                          }}>
                          <Checkbox checked={isSelected} disabled={entry.alreadyAdded} size="small" sx={{ p: 0.25 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: isSelected ? 600 : 400 }}>
                              {entry.displayName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {formatPrice(entry.inputCostPerToken)} / {formatPrice(entry.outputCostPerToken)} per 1M tokens
                            </Typography>
                          </Box>
                          {entry.alreadyAdded && (
                            <Chip label="Added" size="small" variant="outlined" sx={{ fontSize: 11 }} />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleImport} disabled={selected.size === 0 || importing} startIcon={importing ? <CircularProgress size={16} /> : undefined}>
          {importing ? 'Importing...' : `Import ${selected.size} Models`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
