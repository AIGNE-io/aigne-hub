import { Send } from '@mui/icons-material';
import { Box, BoxProps, IconButton, Input, InputAdornment } from '@mui/material';
import { useHistoryTravel } from 'ahooks';
import { Ref, useState } from 'react';

export default function Prompt({
  onSubmit,
  inputRef,
  ...props
}: { onSubmit: (prompt: string) => any; inputRef?: Ref<any> } & Omit<BoxProps, 'onSubmit'>) {
  const [prompt, setPrompt] = useState('');

  const { value: historyPrompt, setValue: setHistoryPrompt, forwardLength, back, go, forward } = useHistoryTravel('');
  const submit = () => {
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
      sx={{ boxShadow: 2, borderRadius: 1, display: 'flex', alignItems: 'center', ...props.sx }}
      component="form"
      onSubmit={(e) => e.preventDefault()}>
      <Input
        inputRef={inputRef}
        fullWidth
        disableUnderline
        value={prompt}
        multiline
        maxRows={10}
        sx={{ py: 0.8, px: 1 }}
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
      />
    </Box>
  );
}
