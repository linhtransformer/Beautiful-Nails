import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const day = DAYS_NL[date.getDay()];
  return `${day.charAt(0).toUpperCase() + day.slice(1)} ${d} ${MONTHS_NL[m - 1]} ${y}`;
}

function page(title: string, body: string): Response {
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} – Beautiful Nails</title>
  <link href="https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#f7f2ec;font-family:'Tenor Sans',Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;}
    .card{background:#fff;border-radius:10px;max-width:480px;width:100%;overflow:hidden;box-shadow:0 4px 24px rgba(124,58,58,0.10),0 1px 4px rgba(124,58,58,0.06);}
    .card-header{background:#7c3a3a;padding:28px 36px;text-align:center;}
    .brand{font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(247,242,236,0.6);margin-bottom:6px;}
    .card-header h1{font-family:'Georgia',serif;font-style:italic;font-size:24px;color:#f7f2ec;letter-spacing:-0.02em;}
    .card-body{padding:32px 36px;}
    .icon{font-size:36px;text-align:center;margin-bottom:16px;}
    h2{font-family:'Georgia',serif;font-style:italic;font-size:20px;color:#2c2826;margin-bottom:10px;}
    p{font-size:14px;color:rgba(44,40,38,0.65);line-height:1.7;margin-bottom:14px;}
    .summary{background:#f7f2ec;border-radius:6px;padding:16px 20px;margin:20px 0;font-size:14px;color:#2c2826;line-height:1.8;}
    .summary strong{color:#7c3a3a;}
    .footer{background:#f0e6e6;padding:14px 36px;border-top:1px solid rgba(124,58,58,0.1);text-align:center;font-size:11px;color:rgba(124,58,58,0.6);letter-spacing:0.06em;}
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <p class="brand">Beautiful Nails</p>
      <h1>${title}</h1>
    </div>
    <div class="card-body">${body}</div>
    <div class="footer">Beautiful Nails &nbsp;·&nbsp; nagelstudiobeautifulnails.nl</div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

serve(async (req) => {
  const url = new URL(req.url);
  const id    = url.searchParams.get("id");
  const email = url.searchParams.get("email");

  if (!id || !email) {
    return page("Ongeldige link", `
      <div class="icon">⚠️</div>
      <h2>Ongeldige link</h2>
      <p>Deze annuleringslink is onvolledig. Controleer de link in je e-mail of neem contact met ons op.</p>
    `);
  }

  const decodedEmail = decodeURIComponent(email).toLowerCase().trim();
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, name, email, service_name, appointment_date, appointment_time, status")
    .eq("id", id)
    .single();

  // Always show the same error whether ID not found or email doesn't match (no info leak)
  if (error || !appt || appt.email?.toLowerCase().trim() !== decodedEmail) {
    return page("Afspraak niet gevonden", `
      <div class="icon">🔍</div>
      <h2>Afspraak niet gevonden</h2>
      <p>We konden je afspraak niet vinden met deze link. Controleer of je de juiste e-mail gebruikt of neem contact met ons op.</p>
    `);
  }

  if (appt.status === "cancelled") {
    return page("Al geannuleerd", `
      <div class="icon">✓</div>
      <h2>Deze afspraak is al geannuleerd</h2>
      <div class="summary">
        <strong>${appt.service_name}</strong><br>
        ${formatDate(appt.appointment_date)} om ${appt.appointment_time.slice(0, 5)}
      </div>
      <p>Is er iets misgegaan? Neem gerust contact met ons op via Instagram of telefoon.</p>
    `);
  }

  const { error: updateError } = await sb
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateError) {
    return page("Er is iets misgegaan", `
      <div class="icon">⚠️</div>
      <h2>Er is iets misgegaan</h2>
      <p>We konden je afspraak niet annuleren. Probeer het later opnieuw of neem contact met ons op.</p>
    `);
  }

  const firstName = appt.name.split(" ")[0];
  return page("Afspraak geannuleerd", `
    <div class="icon">✓</div>
    <h2>Je afspraak is geannuleerd</h2>
    <p>Hoi <strong>${firstName}</strong>, je afspraak is succesvol geannuleerd. Je hoeft verder niets te doen.</p>
    <div class="summary">
      <strong>${appt.service_name}</strong><br>
      ${formatDate(appt.appointment_date)} om ${appt.appointment_time.slice(0, 5)}
    </div>
    <p>Wil je toch een nieuwe afspraak maken? Dat kan altijd via onze website of door ons te bellen.</p>
  `);
});
