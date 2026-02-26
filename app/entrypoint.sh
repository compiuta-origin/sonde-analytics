#!/bin/sh
set -e

cat <<EOF > /app/.next/static/env.js
window.__ENV__ = {
  SUPABASE_PUBLIC_URL: "${SUPABASE_PUBLIC_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
  STRIPE_PUBLISHABLE_KEY: "${STRIPE_PUBLISHABLE_KEY}",
  TERMS_URL: "${TERMS_URL}"
};
EOF

exec "$@"