#!/bin/bash
export PATH="$HOME/.bun/bin:$PATH"
exec bun run /home/ubuntu/tradeonDEX/src/agent/loop.ts
