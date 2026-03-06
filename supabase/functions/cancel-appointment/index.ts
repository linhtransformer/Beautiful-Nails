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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const id    = url.searchParams.get("id");
  const email = url.searchParams.get("email");

  if (!id || !email) {
    return json({ error: "missing_params" }, 400);
  }

  const decodedEmail = decodeURIComponent(email).toLowerCase().trim();
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, name, email, service_name, appointment_date, appointment_time, status")
    .eq("id", id)
    .single();

  if (error || !appt || appt.email?.toLowerCase().trim() !== decodedEmail) {
    return json({ error: "not_found" }, 404);
  }

  const summary = {
    service_name: appt.service_name,
    date_formatted: formatDate(appt.appointment_date),
    time_formatted: appt.appointment_time.slice(0, 5),
  };

  if (appt.status === "cancelled") {
    return json({ status: "already_cancelled", ...summary });
  }

  const { error: updateError } = await sb
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateError) {
    return json({ error: "update_failed" }, 500);
  }

  return json({ status: "cancelled", ...summary });
});
