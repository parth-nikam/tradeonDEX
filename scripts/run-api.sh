#!/bin/bash
export PATH="$HOME/.bun/bin:$PATH"
exec bun run /home/ubuntu/tradeonDEX/src/api/server.ts
