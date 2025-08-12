import { useLocaleContext } from '@arcblock/ux/lib/Locale/context';
import { FormLabel } from '@blocklet/aigne-hub/components';
import { CalendarMonth, ExpandLess, ExpandMore, KeyboardArrowDown } from '@mui/icons-material';
import { Box, Button, Collapse, Divider, Popover, Stack, SxProps, Typography } from '@mui/material';
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
  sx?: SxProps;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onQuickSelect = undefined,
  maxDate = dayjs(),
  minDate = undefined,
  sx = {},
}: DateRangePickerProps) {
  const { t, locale } = useLocaleContext();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setShowCustom(false); // Reset custom section when closing
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
    onStartDateChange(range.start);
    onEndDateChange(range.end);
    onQuickSelect?.(range);
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
        <Box sx={{ p: 3 }}>
          <Typography
            variant="h6"
            sx={{
              mb: 2.5,
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
              mb: 2.5,
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

          <Divider sx={{ mb: 2 }} />

          {/* Custom Range Toggle */}
          <Button
            variant="text"
            startIcon={showCustom ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setShowCustom(!showCustom)}
            sx={{
              width: '100%',
              justifyContent: 'flex-start',
              textTransform: 'none',
              py: 1,
              px: 0,
              fontWeight: 600,
              color: 'text.primary',
              fontSize: '1rem',
            }}>
            {t('customRange')}
          </Button>

          {/* Collapsible Custom Date Range */}
          <Collapse in={showCustom}>
            <Box sx={{ pt: 2 }}>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <FormLabel sx={{ mb: 1, color: 'text.secondary' }}>{t('analytics.startDate')}</FormLabel>
                    <DatePicker
                      value={startDate}
                      onChange={onStartDateChange}
                      maxDate={endDate}
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
                      onChange={onEndDateChange}
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
              </Stack>
            </Box>
          </Collapse>
        </Box>
      </Popover>
    </>
  );
}
