import { describe, expect, test } from '@jest/globals';

import { calculateWorkingHours } from '../utils/utils.js';

describe('calculateWorkingHours', () => {
  // Standard working hours tests
  test('should calculate standard working hours correctly', () => {
    expect(calculateWorkingHours('09:00', '17:00')).toEqual({
      hours: 8,
      minutes: 0,
    });
  });

  test('should handle partial hours correctly', () => {
    expect(calculateWorkingHours('08:45', '18:30')).toEqual({
      hours: 9,
      minutes: 45,
    });
    expect(calculateWorkingHours('09:45', '18:15')).toEqual({
      hours: 8,
      minutes: 30,
    });
    expect(calculateWorkingHours('12:15', '23:15')).toEqual({
      hours: 11,
      minutes: 0,
    });
  });

  // Cross-midnight tests
  test('should handle times crossing midnight', () => {
    expect(calculateWorkingHours('19:00', '04:00')).toEqual({
      hours: 9,
      minutes: 0,
    });
    expect(calculateWorkingHours('22:30', '06:45')).toEqual({
      hours: 8,
      minutes: 15,
    });
  });

  // Edge cases
  test('should handle midnight times correctly', () => {
    expect(calculateWorkingHours('00:00', '12:00')).toEqual({
      hours: 12,
      minutes: 0,
    });
    expect(calculateWorkingHours('12:00', '00:00')).toEqual({
      hours: 12,
      minutes: 0,
    });
    expect(calculateWorkingHours('00:00', '00:00')).toEqual({
      hours: 0,
      minutes: 0,
    });
  });

  // Same hour, different minutes
  test('should handle times within the same hour', () => {
    expect(calculateWorkingHours('09:00', '09:45')).toEqual({
      hours: 0,
      minutes: 45,
    });
    expect(calculateWorkingHours('14:15', '14:45')).toEqual({
      hours: 0,
      minutes: 30,
    });
  });

  test('should throw error for missing parameters', () => {
    expect(() => calculateWorkingHours(null, '17:00')).toThrow();
    expect(() => calculateWorkingHours('09:00', null)).toThrow();
    expect(() => calculateWorkingHours()).toThrow();
  });

  // Boundary tests
  test('should handle boundary times correctly', () => {
    expect(calculateWorkingHours('00:00', '23:59')).toEqual({
      hours: 23,
      minutes: 59,
    });
    expect(calculateWorkingHours('23:59', '23:58')).toEqual({
      hours: 23,
      minutes: 59,
    });
    expect(calculateWorkingHours('23:58', '23:59')).toEqual({
      hours: 0,
      minutes: 1,
    });
  });
});
