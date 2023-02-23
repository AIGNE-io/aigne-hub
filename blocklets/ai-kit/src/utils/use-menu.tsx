import { Menu, MenuProps } from '@mui/material';
import { useCallback, useMemo, useState } from 'react';

export default function useMenu() {
  const [props, setProps] = useState<MenuProps>();

  const menu = useMemo(() => (props ? <Menu {...props} /> : null), [props]);

  const closeMenu = useCallback(() => {
    setProps(undefined);
  }, []);

  const showMenu = useCallback(
    (props: Omit<MenuProps, 'open'>) => {
      setProps({
        ...props,
        open: true,
        onClose: props.onClose ?? closeMenu,
        onClick: closeMenu,
      });
    },
    [closeMenu]
  );

  return { menu, showMenu, closeMenu };
}
