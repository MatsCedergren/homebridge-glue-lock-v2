# Security Policy

This plugin controls a door lock. Please report security problems privately.

## Report a problem

Use [private vulnerability reporting](https://github.com/MatsCedergren/homebridge-glue-lock-v2/security/advisories/new) on GitHub.
Do not open a public issue.

Include:

- The plugin version.
- What an attacker can do, for example unlock the door or read the API key.
- The steps to reproduce it.

Never include your own Glue API key. Replace it with `***`.

You get an answer within 7 days.

## Supported versions

Only the latest version on npm gets security fixes.

## Scope

In scope:

- The code in this repository and the `homebridge-glue-lock-v2` npm package.
- The plugin sends a lock or unlock operation that HomeKit did not ask for.
- The plugin shows the lock as locked when it is not.
- The API key appears in logs, errors or files outside the Homebridge config.

Not in scope:

- The Glue lock, the Glue Hub, the Glue app and the Glue cloud API. Report these to [GlueHome](https://www.gluehome.com/support/home).
- Homebridge and HomeKit. Report these to the [Homebridge project](https://github.com/homebridge/homebridge/security).
