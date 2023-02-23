import Dashboard from '@blocklet/ui-react/lib/Dashboard';
import styled from '@emotion/styled';

import Conversation from '../../components/conversation';

export default function Chat() {
  return (
    <Root footerProps={{ className: 'dashboard-footer' }}>
      <Conversation maxWidth={800} />
    </Root>
  );
}

const Root = styled(Dashboard)`
  > .dashboard-body > .dashboard-main {
    > .dashboard-content {
      display: flex;
      flex-direction: column;
      padding-left: 0;
      padding-right: 0;
      overflow: hidden;
    }

    > .dashboard-footer {
      margin-top: 0;
      padding: 0;
    }
  }
`;
