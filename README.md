# Tunnel Server

Rebuild from [Localtunnel Server](https://github.com/localtunnel/server)

# Features

1. Add basic auth

Add basic auth with `--username` and `--password` arguments

2. Add multiple agents mode

If multiple agents mode enabled and with special subdomain, then subdomain is a reverse proxy (round robin) of all connection using this subdomain.
Enable this mode with `--multi-agents` = `true`