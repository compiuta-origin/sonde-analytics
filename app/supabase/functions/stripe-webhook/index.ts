import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17?target=denonext';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeApiKey = Deno.env.get('STRIPE_API_KEY');
if (!stripeApiKey) {
  throw new Error('STRIPE_API_KEY not configured');
}

const stripe = new Stripe(stripeApiKey, {
  apiVersion: '2025-12-15.clover',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function buildStripeResetKey(subscription: Stripe.Subscription) {
  return `stripe:${subscription.id}:${subscription.current_period_start * 1000}`;
}

async function applyPaidCreditReset(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  plan: string,
  subscription: Stripe.Subscription,
) {
  const resetKey = buildStripeResetKey(subscription);
  const { data, error } = await supabaseAdmin.rpc(
    'reset_user_credits_for_period',
    {
      p_user_id: userId,
      p_plan: plan,
      p_reset_key: resetKey,
    },
  );

  if (error) {
    console.error('[WEBHOOK] Failed to reset credits:', error);
    throw error;
  }

  console.log(
    `[WEBHOOK] Credit reset processed for ${userId}: ${JSON.stringify(data)}`,
  );
}

async function findUserIdByCustomerId(
  supabaseAdmin: ReturnType<typeof createClient>,
  customerId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const subscription = data?.[0];

  if (error || !subscription?.user_id) {
    console.error(
      '[WEBHOOK] Could not find user for customer:',
      customerId,
      error,
    );
    return null;
  }

  return subscription.user_id;
}

serve(async (req) => {
  console.log(`[WEBHOOK] Request received: ${req.method} ${req.url}`);
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(err.message, { status: 400 });
  }

  console.log(`🔔 Event received: ${event.type} [ID: ${event.id}]`);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[WEBHOOK] Missing Supabase environment variables');
    return new Response('Internal Server Error', { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;

        console.log(
          `[WEBHOOK] Checkout completed. Session: ${session.id}, User: ${userId}, Customer: ${customerId}, Sub: ${subscriptionId}`,
        );

        if (!userId || !customerId) {
          throw new Error('Missing user or customer ID in checkout session');
        }

        const { error } = await supabaseAdmin.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: 'pro',
            status: 'trialing',
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'stripe_customer_id',
          },
        );

        if (error) {
          console.error('[WEBHOOK] Failed to upsert checkout subscription:', error);
          throw error;
        }

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        let userId = subscription.metadata?.supabase_user_id ?? null;

        if (!userId) {
          userId = await findUserIdByCustomerId(supabaseAdmin, customerId);
        }

        if (!userId) {
          return new Response(
            JSON.stringify({
              received: true,
              note: 'User not found for subscription sync',
            }),
            { status: 200 },
          );
        }

        const priceId = subscription.items.data[0]?.price.id ?? null;
        const billingInterval =
          subscription.items.data[0]?.price.recurring?.interval === 'year'
            ? 'yearly'
            : 'monthly';
        const status = subscription.status;
        const plan = 'pro';

        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              stripe_price_id: priceId,
              billing_interval: billingInterval,
              status,
              plan,
              trial_start: subscription.trial_start
                ? new Date(subscription.trial_start * 1000).toISOString()
                : null,
              trial_end: subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : null,
              current_period_start: new Date(
                subscription.current_period_start * 1000,
              ).toISOString(),
              current_period_end: new Date(
                subscription.current_period_end * 1000,
              ).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'stripe_customer_id',
            },
          );

        if (subError) {
          console.error('[WEBHOOK] Failed to sync subscription update:', subError);
          throw subError;
        }

        if (['active', 'trialing'].includes(status)) {
          await applyPaidCreditReset(supabaseAdmin, userId, plan, subscription);
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('[WEBHOOK] Failed to mark subscription as canceled:', error);
          throw error;
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          const { error } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription as string);

          if (error) {
            console.error(
              '[WEBHOOK] Failed to update subscription after payment:',
              error,
            );
            throw error;
          }
        }

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          const { error } = await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription as string);

          if (error) {
            console.error('[WEBHOOK] Failed to mark payment as past_due:', error);
            throw error;
          }
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
