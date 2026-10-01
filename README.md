<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# Glue Lock Homebridge Plugin (v2)

Homebridge plugin for Glue smart locks. It uses the Glue cloud API.

> **Unofficial fork.** This project is a fork of [GlueHome/homebridge-plugin](https://github.com/GlueHome/homebridge-plugin).
> It is not made, supported or endorsed by GlueHome. It is licensed under the Apache License 2.0, the same as the original.

The fork adds support for Homebridge 1.8+ and 2.x.

## Installation

```
npm i -g homebridge-glue-lock-v2
```

Run the plugin as a child bridge.

## Requirements

Create an API key with your Glue account. curl asks for your password. Do not store the password in a file.

```
curl -i --request POST 'https://user-api.gluehome.com/v1/api-keys' \
  --header 'Content-Type: application/json' \
  -u 'your-glue-username' \
  --data-raw '{
    "name": "homebridge",
    "scopes": ["events.read", "locks.read", "locks.write"]
  }'
```

## Configuration

Enter the API key in the Homebridge UI, or in `~/.homebridge/config.json`.
The platform name is `GlueHomebridge`, the same as in the original plugin. An existing config continues to work.

```json
    "platforms": [
        {
            "platform": "GlueHomebridge",
            "name": "Glue",
            "apiKey": "<your api key>"
        }
    ]
```
