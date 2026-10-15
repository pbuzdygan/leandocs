---
id: visual-atlas
tags: [server, docker, incus]
---

# ATLAS

Main Docker and Incus host.

## Overview

Main production host for the example homelab. Runs the reverse proxy, [[Home Assistant]] and most containers. Network details are in [[VLAN]].

## Hardware

| Component | Value         |
| --------- | ------------- |
| CPU       | 4-core x86-64 |
| Memory    | 16 GB         |
| Network   | 2.5 GbE       |

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
