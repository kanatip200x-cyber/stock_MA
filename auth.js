// เชื่อมต่อ Supabase + ตรวจสอบการล็อกอิน (ใช้ทั้ง login.html และ index.html)
// ต้องโหลด @supabase/supabase-js (CDN) และ config.js ก่อนไฟล์นี้
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const client = enabled
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } })
    : null;

  const pageUrl = file => new URL(file, window.location.href).href.split("#")[0].split("?")[0];
  const domainOk = user => !cfg.allowedEmailDomain || (user?.email || "").toLowerCase().endsWith("@" + cfg.allowedEmailDomain.toLowerCase());

  async function getUser() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.user || null;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน config.js");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: pageUrl("index.html"), queryParams: { prompt: "select_account" } },
    });
    if (error) throw error;
  }

  async function signOut() {
    if (client) await client.auth.signOut();
    window.location.replace(pageUrl("login.html"));
  }

  // ใช้ในหน้าเว็บหลัก: ถ้ายังไม่ล็อกอิน ส่งไปหน้า login.html
  async function requireLogin() {
    if (!client) return null; // โหมดออฟไลน์
    const user = await getUser();
    if (!user) { window.location.replace(pageUrl("login.html")); return new Promise(() => {}); }
    if (!domainOk(user)) {
      await client.auth.signOut();
      window.location.replace(pageUrl("login.html") + "?error=domain");
      return new Promise(() => {});
    }
    client.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") window.location.replace(pageUrl("login.html")); });
    let profile = null;
    try {
      const { data } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = data;
      client.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
    } catch (e) { console.warn("[Auth] โหลดโปรไฟล์ไม่สำเร็จ", e); }
    return { user, profile };
  }

  window.Auth = { enabled, client, getUser, signInWithGoogle, signOut, requireLogin, domainOk, pageUrl };
})();
