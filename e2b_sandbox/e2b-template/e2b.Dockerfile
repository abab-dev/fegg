# E2B Custom Template: React + Vite + Shadcn
# Pre-baked with all dependencies for instant startup

FROM node:24-bookworm

# Create user only if doesn't exist, add sudo for user
RUN id -u user 2>/dev/null || useradd -m -s /bin/bash user
RUN grep -q "user ALL=(ALL) NOPASSWD:ALL" /etc/sudoers || echo "user ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create workspace directory and copy files as root first
RUN mkdir -p /home/user/workspace
COPY template/ /home/user/workspace/

# Fix ownership AFTER copy
RUN chown -R user:user /home/user

# Switch to user
USER user

# Set working directory
WORKDIR /home/user/workspace

# Install npm dependencies (this gets baked into the template)
RUN npm install

# Verify installation
RUN node --version && npm --version && ls -la
