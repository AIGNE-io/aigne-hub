import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { Box, Typography } from '@mui/material';

export function CreditRateFormula() {
  const { t } = useLocaleContext();
  const baseCreditPrice = window.blocklet?.preferences?.baseCreditPrice || 0.0000025;
  const targetProfitMargin = window.blocklet?.preferences?.targetProfitMargin || 2;

  return (
    <Box sx={{ width: '100%', p: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 2, color: 'text.primary' }}>
        {t('config.modelRates.configInfo.pricingFormula')}
      </Typography>

      <Box
        sx={{
          textAlign: 'center',
          mb: 2,
          p: 1,
          bgcolor: 'background.paper',
          borderRadius: 1,
          border: '1px dashed',
          borderColor: 'primary.main',
          whiteSpace: {
            xs: 'normal',
            md: 'nowrap',
          },
        }}>
        <Typography
          variant="body1"
          sx={{
            fontWeight: 500,
            color: 'text.primary',
          }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
            R
          </Box>
          <Box component="span" sx={{ mx: 2, fontWeight: 500 }}>
            =
          </Box>
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              position: 'relative',
              verticalAlign: 'middle',
            }}>
            <Box
              component="span"
              sx={{
                display: 'block',
                borderBottom: '2px solid',
                borderColor: 'grey.300',
                pb: 0.4,
                mb: 0.4,
                px: 1,
              }}>
              <Box component="span" sx={{ fontWeight: 500 }}>
                {t('config.modelRates.configInfo.modelTokenCost')}
              </Box>
              <Box component="span" sx={{ mx: 1, fontSize: '1.1rem' }}>
                ×
              </Box>
              <Box component="span" sx={{ fontSize: '1.1rem' }}>
                (1 +{' '}
              </Box>
              <Box component="span" sx={{ fontWeight: 500 }}>
                {t('config.modelRates.configInfo.targetProfitMargin')}
              </Box>
              <Box component="span" sx={{ fontSize: '1.1rem' }}>
                )
              </Box>
            </Box>

            <Box
              component="span"
              sx={{
                display: 'block',
              }}>
              <Box component="span" sx={{ fontWeight: 500 }}>
                {t('config.modelRates.configInfo.creditPrice')}
              </Box>
            </Box>
          </Box>
        </Typography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
          <strong>{t('config.modelRates.configInfo.variableExplanation')}</strong>
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pl: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            • <strong>R</strong> = {t('config.modelRates.configInfo.tokenConsumption')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            • <strong>{t('config.modelRates.configInfo.modelTokenCost')}</strong>：
            {t('config.modelRates.configInfo.modelCostDesc')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            • <strong>{t('config.modelRates.configInfo.targetProfitMargin')}</strong>：
            {t('config.modelRates.configInfo.profitMarginDesc')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            • <strong>{t('config.modelRates.configInfo.creditPrice')}</strong>：
            {t('config.modelRates.configInfo.creditPriceDesc')}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
          <strong>{t('config.modelRates.configInfo.formulaExample')}:</strong> ${baseCreditPrice} × (1 +{' '}
          {targetProfitMargin}%) ÷ {t('config.modelRates.configInfo.modelTokenCost')}
        </Typography>
      </Box>
    </Box>
  );
}
