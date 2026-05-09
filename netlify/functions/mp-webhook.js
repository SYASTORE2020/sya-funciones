// ─────────────────────────────────────────────────────────────────────────────
//  SyA Store — Webhook de MercadoPago
//  MP llama esta URL cuando cambia el estado de un pago
//  Env variables: MP_ACCESS_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFY_URL = 'https://verdant-tapioca-41d95c.netlify.app/.netlify/functions/telegram-notify';

exports.handler = async (event) => {
  // MercadoPago siempre espera HTTP 200 — nunca devolver error
  const ok = { statusCode: 200, body: 'ok' };

  try {
    // MP puede enviar el topic como query param o en el body
    const params = event.queryStringParameters || {};
    const body   = JSON.parse(event.body || '{}');

    const type      = body.type      || params.topic;
    const paymentId = body.data?.id  || params.id;

    // Solo procesar notificaciones de tipo "payment"
    if (type !== 'payment' || !paymentId) return ok;

    // Consultar estado del pago en MP
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return ok;

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!mpRes.ok) return ok;

    const payment = await mpRes.json();
    console.log(`Pago ${paymentId}: status=${payment.status}`);

    // Solo notificar si el pago fue aprobado
    if (payment.status !== 'approved') return ok;

    // Construir datos para el Telegram
    const orderId = payment.external_reference || paymentId;
    const total   = payment.transaction_amount  || 0;
    const payer   = payment.payer || {};

    // Obtener items desde la preferencia si está disponible
    let items = [];
    if (payment.order?.id) {
      try {
        const prefRes = await fetch(`https://api.mercadopago.com/merchant_orders/${payment.order.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          items = (prefData.items || []).map(i => ({
            title: i.title, quantity: i.quantity, unit_price: i.unit_price
          }));
        }
      } catch(e) { /* items quedan vacíos, no es crítico */ }
    }

    // Llamar a telegram-notify
    await fetch(NOTIFY_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        order_id      : orderId,
        items,
        customer      : { name: payer.first_name ? `${payer.first_name} ${payer.last_name || ''}`.trim() : payer.email, email: payer.email, phone: payer.phone?.number || '-' },
        total,
        payment_method: 'mercadopago'
      })
    }).catch(() => {});

  } catch(e) {
    console.error('mp-webhook error:', e.message);
  }

  return ok;
};
