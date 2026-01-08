import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Tooltip, Typography } from '@mui/material';

type ModelPriceUnit = 'mtokens' | 'image' | 'second';

interface UnitDisplayProps {
  value: string | number;
  type: 'credit' | 'token';
  variant?: 'body1' | 'body2' | 'caption';
  sx?: any;
  addon?: ModelPriceUnit | string;
}

export default function UnitDisplay({ value, type, variant = 'body2', addon = '', sx = {} }: UnitDisplayProps) {
  const { t } = useLocaleContext();

  const tooltipTitle = t(`config.modelRates.configInfo.unitTooltip.${type}`);

  const getDisplayText = () => {
    if (type === 'credit') {
      return `${value} / 1M`;
    }
    const unitTexts = {
      mtokens: t('config.modelRates.fields.perMillionTokens'),
      image: t('config.modelRates.fields.perImage'),
      second: t('config.modelRates.fields.perSecond'),
    };

    const unitText = unitTexts[addon as ModelPriceUnit] || addon || '';
    return `${value} ${unitText}`;
  };

  if (type === 'credit' && !addon) {
    return (
      <Typography variant={variant} component="span">
        {value}
      </Typography>
    );
  }

  return (
    <Tooltip
      title={tooltipTitle}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: 2,
            border: '1px solid',
            borderColor: 'divider',
            fontSize: '0.75rem',
          },
        },
      }}>
      <Box component="span" sx={{ cursor: 'help', ...sx }}>
        <Typography variant={variant} component="span">
          {getDisplayText()}
        </Typography>
      </Box>
    </Tooltip>
  );
}
