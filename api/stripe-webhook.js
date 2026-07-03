import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { CUSTOM_AUDIO_PRICE, ANNUAL_FOUNDING_PRICE, ANNUAL_FULL_PRICE } from '../src/config/pricing.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.VITE_FROM_EMAIL || 'hello@regulatedapp.co'

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const { type, order_id, user_email, plan, coupon_code, discount_applied } = session.metadata || {}

        if (type === 'custom_audio') {
          await handleCustomAudioPayment(session, user_email, coupon_code, discount_applied)
        } else if (type === 'subscription') {
          await handleSubscriptionPayment(session, user_email, plan, coupon_code, discount_applied)
        }

        // Increment coupon used_count if a code was applied
        if (coupon_code) {
          await supabase.rpc('increment_coupon_usage', { p_code: coupon_code })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        if (invoice.subscription) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', invoice.subscription)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (invoice.subscription) {
          await supabase
            .from('subscriptions')
            .update({ status: 'active' })
            .eq('stripe_subscription_id', invoice.subscription)
        }
        break
      }
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[webhook] handler error:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
    return res.status(500).json({ error: 'Internal error' })
  }
}

async function handleCustomAudioPayment(session, userEmail, couponCode, discountApplied) {
  const { pattern, trigger, desired_state, affirmations } = session.metadata || {}

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7)

  // Plain INSERT — unique constraint on stripe_session_id prevents duplicates.
  // On re-delivery, PostgreSQL raises 23505 (unique violation) which we treat as
  // idempotent success. Any other error is a real failure and should cause Stripe to retry.
  const { error: insertError } = await supabase
    .from('custom_orders')
    .insert({
      user_email: userEmail,
      pattern:       pattern || '',
      trigger:       trigger || '',
      desired_state: desired_state || '',
      affirmations:  affirmations || '',
      status: 'confirmed',
      stripe_session_id: session.id,
      coupon_code_used: couponCode || null,
      discount_applied: discountApplied ? parseFloat(discountApplied) : 0,
      due_date: dueDate.toISOString(),
      turnaround_days: 7,
      created_at: new Date().toISOString(),
    })

  if (insertError) {
    if (insertError.code === '23505') {
      // Duplicate Stripe event redelivery — row already exists, nothing to do
      console.log('[webhook] custom_orders: duplicate stripe_session_id, skipping insert')
      return
    }
    console.error('[webhook] custom_orders insert failed:', JSON.stringify(insertError))
    throw new Error(`custom_orders insert failed: ${insertError.message}`)
  }

  // Upsert user
  await supabase
    .from('users')
    .upsert({ email: userEmail, updated_at: new Date().toISOString() }, { onConflict: 'email' })

  // Send confirmation email only after the order is recorded
  const dueDateStr = dueDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  await resend.emails.send({
    from: `Matthew at Regulated <${FROM_EMAIL}>`,
    to: userEmail,
    subject: "Your custom audio is in progress 🎧",
    html: customAudioConfirmationEmail(dueDateStr),
  })
}

async function handleSubscriptionPayment(session, userEmail, plan, couponCode, discountApplied) {
  const subscription = await stripe.subscriptions.retrieve(session.subscription)

  // Plain INSERT — UNIQUE constraint on stripe_subscription_id prevents duplicates.
  // 23505 on re-delivery = idempotent; any other error = real failure, Stripe should retry.
  const { error: insertError } = await supabase
    .from('subscriptions')
    .insert({
      user_email: userEmail,
      stripe_subscription_id: subscription.id,
      status: 'active',
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      coupon_code_used: couponCode || null,
      discount_applied: discountApplied ? parseFloat(discountApplied) : 0,
      created_at: new Date().toISOString(),
    })

  if (insertError) {
    if (insertError.code === '23505') {
      console.log('[webhook] subscriptions: duplicate stripe_subscription_id, skipping insert')
      return
    }
    console.error('[webhook] subscriptions insert failed:', JSON.stringify(insertError))
    throw new Error(`subscriptions insert failed: ${insertError.message}`)
  }

  // Upsert user
  await supabase
    .from('users')
    .upsert({ email: userEmail, updated_at: new Date().toISOString() }, { onConflict: 'email' })

  // Send welcome email
  await resend.emails.send({
    from: `Matthew at Regulated <${FROM_EMAIL}>`,
    to: userEmail,
    subject: "Welcome to Regulated Premium ✦",
    html: premiumWelcomeEmail(),
  })
}

// --- Email templates ---

function customAudioConfirmationEmail(dueDate) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#0D2330;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:48px;margin-bottom:12px;">🎯</div>
      <h1 style="color:#F0F4F6;font-size:26px;font-weight:800;margin:0 0 8px;">Order confirmed.</h1>
      <p style="color:#8BA9B5;font-size:16px;margin:0;">Your custom audio is now in production.</p>
    </div>

    <div style="background:#1A3A4A;border:1px solid rgba(126,207,192,0.15);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#7ECFC0;letter-spacing:0.08em;margin-bottom:16px;">WHAT HAPPENS NEXT</div>
      ${[
        ['🎙️', 'Recording begins', 'Matthew reviews your intake and starts building your session'],
        ['✂️', 'Production', 'Your audio is recorded, edited, and mixed to professional quality'],
        ['📬', `Delivery by ${dueDate}`, 'Audio delivered directly to this email address'],
        ['♾️', 'Yours forever', 'Download and replay whenever you need it'],
      ].map(([icon, title, detail]) => `
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
          <span style="font-size:20px;flex-shrink:0">${icon}</span>
          <div>
            <div style="font-size:14px;font-weight:600;color:#F0F4F6;margin-bottom:2px">${title}</div>
            <div style="font-size:13px;color:#8BA9B5">${detail}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <p style="color:#8BA9B5;font-size:14px;line-height:1.7;margin-bottom:20px;">
      In the meantime, jump into the free sessions in the app to start building your regulation baseline. The custom audio will layer on top of the foundation you build now.
    </p>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="https://regulatedapp.co" style="display:inline-block;padding:14px 28px;background:#7ECFC0;color:#0D2330;font-size:15px;font-weight:700;border-radius:12px;text-decoration:none;">
        Open the App
      </a>
    </div>

    <p style="color:#4A7080;font-size:12px;line-height:1.6;text-align:center;">
      Questions? Reply to this email or contact hello@regulatedapp.co<br>
      <a href="https://regulatedapp.co/unsubscribe" style="color:#4A7080">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
  `
}

function premiumWelcomeEmail() {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#0D2330;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:48px;margin-bottom:12px;">✦</div>
      <h1 style="color:#F0F4F6;font-size:26px;font-weight:800;margin:0 0 8px;">Welcome to Regulated Premium.</h1>
      <p style="color:#8BA9B5;font-size:16px;margin:0;">Every session in the library is now unlocked. New sessions added every week.</p>
    </div>

    <div style="background:#1A3A4A;border:1px solid rgba(126,207,192,0.15);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#7ECFC0;letter-spacing:0.08em;margin-bottom:16px;">YOUR ACCESS INCLUDES</div>
      ${[
        ['🎧', '13 sessions and growing', 'Every session in the library is now unlocked. New sessions added regularly.'],
        ['🎯', 'Built for your pattern', 'Sleep, anxiety, gut, habits, confidence — each session targets a specific nervous system pattern.'],
        ['🎙️', 'One free custom audio (annual)', `Order a session built for your exact trigger and outcome. Use code ANNUALFREE at checkout — normally $${CUSTOM_AUDIO_PRICE}, free for you.`],
        ['🔒', 'Founding price locked for life', `Your $${ANNUAL_FOUNDING_PRICE}/year rate never rises, even when the library hits 40 sessions and the price goes to $${ANNUAL_FULL_PRICE}.`],
      ].map(([icon, title, detail]) => `
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
          <span style="font-size:20px;flex-shrink:0">${icon}</span>
          <div>
            <div style="font-size:14px;font-weight:600;color:#F0F4F6;margin-bottom:2px">${title}</div>
            <div style="font-size:13px;color:#8BA9B5">${detail}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="https://regulatedapp.co/sessions" style="display:inline-block;padding:14px 28px;background:#7ECFC0;color:#0D2330;font-size:15px;font-weight:700;border-radius:12px;text-decoration:none;">
        Explore the Library
      </a>
    </div>

    <p style="color:#4A7080;font-size:12px;line-height:1.6;text-align:center;">
      Questions? Reply to this email or contact hello@regulatedapp.co<br>
      <a href="https://regulatedapp.co/unsubscribe" style="color:#4A7080">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
  `
}
