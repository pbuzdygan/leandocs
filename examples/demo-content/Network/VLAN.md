---
title: VLAN
tags:
  - network
---

# VLAN

| ID  | Name    | Subnet       | Purpose            |
| --- | ------- | ------------ | ------------------ |
| 10  | Servers | 10.0.10.0/24 | Docker, Incus, DNS |
| 20  | IoT     | 10.0.20.0/24 | Zigbee, cameras    |
| 30  | Clients | 10.0.30.0/24 | Laptops, phones    |

:::tip
Use the IoT VLAN for every device that does not need internet access.
:::
