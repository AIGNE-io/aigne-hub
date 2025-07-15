/* eslint-disable react-hooks/exhaustive-deps */
import { PaymentProvider } from '@blocklet/payment-react';
import { UserCenter } from '@blocklet/ui-react/lib/UserCenter';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSessionContext } from '../../contexts/session';

export default function UserLayout(props: any) {
  const { session, connectApi, events } = useSessionContext();
  const [params] = useSearchParams();
  const embed = params.get('embed') || sessionStorage.getItem('embed');

  useEffect(() => {
    if (embed) {
      sessionStorage.setItem('embed', embed);
    }
  }, [embed]);

  useEffect(() => {
    events.once('logout', () => {
      session.login(() => {}, { openMode: 'redirect', redirect: window.location.href });
    });
  }, []);

  useEffect(() => {
    if (session.initialized && !session.user) {
      // @ts-ignore
      session.login(() => {}, { openMode: 'redirect', redirect: window.location.href });
    }
  }, [session.initialized]);

  if (session.user) {
    return (
      <PaymentProvider session={session} connect={connectApi}>
        <UserCenter
          currentTab={`${window.blocklet.prefix}customer`}
          userDid={session.user.did}
          hideFooter
          embed={embed === '1'}
          notLoginContent="undefined">
          {props.children}
        </UserCenter>
      </PaymentProvider>
    );
  }
  return null;
}
