import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import { Box, Grid, IconButton, IconButtonProps } from '@mui/material';
import { useReactive } from 'ahooks';
import React from 'react';

interface VideoPreviewProps {
  dataSource?: Array<{
    src: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  spacing?: number;
  itemWidth?: number;
  itemHeight?: number;
  transition?: string;
  borderRadius?: number;
  showDownloadButton?: boolean;
}

interface StateProps {
  downloadingIndexMap: {
    [key: number]: boolean;
  };
}

const renderIconButton = (
  children: React.ReactNode,
  onClick: () => void,
  { key, ...extraProps }: { key?: React.Key } & IconButtonProps = {}
) => {
  return (
    <IconButton
      key={key}
      sx={{
        transition: 'all 0.3s',
        color: 'rgba(255,255,255,0.75)',
        '&:hover': {
          color: 'rgba(255,255,255,1)',
        },
      }}
      onClick={onClick}
      {...extraProps}>
      {children}
    </IconButton>
  );
};

function getExtFromBase64(base64: string) {
  // eslint-disable-next-line prefer-regex-literals
  const re = new RegExp('data:video/([a-z]+);base64,.+');
  const res = re.exec(base64);
  if (res?.groups?.ext) {
    return res.groups.ext;
  }
  return '';
}

export default function VideoPreview({
  dataSource = [],
  itemWidth = undefined,
  itemHeight = undefined,
  spacing = 1,
  transition = 'all 0.3s',
  borderRadius = 8,
  showDownloadButton = true,
}: VideoPreviewProps) {
  const state: StateProps = useReactive({
    downloadingIndexMap: {},
  });

  const getDownloadButton = (currentIndex: number, extraProps = {}) =>
    renderIconButton(
      <CloudDownloadOutlinedIcon fontSize="inherit" />,
      async () => {
        const { src } = dataSource?.[currentIndex] || {};
        state.downloadingIndexMap = {
          ...state.downloadingIndexMap,
          [currentIndex]: true,
        };
        if (src) {
          // download base64 video
          if (src?.startsWith('data:video/')) {
            const link = document.createElement('a');
            link.href = src;
            link.download = `video-${currentIndex}.${getExtFromBase64(src) || 'mp4'}`;
            link.click();
          }

          state.downloadingIndexMap = {
            ...state.downloadingIndexMap,
            [currentIndex]: false,
          };
        }
      },
      {
        key: 'download',
        disabled: !!state.downloadingIndexMap[currentIndex],
        ...extraProps,
      }
    );

  return (
    <Grid spacing={spacing} container className="video-wrapper">
      {dataSource?.map((item, index) => {
        const { width, height } = item;
        return (
          <Grid
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="video-item"
            sx={{
              transition,
              '&:hover': {
                cursor: 'pointer',
                '& .video-toolbar': {
                  transition,
                  opacity: 1,
                },
              },
            }}>
            <Box sx={{ position: 'relative' }}>
              <video
                src={item.src}
                controls
                style={{
                  transition,
                  borderRadius,
                  objectFit: 'cover',
                  width: width || itemWidth || '100%',
                  height: height || itemHeight || 'auto',
                  backgroundColor: '#000',
                  maxWidth: '400px',
                }}
                preload="metadata">
                <track kind="captions" />
              </video>
              <Box
                className="video-toolbar"
                sx={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  opacity: 0,
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: '4px',
                }}>
                {showDownloadButton &&
                  getDownloadButton(index, {
                    size: 'small',
                  })}
              </Box>
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}
