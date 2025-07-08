/* eslint-disable import/no-extraneous-dependencies */
import { Skeleton } from '@mui/material';
import { useReactive } from 'ahooks';
import { ImgHTMLAttributes, useRef } from 'react';

function LoadingImage({
  ref = undefined,
  onLoad = () => {},
  ...props
}: { ref?: any; onLoad?: () => void } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad'>) {
  const imageRef = useRef(null);
  const state = useReactive({
    loading: true,
  });

  return (
    <div style={{ position: 'relative' }} ref={ref || imageRef}>
      <div
        className="lazy-image-wrapper"
        style={{
          visibility: state.loading ? 'hidden' : 'visible',
          background: '#f4f4f4',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <img
          alt=""
          {...props}
          onLoad={() => {
            state.loading = false;
            try {
              onLoad();
            } catch (error) {
              console.error('image onLoad error: ', error);
            }
          }}
          loading="eager" // must be eager to make sure the image is loaded
        />
      </div>
      {state.loading && (
        <Skeleton
          className="lazy-image-skeleton"
          animation="wave"
          variant="rectangular"
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
          }}
        />
      )}
    </div>
  );
}

export default LoadingImage;
