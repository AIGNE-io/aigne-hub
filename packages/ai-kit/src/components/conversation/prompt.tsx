import { Send } from '@mui/icons-material';
import { Box, BoxProps, IconButton, Input, InputAdornment, SxProps } from '@mui/material';
import { useHistoryTravel } from 'ahooks';
import { ReactNode, useState } from 'react';

export interface PromptProps extends Omit<BoxProps<'form'>, 'onSubmit' | 'sx'> {
  onSubmit: (prompt: string) => any;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  slotProps?: any;
  sx?: SxProps;
}

export default function Prompt({
  startAdornment = undefined,
  endAdornment = undefined,
  onSubmit,
  slotProps = {},
  sx = {},
  ...props
}: PromptProps) {
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
      sx={{ display: 'flex', gap: 1, alignItems: 'center', ...sx }}
      component="form"
      onSubmit={(e: React.FormEvent<HTMLFormElement>) => e.preventDefault()}>
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
          if (e.keyCode === 229) {
            return;
          }
          if (!e.shiftKey && e.key === 'Enter') {
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
        {...slotProps}
      />

      {endAdornment}
    </Box>
  );
}
