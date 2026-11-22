export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    return new Response(page(url.origin), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function page(origin) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shifaa | بوابة الكادر</title>
<style>
:root{color-scheme:light;--navy:#102b46;--gold:#c6a46d;--bg:#f3f6f9;--card:#fff;--ink:#24384a;--muted:#718092;--line:#e3eaf0}
*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;display:grid;place-items:center;padding:20px}
.wrap{width:min(100%,520px)}.brand{text-align:center;margin-bottom:20px}.brand h1{margin:0;color:var(--navy);font-size:34px;letter-spacing:1px}.brand p{margin:8px 0;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 14px 40px #102b4612}
.tabs{display:flex;gap:8px;margin-bottom:20px}.tabs button{flex:1;background:#eef2f6;color:var(--navy)}button{border:0;border-radius:11px;padding:13px 16px;font:inherit;font-weight:bold;cursor:pointer;background:var(--navy);color:white}.tabs button.active{background:var(--navy);color:#fff}
label{display:block;font-size:14px;font-weight:bold;margin:13px 0 7px}input,select{width:100%;padding:13px;border:1px solid var(--line);border-radius:10px;background:#fff;font:inherit;color:var(--ink)}.primary{width:100%;margin-top:20px}.hidden{display:none!important}.msg{margin-top:14px;padding:12px;border-radius:10px;background:#f0f4f7;color:var(--navy);line-height:1.7;white-space:pre-wrap}.hint{font-size:12px;color:var(--muted);line-height:1.7;margin-top:12px}.gold{color:#9b7843}.topline{height:3px;background:var(--gold);border-radius:4px;margin:-24px -24px 22px}
</style>
</head>
<body>
<div class="wrap">
  <header class="brand"><h1>Shifaa</h1><p>بوابة الأطباء والموظفين</p></header>
  <main class="card">
    <div class="topline"></div>
    <div id="authArea">
      <div class="tabs">
        <button id="loginTab" class="active" type="button">تسجيل الدخول</button>
        <button id="signupTab" type="button">إنشاء حساب</button>
      </div>
      <form id="loginForm">
        <label>البريد الإلكتروني</label><input id="loginEmail" type="email" autocomplete="email" required>
        <label>كلمة المرور</label><input id="loginPassword" type="password" autocomplete="current-password" required>
        <button class="primary" type="submit">دخول</button>
      </form>
      <form id="signupForm" class="hidden">
        <label>الاسم الكامل</label><input id="fullName" autocomplete="name" required>
        <label>رقم الهاتف</label><input id="phone" type="tel" autocomplete="tel" required>
        <label>البريد الإلكتروني</label><input id="email" type="email" autocomplete="email" required>
        <label>كلمة المرور</label><input id="password" type="password" autocomplete="new-password" minlength="8" required>
        <label>نوع الحساب</label><select id="role" required><option value="staff">موظف</option><option value="doctor">طبيب</option></select>
        <label>المهنة / القسم</label><input id="jobTitle" placeholder="مثال: ممرض، استقبال، طبيب عظمية" required>
        <div id="specialtyWrap" class="hidden"><label>اختصاص الطبيب</label><input id="specialty" placeholder="مثال: عظمية، قلبية، أطفال"></div>
        <button class="primary" type="submit">إرسال طلب التسجيل</button>
      </form>
      <p class="hint">إنشاء الحساب لا يمنح صلاحية الدخول مباشرة. يجب تأكيد البريد الإلكتروني ثم انتظار موافقة إدارة المركز.</p>
    </div>
    <div id="dashboard" class="hidden">
      <h2 id="welcome">مرحباً</h2>
      <p id="statusText">جارٍ التحقق من حالة الحساب...</p>
      <button id="logout" class="primary" type="button">تسجيل الخروج</button>
    </div>
    <div id="message" class="msg hidden" role="status"></div>
  </main>
</div>
<script type="module">
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jzzzustilfqkcsotzgdz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LBi1wo1cagczjH2bnNxqFQ_RROGpNeR';
const API_URL = SUPABASE_URL + '/functions/v1/shifaa-auth';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = id => document.getElementById(id);
function message(text) { $('message').textContent = text; $('message').classList.remove('hidden'); }
function clearMessage() { $('message').textContent = ''; $('message').classList.add('hidden'); }
function busy(button, yes, text) { button.disabled = yes; if (yes) { button.dataset.old = button.textContent; button.textContent = text || 'يرجى الانتظار...'; } else if (button.dataset.old) button.textContent = button.dataset.old; }
function showLogin() { $('loginTab').classList.add('active'); $('signupTab').classList.remove('active'); $('loginForm').classList.remove('hidden'); $('signupForm').classList.add('hidden'); clearMessage(); }
function showSignup() { $('signupTab').classList.add('active'); $('loginTab').classList.remove('active'); $('signupForm').classList.remove('hidden'); $('loginForm').classList.add('hidden'); clearMessage(); }

$('loginTab').onclick = showLogin;
$('signupTab').onclick = showSignup;
$('role').onchange = () => $('specialtyWrap').classList.toggle('hidden', $('role').value !== 'doctor');

async function callAuth(action, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {})
    },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || 'تعذر إكمال الطلب');
  return result;
}

async function submitRegistrationIfNeeded(user) {
  const meta = user?.user_metadata || {};
  if (!meta.full_name || !meta.requested_role) return;
  try {
    await callAuth('submit_registration', {
      full_name: meta.full_name,
      phone: meta.phone,
      requested_role: meta.requested_role,
      requested_job_title: meta.requested_job_title,
      specialty: meta.specialty || null
    });
  } catch (e) {
    if (!String(e.message).toLowerCase().includes('already') &&
        !String(e.message).includes('409') &&
        !String(e.message).includes('موجود')) throw e;
  }
}

async function refreshAccount(user) {
  $('authArea').classList.add('hidden');
  $('dashboard').classList.remove('hidden');
  $('welcome').textContent = 'مرحباً ' + (user.user_metadata?.full_name || user.email || '');
  try {
    const { data: profile, error } = await supabase.from('user_profiles')
      .select('role,is_active,force_password_change')
      .eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile) {
      $('statusText').textContent = 'تم تأكيد بريدك الإلكتروني. طلبك بانتظار مراجعة وموافقة إدارة المركز.';
    } else if (!profile.is_active) {
      $('statusText').textContent = 'حسابك موقوف حالياً. يرجى مراجعة إدارة المركز.';
    } else {
      $('statusText').textContent = 'تم تسجيل الدخول بنجاح. سيتم تفعيل واجهة العمل الداخلية بعد استكمال إعدادات النظام.';
    }
  } catch (e) {
    $('statusText').textContent = 'تعذر قراءة حالة الحساب: ' + e.message;
  }
}

$('signupForm').onsubmit = async e => {
  e.preventDefault(); clearMessage();
  const button = $('signupForm').querySelector('button[type="submit"]'); busy(button, true);
  try {
    const role = $('role').value;
    const full_name = $('fullName').value.trim();
    const phone = $('phone').value.trim();
    const email = $('email').value.trim();
    const password = $('password').value;
    const requested_job_title = $('jobTitle').value.trim();
    const specialty = $('specialty').value.trim();
    if (role === 'doctor' && !specialty) throw new Error('يرجى إدخال اختصاص الطبيب.');
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: location.origin,
        data: { full_name, phone, requested_role: role, requested_job_title, specialty: role === 'doctor' ? specialty : null }
      }
    });
    if (error) throw error;
    if (data.session && data.user) {
      await submitRegistrationIfNeeded(data.user);
      await refreshAccount(data.user);
      message('تم إنشاء الحساب وإرسال طلبك للمراجعة.');
    } else {
      message('تم إنشاء الحساب. افتح رسالة التأكيد التي وصلتك إلى بريدك الإلكتروني، واضغط رابط التأكيد. بعد ذلك ارجع إلى هذه الصفحة وسجّل الدخول بالبريد وكلمة المرور لإرسال طلبك إلى الإدارة.');
      showLogin();
    }
  } catch (err) { message(err.message || 'حدث خطأ أثناء التسجيل.'); }
  finally { busy(button, false); }
};

$('loginForm').onsubmit = async e => {
  e.preventDefault(); clearMessage();
  const button = $('loginForm').querySelector('button[type="submit"]'); busy(button, true);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: $('loginEmail').value.trim(),
      password: $('loginPassword').value
    });
    if (error) throw error;
    await submitRegistrationIfNeeded(data.user);
    await refreshAccount(data.user);
  } catch (err) { message(err.message || 'تعذر تسجيل الدخول.'); }
  finally { busy(button, false); }
};

$('logout').onclick = async () => {
  await supabase.auth.signOut();
  $('dashboard').classList.add('hidden');
  $('authArea').classList.remove('hidden');
  showLogin();
};

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) refreshAccount(session.user);
});
const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await refreshAccount(session.user);
</script>
</body>
</html>`;
}
