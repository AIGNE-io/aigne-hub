import { Box, BoxProps, CircularProgress } from '@mui/material';

export interface LoadingProps extends BoxProps {}

export default function Loading(props: LoadingProps) {
  return (
    <Box display="flex" flex={1} height="100%" alignItems="center" justifyContent="center" {...props}>
      <CircularProgress size={30} />
    </Box>
  );
}
