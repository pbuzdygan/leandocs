---
title: Backup Restore
tags:
  - procedure
  - backup
---

# Backup Restore

1. Stop the stack: `docker compose down`
2. Restore the volume from restic:

   ```bash
   restic -r /mnt/backup restore latest --target /srv/vaultwarden
   ```

3. Start the stack and verify the login page.

:::note
LeanDocs itself only needs `data/content` to be backed up.
:::
