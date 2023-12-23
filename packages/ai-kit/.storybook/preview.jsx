import { ThemeProvider, create } from '@arcblock/ux/lib/Theme';

const muiTheme = create();

export const decorators = [
  (Story) => (
    <ThemeProvider theme={muiTheme}>
      <Story />
    </ThemeProvider>
  ),
];
