# Tunnel Server

Rebuild from [Localtunnel Server](https://github.com/localtunnel/server)

# Features

1. Add basic auth

    Add basic auth with `--username` and `--password` arguments

2. Add multiple agents mode

    If multiple agents mode enabled and with special subdomain, then subdomain is a reverse proxy (round robin) of all connection using this subdomain.
    
    Enable this mode with `--multi-agents` = `true`

# Deploy

Deploy using docker

```
docker run -d --restart always --name tunnel-server --net host nguyenphuong99/tunnel-server:latest --port 1234 --domain domain.vn --secure true --multi-agents true
```