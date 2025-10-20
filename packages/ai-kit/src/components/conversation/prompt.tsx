import { Send } from '@mui/icons-material';
import { Box, BoxProps, IconButton, Input, SxProps } from '@mui/material';
import { useHistoryTravel } from 'ahooks';
import { ReactNode, useState } from 'react';

export interface PromptProps extends Omit<BoxProps<'form'>, 'onSubmit' | 'sx'> {
  onSubmit: (prompt: string) => any;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  topAdornment?: ReactNode;
  slotProps?: any;
  sx?: SxProps;
  placeholder?: string;
}

export default function Prompt({
  startAdornment = undefined,
  endAdornment = undefined,
  topAdornment = undefined,
  onSubmit,
  slotProps = {},
  sx = {},
  placeholder = 'Type your message...',
  ...props
}: PromptProps) {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);

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

  const charCount = prompt.length;
  const showCharCount = isFocused && charCount > 0;

  return (
    <Box
      {...props}
      sx={{ display: 'flex', flexDirection: 'column', gap: { sx: 0.5, md: 1.5 }, ...sx }}
      component="form"
      onSubmit={(e: React.FormEvent<HTMLFormElement>) => e.preventDefault()}>
      {/* Toolbar above input */}
      {topAdornment && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            pl: 1,
          }}>
          {topAdornment}
        </Box>
      )}

      {/* Input area */}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'stretch',
          gap: 1.5,
          p: 1.5,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          transition: 'all 0.2s ease',
          bgcolor: 'background.paper',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
            borderColor: 'primary.main',
          },
          '&:focus-within': {
            boxShadow: '0 4px 20px rgba(25, 118, 210, 0.2)',
            borderColor: 'primary.main',
          },
        }}>
        {startAdornment}
        <Input
          fullWidth
          disableUnderline
          value={prompt}
          multiline
          maxRows={10}
          placeholder={placeholder}
          sx={{
            py: 0,
            px: 0,
            fontSize: { xs: '14px', md: '15px' },
            border: 'none',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
            '&.Mui-focused': {
              boxShadow: 'none',
            },
          }}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
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
          {...slotProps}
        />
        <IconButton
          onClick={submit}
          size="small"
          type="submit"
          disabled={!prompt.trim()}
          sx={{
            bgcolor: prompt.trim() ? 'primary.main' : 'action.disabledBackground',
            color: prompt.trim() ? 'primary.contrastText' : 'action.disabled',
            transition: 'all 0.2s ease',
            alignSelf: 'flex-end',
            flexShrink: 0,
            '&:hover': {
              bgcolor: prompt.trim() ? 'primary.dark' : 'action.disabledBackground',
              transform: prompt.trim() ? 'scale(1.05)' : 'none',
            },
            '&.Mui-disabled': {
              bgcolor: 'action.disabledBackground',
              color: 'action.disabled',
            },
          }}>
          <Send fontSize="small" />
        </IconButton>
        {showCharCount && (
          <Box
            sx={{
              position: 'absolute',
              bottom: -24,
              right: 8,
              fontSize: '11px',
              color: 'text.secondary',
              opacity: 0.7,
            }}>
            {charCount} characters
          </Box>
        )}
      </Box>
      {endAdornment}
    </Box>
  );
}
