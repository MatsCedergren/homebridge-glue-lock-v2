---
name: Bug Report
about: Something in the plugin does not work as described in the README
title: ''
labels: bug
assignees: ''

---

<!--
WARNING: Never post your Glue API key ("apiKey"). It can unlock your door.
Replace it with *** in the config and in the logs before you submit.
-->

**Describe The Bug:**
<!-- What happened? -->

**To Reproduce:**
<!-- The steps that cause the problem. -->

**Expected behavior:**
<!-- What should happen? -->

**Lock state:**
<!-- What did the Home app show, and what was the real state of the door? -->

**Logs:**
<!-- Lines from the Homebridge log that start with [Glue] (or the name of your platform). Replace any apiKey with ***. -->

```
Paste the [Glue] log lines here.
```

**Plugin Config:**
<!-- Only the "GlueHomebridge" block. Replace the apiKey with ***. -->

```json
{
    "platform": "GlueHomebridge",
    "name": "Glue",
    "apiKey": "***"
}
```

**Environment:**

* **Plugin Version**: <!-- Homebridge UI → Plugins, or the log line "plugin vX.Y.Z" -->
* **Homebridge Version**: <!-- homebridge -V -->
* **Node.js Version**: <!-- node -v -->
* **Operating System**: <!-- Raspbian / Ubuntu / Debian / Windows / macOS / Docker / hb-service -->
* **Child bridge**: <!-- yes / no -->
* **Glue Hub connection**: <!-- connected / offline / not known -->

<!-- Click the "Preview" tab before you submit to ensure the formatting is correct. -->
