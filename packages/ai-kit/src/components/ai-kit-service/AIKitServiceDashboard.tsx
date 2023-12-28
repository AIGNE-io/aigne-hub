import 'dayjs/locale/zh-cn';

import { LocaleProvider, useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import Toast from '@arcblock/ux/lib/Toast';
import { CheckCircleOutlineRounded, ErrorOutlineRounded } from '@mui/icons-material';
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
  useTheme,
} from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useRequest } from 'ahooks';
import dayjs from 'dayjs';
import { groupBy } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { appRegister, appUsedCredits } from '../../api/ai-kit';
import { translations } from './locales';
import { useAIKitServiceStatus } from './state';

export default function AIKitServiceDashboard() {
  const { locale } = useLocaleContext();

  return (
    <LocaleProvider translations={translations} fallbackLocale="en" locale={locale}>
      <AIKitServiceDashboardContent />
    </LocaleProvider>
  );
}

function AIKitServiceDashboardContent() {
  const { t } = useLocaleContext();
  const { app, loading, fetch } = useAIKitServiceStatus();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const linkToAiKit = useCallback(async () => {
    const res = await appRegister();
    if (res.paymentLink) {
      window.location.href = res.paymentLink;
    }
  }, []);

  if (loading) {
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

      {app?.subscription?.status === 'active' ? (
        <Stack alignItems="center">
          <UseCreditsCharts key={app.aiKitServiceConfig.useAIKitService?.toString()} />
        </Stack>
      ) : (
        <Stack alignItems="center">
          <LoadingButton variant="contained" onClick={linkToAiKit}>
            {t('subscribeAIService')}
          </LoadingButton>
        </Stack>
      )}
    </Stack>
  );
}

function UseAIKitServiceSwitch() {
  const { t } = useLocaleContext();

  const { app, setConfig } = useAIKitServiceStatus();

  const [updating, setUpdating] = useState<boolean | 'success' | 'error'>(false);

  if (!app) return null;

  return (
    <Stack direction="row" overflow="hidden" alignItems="center" gap={1}>
      <FormControlLabel
        key={app.aiKitServiceConfig.useAIKitService?.toString()}
        labelPlacement="start"
        label={<Box>{t('aiProvider')}</Box>}
        sx={{ pr: 1, gap: 1 }}
        control={
          <TextField
            select
            hiddenLabel
            SelectProps={{ autoWidth: true }}
            defaultValue={app.aiKitServiceConfig.useAIKitService ? 'subscribe' : 'local'}
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

const CustomTooltipFormatter = (value: any, name: string) => {
  const nameMap: any = { totalUsedCredits: 'total' };
  return [value, nameMap[name] || name];
};

function UseCreditsCharts() {
  const [date, setDate] = useState(dayjs(new Date()));

  const [startTime, endTime] = useMemo(() => {
    const startTime = dayjs(date).startOf('month');
    const endTime = dayjs(date).endOf('month');

    return [startTime.format('YYYY-MM-DD'), endTime.format('YYYY-MM-DD')];
  }, [date]);

  const { data, loading } = useRequest(() => appUsedCredits({ startTime, endTime }), {
    refreshDeps: [startTime, endTime],
  });

  const map = Object.fromEntries(
    Object.values(groupBy(data?.list || [], 'date')).map((list) => [
      list[0]!.date,
      Object.fromEntries(list.map((i) => [i.model, i.usedCredits])),
    ])
  );
  const list = new Array(dayjs(date).daysInMonth()).fill(0).map((_, index) => {
    const d = dayjs(date)
      .date(index + 1)
      .format('YYYY-MM-DD');
    return { ...map[d], date: d };
  });

  const models = [...new Set(data?.list.map((i) => i.model))];

  const { palette } = useTheme();
  const colors = [
    palette.primary.dark,
    palette.primary.main,
    palette.primary.light,
    palette.secondary.dark,
    palette.secondary.main,
    palette.secondary.light,
    palette.secondary.light,
    palette.warning.dark,
    palette.warning.main,
    palette.warning.light,
    palette.info.dark,
    palette.info.main,
    palette.info.light,
    palette.success.dark,
    palette.success.main,
    palette.success.light,
  ];

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
            <YAxis />
            <Legend />
            <Tooltip formatter={CustomTooltipFormatter} />
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
