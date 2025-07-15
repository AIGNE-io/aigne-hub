import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import * as React from 'react';

type Props = {
  pending?: boolean;
};

export default function ProgressBar({ pending = true }: Props) {
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(
      () => {
        setProgress((oldProgress) => {
          if (oldProgress === 100) {
            if (timer) {
              clearInterval(timer);
            }
            return -1;
          }
          const diff = Math.random() * 10;
          return Math.min(oldProgress + diff, 100);
        });
      },
      pending ? 500 : 30
    ); // 如果已完成，就加速

    return () => {
      clearInterval(timer);
    };
  }, [pending]);
  return (
    <Box sx={{ width: '100%', height: '4px', position: 'fixed', top: 0, left: 0, zIndex: '999999' }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{ opacity: progress === -1 ? 0 : 1, transition: '0.3s' }}
      />
    </Box>
  );
}

const Transition = React.createContext({} as any);

export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = React.useTransition();
  const memoObj = React.useMemo(() => ({ isPending, startTransition }), [isPending]);
  return <Transition.Provider value={memoObj}>{children}</Transition.Provider>;
}

export function useTransitionContext() {
  return React.useContext(Transition);
}
