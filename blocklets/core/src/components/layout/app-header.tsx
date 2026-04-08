import { CreditButton } from '@blocklet/aigne-hub/components';
import Header from '@blocklet/ui-react/lib/Header';
import { ReactNode } from 'react';

const isCfMode = !!(window.blocklet as any)?.__cfMode;

interface AppHeaderProps {
  showCreditButton?: boolean;
  borderBottom?: boolean;
  sx?: Record<string, unknown>;
}

export default function AppHeader({ showCreditButton = true, borderBottom = false, sx }: AppHeaderProps) {
  return (
    <Header
      // @ts-ignore
      maxWidth={false}
      bordered={borderBottom || isCfMode}
      addons={showCreditButton ? (exists: ReactNode[]) => [<CreditButton key="credit" />, ...exists] : undefined}
      meta={undefined}
      sessionManagerProps={
        isCfMode
          ? {
              showRole: true,
              switchDid: false,
              switchProfile: false,
              switchPassport: false,
            }
          : undefined
      }
      homeLink={undefined}
      theme={undefined}
      hideNavMenu={undefined}
      sx={{
        ...(borderBottom ? { borderBottom: '1px solid', borderColor: 'divider' } : {}),
        ...sx,
      }}
    />
  );
}
