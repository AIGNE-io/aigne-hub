import 'dayjs/locale/zh-cn';

import { useSessionContext } from '@app/contexts/session';
import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import RelativeTime from '@arcblock/ux/lib/RelativeTime';
import Toast from '@arcblock/ux/lib/Toast';
import { appUsedCredits } from '@blocklet/ai-kit/api';
import { SubscribeButton } from '@blocklet/ai-kit/components';
import {
  AccessAlarmRounded,
  CheckCircleOutlineRounded,
  ErrorOutlineRounded,
  MoreHorizRounded,
  OpenInNewRounded,
  RouterRounded,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
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
import { groupBy, isNil } from 'lodash';
import { bindMenu, bindTrigger, usePopupState } from 'material-ui-popup-state/hooks';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

import { useAIKitServiceStatus } from './state';

export default function BillingPage() {
  const { t } = useLocaleContext();
  const {
    app,
    error,
    computed: { isSubscriptionAvailable },
    fetch,
  } = useAIKitServiceStatus();
  if (error) throw error;

  useEffect(() => {
    fetch();
  }, [fetch]);

  const isPastDue = app?.subscription?.status === 'past_due';

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

      {app?.config?.useAIKitService && isPastDue ? (
        <Alert severity="warning" action={<Button href={app.subscriptionDetailUrl}>{t('payNow')}</Button>}>
          {t('subscriptionPastDueTip')}
        </Alert>
      ) : (
        !isSubscriptionAvailable && <NonSubscriptions />
      )}

      {app.id && <UseCreditsCharts />}
    </Stack>
  );
}

function NonSubscriptions() {
  const { t } = useLocaleContext();

  return (
    <Stack alignItems="center" gap={4} my={10}>
      <RouterRounded sx={{ fontSize: 56, color: 'text.disabled' }} />

      <Typography variant="body2">{t('subscribeAITip')}</Typography>

      <SubscribeButton />
    </Stack>
  );
}

function UseAIKitServiceSwitch() {
  const { t, locale } = useLocaleContext();
  const { connectApi } = useSessionContext();
  const menuState = usePopupState({ variant: 'popper' });

  const {
    app,
    computed: { isSubscriptionAvailable },
    setConfig,
    fetch,
  } = useAIKitServiceStatus();

  const cancelAt = app?.subscription?.cancel_at;
  const canCancel = app?.subscription?.cancel_at_period_end === false && isSubscriptionAvailable;
  const canRecover = app?.subscription?.cancel_at_period_end === true;

  const [updating, setUpdating] = useState<boolean | 'success' | 'error'>(false);

  if (!app) return null;

  return (
    <Stack gap={1} alignItems="flex-end">
      <Stack direction="row" overflow="hidden" alignItems="center" gap={1}>
        <Box>{t('aiProvider')}</Box>

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

        {app.config?.useAIKitService && canCancel && isSubscriptionAvailable && (
          <>
            <IconButton {...bindTrigger(menuState)}>
              <MoreHorizRounded />
            </IconButton>

            <Menu {...bindMenu(menuState)}>
              <MenuItem
                onClick={() => {
                  menuState.close();

                  connectApi.open({
                    locale,
                    action: 'cancel-subscription-ai-service',
                    messages: {
                      title: t('unsubscribe'),
                      scan: t('unsubscribeTip'),
                      confirm: t('unsubscribe'),
                      success: `${t('cancelled')}`,
                    },
                    async onSuccess() {
                      await fetch();
                    },
                  });
                }}>
                {t('unsubscribe')}
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>

      <Stack direction="row" alignItems="center" gap={2}>
        {canRecover && !!cancelAt && (
          <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <AccessAlarmRounded color="warning" fontSize="small" />
            <Box component="span">&nbsp;{t('unsubscribeAt')}&nbsp;</Box>
            <RelativeTime
              locale={locale}
              type="absolute"
              value={cancelAt * 1000}
              withoutSuffix={undefined}
              from={undefined}
              to={undefined}
              tz={undefined}
              relativeRange={undefined}
            />

            <Button
              sx={{ ml: 1 }}
              onClick={() =>
                connectApi.open({
                  locale,
                  action: 'recover-subscription-ai-service',
                  messages: {
                    title: t('recoverSubscription'),
                    scan: t('recoverSubscriptionTip'),
                    confirm: t('recoverSubscription'),
                    success: `${t('recoverSubscriptionSucceed')}`,
                  },
                  async onSuccess() {
                    await fetch();
                  },
                })
              }>
              {t('recoverSubscription')}
            </Button>
          </Typography>
        )}

        {app.subscriptionDetailUrl && (
          <Button component="a" href={app.subscriptionDetailUrl} target="_blank" endIcon={<OpenInNewRounded />}>
            {t('viewSubscriptionDetail')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

function UseCreditsCharts() {
  const { t } = useLocaleContext();
  const { app } = useAIKitServiceStatus();
  const [date, setDate] = useState(dayjs(new Date()));

  const [startTime, endTime] = useMemo(() => {
    const startTime = dayjs(date).startOf('month');
    const endTime = dayjs(date).endOf('month');

    return [startTime.format('YYYY-MM-DD'), endTime.format('YYYY-MM-DD')];
  }, [date]);

  const { data, loading } = useRequest(
    () =>
      appUsedCredits(
        { startTime, endTime: dayjs(endTime).endOf('day').format('YYYY-MM-DD HH:mm:ss') },
        { useAIKitService: app?.config?.useAIKitService }
      ),
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

  const TooltipContent = useMemo(() => createTooltipContentComponent({ unit: symbol }), [symbol]);

  let total = new BigNumber(0);

  const map = Object.fromEntries(
    Object.values(groupBy(data?.list || [], 'date')).map((list) => [
      list[0]!.date,
      Object.fromEntries(
        list.map((i) => {
          const value = price
            ? price.multipliedBy(i.usedCredits).toString()
            : i.promptTokens + i.completionTokens + i.numberOfImageGeneration;

          total = total.plus(value);

          return [i.model, value];
        })
      ),
    ])
  );
  const list = new Array(dayjs(date).daysInMonth()).fill(0).map((_, index) => {
    const d = dayjs(date)
      .date(index + 1)
      .format('YYYY-MM-DD');
    return { ...map[d], date: d };
  });

  const models = [...new Set((data?.list || []).map((i) => i.model))];
  const colors = ['#ffc800', '#b7ff00', '#40ff00', '#00ffae', '#00c3ff', '#0066ff', '#5500ff', '#ae00ff'];

  return (
    <Stack width={1} gap={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" fontWeight="bold">
          {t('monthlySpend')}

          <Typography component="span" sx={{ ml: 1 }}>
            {total.toNumber()} {symbol || ''}
          </Typography>
        </Typography>

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
            <Tooltip formatter={(v) => `${v} ${symbol ?? 'unit'}`} content={TooltipContent} />
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

function createTooltipContentComponent({ unit }: { unit?: string } = {}) {
  return function TooltipContent(props: TooltipProps<ValueType, NameType>) {
    const { t } = useLocaleContext();

    if (!props.payload?.length) return null;

    return (
      <Paper sx={{ py: 2 }}>
        <Typography variant="subtitle1" sx={{ mx: 2, mb: 1 }}>
          {props.label}
        </Typography>

        <Table size="small" sx={{ td: { border: 'none', py: 0 } }}>
          <TableBody>
            <TableRow>
              <TableCell>{t('total')}</TableCell>
              <TableCell>
                {props.payload
                  .reduce(
                    (res, i) => res.plus(typeof i.value === 'string' || typeof i.value === 'number' ? i.value : 0),
                    new BigNumber(0)
                  )
                  .toNumber()}{' '}
                {unit ?? ''}
              </TableCell>
            </TableRow>

            {props.payload
              .map((i, index) => (
                <TableRow key={i.dataKey}>
                  <TableCell sx={{ color: i.color }}>{i.dataKey}</TableCell>
                  <TableCell sx={{ color: i.color }}>
                    {props.formatter && !isNil(i.value) && !isNil(i.name)
                      ? props.formatter(i.value, i.name, i, index, props.payload!)
                      : i.value}
                  </TableCell>
                </TableRow>
              ))
              .reverse()}
          </TableBody>
        </Table>
      </Paper>
    );
  };
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
