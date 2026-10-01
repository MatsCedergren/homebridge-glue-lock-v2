// Modified by Mats Cedergren, 2026: Homebridge v2 fork (homebridge-glue-lock-v2).
// Generates accessory UUIDs with hap.uuid and removes legacy cached accessories.
import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { GlueLockAccessory } from './lock';
import { GlueApi } from './api';
import { issueApiKey } from './api/client';

interface GlueHomePlatformConfig extends PlatformConfig {
  apiKey: string;
  username: string;
  password: string;
}

export class GlueHomePlatformPlugin implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private apiClient?: GlueApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');

      this.getApiKey(config as GlueHomePlatformConfig)
        .then(key => {
          this.apiClient = new GlueApi(key);
          this.discoverDevices();
        }).catch(err => {
          log.error('Error authenticating:', err);
        });
    });
  }

  getApiKey(glueConfig: GlueHomePlatformConfig): Promise<string> {
    return (glueConfig.apiKey)
      ? Promise.resolve(glueConfig.apiKey)
      : issueApiKey(glueConfig.username, glueConfig.password);
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  discoverDevices() {
    if (this.apiClient === undefined) {
      return;
    }
    const apiClient = this.apiClient;
    apiClient.getLocks()
      .then(locks => {
        const activeUUIDs = new Set<string>();

        for (const lock of locks) {
          const uuid = this.api.hap.uuid.generate(lock.id);
          activeUUIDs.add(uuid);

          // Versions before 0.3.0 used the raw lock id as UUID. Remove such accessories so they are not duplicated.
          const legacyAccessory = this.accessories.find(accessory => accessory.UUID === lock.id && lock.id !== uuid);
          if (legacyAccessory) {
            this.log.info('Removing legacy accessory from cache:', legacyAccessory.displayName);
            this.removeCachedAccessory(legacyAccessory);
          }

          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            new GlueLockAccessory(this, existingAccessory, apiClient, lock);

            this.api.updatePlatformAccessories([existingAccessory]);
          } else {
            this.log.info('Adding new accessory:', lock.description);

            const accessory = new this.api.platformAccessory(lock.description, uuid);

            new GlueLockAccessory(this, accessory, apiClient, lock);

            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            this.accessories.push(accessory);
          }
        }

        // Remove cached accessories for locks that no longer exist in the Glue account.
        for (const accessory of [...this.accessories]) {
          if (!activeUUIDs.has(accessory.UUID)) {
            this.log.info('Removing accessory that is no longer in the Glue account:', accessory.displayName);
            this.removeCachedAccessory(accessory);
          }
        }
      }).catch(error => {
        this.log.error('Could not discover locks:', error instanceof Error ? error.message : error);
      });
  }

  private removeCachedAccessory(accessory: PlatformAccessory) {
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.splice(this.accessories.indexOf(accessory), 1);
  }
}
