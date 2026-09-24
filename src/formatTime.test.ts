import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('форматує мілісекунди, менші за секунду', () => {
    expect(formatTime(0)).toBe('0ms');
    expect(formatTime(250)).toBe('250ms');
    expect(formatTime(999)).toBe('999ms');
  });

  it('форматує секунди без хвилин чи годин', () => {
    expect(formatTime(1000)).toBe('1s');
    expect(formatTime(45000)).toBe('45s');
    expect(formatTime(59000)).toBe('59s');
  });

  it('форматує хвилини та секунди', () => {
    expect(formatTime(60000)).toBe('1m');
    expect(formatTime(65000)).toBe('1m 5s');
    expect(formatTime(125000)).toBe('2m 5s');
  });

  it('форматує години, хвилини та секунди', () => {
    expect(formatTime(3600000)).toBe('1h');
    expect(formatTime(3661000)).toBe('1h 1m 1s');
    expect(formatTime(7325000)).toBe('2h 2m 5s');
  });

  it('коректно обробляє граничні та некоректні значення', () => {
    expect(formatTime(-100)).toBe('0ms');
    expect(formatTime(NaN)).toBe('0ms');
    expect(formatTime(Infinity)).toBe('0ms');
  });
});
