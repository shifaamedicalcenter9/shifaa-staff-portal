import { createClient } from "npm:@supabase/supabase-js@2";

const projectUrl = Deno.env.get("SHIFAA_PROJECT_URL")!;
const serviceKey = Deno.env.get("SHIFAA_SERVICE_ROLE_KEY")!;
const allowedOrigin = "https://shifaa-staff-portal.shifaamedicalcenter9.workers.dev";

const admin = createClient(projectUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publicAuth = createClient(
  projectUrl,
  "sb_publishable_LBi1wo1cagczjH2bnNxqFQ_RROGpNeR",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? allowedOrigin : allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function writeAudit(action: string, details: Record<string, unknown>, userId: string | null, req: Request) {
  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || "unknown";
  const row: Record<string, unknown> = {
    user_id: userId,
    action,
    details: { ...details, user_agent: ua },
  };
  if (forwarded && /^[0-9a-fA-F:.]+$/.test(forwarded)) row.ip_address = forwarded;
  try { await admin.from("security_audit_logs").insert(row); } catch (_) { /* audit failure must not expose credentials */ }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return response({ error: "طريقة الطلب غير مسموحة" }, 405, origin);

  try {
    if (!projectUrl || !serviceKey) return response({ error: "إعدادات الخادم غير مكتملة" }, 500, origin);
    const body = await req.json();
    const action = String(body.action || "");

    // Username sign-in is performed server-side; the email is never disclosed to the browser.
    if (action === "username_login") {
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      if (!/^[a-z0-9._-]{3,30}$/.test(username) || password.length < 1) {
        await writeAudit("username_login_failed", { username, reason: "invalid_input" }, null, req);
        return response({ error: "بيانات الدخول غير صحيحة" }, 401, origin);
      }

      const ipValue = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      const validIp = ipValue && /^[0-9a-fA-F:.]+$/.test(ipValue) ? ipValue : null;
      const { data: rateAllowed, error: rateError } = await admin.rpc("allow_username_login_attempt", {
        p_username: username,
        p_ip: validIp,
      });
      if (rateError) {
        console.error("Username login rate-limit check failed:", rateError);
        return response({ error: "خدمة تسجيل الدخول غير جاهزة حالياً" }, 503, origin);
      }
      if (rateAllowed !== true) {
        await writeAudit("username_login_blocked", { username, reason: "rate_limit" }, null, req);
        return response({ error: "تجاوزت عدد محاولات الدخول المسموح. حاول بعد 15 دقيقة." }, 429, origin);
      }

      let accountId: string | null = null;
      const { data: profile } = await admin.from("user_profiles").select("id").eq("username", username).maybeSingle();
      if (profile?.id) accountId = profile.id;
      if (!accountId) {
        const { data: pending } = await admin.from("registration_requests").select("auth_user_id").eq("username", username).maybeSingle();
        if (pending?.auth_user_id) accountId = pending.auth_user_id;
      }
      if (!accountId) {
        await writeAudit("username_login_failed", { username, reason: "not_found" }, null, req);
        return response({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401, origin);
      }

      const { data: authUser, error: getUserError } = await admin.auth.admin.getUserById(accountId);
      const email = authUser?.user?.email;
      if (getUserError || !email) {
        await writeAudit("username_login_failed", { username, reason: "account_unavailable" }, accountId, req);
        return response({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401, origin);
      }

      const { data: signIn, error: signInError } = await publicAuth.auth.signInWithPassword({ email, password });
      if (signInError || !signIn.session || !signIn.user) {
        await writeAudit("username_login_failed", { username, reason: "credentials_rejected" }, accountId, req);
        return response({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, 401, origin);
      }
      await writeAudit("username_login_succeeded", { username }, accountId, req);
      return response({ success: true, session: signIn.session, user: signIn.user }, 200, origin);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token || token === authorization) return response({ error: "يجب تسجيل الدخول أولاً" }, 401, origin);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "جلسة الدخول غير صالحة" }, 401, origin);
    const user = authData.user;

    if (action === "submit_registration") {
      if (!user.email_confirmed_at) return response({ error: "يجب تأكيد البريد الإلكتروني أولاً" }, 403, origin);
      const fullName = String(body.full_name || "").trim();
      const username = normalizeUsername(body.username);
      const phone = String(body.phone || "").trim();
      const requestedRole = String(body.requested_role || "");
      const jobTitle = String(body.requested_job_title || "").trim();
      const specialty = String(body.specialty || "").trim();
      if (fullName.length < 3 || phone.length < 7 || jobTitle.length < 2 || !/^[a-z0-9._-]{3,30}$/.test(username)) {
        return response({ error: "يرجى إكمال الاسم واسم المستخدم ورقم الهاتف والمسمى الوظيفي بشكل صحيح" }, 400, origin);
      }
      if (!["doctor", "staff", "reception"].includes(requestedRole)) return response({ error: "نوع الحساب غير صحيح" }, 400, origin);
      if (requestedRole === "doctor" && specialty.length < 2) return response({ error: "اختصاص الطبيب مطلوب" }, 400, origin);

      const { data: existingProfile, error: profileError } = await admin.from("user_profiles").select("id").eq("id", user.id).maybeSingle();
      if (profileError) return response({ error: "تعذر التحقق من حالة الحساب" }, 500, origin);
      if (existingProfile) return response({ error: "هذا الحساب مسجل مسبقاً في النظام" }, 409, origin);

      const { data: existingRequest, error: requestCheckError } = await admin.from("registration_requests").select("id,status").eq("auth_user_id", user.id).maybeSingle();
      if (requestCheckError) return response({ error: "تعذر التحقق من طلب التسجيل" }, 500, origin);
      if (existingRequest) return response({ error: "يوجد طلب تسجيل سابق لهذا الحساب", status: existingRequest.status }, 409, origin);

      const { data: profileName } = await admin.from("user_profiles").select("id").eq("username", username).maybeSingle();
      const { data: requestName } = await admin.from("registration_requests").select("id").eq("username", username).maybeSingle();
      if (profileName || requestName) return response({ error: "اسم المستخدم مستخدم بالفعل، اختر اسماً آخر" }, 409, origin);

      const { data: newRequest, error: insertError } = await admin.from("registration_requests").insert({
        auth_user_id: user.id,
        full_name: fullName,
        username,
        phone,
        requested_role: requestedRole,
        requested_job_title: jobTitle,
        specialty: requestedRole === "doctor" ? specialty : null,
        status: "pending",
      }).select("id,status,created_at").single();
      if (insertError) {
        console.error("Registration insert error:", insertError);
        return response({ error: insertError.code === "23505" ? "اسم المستخدم مستخدم بالفعل" : "تعذر إرسال طلب التسجيل" }, insertError.code === "23505" ? 409 : 500, origin);
      }
      await writeAudit("registration_submitted", { request_id: newRequest.id, username, requested_role: requestedRole }, user.id, req);
      return response({ success: true, message: "تم إرسال طلبك بنجاح، وهو بانتظار موافقة المدير", request: newRequest }, 200, origin);
    }

    if (action === "review_registration") {
      const { data: manager, error: managerError } = await admin.from("user_profiles").select("id,role,is_active,staff_id").eq("id", user.id).maybeSingle();
      if (managerError || !manager || manager.role !== "manager" || manager.is_active !== true || !manager.staff_id) {
        return response({ error: "هذه العملية متاحة لمدير المركز فقط" }, 403, origin);
      }
      const requestId = String(body.request_id || "").trim();
      const decision = String(body.decision || "");
      const rejectionReason = String(body.rejection_reason || "").trim();
      if (!requestId || !["approve", "reject"].includes(decision)) return response({ error: "بيانات مراجعة الطلب غير صحيحة" }, 400, origin);
      if (decision === "reject" && rejectionReason.length < 2) return response({ error: "يرجى كتابة سبب الرفض" }, 400, origin);
      const { data: reviewResult, error: reviewError } = await admin.rpc("review_registration_request", {
        p_request_id: requestId,
        p_action: decision,
        p_manager_id: user.id,
        p_rejection_reason: decision === "reject" ? rejectionReason : null,
      });
      if (reviewError) {
        console.error("Review error:", reviewError);
        return response({ error: "تعذرت مراجعة الطلب", details: reviewError.message }, 400, origin);
      }
      return response({ success: true, result: reviewResult }, 200, origin);
    }

    return response({ error: "العملية المطلوبة غير معروفة" }, 400, origin);
  } catch (error) {
    console.error("Shifaa auth error:", error);
    return response({ error: "حدث خطأ داخلي أثناء تنفيذ الطلب" }, 500, req.headers.get("Origin"));
  }
});
