import { FormLabel } from '@blocklet/aigne-hub/components';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';

import EnterHint from './enter-hint';

interface CustomAutocompleteProps {
  label: string;
  placeholder?: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  disabled?: boolean;
}

export default function CustomAutocomplete({
  label,
  placeholder = '',
  options,
  value,
  onChange,
  inputValue,
  onInputChange,
  disabled = false,
}: CustomAutocompleteProps) {
  return (
    <Box>
      <FormLabel sx={{ mb: 1 }}>{label}</FormLabel>
      <Autocomplete
        multiple
        freeSolo
        disabled={disabled}
        options={options}
        value={value}
        onChange={(_, newValue) => {
          onChange(newValue);
        }}
        renderInput={(params) => <TextField {...params} size="small" placeholder={placeholder} />}
        renderOption={(props, option) => (
          <Box component="li" {...props}>
            {option === inputValue ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                }}>
                <Typography variant="body1" sx={{ fontWeight: 500, color: 'primary.main' }}>
                  ✨ {option}
                </Typography>
                <EnterHint />
              </Box>
            ) : (
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {option}
              </Typography>
            )}
          </Box>
        )}
        inputValue={inputValue}
        onInputChange={(_, newInputValue) => {
          onInputChange(newInputValue);
        }}
        filterOptions={(options) => {
          const filtered = options.filter((option) => option.toLowerCase().includes(inputValue.toLowerCase()));
          if (inputValue && !filtered.includes(inputValue)) {
            filtered.unshift(inputValue);
          }
          return filtered;
        }}
      />
    </Box>
  );
}
