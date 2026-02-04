import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGrantUsage } from './use-grant-usage';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('useGrantUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Success Cases', () => {
    it('should fetch grant usage successfully', async () => {
      // Given: Valid grant usage data
      const mockData = {
        summary: {
          total_granted: '1000',
          total_consumed: '250',
          total_remaining: '750',
        },
        daily_stats: [
          {
            date: '2024-01-01',
            total_granted: '0',
            total_consumed: '100',
            total_remaining: '0',
          },
        ],
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockData });

      // When: Hook is called with time range and grantorDid
      const { result } = renderHook(() =>
        useGrantUsage({
          startTime: 1704067200,
          endTime: 1704153600,
          grantorDid: 'z1testapp123',
        })
      );

      // Then: Should return grant usage data
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/credit/grant-usage', {
        params: { startTime: 1704067200, endTime: 1704153600, grantorDid: 'z1testapp123' },
      });
    });

    it('should return empty data when no grants exist', async () => {
      // Given: No grants
      const mockData = {
        summary: {
          total_granted: '0',
          total_consumed: '0',
          total_remaining: '0',
        },
        daily_stats: [],
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockData });

      // When: Hook is called
      const { result } = renderHook(() =>
        useGrantUsage({
          startTime: 1704067200,
          endTime: 1704153600,
          grantorDid: 'z1testapp456',
        })
      );

      // Then: Should return empty data
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
    });
  });

  describe('Error Cases', () => {
    it('should handle missing parameters gracefully', async () => {
      // When: Hook is called without parameters
      const { result } = renderHook(() =>
        useGrantUsage({
          startTime: undefined,
          endTime: undefined,
          grantorDid: undefined,
        })
      );

      // Then: Should return null immediately
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeNull();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should handle API error with silent degradation', async () => {
      // Given: API returns error
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      // When: Hook is called
      const { result } = renderHook(() =>
        useGrantUsage({
          startTime: 1704067200,
          endTime: 1704153600,
          grantorDid: 'z1testapp789',
        })
      );

      // Then: Should return null
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });

    it('should handle API failure response with silent degradation', async () => {
      // Given: API returns failure response
      const mockData = {
        success: false,
        error: 'Currency not configured',
        summary: {
          total_granted: '0',
          total_consumed: '0',
          total_remaining: '0',
        },
        daily_stats: [],
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockData });

      // When: Hook is called
      const { result } = renderHook(() =>
        useGrantUsage({
          startTime: 1704067200,
          endTime: 1704153600,
          grantorDid: 'z1testapp111',
        })
      );

      // Then: Should return null
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });
  });
});
