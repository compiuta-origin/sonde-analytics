import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17?target=denonext';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS,
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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with user's JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      },
    );

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { lookupKey, currency } = await req.json();

    if (!lookupKey) {
      throw new Error('Lookup key is required');
    }

    // Retrieve the price using the lookup key
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      active: true,
    });

    if (!prices.data || prices.data.length === 0) {
      throw new Error(`No price found for lookup key: ${lookupKey}`);
    }

    const priceId = prices.data[0].id;

    // Check if user already has a Stripe customer ID
    const { data: subscriptions, error: subscriptionError } = await supabaseClient
      .from('subscriptions')
      .select('id, stripe_customer_id, plan, status, updated_at, created_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    if (subscriptionError) {
      throw subscriptionError;
    }

    const subscription = pickSubscriptionRow(
      subscriptions,
      CHECKOUT_SUBSCRIPTION_SELECTION_OPTIONS,
    );

    let customerId = subscription?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      // Store customer ID in database
      if (subscription?.id) {
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .update({
            stripe_customer_id: customerId,
            plan: subscription.plan ?? 'free',
          })
          .eq('id', subscription.id);
        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabaseClient
          .from('subscriptions')
          .insert({
          user_id: user.id,
          stripe_customer_id: customerId,
          plan: 'free',
        });
        if (insertError) {
          throw insertError;
        }
      }
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      currency: currency?.toLowerCase(),
      payment_method_types: ['card'],
      metadata: {
        supabase_user_id: user.id,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
      success_url: `${Deno.env.get('SITE_URL')}/dashboard?success=true`,
      cancel_url: `${Deno.env.get('SITE_URL')}/upgrade?canceled=true`,
      allow_promotion_codes: true,
    });

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
