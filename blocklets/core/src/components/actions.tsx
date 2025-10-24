/* eslint-disable react/prop-types */
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { stopEvent } from '@blocklet/payment-react';
import { ExpandMoreOutlined, MoreHorizOutlined } from '@mui/icons-material';
import { Button, IconButton, ListItemText, Menu, MenuItem, Skeleton } from '@mui/material';
import React, { useRef, useState } from 'react';
import type { LiteralUnion } from 'type-fest';

type ActionItem = {
  label: string;
  handler: Function;
  color: LiteralUnion<'primary' | 'secondary' | 'error', string>;
  disabled?: boolean;
  divider?: boolean;
  dense?: boolean;
};

export type ActionsProps = {
  actions: ActionItem[];
  variant?: LiteralUnion<'compact' | 'normal' | 'outlined', string>;
  sx?: any;
  onOpenCallback?: Function;
};

export default function Actions(rawProps: ActionsProps) {
  const props: ActionsProps = Object.assign(
    {
      variant: 'compact',
      sx: {},
      onOpenCallback: null,
    },
    rawProps
  );
  const { t } = useLocaleContext();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const anchorRef = useRef(null);
  const [openLoading, setOpenLoading] = useState(false);

  const onOpen = (e: React.SyntheticEvent<any>) => {
    stopEvent(e);
    anchorRef.current = e.currentTarget;
    if (props.onOpenCallback && typeof props.onOpenCallback === 'function') {
      const result = props.onOpenCallback();
      if (result instanceof Promise) {
        setOpenLoading(true);
        result.finally(() => {
          setOpenLoading(false);
        });
      }
    }
    setAnchorEl(e.currentTarget);
  };

  const onClose = (e: React.SyntheticEvent<any>, handler?: Function) => {
    stopEvent(e);
    setAnchorEl(null);

    if (typeof handler === 'function') {
      handler();
    }
  };

  const renderButton = () => {
    if (props.variant === 'outlined') {
      return (
        <Button
          aria-label="actions"
          sx={{
            minWidth: 0,
            padding: '5px',
            ...props.sx,
          }}
          variant="outlined"
          onClick={onOpen}
          size="small">
          <MoreHorizOutlined />
        </Button>
      );
    }
    if (props.variant === 'compact') {
      return (
        <IconButton aria-label="actions" sx={props.sx} aria-haspopup="true" onClick={onOpen} size="small">
          <MoreHorizOutlined />
        </IconButton>
      );
    }
    return (
      <Button sx={props.sx} onClick={onOpen} size="small" variant="contained" color="primary">
        {t('common.actions')} <ExpandMoreOutlined fontSize="small" />
      </Button>
    );
  };

  return (
    <>
      {renderButton()}
      <Menu
        anchorEl={anchorEl}
        open={open}
        // @ts-ignore
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {props.actions.map((action) =>
          openLoading ? (
            <MenuItem key={action.label} dense disabled>
              <ListItemText
                primary={<Skeleton />}
                slotProps={{
                  primary: { width: '56px' },
                }}
              />
            </MenuItem>
          ) : (
            <MenuItem
              key={action.label}
              divider={!!action.divider}
              dense={!!action.dense}
              disabled={!!action.disabled}
              onClick={(e) => onClose(e, action.handler)}>
              <ListItemText
                primary={action.label}
                slotProps={{
                  primary: { color: action.color },
                }}
              />
            </MenuItem>
          )
        )}
      </Menu>
    </>
  );
}
