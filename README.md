<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Glue Lock Homebridge Plugin (v2)

Homebridge plugin for Glue smart locks. It uses the Glue cloud API through a Glue Hub.

> **Unofficial fork.** This project is a fork of [GlueHome/homebridge-plugin](https://github.com/GlueHome/homebridge-plugin).
> It is not made, supported or endorsed by GlueHome. It is licensed under the Apache License 2.0, the same as the original.

The fork supports Homebridge 1.8+ and 2.x. The original plugin stops at start on Homebridge 2.x.

## Features

- Lock and unlock from the Home app, Siri and HomeKit automations.
- Lock state, battery level and a low-battery warning.
- "Not responding" in HomeKit when the Glue Hub cannot reach the lock.
- A failed lock operation is never shown as locked.
- The plugin never sends a lock or unlock operation by itself. Only HomeKit commands send operations.

## Requirements

- A Glue lock connected to a Glue Hub.
- Homebridge `^1.8.0 || ^2.0.0`.
- Node.js `^22 || ^24`.
- A Glue API key (see below).

## Create an API key

Create the key once, on any computer. curl asks for your Glue password. Do not store the password in a file.

```sh
curl -i --request POST 'https://user-api.gluehome.com/v1/api-keys' \
  --header 'Content-Type: application/json' \
  -u 'your-glue-username' \
  --data-raw '{
    "name": "homebridge",
    "scopes": ["events.read", "locks.read", "locks.write"]
  }'
```

The response contains `apiKey`. Keep it secret: it can unlock your door.
Glue allows 10 API keys per account.

## Installation

Install the plugin from the Homebridge UI: search for `homebridge-glue-lock-v2`.

Or install it from the command line:

```sh
npm install -g homebridge-glue-lock-v2
```

Run the plugin as a **child bridge**. Then an error in this plugin cannot stop your other accessories.

## Configuration

Use the plugin settings in the Homebridge UI, or edit `config.json`:

```json
"platforms": [
    {
        "platform": "GlueHomebridge",
        "name": "Glue",
        "apiKey": "<your api key>",
        "pollInterval": 30,
        "lowBatteryThreshold": 20
    }
]
```

| Setting | Required | Default | Description |
|---|---|---|---|
| `platform` | yes | | Must be `GlueHomebridge`. |
| `apiKey` | yes | | Your Glue API key. |
| `name` | no | `Glue` | Name of the platform in the log. |
| `pollInterval` | no | `30` | Seconds between status reads from Glue. Minimum `15`. After a failed read, the delay doubles, up to 5 minutes. |
| `lowBatteryThreshold` | no | `20` | HomeKit shows a low-battery warning when the battery level is below this value (%). |

## Move from `@gluehome/homebridge-gluehome`

1. Take a backup of Homebridge.
2. Uninstall `@gluehome/homebridge-gluehome`. Both plugins use the platform name `GlueHomebridge`, so do not install both.
3. Install `homebridge-glue-lock-v2`. The existing `GlueHomebridge` config block continues to work.
4. Remove `username`, `password` and `auth` from the config block, if they are there. This plugin does not use them.
5. Restart Homebridge.

The lock appears as a **new accessory** in the Home app, because the accessory ID changed. Set up its room and automations again.

If the old lock was on a child bridge and the Home app does not let you add the bridge:

1. Remove the old Glue bridge or lock from the Home app.
2. Pair with the QR code of the child bridge, not the QR code of the main bridge. In the Homebridge UI, open the plugin menu and select the bridge settings.
3. If that fails, unpair the child bridge in the Homebridge UI (**Settings** → **Unpair Bridges / Cameras / TVs / External Accessories**) and pair again.

## How the lock state works

- The lock state comes from the last lock event that Glue reports, for example `remoteLock` or `manualUnlock`.
- HomeKit is updated after each status read, so a change can take up to `pollInterval` seconds to appear.
- If Glue does not report an operation, for example a manual operation that the Glue Hub did not register, HomeKit shows the old state until Glue reports a new event.
- After a failed or timed-out operation, HomeKit shows "Locking…" or "Unlocking…" until Glue reports a new lock event. The plugin does not send the operation again. Check the door.

## Troubleshooting

| Log message | Meaning |
|---|---|
| `No API key in the config.` | Add `apiKey` to the config block. |
| `Wrong authentication data provided.` | Glue did not accept the API key. Create a new key. |
| `<lock>: offline. Shown as not responding.` | The Glue Hub cannot reach the lock. Check the hub and the lock batteries. |
| `<lock>: could not refresh (n in a row)` | The Glue API did not answer. The plugin tries again with a longer delay. |
| `<lock>: lock failed.` | Glue could not lock the door, for example because the door was open. |

## Development

```sh
nvm use
npm ci
npm run lint
npm run typecheck
npm run build
npm test
```

The tests never call the real Glue API. They use fixtures in `test/fixtures`.

## License

Apache License 2.0. See [LICENSE](LICENSE). The original plugin was made by GlueHome.
