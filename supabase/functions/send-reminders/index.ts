// Sends a reminder email (24h ahead) for every non-cancelled appointment
// scheduled for tomorrow. Triggered once per day by a GitHub Actions cron.
// If the appointments table has a reminder_sent_at column it is used to
// guarantee at-most-once delivery; without it the daily schedule is the guard.
// The email template mirrors send-booking-confirmation exactly.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { amsterdamNow } from "../_shared/booking.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MONTHS_NL = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december"
];
const DAYS_NL = [
  "zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"
];

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayName = DAYS_NL[date.getDay()];
  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${d} ${MONTHS_NL[m - 1]} ${y}`;
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

interface Appt {
  id: string;
  name: string;
  email: string;
  service_name: string;
  service_price: string;
  service_duration: number;
  appointment_date: string;
  appointment_time: string;
  notes?: string;
}

// Same layout as the confirmation email (send-booking-confirmation),
// with reminder copy in the header and intro.
function buildReminderHtml(data: Appt): string {
  const cancelUrl = `https://nagelstudiobeautifulnails.nl/cancel.html?id=${data.id}&email=${encodeURIComponent(data.email)}`;
  const firstName = data.name.split(" ")[0];
  const formattedDate = formatDate(data.appointment_date);
  const formattedTime = formatTime(data.appointment_time);
  const notesRow = data.notes
    ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#9e7070;font-size:14px;font-family:'Georgia',serif;width:120px;vertical-align:top;">Notities</td>
        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#2c2826;font-size:14px;font-family:Arial,sans-serif;font-weight:500;">${data.notes}</td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Herinnering afspraak – Beautiful Nails</title>
</head>
<body style="margin:0;padding:0;background:#f7f2ec;font-family:Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Grain texture overlay via table background -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f2ec;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(124,58,58,0.10),0 1px 4px rgba(124,58,58,0.06);">

          <!-- Header strip -->
          <tr>
            <td style="background:#7c3a3a;padding:32px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(247,242,236,0.6);font-family:Arial,sans-serif;">Beautiful Nails</p>
              <h1 style="margin:0;font-family:'Georgia',serif;font-style:italic;font-size:28px;color:#f7f2ec;letter-spacing:-0.02em;line-height:1.2;">Herinnering afspraak</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 0;">

              <p style="margin:0 0 8px;font-size:15px;color:#2c2826;font-family:Arial,sans-serif;line-height:1.6;">
                Hoi <strong>${firstName}</strong>,
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:rgba(44,40,38,0.7);font-family:Arial,sans-serif;line-height:1.7;">
                Een korte herinnering: morgen sta je bij ons ingepland. Hieronder vind je een overzicht van je afspraak.
              </p>

              <!-- Summary box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f2ec;border-radius:6px;padding:0;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 16px;font-family:'Georgia',serif;font-style:italic;font-size:15px;color:#7c3a3a;">Overzicht afspraak</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#9e7070;font-size:14px;font-family:'Georgia',serif;width:120px;">Behandeling</td>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#2c2826;font-size:14px;font-family:Arial,sans-serif;font-weight:500;">${data.service_name}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#9e7070;font-size:14px;font-family:'Georgia',serif;">Datum</td>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#2c2826;font-size:14px;font-family:Arial,sans-serif;font-weight:500;">${formattedDate}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#9e7070;font-size:14px;font-family:'Georgia',serif;">Tijd</td>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#2c2826;font-size:14px;font-family:Arial,sans-serif;font-weight:500;">${formattedTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#9e7070;font-size:14px;font-family:'Georgia',serif;">Duur</td>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(124,58,58,0.08);color:#2c2826;font-size:14px;font-family:Arial,sans-serif;font-weight:500;">${data.service_duration} minuten</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:${data.notes ? '1px solid rgba(124,58,58,0.08)' : 'none'};color:#9e7070;font-size:14px;font-family:'Georgia',serif;">Prijs</td>
                        <td style="padding:10px 0;border-bottom:${data.notes ? '1px solid rgba(124,58,58,0.08)' : 'none'};color:#7c3a3a;font-size:14px;font-family:Arial,sans-serif;font-weight:600;">${data.service_price}</td>
                      </tr>
                      ${notesRow}
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Cancel section -->
          <tr>
            <td style="padding:0 40px 28px;">
              <p style="margin:0 0 12px;font-size:13px;color:rgba(44,40,38,0.55);font-family:Arial,sans-serif;line-height:1.7;">
                Kun je toch niet komen? Annuleer je afspraak via de knop hieronder, dan kunnen we de tijd opnieuw invullen. De link werkt alleen voor dit e-mailadres.
              </p>
              <a href="${cancelUrl}" style="display:inline-block;padding:11px 22px;background:#7c3a3a;color:#f7f2ec;font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.08em;text-decoration:none;border-radius:4px;">
                Afspraak annuleren
              </a>
            </td>
          </tr>

          <!-- Questions -->
          <tr>
            <td style="padding:0 40px 36px;text-align:left;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(44,40,38,0.4);font-family:Arial,sans-serif;">Vragen?</p>
              <p style="margin:0;font-size:14px;color:rgba(44,40,38,0.6);font-family:Arial,sans-serif;line-height:1.6;">
                Stuur een bericht via Instagram of bel ons. We helpen je graag.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f0e6e6;padding:20px 40px;border-top:1px solid rgba(124,58,58,0.1);">
              <p style="margin:0;font-size:11px;color:rgba(124,58,58,0.6);font-family:Arial,sans-serif;text-align:center;letter-spacing:0.06em;">
                Beautiful Nails &nbsp;·&nbsp; Dit is een automatische herinnering
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Tomorrow in Amsterdam
  const now = amsterdamNow();
  const [y, m, d] = now.dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrow = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;

  const COLUMNS = "id, name, email, service_name, service_price, service_duration, appointment_date, appointment_time, notes";

  // Prefer reminder_sent_at bookkeeping when the column exists
  let appointments: Appt[] | null = null;
  let hasReminderColumn = true;
  {
    const { data, error } = await sb
      .from("appointments")
      .select(COLUMNS)
      .eq("appointment_date", tomorrow)
      .neq("status", "cancelled")
      .is("reminder_sent_at", null);
    if (error) {
      hasReminderColumn = false;
      const fallback = await sb
        .from("appointments")
        .select(COLUMNS)
        .eq("appointment_date", tomorrow)
        .neq("status", "cancelled");
      if (fallback.error) {
        return new Response(JSON.stringify({ error: fallback.error.message }), { status: 500 });
      }
      appointments = fallback.data as Appt[];
    } else {
      appointments = data as Appt[];
    }
  }

  let sent = 0;
  const failures: string[] = [];
  for (const a of appointments || []) {
    if (!a.email) continue;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Beautiful Nails <afspraken@nagelstudiobeautifulnails.nl>",
        to: [a.email],
        subject: "Herinnering: je afspraak morgen bij Beautiful Nails",
        html: buildReminderHtml(a),
      }),
    });
    if (res.ok) {
      sent++;
      if (hasReminderColumn) {
        await sb.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", a.id);
      }
    } else {
      failures.push(a.id);
      console.error("Resend error for", a.id, await res.text());
    }
  }

  return new Response(
    JSON.stringify({ date: tomorrow, sent, failed: failures.length, tracked: hasReminderColumn }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
