import 'dayjs/locale/zh-cn';

import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { CheckCircleOutlineRounded, ErrorOutlineRounded, RouterRounded, ShoppingCartSharp } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import {
  Box,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { fromUnitToToken } from '@ocap/util';
import { useRequest } from 'ahooks';
import BigNumber from 'bignumber.js';
import dayjs from 'dayjs';
import { groupBy } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { withQuery } from 'ufo';

import { appServiceRegister, appUsedCredits } from '../../libs/app';
import { useAIKitServiceStatus } from './state';

export default function BillingPage() {
  const { t } = useLocaleContext();
  const { app, error, fetch } = useAIKitServiceStatus();
  if (error) throw error;

  useEffect(() => {
    fetch();
  }, [fetch]);

  if (!app) {
    return (
      <Stack alignItems="center" py={10}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  return (
    <Stack p={3} gap={4}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Typography variant="h5">{t('usage')}</Typography>

        <UseAIKitServiceSwitch />
      </Stack>

      {!app?.config?.useAIKitService || app?.subscription?.status === 'active' ? (
        <Stack alignItems="center">
          <UseCreditsCharts />
        </Stack>
      ) : (
        <NonSubscriptions />
      )}
    </Stack>
  );
}

function NonSubscriptions() {
  const { t } = useLocaleContext();
  const [loading, setLoading] = useState(false);

  const linkToAiKit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await appServiceRegister();
      if (res.paymentLink) {
        window.location.href = withQuery(res.paymentLink, { redirect: window.location.href });
      }
    } catch (error) {
      Toast.error(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Stack alignItems="center" gap={4} my={10}>
      <RouterRounded sx={{ fontSize: 56, color: 'text.disabled' }} />

      <Typography variant="body2">{t('subscribeAITip')}</Typography>

      <LoadingButton
        variant="contained"
        onClick={linkToAiKit}
        endIcon={<ShoppingCartSharp />}
        loading={loading}
        loadingPosition="end">
        {t('subscribeAIService')}
      </LoadingButton>
    </Stack>
  );
}

function UseAIKitServiceSwitch() {
  const { t } = useLocaleContext();

  const { app, setConfig } = useAIKitServiceStatus();

  const [updating, setUpdating] = useState<boolean | 'success' | 'error'>(false);

  if (!app) return null;

  return (
    <Stack direction="row" overflow="hidden" alignItems="center" gap={1} pr="3px">
      <FormControlLabel
        key={app.config?.useAIKitService?.toString()}
        labelPlacement="start"
        label={<Box>{t('aiProvider')}</Box>}
        sx={{ pr: 1, gap: 1 }}
        control={
          <TextField
            select
            size="small"
            hiddenLabel
            SelectProps={{ autoWidth: true }}
            defaultValue={app.config?.useAIKitService ? 'subscribe' : 'local'}
            onChange={async (e) => {
              try {
                setUpdating(true);
                await setConfig({ useAIKitService: e.target.value === 'subscribe' });
                setUpdating('success');
              } catch (error) {
                setUpdating('error');
                Toast.error(error.message);
                throw error;
              }
            }}>
            <MenuItem value="subscribe">{t('aiProviderSubscription')}</MenuItem>
            <MenuItem value="local">{t('aiProviderLocalAIKit')}</MenuItem>
          </TextField>
        }
      />

      {updating && (
        <Stack justifyContent="center" alignItems="center" width={24} height={24}>
          {updating === true ? (
            <CircularProgress size={20} />
          ) : updating === 'success' ? (
            <CheckCircleOutlineRounded color="success" sx={{ fontSize: 24 }} />
          ) : updating === 'error' ? (
            <ErrorOutlineRounded color="error" sx={{ fontSize: 24 }} />
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}

function UseCreditsCharts() {
  const { app } = useAIKitServiceStatus();
  const [date, setDate] = useState(dayjs(new Date()));

  const [startTime, endTime] = useMemo(() => {
    const startTime = dayjs(date).startOf('month');
    const endTime = dayjs(date).endOf('month');

    return [startTime.format('YYYY-MM-DD'), endTime.format('YYYY-MM-DD')];
  }, [date]);

  const { data, loading } = useRequest(
    () => appUsedCredits({ startTime, endTime }, { useAIKitService: app?.config?.useAIKitService }),
    {
      refreshDeps: [startTime, endTime, app?.config?.useAIKitService],
    }
  );

  const { price, symbol } = useMemo(() => {
    if (!app?.config?.useAIKitService || !app?.subscription) return {};

    const price = app.subscription.items.find((i) => i.price.currency_id === app.subscription!.currency_id)?.price;
    const { decimal } = app.subscription.paymentCurrency;

    if (!price) return {};

    return {
      price: new BigNumber(fromUnitToToken(price.unit_amount, decimal)).dividedBy(
        price.transform_quantity?.divide_by ?? 1
      ),
      symbol: app.subscription.paymentCurrency.symbol,
    };
  }, [app]);

  const map = Object.fromEntries(
    Object.values(groupBy(data?.list || [], 'date')).map((list) => [
      list[0]!.date,
      Object.fromEntries(
        list.map((i) => [
          i.model,
          price
            ? price.multipliedBy(i.usedCredits).toString()
            : i.promptTokens + i.completionTokens + i.numberOfImageGeneration,
        ])
      ),
    ])
  );
  const list = new Array(dayjs(date).daysInMonth()).fill(0).map((_, index) => {
    const d = dayjs(date)
      .date(index + 1)
      .format('YYYY-MM-DD');
    return { ...map[d], date: d };
  });

  const models = [...new Set(data?.list.map((i) => i.model))];

  const colors = ['#ffc800', '#b7ff00', '#40ff00', '#00ffae', '#00c3ff', '#0066ff', '#5500ff', '#ae00ff'];

  return (
    <Stack width={1} gap={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box />

        <MonthPicker
          value={date}
          onChange={(newValue: any) => {
            setDate(newValue);
          }}
        />
      </Stack>

      {loading ? (
        <Box width="100%">
          <Skeleton variant="rounded" height={260} sx={{ margin: '20px 30px 30px 20px' }} />
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={list} barSize={10}>
            <XAxis dataKey="date" scale="point" interval={8} padding={{ left: 10, right: 10 }} />
            <YAxis unit={symbol ?? 'unit'} width={100} />
            <Legend />
            <Tooltip formatter={(v) => `${v} ${symbol ?? 'unit'}`} />
            <CartesianGrid strokeDasharray="3 3" />
            {models.map((model, index) => (
              <Bar key={model} dataKey={model} stackId="usedCredits" fill={colors[index] || 'black'} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Stack>
  );
}

type DatePickerProps = React.ComponentProps<typeof DatePicker>;

interface MonthPickerProps {
  value: DatePickerProps['value'];
  onChange: DatePickerProps['onChange'];
}

function MonthPicker({ value, onChange }: MonthPickerProps) {
  const { t, locale } = useLocaleContext();

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={/zh/i.test(locale) ? 'zh-cn' : 'en'}>
      <DatePicker
        views={['year', 'month']}
        label={t('selectMonth')}
        openTo="month"
        format="YYYY-MM"
        defaultValue={dayjs(new Date())}
        maxDate={dayjs(new Date())}
        value={value}
        onChange={onChange}
        slotProps={{ textField: { size: 'small' } }}
      />
    </LocalizationProvider>
  );
}
