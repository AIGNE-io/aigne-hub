import { Send } from '@mui/icons-material';
import { Box, BoxProps, IconButton, Input, InputAdornment, InputProps } from '@mui/material';
import { useHistoryTravel } from 'ahooks';
import { ReactNode, useState } from 'react';

export interface PromptProps extends Omit<BoxProps, 'onSubmit'> {
  onSubmit: (prompt: string) => any;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  InputProps?: Partial<InputProps>;
}

export default function Prompt({ startAdornment, endAdornment, onSubmit, InputProps, ...props }: PromptProps) {
  const [prompt, setPrompt] = useState('');

  const { value: historyPrompt, setValue: setHistoryPrompt, forwardLength, back, go, forward } = useHistoryTravel('');
  const submit = () => {
    if (!prompt.trim()) {
      return;
    }

    go(forwardLength);
    // wait for history to set before submitting
    setTimeout(() => {
      setHistoryPrompt(prompt);
      onSubmit(prompt);
      setPrompt('');
    }, 50);
  };

  return (
    <Box
      {...props}
      sx={{ display: 'flex', gap: 1, alignItems: 'center', ...props.sx }}
      component="form"
      onSubmit={(e) => e.preventDefault()}>
      {startAdornment}

      <Input
        fullWidth
        disableUnderline
        value={prompt}
        multiline
        maxRows={10}
        sx={{ py: 0.8, px: 1, boxShadow: 2, borderRadius: 1 }}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.metaKey && e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            back();
            setPrompt(historyPrompt || '');
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            forward();
            setPrompt(historyPrompt || '');
          }
        }}
        endAdornment={
          <InputAdornment position="end">
            <IconButton onClick={submit} size="small" type="submit">
              <Send fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
        {...InputProps}
      />

      {endAdornment}
    </Box>
  );
}
