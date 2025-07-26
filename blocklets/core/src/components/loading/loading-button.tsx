import { LoadingButtonProps, LoadingButton as MuiLoadingButton } from '@mui/lab';
import { MouseEvent, useCallback, useState } from 'react';

export default function LoadingButton({ onClick, ...props }: LoadingButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      try {
        setLoading(true);
        onClick?.(e);
      } finally {
        setLoading(false);
      }
    },
    [onClick]
  );

  return <MuiLoadingButton {...props} loading={props.loading || loading} onClick={handleClick} />;
}
