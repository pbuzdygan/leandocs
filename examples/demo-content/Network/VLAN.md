---
title: VLAN
tags:
  - network
---

# VLAN

| ID  | Name    | Subnet          | Purpose            |
| --- | ------- | --------------- | ------------------ |
| 10  | Servers | 192.168.10.0/24 | Docker, Incus, DNS |
| 20  | IoT     | 192.168.20.0/24 | Zigbee, cameras    |
| 30  | Clients | 192.168.30.0/24 | Laptops, phones    |

:::tip
Use the IoT VLAN for every device that does not need internet access.
:::
