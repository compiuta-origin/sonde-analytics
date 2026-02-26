export function getCorsHeaders(req?: Request) {
  const allowedOrigin = Deno.env.get('SITE_URL') ?? '';
  const origin = req?.headers.get('origin') ?? '';

  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : '',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };
}
