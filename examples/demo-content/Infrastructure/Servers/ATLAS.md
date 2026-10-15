---
title: ATLAS
description: Main Docker and Incus host
tags:
  - server
  - docker
  - incus
---

# ATLAS

## Overview

Main production host for the homelab. Runs Docker for most services and Incus for the Home Assistant VM. See [[Home Assistant]] and [[VLAN]].

## Hardware

| Component | Value         |
| --------- | ------------- |
| Model     | Mini PC       |
| CPU       | 4-core x86-64 |
| RAM       | 16 GB         |
| Network   | 2.5 GbE       |

## Network

```mermaid
flowchart LR
    Internet --> Gateway
    Gateway --> Switch
    Switch --> ATLAS
    ATLAS --> HAOS[Home Assistant VM]
```

:::warning
Do not enable Secure Boot for the HAOS VM.
:::

## Docker

```yaml
services:
  vaultwarden:
    image: vaultwarden/server:latest
    restart: unless-stopped
    volumes:
      - ./vw-data:/data
```

Update all stacks with `docker compose pull && docker compose up -d`.

## Maintenance checklist

- [x] Weekly backup verified
- [ ] Firmware update
- [ ] Rotate SSH keys
