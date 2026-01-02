FROM oven/bun:1-debian

RUN mkdir -p /home/user/workspace

WORKDIR /home/user/workspace

COPY . /home/user/workspace/

# Remove e2b config files
RUN rm -f e2b.Dockerfile e2b.toml

RUN bun install

EXPOSE 5173
