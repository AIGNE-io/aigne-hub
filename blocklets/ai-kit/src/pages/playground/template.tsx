import Toast from '@arcblock/ux/lib/Toast';
import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import styled from '@emotion/styled';
import { ArrowDropDown, CopyAll } from '@mui/icons-material';
import {
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  ListItemText,
  MenuItem,
  TextField,
  TextFieldProps,
} from '@mui/material';
import { useLocalStorageState, useMount, useReactive } from 'ahooks';
import { produce } from 'immer';
import { pick } from 'lodash';
import { nanoid } from 'nanoid';
import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';

import Conversation, { ConversationRef } from '../../components/conversation';
import useMenu from '../../utils/use-menu';

const nextId = () => nanoid(16);

type ParameterType = 'number' | 'string';

type Parameter = { type?: ParameterType; value?: any; [key: string]: any };

const INIT_FORM = {
  id: '',
  name: '',
  description: '',
  template: '',
};

export default function TemplateView() {
  const templates = useTemplates();

  const { menu, showMenu } = useMenu();

  const conversation = useRef<ConversationRef>(null);

  const form = useReactive<Pick<Template, 'id' | 'name' | 'description' | 'template'>>({ ...INIT_FORM });
  const setForm = useCallback(
    (t: Template) => Object.assign(form, INIT_FORM, pick(t, ['id', 'name', 'description', 'template'])),
    []
  );

  useMount(() => {
    const first =
      templates.templates.at(0) ??
      templates.setTemplate({
        id: nextId(),
        name: 'Tweet Assistant',
        description: 'Generate your tweets in seconds',
        template: 'Write a tweet thread of {{num}} in {{language}} about {{topic}}.',
        parameters: {
          num: { type: 'number', value: 3 },
          language: { type: 'string', value: 'English' },
          topic: { type: 'string', multiline: true, value: 'web3 and ArcBlock' },
        },
      });
    setForm(first);
    setParamsMap(first.parameters);
  });

  const deferredTemplate = useDeferredValue(form.template);

  const params = useMemo(
    () => [...new Set(Array.from(deferredTemplate.matchAll(/{{\s*(\w+)\s*}}/g)).map((i) => i[1]!))],
    [deferredTemplate]
  );

  const [paramsMap, setParamsMap] = useState<{ [key: string]: Parameter }>({});

  const submit = () => {
    if (form.id) {
      templates.setTemplate({ ...form, parameters: paramsMap });
    }
    let prompt = form.template;
    for (const param of params) {
      prompt = prompt.replace(new RegExp(`{{\\s*(${param})\\s*}}`, 'g'), paramsMap[param]?.value || '');
    }
    conversation.current?.addConversation(prompt);
  };

  const templateSelector = (
    <IconButton
      tabIndex={-1}
      size="small"
      onClick={(e) => {
        showMenu({
          anchorEl: e.currentTarget,
          sx: { maxHeight: '50vh' },
          children:
            templates.templates.length > 0 ? (
              templates.templates.map((item) => (
                <MenuItem
                  key={item.id}
                  onClick={() => {
                    setForm(item);
                    setParamsMap(item.parameters);
                  }}>
                  <ListItemText
                    sx={{ maxWidth: 200 }}
                    primary={item.name || item.id}
                    primaryTypographyProps={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                    secondary={item.description || item.template}
                    secondaryTypographyProps={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled>
                <ListItemText primary="Nothing" />
              </MenuItem>
            ),
        });
      }}>
      <ArrowDropDown />
    </IconButton>
  );

  return (
    <Root footerProps={{ className: 'dashboard-footer' }}>
      <Conversation className="conversation" ref={conversation} sx={{ flex: 1 }} />

      <Divider orientation="vertical" />

      <Box flex={1} m={2}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Name"
              size="small"
              value={form.name}
              onChange={(e) => (form.name = e.target.value)}
              InputProps={{
                sx: { pr: 0.5 },
                endAdornment: <InputAdornment position="end">{templateSelector}</InputAdornment>,
              }}
            />
            {menu}
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              size="small"
              value={form.description}
              onChange={(e) => (form.description = e.target.value)}
              multiline
              minRows={2}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Template"
              size="small"
              multiline
              minRows={2}
              value={form.template}
              onChange={(e) => (form.template = e.target.value)}
            />
          </Grid>
          {params.map((param) => (
            <Grid item xs={12} key={param}>
              <Box display="flex" justifyContent="space-between">
                <ParameterRenderer
                  key={`${form.id}-${param}`}
                  sx={{ flex: 1, mr: 2 }}
                  size="small"
                  label={param}
                  parameter={paramsMap[param]}
                  value={paramsMap[param]?.value}
                  onChange={(value) => setParamsMap((v) => ({ ...v, [param]: { ...v[param]!, value } }))}
                />
                <ParameterTypeSelect
                  key={`${form.id}-${param}-type`}
                  inputProps={{ tabIndex: -1 }}
                  value={paramsMap[param]}
                  onChange={(value) => setParamsMap((v) => ({ ...v, [param]: value! }))}
                />
              </Box>
            </Grid>
          ))}
          <Grid item xs={12} mt={2} display="flex">
            <Button sx={{ flex: 1 }} variant="contained" onClick={submit}>
              Execute
            </Button>
            <Button
              variant="outlined"
              sx={{ mx: 1 }}
              onClick={() => {
                setForm(templates.setTemplate({ ...form, id: form.id || nextId(), parameters: paramsMap }));
                Toast.success('Saved');
              }}>
              Save
            </Button>
            <Button
              variant="outlined"
              sx={{ mr: 1 }}
              onClick={() => {
                setForm(templates.setTemplate({ ...form, id: nextId(), parameters: paramsMap }));
                Toast.success('Saved');
              }}>
              Save As New
            </Button>
            <Button
              startIcon={<CopyAll />}
              variant="outlined"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify({ ...form, parameters: paramsMap }));
                Toast.success('Copied');
              }}>
              Copy
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Root>
  );
}

interface Template {
  id: string;
  name: string;
  description: string;
  template: string;
  parameters: { [key: string]: Parameter };
}

function useTemplates() {
  const [templates, setTemplates] = useLocalStorageState<Template[]>('PlaygroundTemplates', { defaultValue: [] });

  const setTemplate = useCallback((template: Template) => {
    setTemplates((v = []) =>
      produce(v, (draft) => {
        const old = draft.find((i) => i.id === template.id);
        if (old) {
          Object.assign(old, template);
        } else {
          draft.unshift(template);
        }
      })
    );
    return template;
  }, []);

  return { templates, setTemplates, setTemplate };
}

const Root = styled(Dashboard)`
  > .dashboard-body > .dashboard-main {
    > .dashboard-content {
      display: flex;
      padding-left: 0;
      padding-right: 0;
      overflow: hidden;

      @media (max-width: 800px) {
        flex-direction: column;
        overflow: auto;

        > .conversation {
          overflow: unset;
          flex-grow: 0;
        }

        > .MuiDivider-root {
          height: 1px;
          width: 100%;
          margin: 32px 0;
          border-bottom: 1px solid #eee;
        }
      }
    }

    > .dashboard-footer {
      margin-top: 0;
      padding: 0;
    }
  }
`;

const PARAMETER_SELECT_MAP: { [key in ParameterType]: (value: Parameter) => string } = {
  number: () => 'number',
  string: (value) => (value.multiline ? 'long-text' : 'text'),
};

const PARAMETER_SELECT_VALUE_MAP: { [key: string]: Parameter } = {
  text: { type: 'string' },
  'long-text': { type: 'string', multiline: true },
  number: { type: 'number' },
};

function ParameterTypeSelect({
  value,
  onChange,
  ...props
}: { value?: Parameter; onChange: (value?: Parameter) => void } & Omit<TextFieldProps, 'value' | 'onChange'>) {
  const v = value?.type ? PARAMETER_SELECT_MAP[value.type](value) : 'text';

  return (
    <TextField
      {...props}
      sx={{ width: 130 }}
      size="small"
      select
      value={v}
      onChange={(e) => onChange(PARAMETER_SELECT_VALUE_MAP[e.target.value])}>
      <MenuItem value="text">Short Text</MenuItem>
      <MenuItem value="long-text">Long Text</MenuItem>
      <MenuItem value="number">Number</MenuItem>
    </TextField>
  );
}

function ParameterRenderer({
  parameter,
  value,
  onChange,
  ...props
}: { parameter?: Parameter; value?: string; onChange?: (value: string) => void } & Omit<TextFieldProps, 'onChange'>) {
  const multiline = parameter?.type === 'string' && parameter.multiline;

  return (
    <TextField
      {...props}
      inputProps={
        parameter?.type === 'number'
          ? {
              type: 'number',
              inputMode: 'numeric',
              pattern: '[0-9]*',
            }
          : undefined
      }
      multiline={multiline}
      minRows={multiline ? 2 : undefined}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
