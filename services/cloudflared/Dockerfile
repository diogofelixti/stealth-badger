FROM golang:1.23-alpine AS access-env
WORKDIR /src
COPY services/access-env-entrypoint.go .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /access-env-entrypoint access-env-entrypoint.go

FROM cloudflare/cloudflared:latest

COPY --from=access-env /access-env-entrypoint /usr/local/bin/access-env-entrypoint

ENTRYPOINT ["/usr/local/bin/access-env-entrypoint"]
CMD ["cloudflared", "tunnel", "--no-autoupdate", "--metrics", "0.0.0.0:2000", "run"]
