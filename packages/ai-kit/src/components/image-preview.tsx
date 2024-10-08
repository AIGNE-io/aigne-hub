import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined';
import RotateRightOutlinedIcon from '@mui/icons-material/RotateRightOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import { Box, GlobalStyles, Grid, IconButton, IconButtonProps } from '@mui/material';
import { useReactive } from 'ahooks';
import { saveAs } from 'file-saver';
import React from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { withQuery } from 'ufo';

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
  formatDownloadSrc?: (src: string) => string;
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
  const re = new RegExp('data:image/([a-z]+);base64,.+');
  const res = re.exec(base64);
  if (res?.groups?.ext) {
    return res.groups.ext;
  }
  return '';
}

export default function ImagePreview({
  dataSource,
  itemWidth,
  itemHeight,
  spacing = 1,
  transition = 'all 0.3s',
  formatDownloadSrc = (value) => value,
}: ImagePreviewProps) {
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
          // download base64 image
          if (src?.startsWith('data:image/')) {
            const link = document.createElement('a');
            link.href = src;
            link.download = `image-${currentIndex}.${getExtFromBase64(src) || 'png'}`;
            link.click();
          } else {
            // use file saver to download image, will slow down the performance
            await saveAs(formatDownloadSrc(src));
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
      {/* copy from PhotoProvider */}
      <GlobalStyles styles=".PhotoView-Portal{height:100%;left:0;overflow:hidden;position:fixed;top:0;touch-action:none;width:100%;z-index:2000}@-webkit-keyframes PhotoView__rotate{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}@keyframes PhotoView__rotate{0%{transform:rotate(0deg)}to{transform:rotate(1turn)}}@-webkit-keyframes PhotoView__delayIn{0%,50%{opacity:0}to{opacity:1}}@keyframes PhotoView__delayIn{0%,50%{opacity:0}to{opacity:1}}.PhotoView__Spinner{-webkit-animation:PhotoView__delayIn .4s linear both;animation:PhotoView__delayIn .4s linear both}.PhotoView__Spinner svg{-webkit-animation:PhotoView__rotate .6s linear infinite;animation:PhotoView__rotate .6s linear infinite}.PhotoView__Photo{cursor:-webkit-grab;cursor:grab;max-width:none}.PhotoView__Photo:active{cursor:-webkit-grabbing;cursor:grabbing}.PhotoView__icon{display:inline-block;left:0;position:absolute;top:0;transform:translate(-50%,-50%)}.PhotoView__PhotoBox,.PhotoView__PhotoWrap{bottom:0;direction:ltr;left:0;position:absolute;right:0;top:0;touch-action:none;width:100%}.PhotoView__PhotoWrap{overflow:hidden;z-index:10}.PhotoView__PhotoBox{transform-origin:left top}@-webkit-keyframes PhotoView__fade{0%{opacity:0}to{opacity:1}}@keyframes PhotoView__fade{0%{opacity:0}to{opacity:1}}.PhotoView-Slider__clean .PhotoView-Slider__ArrowLeft,.PhotoView-Slider__clean .PhotoView-Slider__ArrowRight,.PhotoView-Slider__clean .PhotoView-Slider__BannerWrap,.PhotoView-Slider__clean .PhotoView-Slider__Overlay,.PhotoView-Slider__willClose .PhotoView-Slider__BannerWrap:hover{opacity:0}.PhotoView-Slider__Backdrop{background:#000;height:100%;left:0;position:absolute;top:0;transition-property:background-color;width:100%;z-index:-1}.PhotoView-Slider__fadeIn{-webkit-animation:PhotoView__fade linear both;animation:PhotoView__fade linear both;opacity:0}.PhotoView-Slider__fadeOut{animation:PhotoView__fade linear reverse both;opacity:0}.PhotoView-Slider__BannerWrap{align-items:center;background-color:rgba(0,0,0,.5);color:#fff;display:flex;height:44px;justify-content:space-between;left:0;position:absolute;top:0;transition:opacity .2s ease-out;width:100%;z-index:20}.PhotoView-Slider__BannerWrap:hover{opacity:1}.PhotoView-Slider__Counter{font-size:14px;opacity:.75;padding:0 10px}.PhotoView-Slider__BannerRight{align-items:center;display:flex;height:100%}.PhotoView-Slider__toolbarIcon{fill:#fff;box-sizing:border-box;cursor:pointer;opacity:.75;padding:10px;transition:opacity .2s linear}.PhotoView-Slider__toolbarIcon:hover{opacity:1}.PhotoView-Slider__ArrowLeft,.PhotoView-Slider__ArrowRight{align-items:center;bottom:0;cursor:pointer;display:flex;height:100px;justify-content:center;margin:auto;opacity:.75;position:absolute;top:0;transition:opacity .2s linear;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;width:70px;z-index:20}.PhotoView-Slider__ArrowLeft:hover,.PhotoView-Slider__ArrowRight:hover{opacity:1}.PhotoView-Slider__ArrowLeft svg,.PhotoView-Slider__ArrowRight svg{fill:#fff;background:rgba(0,0,0,.3);box-sizing:content-box;height:24px;padding:10px;width:24px}.PhotoView-Slider__ArrowLeft{left:0}.PhotoView-Slider__ArrowRight{right:0}" />
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
                    src={withQuery(item.src, {
                      imageFilter: 'resize',
                      f: 'webp',
                      w: typeof itemWidth === 'number' ? Math.min(itemWidth * 2, 1200) : undefined,
                    })}
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
