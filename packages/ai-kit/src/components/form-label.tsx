import { InfoOutlined } from '@mui/icons-material';
import { Box, FormLabel, Tooltip, Typography } from '@mui/material';
import type { FormLabelProps } from '@mui/material';
import type { ReactNode } from 'react';

export default function CustomFormLabel({
  children,
  required = false,
  tooltip = '',
  description = '',
  ...props
}: FormLabelProps & { required?: boolean; tooltip?: ReactNode | string; description?: ReactNode | string }) {
  return (
    <Box sx={{ mb: 1, width: '100%' }}>
      <FormLabel
        {...props}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'text.primary',
          '&.MuiFormLabel-root': {
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            fontWeight: 500,
            color: 'text.primary',
          },
          ...(props.sx || {}),
        }}>
        {children}
        {required && (
          <Typography component="span" color="error">
            *
          </Typography>
        )}
        {tooltip &&
          (typeof tooltip === 'string' ? (
            <Tooltip title={tooltip}>
              <InfoOutlined fontSize="small" sx={{ opacity: 0.7, fontSize: '1rem' }} />
            </Tooltip>
          ) : (
            tooltip
          ))}
      </FormLabel>
      {description && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}>
          {description}
        </Typography>
      )}
    </Box>
  );
}
