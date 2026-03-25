/**
 * Shared tab styling constants for consistent tab appearance across the app.
 */

/** Primary-level tabs (e.g. config section tabs) */
export const primaryTabSx = {
  '.MuiTab-root': {
    padding: 0,
    marginRight: '24px',
    minHeight: 32,
    minWidth: 'auto',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'text.lighter',
    '&.Mui-selected': {
      color: 'primary.main',
    },
  },
  '.MuiTouchRipple-root': {
    display: 'none',
  },
};

/** Secondary-level tabs (e.g. ai-config sub-tabs) */
export const secondaryTabSx = {
  '.MuiTab-root': {
    padding: 0,
    marginRight: '24px',
    minHeight: 32,
    minWidth: 'auto',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'text.lighter',
    '&.Mui-selected': {
      color: 'text.primary',
      fontWeight: 600,
    },
  },
  '.MuiTabs-indicator': {
    display: 'none',
  },
  '.MuiTabs-hideScrollbar': {
    border: 'none !important',
  },
  '.MuiTouchRipple-root': {
    display: 'none',
  },
};
