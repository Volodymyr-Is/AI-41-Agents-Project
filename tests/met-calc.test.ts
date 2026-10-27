import { calculateMetCalories } from '../src/utils/met-calc';


describe('calculateMetCalories', () => {
  it('should calculate calories correctly with rounding to 1 decimal place', () => {
    expect(calculateMetCalories(1, 70, 60)).toBe(70.0);
  });

  it('should calculate calories for given MET, weight, and duration', () => {
    expect(calculateMetCalories(3.5, 80, 90)).toBe(420.0);
  });

  it('should round to 1 decimal place', () => {
    expect(calculateMetCalories(1.5, 77, 45)).toBe(86.6);
  });

  it('should throw on non-positive MET', () => {
    expect(() => calculateMetCalories(0, 70, 60)).toThrow('MET must be a positive number');
  });

  it('should throw on non-positive weight', () => {
    expect(() => calculateMetCalories(1, 0, 60)).toThrow('Weight must be a positive number');
  });

  it('should throw on non-positive duration', () => {
    expect(() => calculateMetCalories(1, 70, 0)).toThrow('Duration must be a positive number');
  });
});