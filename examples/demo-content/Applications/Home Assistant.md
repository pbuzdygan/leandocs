---
title: Home Assistant
tags:
  - application
  - automation
---

# Home Assistant

Runs as a VM on [[BUZHULK]] (Incus, macvlan networking).

## Troubleshooting

:::danger
Restoring an old snapshot overwrites all automations created since then.
:::

```bash
incus exec haos -- ha core restart
```
