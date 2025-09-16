import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { FormLabel } from '@blocklet/aigne-hub/components';
import { CalendarMonth, ExpandLess, ExpandMore, KeyboardArrowDown } from '@mui/icons-material';
import { Box, Button, Collapse, Divider, Popover, Stack, SxProps, Typography, useMediaQuery } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { useState } from 'react';

export interface DateRangePickerProps {
  startDate: Dayjs;
  endDate: Dayjs;
  onStartDateChange: (date: Dayjs | null) => void;
  onEndDateChange: (date: Dayjs | null) => void;
  onQuickSelect?: (range: { start: Dayjs; end: Dayjs }) => void;
  maxDate?: Dayjs;
  minDate?: Dayjs;
  maxRangeDays?: number;
  sx?: SxProps;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onQuickSelect = undefined,
  maxDate = dayjs(),
  minDate = dayjs().subtract(3, 'month').startOf('month'), // Default to 3 months ago
  maxRangeDays = 31,
  sx = {},
}: DateRangePickerProps) {
  const { t, locale } = useLocaleContext();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('md'));

  const handleStartDateChange = (date: Dayjs | null) => {
    if (!date) {
      onStartDateChange(date);
      return;
    }

    // Ensure date is not before minDate
    const adjustedDate = minDate && date.isBefore(minDate, 'day') ? minDate : date;

    const daysDiff = endDate.diff(adjustedDate, 'day') + 1;
    if (daysDiff > maxRangeDays) {
      const newEndDate = adjustedDate.add(maxRangeDays - 1, 'day');
      onStartDateChange(adjustedDate);
      onEndDateChange(newEndDate);
    } else {
      onStartDateChange(adjustedDate);
    }
  };

  const handleEndDateChange = (date: Dayjs | null) => {
    if (!date) {
      onEndDateChange(date);
      return;
    }

    const daysDiff = date.diff(startDate, 'day') + 1;
    if (daysDiff > maxRangeDays) {
      let newStartDate = date.subtract(maxRangeDays - 1, 'day');
      // Ensure newStartDate is not before minDate
      if (minDate && newStartDate.isBefore(minDate, 'day')) {
        newStartDate = minDate;
      }
      onEndDateChange(date);
      onStartDateChange(newStartDate);
    } else {
      onEndDateChange(date);
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setShowCustom(false);
  };

  const open = Boolean(anchorEl);

  const quickRanges = [
    {
      label: t('last7Days'),
      getValue: () => ({
        start: dayjs().subtract(6, 'day').startOf('day'),
        end: dayjs().endOf('day'),
      }),
    },
    {
      label: t('last30Days'),
      getValue: () => ({
        start: dayjs().subtract(29, 'day').startOf('day'),
        end: dayjs().endOf('day'),
      }),
    },
    {
      label: t('thisMonth'),
      getValue: () => ({
        start: dayjs().startOf('month'),
        end: dayjs().endOf('day'),
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
      if (locale === 'zh') {
        return startDate.format('YYYY年MM月DD日');
      }
      return startDate.format('MMM DD, YYYY');
    }

    if (locale === 'zh') {
      if (startDate.isSame(endDate, 'year')) {
        return `${startDate.format('M月D日')} - ${endDate.format('M月D日, YYYY年')}`;
      }
      return `${startDate.format('YYYY年M月D日')} - ${endDate.format('YYYY年M月D日')}`;
    }

    return `${startDate.format('MMM DD')} - ${endDate.format('MMM DD, YYYY')}`;
  };

  const handleQuickSelect = (range: { start: Dayjs; end: Dayjs }) => {
    // Ensure start date is not before minDate
    let adjustedStart = range.start;
    if (minDate && adjustedStart.isBefore(minDate, 'day')) {
      adjustedStart = minDate;
    }

    const daysDiff = range.end.diff(adjustedStart, 'day') + 1;
    if (daysDiff > maxRangeDays) {
      const adjustedEnd = adjustedStart.add(maxRangeDays - 1, 'day');
      onStartDateChange(adjustedStart);
      onEndDateChange(adjustedEnd);
      onQuickSelect?.({ start: adjustedStart, end: adjustedEnd });
    } else {
      onStartDateChange(adjustedStart);
      onEndDateChange(range.end);
      onQuickSelect?.({ start: adjustedStart, end: range.end });
    }
    handleClose();
  };

  // Check if current selection matches any quick range
  const getActiveQuickRange = () => {
    return quickRanges.find((range) => {
      const rangeValue = range.getValue();
      return startDate.isSame(rangeValue.start, 'day') && endDate.isSame(rangeValue.end, 'day');
    });
  };

  const activeQuickRange = getActiveQuickRange();

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<CalendarMonth />}
        endIcon={<KeyboardArrowDown />}
        onClick={handleClick}
        sx={{
          justifyContent: 'space-between',
          minWidth: 220,
          textTransform: 'none',
          bgcolor: 'background.paper',
          borderColor: 'divider',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'action.hover',
          },
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
            sx: {
              p: 0,
              minWidth: 320,
              borderRadius: 3,
              boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
              border: '1px solid',
              borderColor: 'divider',
            },
          },
        }}>
        <Box sx={{ p: isMobile ? 2 : 3 }}>
          <Typography
            variant="h6"
            sx={{
              mb: isMobile ? 1.5 : 2.5,
              color: 'text.primary',
              fontWeight: 600,
              fontSize: '1rem',
            }}>
            {t('quickSelect')}
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1.5,
              mb: isMobile ? 1.5 : 2.5,
            }}>
            {quickRanges.map((range) => {
              const isActive = activeQuickRange?.label === range.label;
              return (
                <Button
                  key={range.label}
                  variant={isActive ? 'contained' : 'outlined'}
                  onClick={() => handleQuickSelect(range.getValue())}
                  sx={{
                    py: 1,
                    textTransform: 'none',
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    bgcolor: isActive ? 'primary.main' : 'transparent',
                    borderColor: isActive ? 'primary.main' : 'divider',
                    color: isActive ? 'primary.contrastText' : 'text.primary',
                    '&:hover': {
                      bgcolor: isActive ? 'primary.dark' : 'action.hover',
                      borderColor: isActive ? 'primary.dark' : 'primary.main',
                      transform: 'translateY(-1px)',
                    },
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  }}>
                  {range.label}
                </Button>
              );
            })}
          </Box>

          <Divider sx={{ mb: isMobile ? 1.5 : 2.5 }} />

          <Button
            variant="text"
            startIcon={showCustom ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setShowCustom(!showCustom)}
            sx={{
              width: '100%',
              justifyContent: 'flex-start',
              textTransform: 'none',
              p: 0,
              fontWeight: 600,
              color: 'text.primary',
              fontSize: '1rem',
              mb: isMobile ? 1.5 : 2.5,
            }}>
            {t('customRange')}
          </Button>

          <Collapse in={showCustom}>
            <Stack sx={{ gap: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <FormLabel sx={{ mb: 1, color: 'text.secondary' }}>{t('analytics.startDate')}</FormLabel>
                  <DatePicker
                    value={startDate}
                    onChange={handleStartDateChange}
                    maxDate={maxDate}
                    minDate={minDate}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 1.5,
                          },
                        },
                      },
                    }}
                  />
                </Box>

                <Box sx={{ flex: 1 }}>
                  <FormLabel sx={{ mb: 1, color: 'text.secondary' }}>{t('analytics.endDate')}</FormLabel>
                  <DatePicker
                    value={endDate}
                    onChange={handleEndDateChange}
                    minDate={startDate}
                    maxDate={maxDate}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 1.5,
                          },
                        },
                      },
                    }}
                  />
                </Box>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  fontSize: '0.75rem',
                }}>
                {t('dataAvailableFrom')}
              </Typography>
            </Stack>
          </Collapse>
        </Box>
      </Popover>
    </>
  );
}
