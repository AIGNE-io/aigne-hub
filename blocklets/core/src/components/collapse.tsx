/* eslint-disable react/prop-types */
import { ExpandLessOutlined, ExpandMoreOutlined } from '@mui/icons-material';
import { Box, Collapse, Stack } from '@mui/material';
import { useEffect, useState } from 'react';

type Props = {
  trigger: string | ((expanded: boolean) => React.ReactNode) | React.ReactNode;
  children?: React.ReactNode;
  expanded?: boolean;
  addons?: React.ReactNode;
  style?: Record<string, any>;
  value?: string;
  onChange?: (value: string, expanded: boolean) => void;
  lazy?: boolean;
  card?: boolean;
};

export default function IconCollapse(rawProps: Props) {
  const props = Object.assign(
    {
      value: '',
      onChange: () => {},
      children: null,
      expanded: false,
      addons: null,
      style: {},
      lazy: true,
      card: false,
    },
    rawProps
  );
  const [expanded, setExpanded] = useState(props.expanded || false);
  const toggleExpanded = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
  };

  useEffect(() => {
    setExpanded(props.expanded || false);
  }, [props.expanded]);

  return (
    <>
      <Stack
        direction="row"
        onClick={(e) => {
          e.stopPropagation();
          props.onChange?.(props.value || '', !expanded);
          toggleExpanded();
        }}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 1,
          cursor: 'pointer',
          fontWeight: 500,
          color: 'text.primary',
          '& :hover': { color: 'primary.main' },
          ...(props.card && {
            borderRadius: 1,
            padding: 1,
            pl: 2,
            backgroundColor: 'grey.100',
          }),
          ...props.style,
        }}>
        <Box>{typeof props.trigger === 'function' ? props.trigger(expanded) : props.trigger}</Box>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
          }}>
          {props.addons} {expanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
        </Stack>
      </Stack>
      <Collapse in={expanded} sx={{ width: '100%' }}>
        {expanded || props.lazy ? props.children : null}
      </Collapse>
    </>
  );
}
