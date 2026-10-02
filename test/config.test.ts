import { describe, expect, it } from 'vitest';
import { readApiKey } from '../src/config';

describe('readApiKey', () => {
  it('returns the API key from the config', () => {
    expect(readApiKey({ apiKey: 'key-1' })).toEqual({ apiKey: 'key-1', errors: [], warnings: [] });
  });

  it('removes white space around the key', () => {
    expect(readApiKey({ apiKey: '  key-1\n' }).apiKey).toBe('key-1');
  });

  it.each([{}, { apiKey: '' }, { apiKey: '   ' }, { apiKey: 42 }])('gives an error without a usable key: %j', config => {
    const result = readApiKey(config);

    expect(result.apiKey).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('No API key');
  });

  it('never uses username and password, and warns about them', () => {
    const result = readApiKey({ username: 'user', password: 'secret' });

    expect(result.apiKey).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('no longer used');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('uses the key and warns when username and password are also present', () => {
    const result = readApiKey({ apiKey: 'key-1', username: 'user', password: 'secret' });

    expect(result.apiKey).toBe('key-1');
    expect(result.warnings).toHaveLength(1);
  });
});
