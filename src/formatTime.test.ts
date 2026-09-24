import { describe, expect, it } from 'vitest';

import { formatTime } from './formatTime';

describe('formatTime', () => {
  describe('людський формат за замовчуванням (style: human)', () => {
    it('повертає 0s для 0 або менше 1000 мс', () => {
      expect(formatTime(0)).toBe('0s');
      expect(formatTime(500)).toBe('0s');
      expect(formatTime(-1000)).toBe('0s');
      expect(formatTime(NaN)).toBe('0s');
    });

    it('форматує секунди до 1 хвилини', () => {
      expect(formatTime(1_000)).toBe('1s');
      expect(formatTime(45_000)).toBe('45s');
      expect(formatTime(59_000)).toBe('59s');
    });

    it('форматує хвилини та секунди', () => {
      expect(formatTime(60_000)).toBe('1m');
      expect(formatTime(65_000)).toBe('1m 5s');
      expect(formatTime(125_000)).toBe('2m 5s');
      expect(formatTime(600_000)).toBe('10m');
      expect(formatTime(3599_000)).toBe('59m 59s');
    });

    it('форматує години, хвилини та секунди', () => {
      expect(formatTime(3600_000)).toBe('1h');
      expect(formatTime(3605_000)).toBe('1h 5s');
      expect(formatTime(3660_000)).toBe('1h 1m');
      expect(formatTime(3665_000)).toBe('1h 1m 5s');
      expect(formatTime(7325_000)).toBe('2h 2m 5s');
    });
  });

  describe('цифровий формат (style: digital)', () => {
    it('повертає 00:00 для 0 та від\'ємних значень', () => {
      expect(formatTime(0, { style: 'digital' })).toBe('00:00');
      expect(formatTime(-5000, { style: 'digital' })).toBe('00:00');
      expect(formatTime(NaN, { style: 'digital' })).toBe('00:00');
    });

    it('форматує секунди та хвилини у вигляді mm:ss', () => {
      expect(formatTime(5_000, { style: 'digital' })).toBe('00:05');
      expect(formatTime(65_000, { style: 'digital' })).toBe('01:05');
      expect(formatTime(599_000, { style: 'digital' })).toBe('09:59');
    });

    it('форматує години у вигляді hh:mm:ss', () => {
      expect(formatTime(3600_000, { style: 'digital' })).toBe('01:00:00');
      expect(formatTime(3665_000, { style: 'digital' })).toBe('01:01:05');
      expect(formatTime(36000_000, { style: 'digital' })).toBe('10:00:00');
    });
  });
});
