# Jong has no build step and no npm dependencies, so a single stage copying
# the runtime files is enough.
FROM node:24-alpine

RUN apk add --no-cache tini \
 && addgroup --system app \
 && adduser --system --ingroup app app

WORKDIR /app

COPY server.mjs index.html LICENSE ./
COPY src/ ./src/

ENV PORT=3000

USER app:app
EXPOSE 3000

# Uses Node's built-in fetch, so the image needs neither curl nor wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/`) \
    .then((res) => process.exit(res.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.mjs"]
