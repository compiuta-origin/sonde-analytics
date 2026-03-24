import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17?target=denonext';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  PORTAL_SUBSCRIPTION_SELECTION_OPTIONS,
  pickSubscriptionRow,
} from '../_shared/subscription.ts';

const stripeApiKey = Deno.env.get('STRIPE_API_KEY');
if (!stripeApiKey) {
  throw new Error('STRIPE_API_KEY not configured');
}

const stripe = new Stripe(stripeApiKey, {
  apiVersion: '2025-12-15.clover',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    // Get customer ID
    const { data: subscriptions, error: subscriptionError } = await supabaseClient
      .from('subscriptions')
      .select('stripe_customer_id, status, updated_at, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    if (subscriptionError) {
      throw subscriptionError;
    }

    const subscription = pickSubscriptionRow(
      subscriptions,
      PORTAL_SUBSCRIPTION_SELECTION_OPTIONS,
    );

    if (!subscription?.stripe_customer_id) {
      throw new Error('No subscription found');
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${Deno.env.get('SITE_URL')}/dashboard`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
