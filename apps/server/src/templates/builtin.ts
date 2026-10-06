/**
 * Built-in templates (PROJECT_SPEC §35–36), written to `_templates/` once. They are ordinary
 * Markdown files afterwards: users edit, delete or add templates in that folder.
 */
export const BUILTIN_TEMPLATES: Record<string, string> = {
  Server: `---
tags: [server]
---

# {{title}}

## Overview

## Hardware

## Operating System

## Network

## Storage

## Services

## Backup

## Monitoring

## Maintenance

## Troubleshooting

## References
`,
  Application: `---
tags: [application]
---

# {{title}}

## Overview

## Deployment

## Configuration

## Network

## Volumes

## Backup

## Update procedure

## Troubleshooting
`,
  Procedure: `---
tags: [procedure]
---

# {{title}}

## Purpose

## Prerequisites

## Steps

1. 

## Verification

## Rollback

## References
`,
  'Network Device': `---
tags: [network]
---

# {{title}}

## Overview

| Property | Value |
| --- | --- |
| Model | |
| Management IP | |
| Firmware | |
| Location | |

## Interfaces and VLANs

## Configuration

## Backup

## Maintenance

## Troubleshooting
`,
  Incident: `---
tags: [incident]
---

# {{title}}

**Date:** {{date}}

## Summary

## Impact

## Timeline

| Time | Event |
| --- | --- |
| | |

## Root cause

## Resolution

## Follow-up actions

- [ ] 
`,
};
