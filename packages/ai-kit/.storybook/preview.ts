import { ThemeProvider, create } from '@arcblock/ux/lib/Theme';
import type { Preview } from '@storybook/react';
import React from 'react';

const muiTheme = create();

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        method: 'alphabetical',
        order: ['Components', ['Image Preview', 'Loading Image']],
      },
    },
    backgrounds: {
      values: [
        { name: 'light', value: '#f8f8f7', default: true },
        { name: 'dark', value: '#222222' },
      ],
    },
  },
  decorators: [(StoryFn) => React.createElement(ThemeProvider, { theme: muiTheme }, React.createElement(StoryFn))],
  tags: ['autodocs'],
};

export default preview;
