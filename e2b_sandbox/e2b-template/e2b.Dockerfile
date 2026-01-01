# E2B Custom Template: React + Vite + Shadcn
# Using Bun for faster installs and runtime

FROM oven/bun:1-debian

# Create workspace and copy template
RUN mkdir -p /home/user/workspace

WORKDIR /home/user/workspace

COPY template/ /home/user/workspace/

# Install dependencies with bun (much faster than npm)
RUN bun install

# Verify installation
RUN bun --version && ls -la
