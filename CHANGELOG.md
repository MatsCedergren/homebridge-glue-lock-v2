# Changelog

All notable changes to `homebridge-glue-lock-v2` are listed here.
This package is an unofficial fork of [`@gluehome/homebridge-gluehome`](https://github.com/GlueHome/homebridge-plugin) 0.2.0.

## 1.0.1 - 2026-10-02

### Changed

- The GitHub repository is renamed to [`MatsCedergren/homebridge-glue-lock-v2`](https://github.com/MatsCedergren/homebridge-glue-lock-v2). The package links point to the new name.
- First version published from GitHub Actions with npm trusted publishing and provenance.

No code changes.

## 1.0.0 - 2026-10-02

First release of the fork.

### Compatibility

- Supports Homebridge `^1.8.0 || ^2.0.0` and Node.js `^22 || ^24`.
- The platform name is still `GlueHomebridge`, so an existing config block continues to work.
- The package name is new. Remove `@gluehome/homebridge-gluehome` before you install this package.

### Changed

- Replaced `Service.BatteryService` with `Service.Battery`. The old plugin stops at start on Homebridge 2.x.
- Characteristic handlers use `onGet` / `onSet`. Errors are reported to HomeKit as `HapStatusError`.
- Accessory UUIDs are generated with `hap.uuid.generate(lock.id)`. A cached accessory with the old raw-ID UUID is replaced, not duplicated. HomeKit therefore shows the lock as a new accessory once.
- Replaced `axios` with the built-in `fetch`. The package has no runtime dependencies.
- The low-battery warning starts below 20 % (was 50 %). Use `lowBatteryThreshold` to change it.

### Added

- `pollInterval` setting: default 30 s, minimum 15 s. After a failed poll, the delay doubles up to 5 minutes.
- `lowBatteryThreshold` setting: default 20 %.
- `offline` and `disconnected` from Glue, and 3 failed polls in a row, show the lock as "Not responding" in HomeKit.
- Lock discovery at start is retried with backoff when the Glue API cannot be reached.

### Fixed

- The target state is kept apart from the current state. A failed or timed-out lock operation is never shown as locked.
- `onSet` returns at once. Before, HomeKit waited up to about 20 s and could show "Not responding".
- A second command during an operation is rejected with `RESOURCE_BUSY`. An operation is never sent again automatically.
- A network error during a poll no longer stops the child bridge (upstream issues #20 and #36).
- `Contenty-Type` header typo.
- Logs show state changes. The lock ID, serial number and API key are never logged.

### Removed

- Creating an API key from `username` / `password` in the config. Each start created a new key, until Glue's limit of 10 keys per account was reached (upstream issue #32). Create the key once and enter it as `apiKey`. A `username` or `password` in the config causes a warning.
