// eslint-disable-next-line import/no-extraneous-dependencies
import { storiesOf } from '@storybook/react';

import { ImagePreview } from '../src/components';

storiesOf('Image Preview', module)
  .addParameters({
    // More on Story layout: https://storybook.js.org/docs/react/configure/story-layout
    layout: 'fullscreen',
    readme: {
      sidebar: '<!-- PROPS -->',
    },
  })
  .add('Default', () => {
    const mockDataSource = [
      {
        src: 'https://storage.staging.abtnet.io/app/resolve/display?assetId=zjdmpgwF3FzQrnoj14m8TK8BVWgZukEJ4Nnw',
      },
      {
        src: 'https://storage.staging.abtnet.io/app/resolve/display?assetId=zjdr4bbqJR5x2229FkQXw3T4GCxej5GWx6yB&vcId=undefined',
      },
      {
        src: 'https://react-photo-view.vercel.app/_next/static/media/4.57ff8e86.jpg',
      },
      {
        src: 'https://d2himn2hu5r2qx.cloudfront.net/blender/api/assets/preview/cccee60414174ff09a2388414c712bce?assetId=zjder7SNoqKtLSNJZPCvc6pvn8Ks86AubGVd&vcId=undefined',
      },
      {
        src: 'https://react-photo-view.vercel.app/_next/static/media/2.b43f1ead.jpg',
      },
    ];
    return <ImagePreview dataSource={mockDataSource} itemWidth={200} itemHeight={200} />;
  });
