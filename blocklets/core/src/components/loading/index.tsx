import { Box, BoxProps, CircularProgress } from '@mui/material';

export interface LoadingProps extends BoxProps {}

export default function Loading(props: LoadingProps) {
  return (
    <Box
      {...props}
      sx={[
        {
          display: 'flex',
          flex: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}>
      <CircularProgress size={30} />
    </Box>
  );
}
