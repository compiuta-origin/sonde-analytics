FROM alpine

RUN apk add --no-cache ca-certificates curl

RUN curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
  | tar -xz \
  && mv supabase /usr/local/bin/supabase \
  && chmod +x /usr/local/bin/supabase

WORKDIR /
ENTRYPOINT ["supabase"]