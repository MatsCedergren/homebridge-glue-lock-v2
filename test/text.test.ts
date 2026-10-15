import { describe, expect, it } from 'vitest';
import { asSentence } from '../src/utils';

describe('asSentence', () => {
  it('adds a period when the text has none', () => {
    expect(asSentence('HTTP 500 Internal Server Error')).toBe('HTTP 500 Internal Server Error.');
  });

  it('does not add a second period', () => {
    expect(asSentence('Please check the plugin configuration.')).toBe('Please check the plugin configuration.');
  });

  it('keeps other end punctuation', () => {
    expect(asSentence('Is the hub online?')).toBe('Is the hub online?');
  });

  it('removes trailing spaces', () => {
    expect(asSentence('fetch failed  ')).toBe('fetch failed.');
  });
});
