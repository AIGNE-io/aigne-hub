import { FormLabel } from '@blocklet/aigne-hub/components';
import { Box, InputAdornment, TextField, Typography } from '@mui/material';
import type { TextFieldProps } from '@mui/material';
import get from 'lodash/get';
import React, { ReactNode, useImperativeHandle, useRef } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import type { Control, FieldPath, FieldValues, RegisterOptions } from 'react-hook-form';

type BaseInputProps<T extends FieldValues = FieldValues> = {
  name: FieldPath<T>;
  label?: ReactNode;
  placeholder?: string;
  errorPosition?: 'right' | 'bottom';
  rules?: RegisterOptions;
  wrapperStyle?: React.CSSProperties;
  required?: boolean;
  tooltip?: ReactNode | string;
  description?: ReactNode | string;
  control?: Control<T>;
};

type CustomRenderProps = {
  field: { value: any; onChange: (value: any) => void; onBlur: () => void };
  error?: string;
  hasError: boolean;
};

type InputProps<T extends FieldValues = FieldValues> = BaseInputProps<T> &
  TextFieldProps & {
    type?: 'text' | 'custom';
    render?: (props: CustomRenderProps) => ReactNode;
  };

function FormInputError({ error }: { error: string }) {
  return (
    <InputAdornment position="end">
      <Typography component="span" color="error">
        {error}
      </Typography>
    </InputAdornment>
  );
}

export default function FormInput<T extends FieldValues = FieldValues>({
  ref = undefined,
  name,
  label = '',
  placeholder = '',
  rules = {},
  errorPosition = 'bottom',
  wrapperStyle = {},
  required = false,
  tooltip = '',
  description = '',
  control: externalControl = undefined,
  type = 'text',
  render = undefined,
  ...rest
}: InputProps<T> & {
  ref?: React.RefObject<HTMLInputElement | null>;
}) {
  const formContext = useFormContext<T>();
  const control = externalControl || formContext?.control;
  const formState = formContext?.formState;

  const inputRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(ref, () => {
    return inputRef.current as HTMLInputElement;
  });

  const error = get(formState?.errors, name)?.message as string;
  const hasError = !!get(formState?.errors, name);

  if (!control) {
    throw new Error('FormInput must be used within a FormProvider or with a control prop');
  }

  return (
    <Controller
      name={name}
      control={control}
      rules={rules as any}
      render={({ field }) => (
        <Box sx={{ width: '100%', ...wrapperStyle }}>
          {!!label && (
            <FormLabel required={required} tooltip={tooltip} description={description}>
              {label}
            </FormLabel>
          )}

          {type === 'custom' && render ? (
            render({ field, error, hasError })
          ) : (
            <TextField
              fullWidth
              error={hasError}
              helperText={errorPosition === 'bottom' && error ? error : ''}
              placeholder={placeholder}
              size="small"
              {...field}
              {...rest}
              inputRef={inputRef}
              slotProps={{
                ...(rest.slotProps || {}),
                input: Object.assign(
                  rest.slotProps?.input || {},
                  errorPosition === 'right' && error ? { endAdornment: <FormInputError error={error} /> } : {}
                ),
              }}
            />
          )}
        </Box>
      )}
    />
  );
}
