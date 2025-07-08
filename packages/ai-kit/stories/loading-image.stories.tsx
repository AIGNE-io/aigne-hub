import type { Meta, StoryObj } from '@storybook/react';

import { LoadingImage } from '../src/components';

const meta: Meta<typeof LoadingImage> = {
  title: 'Components/Loading Image',
  component: LoadingImage,
  parameters: {
    layout: 'fullscreen',
    readme: {
      sidebar: '<!-- PROPS -->',
    },
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src: 'https://storage.staging.abtnet.io/app/resolve/display?assetId=zjdmpgwF3FzQrnoj14m8TK8BVWgZukEJ4Nnw',
  },
};
