---
id: visual-buzhulk
tags: [server, docker, incus]
---

# BUZHULK

Main Docker and Incus host.

## Overview

Main production host for BUZLAB. Runs the reverse proxy, [[Home Assistant]] and most containers. Network details are in [[VLAN]].

## Hardware

| Component | Value        |
| --------- | ------------ |
| CPU       | Intel N100   |
| Memory    | 32 GB DDR5   |
| Network   | Intel I226-V |

## Docker

```bash
docker compose -f /srv/stack/compose.yaml up -d
docker ps --format '{{.Names}}'
```

:::warning
Stop the stack before resizing the data volume.
:::

## Backup

- [x] Nightly snapshot to the NAS
- [ ] Off-site copy

> Restore tests run every quarter.
