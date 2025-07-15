import { Switch } from '@mui/material';
import type { SwitchProps as MuiSwitchProps } from '@mui/material';
import { styled } from '@mui/system';
import type { LiteralUnion } from 'type-fest';

type CustomSwitchProps = {
  variant?: LiteralUnion<'success' | 'error' | 'warning' | 'info' | 'primary' | 'secondary', string>;
} & MuiSwitchProps;

const SwitchButton: React.FC<CustomSwitchProps> = styled(Switch)<CustomSwitchProps>(
  ({ variant = 'success', theme }) => ({
    width: 28,
    height: 16,
    padding: 0,
    display: 'inline-flex',
    '&:active': {
      '& .MuiSwitch-thumb': {
        width: 15,
      },
      '& .MuiSwitch-switchBase.Mui-checked': {
        transform: 'translateX(9px)',
      },
    },
    '& .MuiSwitch-switchBase': {
      padding: 2,
      '&.Mui-checked': {
        transform: 'translateX(12px)',
        color: '#fff',
        '& + .MuiSwitch-track': {
          opacity: 1,
          backgroundColor: theme.palette[variant]?.light,
        },
      },
    },
    '& .MuiSwitch-thumb': {
      boxShadow: '0 2px 4px 0 rgb(0 35 11 / 20%)',
      width: 12,
      height: 12,
      borderRadius: 6,
      transition: (theme.transitions as any)?.create(['width'], {
        duration: 200,
      }),
    },
    '& .MuiSwitch-track': {
      borderRadius: 16 / 2,
      opacity: 1,
      backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)',
      boxSizing: 'border-box',
    },
  })
);

export default SwitchButton;
