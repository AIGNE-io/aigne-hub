// eslint-disable-next-line import/no-extraneous-dependencies
import { storiesOf } from '@storybook/react';

import { LoadingImage } from '../src/index';

storiesOf('Loading Image', module)
  .addParameters({
    // More on Story layout: https://storybook.js.org/docs/react/configure/story-layout
    layout: 'fullscreen',
    readme: {
      sidebar: '<!-- PROPS -->',
    },
  })
  .add('Default', () => {
    return (
      <LoadingImage src="https://storage.staging.abtnet.io/app/resolve/display?assetId=zjdmpgwF3FzQrnoj14m8TK8BVWgZukEJ4Nnw" />
    );
  });
