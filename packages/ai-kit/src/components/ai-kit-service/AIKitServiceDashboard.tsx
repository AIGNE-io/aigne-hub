import Toast from '@arcblock/ux/lib/Toast';
import { CheckCircleOutlineRounded, ErrorOutlineRounded } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, CircularProgress, FormControlLabel, Skeleton, Stack, Switch } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { useRequest } from 'ahooks';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

import { appRegister, appUsedCredits } from '../../api/ai-kit';
import { useAIKitServiceStatus } from './state';

export default function AIKitServiceDashboard() {
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
    <Box p={2.5}>
      <UseAIKitServiceSwitch />

      {app?.subscription?.status === 'active' ? (
        <Stack alignItems="center">
          <UseCreditsCharts />
        </Stack>
      ) : (
        <Stack alignItems="center">
          <LoadingButton variant="contained" onClick={linkToAiKit}>
            Subscribe
          </LoadingButton>
        </Stack>
      )}
    </Box>
  );
}

function UseAIKitServiceSwitch() {
  const { app, setConfig } = useAIKitServiceStatus();

  const [updating, setUpdating] = useState<boolean | 'success' | 'error'>(false);
  const [isSwitchOn, setIsSwitchOn] = useState(app?.aiKitServiceConfig?.useAIKitService);

  if (!app) return null;

  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Box flex={1} component="h1">
        Billing
      </Box>

      <Stack direction="row" overflow="hidden" alignItems="center" gap={1}>
        <FormControlLabel
          key={app.aiKitServiceConfig.useAIKitService?.toString()}
          labelPlacement="start"
          label={<Box>Use AI Kit Service</Box>}
          sx={{ pr: 1 }}
          control={
            <Switch
              defaultChecked={app.aiKitServiceConfig.useAIKitService}
              checked={isSwitchOn}
              onChange={async (_, checked) => {
                const AIKIT = (window.blocklet?.componentMountPoints || [])?.find(
                  (x: { did: string }) => x.did === 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ'
                );

                if (!AIKIT) {
                  Toast.error('The current component does not have an ai-kit installed. Mount the ai-kit first');
                  return;
                }

                try {
                  setUpdating(true);
                  await setConfig({ useAIKitService: checked });
                  setIsSwitchOn(checked);
                  setUpdating('success');
                } catch (error) {
                  setUpdating('error');
                  Toast.error(error.message);
                  throw error;
                }
              }}
            />
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
    </Stack>
  );
}

const CustomTooltipFormatter = (value: any, name: string) => {
  const nameMap: any = { totalUsedCredits: 'total' };
  return [value, nameMap[name] || name];
};

function UseCreditsCharts() {
  const [selectedMonth, setSelectedMonth] = useState(dayjs(new Date()));

  const [startOfMonth, endOfMonth] = useMemo(() => {
    const startOfMonth = dayjs(selectedMonth).startOf('month');
    const endOfMonth = dayjs(selectedMonth).endOf('month');

    return [startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD')];
  }, [selectedMonth]);

  const data = useRequest(() => appUsedCredits({ startOfMonth, endOfMonth }), {
    refreshDeps: [startOfMonth, endOfMonth],
  });

  const list = data.data?.list || [];

  return (
    <Stack width={1}>
      <Stack direction="row" overflow="hidden" alignItems="center">
        <Box flex={1} component="h3">
          Daily Costs
        </Box>

        <MonthPicker
          value={selectedMonth}
          onChange={(newValue: any) => {
            setSelectedMonth(newValue);
          }}
        />
      </Stack>

      {data.loading ? (
        <Box width="100%">
          <Skeleton variant="rounded" height={260} sx={{ margin: '20px 30px 30px 20px' }} />
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={list} barSize={20} margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
            <XAxis dataKey="date" scale="point" interval={8} padding={{ left: 10, right: 10 }} />
            <Tooltip formatter={CustomTooltipFormatter} />
            <CartesianGrid strokeDasharray="3 3" />
            <Bar dataKey="totalUsedCredits" fill="#8884d8" background={{ fill: '#eee' }} />
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
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        views={['year', 'month']}
        label="Year and Month"
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
