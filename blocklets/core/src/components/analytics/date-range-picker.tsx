import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { CalendarMonth, KeyboardArrowDown } from '@mui/icons-material';
import { Box, Button, Popover, Stack, SxProps, Typography } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';

export interface DateRangePickerProps {
  startDate: Dayjs;
  endDate: Dayjs;
  onStartDateChange: (date: Dayjs | null) => void;
  onEndDateChange: (date: Dayjs | null) => void;
  onQuickSelect?: (range: { start: Dayjs; end: Dayjs }) => void;
  showQuickRanges?: boolean;
  maxDate?: Dayjs;
  minDate?: Dayjs;
  sx?: SxProps;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onQuickSelect = undefined,
  showQuickRanges = true,
  maxDate = dayjs(),
  minDate = undefined,
  sx = {},
}: DateRangePickerProps) {
  const { t } = useLocaleContext();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  const quickRanges = [
    {
      label: t('last7Days'),
      getValue: () => ({
        start: dayjs().subtract(7, 'day'),
        end: dayjs(),
      }),
    },
    {
      label: t('last30Days'),
      getValue: () => ({
        start: dayjs().subtract(30, 'day'),
        end: dayjs(),
      }),
    },
    {
      label: t('thisMonth'),
      getValue: () => ({
        start: dayjs().startOf('month'),
        end: dayjs().endOf('month'),
      }),
    },
    {
      label: t('lastMonth'),
      getValue: () => ({
        start: dayjs().subtract(1, 'month').startOf('month'),
        end: dayjs().subtract(1, 'month').endOf('month'),
      }),
    },
  ];

  const formatDateRange = () => {
    if (startDate.isSame(endDate, 'day')) {
      return startDate.format('MMM DD, YYYY');
    }
    return `${startDate.format('MMM DD')} - ${endDate.format('MMM DD, YYYY')}`;
  };

  const handleQuickSelect = (range: { start: Dayjs; end: Dayjs }) => {
    onStartDateChange(range.start);
    onEndDateChange(range.end);
    onQuickSelect?.(range);
    handleClose();
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<CalendarMonth />}
        endIcon={<KeyboardArrowDown />}
        onClick={handleClick}
        sx={{
          justifyContent: 'space-between',
          minWidth: 200,
          textTransform: 'none',
          ...sx,
        }}>
        {formatDateRange()}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: { p: 3, minWidth: 400 },
          },
        }}>
        <Stack spacing={3}>
          {/* Quick Select Buttons */}
          {showQuickRanges && onQuickSelect && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                {t('quickSelect')}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {quickRanges.map((range) => (
                  <Button
                    key={range.label}
                    variant="outlined"
                    size="small"
                    onClick={() => handleQuickSelect(range.getValue())}
                    sx={{
                      whiteSpace: 'nowrap',
                      minWidth: 'fit-content',
                    }}>
                    {range.label}
                  </Button>
                ))}
              </Stack>
            </Box>
          )}

          {/* Date Pickers */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary' }}>
              {t('customRange')}
            </Typography>
            <Stack direction="row" spacing={2}>
              <DatePicker
                label={t('analytics.startDate')}
                value={startDate}
                onChange={onStartDateChange}
                maxDate={endDate}
                minDate={minDate}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { minWidth: 140 },
                  },
                }}
              />
              <DatePicker
                label={t('analytics.endDate')}
                value={endDate}
                onChange={onEndDateChange}
                minDate={startDate}
                maxDate={maxDate}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { minWidth: 140 },
                  },
                }}
              />
            </Stack>
          </Box>
        </Stack>
      </Popover>
    </>
  );
}
