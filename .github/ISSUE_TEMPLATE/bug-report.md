---
name: Bug Report
about: Something in the plugin does not work as described in the README
title: ''
labels: bug
assignees: ''

---

<!--
WARNING: Never post your Glue API key ("apiKey"). It can unlock your door.
Delete the "apiKey" line from the config before you paste it.
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

> ⚠️ Paste only lines that start with `[Glue]` (or the name of your platform). Check that they contain no API key.

```
Paste the [Glue] log lines here.
```

**Plugin Config:**

> ⚠️ **Never post your Glue API key.** It can unlock your door.
> Paste only the "GlueHomebridge" block, and delete the `"apiKey"` line first.

```json
{
    "platform": "GlueHomebridge",
    "name": "Glue"
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
