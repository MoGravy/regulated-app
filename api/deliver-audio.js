/**
 * Called by Matthew (or an admin script) after uploading a custom audio to Supabase Storage.
 * POST /api/deliver-audio
 * Body: { orderId, audioPath, secret }
 *
 * This sends the delivery email with a signed download URL.
 */
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.VITE_FROM_EMAIL || 'hello@regulatedapp.co'
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-this-secret'
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://regulatedapp.co'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { orderId, audioPath, secret } = req.body

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!orderId || !audioPath) {
    return res.status(400).json({ error: 'orderId and audioPath required' })
  }

  try {
    // Get order details
    const { data: order, error } = await supabase
      .from('custom_orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    // Generate signed URL (7-day expiry initially; user can always request new one)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('audio')
      .createSignedUrl(audioPath, 60 * 60 * 24 * 30) // 30 days

    if (urlError) throw urlError

    // Update order status
    await supabase
      .from('custom_orders')
      .update({
        status: 'delivered',
        audio_url: audioPath,
        delivered_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    // Send delivery email
    await resend.emails.send({
      from: `Matthew at Regulated <${FROM_EMAIL}>`,
      to: order.user_email,
      subject: "Your custom audio is ready 🎧",
      html: deliveryEmail(urlData.signedUrl, order),
    })

    return res.status(200).json({ success: true, email: order.user_email })

  } catch (err) {
    console.error('deliver-audio error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function deliveryEmail(downloadUrl, order) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#0D2330;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:48px;margin-bottom:12px;">🎧</div>
      <h1 style="color:#F0F4F6;font-size:26px;font-weight:800;margin:0 0 8px;">Your audio is ready.</h1>
      <p style="color:#8BA9B5;font-size:16px;margin:0;">Built specifically for your pattern.</p>
    </div>

    <div style="background:#1A3A4A;border:1px solid rgba(126,207,192,0.15);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#7ECFC0;letter-spacing:0.08em;margin-bottom:12px;">YOUR ORDER</div>
      <div style="font-size:14px;color:#8BA9B5;margin-bottom:6px;"><strong style="color:#F0F4F6">Pattern:</strong> ${order.pattern.substring(0, 120)}${order.pattern.length > 120 ? '…' : ''}</div>
      <div style="font-size:14px;color:#8BA9B5;margin-bottom:6px;"><strong style="color:#F0F4F6">Trigger:</strong> ${order.trigger}</div>
      <div style="font-size:14px;color:#8BA9B5;"><strong style="color:#F0F4F6">Desired state:</strong> ${order.desired_state}</div>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${downloadUrl}" style="display:inline-block;padding:16px 32px;background:#7ECFC0;color:#0D2330;font-size:16px;font-weight:700;border-radius:12px;text-decoration:none;">
        Download Your Audio
      </a>
      <p style="color:#4A7080;font-size:12px;margin-top:10px;">Link valid for 30 days. Save it to your device.</p>
    </div>

    <div style="background:#1A3A4A;border:1px solid rgba(126,207,192,0.15);border-radius:16px;padding:20px;margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;color:#F0F4F6;margin-bottom:8px;">How to get the most from this</div>
      <ul style="color:#8BA9B5;font-size:14px;line-height:1.8;padding-left:18px;margin:0;">
        <li>Listen with headphones in a quiet space</li>
        <li>Don't try to analyse — just receive</li>
        <li>Listen daily for 21 days for deepest impact</li>
        <li>Notice what shifts in your body, not just your thoughts</li>
      </ul>
    </div>

    <p style="color:#4A7080;font-size:12px;line-height:1.6;text-align:center;">
      Reply to this email with any questions. I read everything.<br>
      <a href="${APP_URL}/unsubscribe" style="color:#4A7080">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
  `
}
