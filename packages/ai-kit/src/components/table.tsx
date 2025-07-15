import Datatable from '@arcblock/ux/lib/Datatable';
import Empty from '@arcblock/ux/lib/Empty';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { useMediaQuery, useTheme } from '@mui/material';
// eslint-disable-next-line import/no-extraneous-dependencies
import { styled } from '@mui/system';
/* eslint-disable @typescript-eslint/indent */
import React from 'react';

import withLocaleProvider from '../utils/withLocaleProvider';

function EmptyStub() {
  return null;
}

const Table = React.memo(
  ({ options, columns, toolbar = true, footer = true, hasRowLink = false, emptyNodeText = '', ...rest }: any) => {
    const { locale, t } = useLocaleContext();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const defaultOptions = {
      print: false,
      download: false,
      filter: false,
      selectableRows: 'none',
      rowsPerPage: isMobile ? 5 : 10,
      rowsPerPageOptions: [5, 10, 20, 50, 100],
      searchDebounceTime: 300,
      tableBodyHeight: '100%',
      loading: true,
    };

    const components: any = {};
    if (!toolbar) {
      components.TableToolbar = EmptyStub;
    }
    if (!footer) {
      components.TableFooter = EmptyStub;
    }

    // components.TableHead = EmptyStub2
    return (
      <Wrapped
        locale={locale}
        options={{ ...defaultOptions, ...options }}
        columns={columns.map((x: any) => {
          x.options = x.options || {};
          x.options.filter = x.options.filter || false;
          x.options.sort = x.options.sort || false;
          return x;
        })}
        emptyNode={<Empty>{emptyNodeText || t('empty')}</Empty>}
        {...rest}
        components={components}
        hasRowLink={hasRowLink}
        isMobile={isMobile}
      />
    );
  }
);

interface TableProps {
  options: any;
  columns: any;
  toolbar?: boolean;
  footer?: boolean;
  hasRowLink?: boolean;
  emptyNodeText?: string;
  mobileTDFlexDirection?: string;
}

const Wrapped = styled(Datatable)`
  ${(props: any) =>
    props?.hasRowLink
      ? `.MuiTableCell-root {
    font-size: 0.875rem !important;
  }`
      : ''}
  .MuiPaper-root {
    border-radius: 8px;
    overflow: hidden;
  }
  table.MuiTable-root {
    outline: 1px solid;
    outline-color: ${({ theme }) => theme.palette.grey[100]};
    border-radius: ${({ theme }) => `${2 * (theme.shape.borderRadius as number)}px`};
    overflow: hidden;
  }
  [class*='MUIDataTable-responsiveBase'] {
    outline: 1px solid;
    outline-color: ${({ theme }) => theme.palette.grey[100]};
    border-radius: ${({ theme }) => `${2 * (theme.shape.borderRadius as number)}px`};
  }

  th.MuiTableCell-head {
    padding: 8px 16px 8px 16px;
    text-transform: inherit;
    background: ${({ theme }) => theme.palette.grey[50]};
    border-bottom: none;
    &:first-of-type {
      border-top-left-radius: 8px;
      padding-left: 20px;
    }
    &:last-of-type {
      border-top-right-radius: 8px;
    }
  }

  tr.MuiTableRow-root:not(.MuiTableRow-footer):hover {
    background: ${({ theme }) => theme.palette.grey[100]};
  }
  tr.MuiTableRow-root:last-of-type td:first-of-type {
    border-bottom-left-radius: 8px;
  }

  tr.MuiTableRow-root:last-of-type td:last-of-type {
    border-bottom-right-radius: 8px;
  }

  tr.MuiTableRow-root:nth-of-type(even) {
    background: ${({ theme }) => theme.palette.grey[50]};
  }
  td.MuiTableCell-root {
    border-bottom: none;
    padding-top: 12px;
    padding-bottom: 12px;
    padding-left: 16px;
    padding-right: 16px;
    &:first-of-type {
      padding-left: 20px;
    }
    &.MuiTableCell-footer {
      border: none;
    }
  }

  .datatable-footer {
    .MuiTableRow-root.MuiTableRow-footer {
      border: none;
    }
    table.MuiTable-root {
      outline: none;
      overflow: hidden;
    }
    .MuiTablePagination-input {
      background: none;
    }
    div.MuiSelect-select {
      padding: 0 24px 0 0;
    }
  }

  th a,
  td a {
    text-decoration: none;
    display: block;
    color: inherit;
    &:first-of-type {
      padding-left: 0;
    }
  }

  > div {
    overflow: auto;
  }
  .custom-toobar-title-inner {
    display: flex;
    align-items: center;
  }
  @media (max-width: ${({ theme }) => theme.breakpoints.values.md}px) {
    th a,
    td a {
      text-decoration: none;
      display: block;
      color: inherit;
      padding-top: 0;
      padding-bottom: 0;
      padding-right: 0;
    }
    tr.MuiTableRow-root {
      border: none;
      padding: 20px;
      display: block;
    }
    td.MuiTableCell-root:first-of-type {
      padding-left: 0;
      margin-top: 0;
    }
    td.MuiTableCell-root {
      margin: 0;
      margin-top: 8px;
      align-items: center;
      padding: 0;
      flex-wrap: wrap;
      flex-direction: ${({ mobileTDFlexDirection = 'column' }: TableProps) => mobileTDFlexDirection || 'row'};
      align-items: ${({ mobileTDFlexDirection = 'column' }) =>
        mobileTDFlexDirection === 'column' ? 'flex-start' : 'center'};
      justify-content: ${({ mobileTDFlexDirection = 'column' }) =>
        mobileTDFlexDirection === 'column' ? 'flex-start' : 'space-between'};
    }
    td.MuiTableCell-root > div {
      margin-bottom: 4px;
    }
    .MuiTable-root > .MuiTableBody-root > .MuiTableRow-root > td.MuiTableCell-root {
      display: flex;
      flex-direction: ${({ mobileTDFlexDirection = 'column' }) => mobileTDFlexDirection || 'row'};
      align-items: flex-start;
      justify-content: ${({ mobileTDFlexDirection = 'column' }) =>
        mobileTDFlexDirection === 'row' ? 'space-between' : 'flex-start'};
      flex-wrap: ${({ mobileTDFlexDirection = 'column' }) => (mobileTDFlexDirection === 'row' ? 'nowrap' : 'wrap')};
      word-break: break-all;
      &.datatables-noprint {
        justify-content: center;
      }
    }
    [class*='MUIDataTable-responsiveBase'] tr:not([class*='responsiveSimple']) td.MuiTableCell-body > div {
      width: inherit;
    }
  }
`;

export default withLocaleProvider(Table, {
  translations: {
    en: {
      empty: 'No data',
    },
    zh: {
      empty: '暂无数据',
    },
  },
});
