FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git
RUN GOBIN=/out go install github.com/minio/minio@latest

FROM alpine:3.23

RUN apk add --no-cache ca-certificates
COPY --from=builder /out/minio /usr/local/bin/minio

EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
