import type { ReactNode } from 'react';

interface UserCenterProps {
  children?: ReactNode;
  [key: string]: unknown;
}

export function UserCenter({ children, ...rest }: UserCenterProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} {...rest}>
      {children}
    </div>
  );
}

export default UserCenter;
