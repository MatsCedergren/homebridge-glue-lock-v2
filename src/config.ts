// Added by Mats Cedergren, 2026: reads the API key from the config. The plugin never creates API keys.

export const API_KEY_HELP = 'Create an API key with your Glue account (see the README) and enter it as "apiKey" in the plugin settings.';

export interface ApiKeyResult {
  apiKey?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Versions before 1.0.0 created a new Glue API key at each start when the config had username and password.
 * Glue allows 10 keys per account, so that path is removed. A password in the config is reported, never used.
 */
export function readApiKey(config: Record<string, unknown>): ApiKeyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.username !== undefined || config.password !== undefined) {
    warnings.push('The settings "username" and "password" are no longer used. Remove them from the config, '
      + 'so that your Glue password is not stored in Homebridge.');
  }

  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!apiKey) {
    errors.push(`No API key in the config. ${API_KEY_HELP}`);
    return { errors, warnings };
  }

  return { apiKey, errors, warnings };
}
