import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@17?target=denonext';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PLAN_LIMITS } from '../_shared/plans.ts';

const stripeApiKey = Deno.env.get('STRIPE_API_KEY');
if (!stripeApiKey) {
  throw new Error('STRIPE_API_KEY not configured');
}

const stripe = new Stripe(stripeApiKey, {
  apiVersion: '2025-12-15.clover',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  console.log(`[WEBHOOK] Request received: ${req.method} ${req.url}`);
  const signature = req.headers.get('Stripe-Signature');

  // Verify webhook signature
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

  // Create Supabase admin client (bypasses RLS)
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[WEBHOOK] Missing Supabase environment variables');
    return new Response('Internal Server Error', { status: 500 });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        console.log(
          `[WEBHOOK] Checkout completed. Session: ${session.id}, User: ${userId}, Customer: ${customerId}, Sub: ${subscriptionId}`,
        );

        if (!userId) {
          console.error(
            '[WEBHOOK] CRITICAL: No user ID in session metadata. Metadata:',
            JSON.stringify(session.metadata),
          );
          throw new Error('No user ID in session metadata');
        }

        // Update subscription record
        console.log(`[WEBHOOK] Upserting subscription for user ${userId}...`);
        const { data: subData, error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: 'pro',
            status: 'trialing',
            updated_at: new Date().toISOString(),
          })
          .select();

        if (subError) {
          console.error('[WEBHOOK] Subscription upsert failed:', subError);
          throw subError;
        }
        console.log(
          `[WEBHOOK] Subscription upserted successfully:`,
          JSON.stringify(subData),
        );

        // Refill credits immediately on upgrade
        console.log(
          `[WEBHOOK] Updating credits for user ${userId} to ${PLAN_LIMITS['pro'].monthly_credits}...`,
        );
        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({
            credits_balance: PLAN_LIMITS['pro'].monthly_credits,
          })
          .eq('id', userId)
          .select();

        if (profileError) {
          console.error('[WEBHOOK] Profile update failed:', profileError);
          throw profileError;
        }
        console.log(
          `[WEBHOOK] Profile updated successfully:`,
          JSON.stringify(profileData),
        );

        console.log(
          `[WEBHOOK] Successfully processed checkout.session.completed for user ${userId}`,
        );
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        let userId = subscription.metadata?.supabase_user_id;
        const customerId = subscription.customer as string;

        console.log(
          `[WEBHOOK] Subscription ${event.type}. Sub: ${subscription.id}, User: ${userId}, Customer: ${customerId}`,
        );

        if (!userId) {
          console.log(
            '[WEBHOOK] No metadata in subscription, looking up by customer ID...',
          );
          const { data, error } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .single();

          if (error || !data) {
            console.error(
              '[WEBHOOK] Could not find user for customer:',
              customerId,
              error,
            );
            // Note: In some cases, created might come before checkout.completed has upserted the record.
            // We should handle this gracefully or rely on checkout.completed for the initial setup.
            return new Response(
              JSON.stringify({
                received: true,
                note: 'User not found for subscription sync',
              }),
              { status: 200 },
            );
          }
          userId = data.user_id;
          console.log(`[WEBHOOK] Found user ID via customer lookup: ${userId}`);
        }

        // Determine billing interval from the price
        const priceId = subscription.items.data[0].price.id;
        const billingInterval =
          subscription.items.data[0].price.recurring?.interval;
        const status = subscription.status;
        const plan = 'pro';

        console.log(
          `[WEBHOOK] Updating subscription details. Status: ${status}, Plan: ${plan}, Interval: ${billingInterval}`,
        );

        // Update subscription status
        const { error: subUpdateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            billing_interval: billingInterval === 'year' ? 'yearly' : 'monthly',
            status: status,
            plan: plan,
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
          })
          .eq('stripe_customer_id', customerId);

        if (subUpdateError) {
          console.error(
            '[WEBHOOK] Subscription status update failed:',
            subUpdateError,
          );
          throw subUpdateError;
        }

        // Refill credits if status is active or trialing
        if (['active', 'trialing'].includes(status)) {
          console.log(
            `[WEBHOOK] Status is ${status}, refilling credits for user ${userId}...`,
          );
          const { error: profileUpdateError } = await supabaseAdmin
            .from('profiles')
            .update({
              credits_balance: PLAN_LIMITS[plan].monthly_credits,
            })
            .eq('id', userId);

          if (profileUpdateError) {
            console.error(
              '[WEBHOOK] Profile credit refill failed during sub update:',
              profileUpdateError,
            );
          } else {
            console.log('[WEBHOOK] Credits refilled successfully');
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Downgrade to free plan
        await supabaseAdmin
          .from('subscriptions')
          .update({
            plan: 'free',
            status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        // Update subscription status to active after successful payment
        if (invoice.subscription) {
          // Get user ID from subscription
          const { data: subscription } = await supabaseAdmin
            .from('subscriptions')
            .select('user_id, plan')
            .eq('stripe_subscription_id', invoice.subscription as string)
            .single();

          if (subscription) {
            await supabaseAdmin
              .from('subscriptions')
              .update({
                status: 'active',
                updated_at: new Date().toISOString(),
              })
              .eq('stripe_subscription_id', invoice.subscription as string);

            // Refill credits
            const planKey =
              (subscription.plan as keyof typeof PLAN_LIMITS) || 'pro';
            await supabaseAdmin
              .from('profiles')
              .update({
                credits_balance: PLAN_LIMITS[planKey].monthly_credits,
              })
              .eq('id', subscription.user_id);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        // Mark subscription as past_due
        if (invoice.subscription) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription as string);
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
