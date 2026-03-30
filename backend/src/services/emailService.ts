import { Resend } from 'resend';

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    resend = new Resend(key);
  }
  return resend;
}

const FROM = process.env.EMAIL_FROM || 'PricePulse <noreply@yourdomain.com>';

// ─── Booking confirmation ─────────────────────────────────────────────────────

export interface BookingConfirmationData {
  to: string;
  guestName: string;
  venueName: string;
  tableNumber: string;
  section: string;
  partySize: number;
  bookingDate: string;   // e.g. "2026-04-15"
  startTime: string;     // e.g. "19:30"
  notes?: string | null;
}

export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
  const {
    to, guestName, venueName, tableNumber, section,
    partySize, bookingDate, startTime, notes,
  } = data;

  const formattedDate = new Date(`${bookingDate}T${startTime}`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Booking Confirmed</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                ${venueName}
              </p>
              <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">Booking Confirmation</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 24px;font-size:16px;color:#374151;">
                Hi <strong>${guestName}</strong>,<br/>
                Your table is confirmed. We look forward to seeing you!
              </p>

              <!-- Details card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;">Date &amp; Time</td>
                        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${formattedDate} at ${startTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;">Table</td>
                        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">Table ${tableNumber} · ${section}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;">Party size</td>
                        <td style="padding:6px 0;font-size:13px;font-weight:600;color:#111827;">${partySize} ${partySize === 1 ? 'guest' : 'guests'}</td>
                      </tr>
                      ${notes ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#6b7280;vertical-align:top;">Notes</td>
                        <td style="padding:6px 0;font-size:13px;color:#374151;">${notes}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                Need to make changes? Contact us directly and we'll be happy to help.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                This email was sent by ${venueName} via PricePulse
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await getResend().emails.send({
    from:    FROM,
    to,
    subject: `Booking confirmed at ${venueName} — ${formattedDate}`,
    html,
  });
}

// ─── Booking cancellation ─────────────────────────────────────────────────────

export interface BookingCancellationData {
  to: string;
  guestName: string;
  venueName: string;
  bookingDate: string;
  startTime: string;
}

export async function sendBookingCancellation(data: BookingCancellationData): Promise<void> {
  const { to, guestName, venueName, bookingDate, startTime } = data;

  const formattedDate = new Date(`${bookingDate}T${startTime}`)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  await getResend().emails.send({
    from:    FROM,
    to,
    subject: `Booking cancelled at ${venueName}`,
    html: `
<p>Hi ${guestName},</p>
<p>Your booking at <strong>${venueName}</strong> on <strong>${formattedDate} at ${startTime}</strong> has been cancelled.</p>
<p>If this was a mistake, please contact us to rebook.</p>
<p style="color:#6b7280;font-size:12px;">Sent via PricePulse</p>`,
  });
}
