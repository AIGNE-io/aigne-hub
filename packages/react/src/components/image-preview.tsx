import 'react-photo-view/dist/react-photo-view.css';

import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import RotateRightOutlinedIcon from '@mui/icons-material/RotateRightOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import { Box, Grid, IconButton } from '@mui/material';
import { useReactive } from 'ahooks';
import { saveAs } from 'file-saver';
import { PhotoProvider, PhotoView } from 'react-photo-view';

import LoadingImage from './loading-image';

interface ImagePreviewProps {
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
}

interface StateProps {
  downloadingIndexMap: {
    [key: number]: boolean;
  };
}

const renderIconButton = (children: React.ReactNode, onClick: () => void, extraProps = {}) => {
  return (
    <IconButton
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

export default function ImagePreview({
  dataSource,
  itemWidth,
  itemHeight,
  spacing = 1,
  transition = 'all 0.3s',
}: ImagePreviewProps) {
  const state: StateProps = useReactive({
    downloadingIndexMap: {},
  });

  const getDownloadButton = (currentIndex: number, extraProps = {}) =>
    renderIconButton(
      <CloudDownloadOutlinedIcon />,
      async () => {
        const { src } = dataSource?.[currentIndex] || {};
        state.downloadingIndexMap = {
          ...state.downloadingIndexMap,
          [currentIndex]: true,
        };
        if (src) {
          await saveAs(src);
          state.downloadingIndexMap = {
            ...state.downloadingIndexMap,
            [currentIndex]: false,
          };
        }
      },
      {
        key: 'download',
        disabled: !!state.downloadingIndexMap[currentIndex],
        loading: !!state.downloadingIndexMap[currentIndex],
        ...extraProps,
      }
    );

  return (
    <PhotoProvider
      toolbarRender={({ index, scale, onScale, rotate, onRotate }) => {
        return [
          renderIconButton(<ZoomInOutlinedIcon />, () => onScale(scale + 0.25), {
            key: 'scale-down',
          }),
          renderIconButton(<ZoomOutOutlinedIcon />, () => onScale(scale - 0.25), {
            key: 'scale-up',
          }),
          renderIconButton(<RotateRightOutlinedIcon />, () => onRotate(rotate + 90), {
            key: 'rotate',
          }),
          getDownloadButton(index),
        ];
      }}>
      <Grid spacing={spacing} container className="photo-wrapper">
        {dataSource?.map((item, index) => {
          const { width, height } = item;
          return (
            <Grid
              item
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="photo-item"
              sx={{
                transition,
                '&:hover': {
                  cursor: 'pointer',
                  '& .photo-toolbar': {
                    transition,
                    opacity: 1,
                  },
                },
              }}>
              <Box sx={{ position: 'relative' }}>
                <PhotoView {...item}>
                  <LoadingImage
                    {...item}
                    style={{
                      transition,
                      objectFit: 'cover',
                      width: width || itemWidth || '100%',
                      height: height || itemHeight || '100%',
                    }}
                  />
                </PhotoView>
                <Box
                  className="photo-toolbar"
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    opacity: 0,
                    background: 'rgba(0,0,0,0.7)',
                  }}>
                  {getDownloadButton(index, {
                    size: 'small',
                  })}
                </Box>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </PhotoProvider>
  );
}
