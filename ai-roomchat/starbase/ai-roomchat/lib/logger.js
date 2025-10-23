/**
 * Test-aware logger that suppresses console output during tests
 * to prevent test failures caused by console.warn/error
 */

const IS_TEST = process.env.NODE_ENV === 'test';

export const error = (...args) => {
  if (!IS_TEST) console.error(...args);
};

export const warn = (...args) => {
  if (!IS_TEST) console.warn(...args);
};

export const info = (...args) => {
  if (!IS_TEST) console.info(...args);
};

export const log = (...args) => {
  if (!IS_TEST) console.log(...args);
};
