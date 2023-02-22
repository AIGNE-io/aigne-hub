const { mergeConfig } = require('vite');

module.exports = {
  stories: ['../stories/*.stories.mdx', '../stories/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-interactions',
    '@storybook/addon-essentials',
    '@storybook/addon-actions',
  ],
  core: {
    builder: '@storybook/builder-vite',
  },
  async viteFinal(config, { configType }) {
    // return the customized config
    config.resolve.dedupe = ['@storybook/client-api'];
    return mergeConfig(config, {
      // customize the Vite config here
      define: {
        ...config.define,
        global: 'window',
      },
    });
  },
};
