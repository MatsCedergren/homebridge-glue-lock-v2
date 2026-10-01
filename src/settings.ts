// Modified by Mats Cedergren, 2026: Homebridge v2 fork (homebridge-glue-lock-v2).
import { platform, release } from 'os';

/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'GlueHomebridge';

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const VERSION = require('../package.json').version;

export const OS_VERSION = `${platform()} ${release()}`;

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-glue-lock-v2';
