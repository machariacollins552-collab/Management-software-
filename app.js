'use strict';
(function () {
  // ---------- Config (the anon key is public by design; Row Level Security protects the data) ----------
  var SUPABASE_URL = 'https://iiorulhxzfjvdfopystd.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb3J1bGh4emZqdmRmb3B5c3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MzUwMTYsImV4cCI6MjExMTExMTAxNn0.XBYCDtUEcJdjqc5lzcNfaO0PyzSO5HCjoZ7DfN730lI';

  // Refuse to run inside someone else's page (clickjacking protection).
  if (window.top !== window.self) { document.documentElement.innerHTML = ''; return; }

  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');

  if (!window.supabase || !window.supabase.createClient) {
    app.innerHTML = '<div class="center"><div class="glass authcard stack"><h2>Can’t connect</h2>' +
      '<p class="muted">The app could not load. Check your internet connection and try again.</p>' +
      '<button class="btn block" data-action="reload">Reload</button></div></div>';
    app.addEventListener('click', function (e) { if (e.target.closest('[data-action="reload"]')) location.reload(); });
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  // ---------- Small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kes(n) {
    var v = Number(n) || 0;
    return 'KES ' + v.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fdate(d) { return d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function fdatetime(d) {
    return d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  }
  function fperiod(d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-KE', { month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function money2(x) { return Math.round(Number(x) * 100) / 100; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

  var toastTimer;
  function toast(msg, bad) {
    toastEl.textContent = msg;
    toastEl.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ''; }, 3800);
  }

  function friendly(err) {
    var m = String((err && err.message) || err || '').toLowerCase();
    if (m.indexOf('invalid login') > -1) return 'Email or password is incorrect.';
    if (m.indexOf('not confirmed') > -1) return 'Please confirm your email first, then sign in.';
    if (m.indexOf('already registered') > -1) return 'That email already has an account. Try signing in.';
    if (m.indexOf('rate limit') > -1 || m.indexOf('too many') > -1 || m.indexOf('security purposes') > -1) return 'Too many attempts. Wait a minute and try again.';
    if (m.indexOf('database error') > -1) return 'Please check your name and room number, then try again.';
    if (m.indexOf('password') > -1 && m.indexOf('least') > -1) return 'Choose a password with at least 8 characters.';
    if (m.indexOf('failed to fetch') > -1 || m.indexOf('network') > -1) return 'No connection. Check your internet and try again.';
    return 'Something went wrong. Please try again.';
  }

  // ---------- Icons ----------
  function svg(inner) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'; }
  var ICON = {
    home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    pay: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>'),
    book: svg('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4z"/><path d="M8 20a3 3 0 01-3-3"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
    users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3 3 0 010 5.6M18 14.8c1.8.6 3 2.2 3 5.2"/>'),
    bill: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>'),
    pulse: svg('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="#1a110a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>'
  };

  // ---------- State ----------
  var S = {
    session: null, profile: null, view: 'home',
    settings: { theme: lsGet('pm_theme') === 'light' ? 'light' : 'dark', font: ['serif', 'sans', 'mono'].indexOf(lsGet('pm_font')) > -1 ? lsGet('pm_font') : 'serif' },
    t: { balance: 0, charges: [], payments: [] },
    a: { profiles: [], balances: {}, payments: [], log: [] },
    detail: null, polling: false, installPrompt: null, taps: 0, tapTimer: null
  };

  function applyLook() {
    document.documentElement.setAttribute('data-theme', S.settings.theme);
    document.documentElement.setAttribute('data-font', S.settings.font);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', S.settings.theme === 'light' ? '#f6efe6' : '#14100d');
  }

  // ---------- Layout ----------
  function shell(opts) {
    var badge = S.profile.role === 'admin' ? 'Owner' : 'Room ' + esc(S.profile.room_number);
    var nav = '<nav class="tabbar" aria-label="Main">' + opts.tabs.map(function (t) {
      return '<button type="button" data-action="nav" data-id="' + t.id + '"' + (S.view === t.id ? ' aria-current="page"' : '') + '>' + ICON[t.icon] + '<span>' + t.label + '</span></button>';
    }).join('') + '</nav>';
    return '<div class="shell' + (opts.wide ? ' wide' : '') + '">' +
      '<header class="topbar"><div class="brand"><span class="mark">' + ICON.logo + '</span><b>Property Manager</b></div>' +
      '<div class="row"><span class="badge">' + badge + '</span><button type="button" class="linkbtn" data-action="refresh">Refresh</button></div></header>' +
      nav + '<main>' + opts.body + '</main></div>';
  }

  function busy(f, fn) {
    var b = f.querySelector('button[type="submit"]');
    if (b) b.disabled = true;
    return Promise.resolve().then(fn).catch(function (e) {
      console.error(e);
      setErr(f, 'Something went wrong. Check your connection and try again.');
    }).then(function () { if (b && b.isConnected) b.disabled = false; });
  }
  function setErr(f, msg) { var e = f.querySelector('.err'); if (e) e.textContent = msg || ''; }

  // ---------- Auth screens ----------
  function pwField(name, label, autocomplete) {
    return '<label class="field"><span>' + label + '</span><div class="pw"><input name="' + name + '" type="password" autocomplete="' + autocomplete + '" minlength="8" required>' +
      '<button type="button" data-action="togglepw" aria-label="Show password">Show</button></div></label>';
  }

  function renderAuth(mode) {
    S.polling = false;
    var body;
    if (mode === 'signup') {
      body = '<h1>Create your account</h1><p class="muted">Your landlord will approve your room before you can see your balance.</p>' +
        '<form data-form="signup" class="stack" novalidate>' +
        '<label class="field"><span>Full name</span><input name="name" autocomplete="name" maxlength="100" required></label>' +
        '<label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>' +
        '<label class="field"><span>Room number</span><input name="room" maxlength="20" required></label>' +
        pwField('password', 'Password (8+ characters)', 'new-password') +
        '<label class="check"><input type="checkbox" name="consent"><span>I agree that my name, room number and payment records are stored and shown to my landlord to manage my tenancy.</span></label>' +
        '<div class="err" role="alert"></div>' +
        '<button class="btn block" type="submit">Create account</button></form>' +
        '<p class="small muted">Already registered? <button class="linkbtn" data-action="authmode" data-mode="login">Sign in</button></p>';
    } else if (mode === 'checkemail') {
      body = '<h1>Check your email</h1><p class="muted">We sent a confirmation link. Open it, then come back and sign in.</p>' +
        '<button class="btn block" data-action="authmode" data-mode="login">Go to sign in</button>';
    } else {
      var owner = mode === 'owner';
      body = '<h1>' + (owner ? 'Owner access' : 'Welcome back') + '</h1><p class="muted">' + (owner ? 'Sign in, then enter your authenticator code.' : 'Sign in to see your balance and pay rent.') + '</p>' +
        '<form data-form="login" class="stack" novalidate>' +
        '<label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>' +
        pwField('password', 'Password', 'current-password') +
        '<div class="err" role="alert"></div>' +
        '<button class="btn block" type="submit">Sign in</button></form>' +
        (owner ? '<p class="small"><button class="linkbtn" data-action="authmode" data-mode="login">Back to tenant sign in</button></p>'
          : '<p class="small muted">New tenant? <button class="linkbtn" data-action="authmode" data-mode="signup">Create an account</button></p>');
    }
    app.innerHTML = '<div class="center"><div class="glass authcard stack"><div class="brand"><button type="button" class="mark" data-action="logotap" aria-label="Property Manager">' + ICON.logo + '</button><b>Property Manager</b></div>' + body + '</div></div>';
  }

  function renderPending() {
    app.innerHTML = '<div class="center"><div class="glass authcard stack"><h1>Waiting for approval</h1>' +
      '<p class="muted">Hi ' + esc(S.profile.full_name) + '. Your landlord needs to confirm room <b>' + esc(S.profile.room_number) + '</b> before your account opens.</p>' +
      '<button class="btn block" data-action="recheck">Check again</button>' +
      '<button class="btn ghost block" data-action="signout">Sign out</button></div></div>';
  }

  // ---------- Entering the app ----------
  async function enter(session) {
    S.session = session;
    var pr = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (pr.error || !pr.data) {
      toast('Could not load your account. Please sign in again.', true);
      await sb.auth.signOut();
      renderAuth('login');
      return;
    }
    S.profile = pr.data;
    var st = await sb.from('user_settings').select('theme,font').eq('user_id', S.profile.id).maybeSingle();
    if (st.data) {
      S.settings = { theme: st.data.theme === 'light' ? 'light' : 'dark', font: ['serif', 'sans', 'mono'].indexOf(st.data.font) > -1 ? st.data.font : 'serif' };
      lsSet('pm_theme', S.settings.theme); lsSet('pm_font', S.settings.font);
      applyLook();
    }
    if (!S.profile.approved) { renderPending(); return; }
    if (S.profile.role === 'admin') { await adminGate(); return; }
    S.view = 'home';
    await loadTenant();
    render();
  }

  async function adminGate() {
    var aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error) { toast('Could not check two-factor status.', true); return; }
    if (aal.data.currentLevel === 'aal2') { S.view = 'overview'; await loadAdmin(); render(); return; }
    if (aal.data.nextLevel === 'aal2') {
      var fl = await sb.auth.mfa.listFactors();
      var totp = fl.data && fl.data.totp && fl.data.totp[0];
      if (totp) { renderMfa(totp.id, false); return; }
    }
    await startEnroll();
  }

  function renderMfa(factorId, enrolling, secret) {
    var intro = enrolling
      ? '<h1>Secure your owner account</h1><p class="muted">Scan this code with an authenticator app (Google Authenticator, Authy, Microsoft Authenticator), then enter the 6-digit code.</p><img id="qr" class="qr" alt="Authenticator QR code"><p class="secret">' + esc(secret || '') + '</p><button type="button" class="btn ghost small" data-action="copykey" data-key="' + esc(secret || '') + '">Copy key</button>'
      : '<h1>Two-factor code</h1><p class="muted">Enter the 6-digit code from your authenticator app.</p>';
    app.innerHTML = '<div class="center"><div class="glass authcard stack">' + intro +
      '<form data-form="mfa" data-factor="' + esc(factorId) + '" class="stack" novalidate>' +
      '<label class="field"><span>6-digit code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>' +
      '<div class="err" role="alert"></div><button class="btn block" type="submit">Verify</button></form>' +
      '<button class="btn ghost block" data-action="signout">Sign out</button></div></div>';
  }

  async function startEnroll() {
    var fl = await sb.auth.mfa.listFactors();
    var all = (fl.data && fl.data.all) || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].status === 'unverified') await sb.auth.mfa.unenroll({ factorId: all[i].id });
    }
    var en = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Owner ' + Date.now() });
    if (en.error) { toast('Could not start two-factor setup.', true); return; }
    renderMfa(en.data.id, true, en.data.totp.secret);
    var img = document.getElementById('qr');
    if (img) img.src = en.data.totp.qr_code;
  }

  // ---------- Data loading ----------
  async function loadTenant() {
    var uid = S.profile.id;
    var r = await Promise.all([
      sb.from('tenant_balances').select('balance_due').eq('tenant_id', uid).maybeSingle(),
      sb.from('charges').select('*').eq('tenant_id', uid).order('period', { ascending: false }),
      sb.from('payments').select('*').eq('tenant_id', uid).order('created_at', { ascending: false })
    ]);
    if (r[0].error || r[1].error || r[2].error) { toast('Could not load your records. Pull Refresh to retry.', true); return; }
    S.t = { balance: Number((r[0].data && r[0].data.balance_due) || 0), charges: r[1].data || [], payments: r[2].data || [] };
  }

  async function loadAdmin() {
    var r = await Promise.all([
      sb.from('profiles').select('*').order('room_number'),
      sb.from('tenant_balances').select('*'),
      sb.from('payments').select('*').order('created_at', { ascending: false }).limit(1000),
      sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(150)
    ]);
    if (r.some(function (x) { return x.error; })) { toast('Could not load some owner data. Check you completed two-factor.', true); }
    var bal = {};
    (r[1].data || []).forEach(function (b) { bal[b.tenant_id] = Number(b.balance_due); });
    S.a = { profiles: r[0].data || [], balances: bal, payments: r[2].data || [], log: r[3].data || [] };
  }

  async function loadDetail(id) {
    var r = await Promise.all([
      sb.from('charges').select('*').eq('tenant_id', id).order('period', { ascending: false }),
      sb.from('payments').select('*').eq('tenant_id', id).order('created_at', { ascending: false })
    ]);
    S.detail = { id: id, charges: r[0].data || [], payments: r[1].data || [] };
  }

  // ---------- Ledger maths ----------
  function methodLabel(m) { return { mpesa: 'M-Pesa', card: 'Card', bank: 'Bank', paypal: 'PayPal', cash: 'Cash' }[m] || cap(m); }

  function ledger(charges, payments) {
    var rows = [];
    charges.forEach(function (c) {
      rows.push({ t: new Date(c.period + 'T00:00:00Z').getTime(), date: fperiod(c.period), label: cap(c.kind) + (c.note ? ' – ' + c.note : ''), debit: Number(c.amount), credit: 0 });
    });
    payments.filter(function (p) { return p.status === 'confirmed'; }).forEach(function (p) {
      var when = p.confirmed_at || p.created_at;
      rows.push({ t: new Date(when).getTime(), date: fdate(when), label: 'Payment · ' + methodLabel(p.method) + (p.reference ? ' (' + p.reference + ')' : ''), debit: 0, credit: Number(p.amount) });
    });
    rows.sort(function (a, b) { return a.t - b.t; });
    var bal = 0;
    rows.forEach(function (r) { bal = money2(bal + r.debit - r.credit); r.bal = bal; });
    return rows;
  }

  function nextMonth(ms) { var d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }

  function monthlySeries(rows) {
    if (!rows.length) return [];
    var first = new Date(rows[0].t), now = new Date();
    var start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
    var end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    var months = [];
    for (var m = start; m <= end; m = nextMonth(m)) months.push(m);
    return months.slice(-12).map(function (m) {
      var lim = nextMonth(m), b = 0;
      for (var i = 0; i < rows.length; i++) { if (rows[i].t < lim) b = rows[i].bal; else break; }
      return { m: m, b: b };
    });
  }

  function chartSvg(series) {
    if (series.length < 2) return '<p class="muted small">Your graph appears once you have two months of records.</p>';
    var W = 320, H = 150, L = 8, R = 8, T = 14, B = 26;
    var vals = series.map(function (s) { return s.b; });
    var max = Math.max.apply(null, vals.concat([1])), min = Math.min.apply(null, vals.concat([0]));
    var span = (max - min) || 1;
    function x(i) { return L + (W - L - R) * i / (series.length - 1); }
    function y(v) { return T + (H - T - B) * (1 - (v - min) / span); }
    var pts = series.map(function (s, i) { return x(i).toFixed(1) + ',' + y(s.b).toFixed(1); }).join(' ');
    var grid = [0, 1, 2, 3].map(function (k) { var gy = (T + (H - T - B) * k / 3).toFixed(1); return '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/>'; }).join('');
    var dots = series.map(function (s, i) { return '<circle class="dot" cx="' + x(i).toFixed(1) + '" cy="' + y(s.b).toFixed(1) + '" r="3"/>'; }).join('');
    var lab = function (ms) { return new Date(ms).toLocaleDateString('en-KE', { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
    var last = series[series.length - 1];
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Balance owed by month, from ' + lab(series[0].m) + ' to ' + lab(last.m) + '. Latest: ' + esc(kes(last.b)) + '.">' +
      grid + '<polyline class="line" points="' + pts + '"/>' + dots +
      '<text x="' + L + '" y="' + (H - 8) + '">' + lab(series[0].m) + '</text>' +
      '<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + lab(last.m) + '</text>' +
      '<text x="' + (W - R) + '" y="' + (T - 4) + '" text-anchor="end">' + esc(kes(max)) + '</text></svg>';
  }

  function ledgerTable(rows) {
    if (!rows.length) return '<p class="muted">No records yet.</p>';
    return '<div class="tablewrap"><table><thead><tr><th>Date</th><th>Details</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>' +
      rows.slice().reverse().map(function (r) {
        return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.label) + '</td><td class="num">' + (r.debit ? esc(kes(r.debit)) : '') + '</td><td class="num pos">' + (r.credit ? esc(kes(r.credit)) : '') + '</td><td class="num">' + esc(kes(r.bal)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function statusBadge(s) {
    return '<span class="badge ' + (s === 'confirmed' ? 'ok' : s === 'failed' ? 'bad' : 'warn') + '">' + esc(s) + '</span>';
  }

  function paymentList(payments) {
    if (!payments.length) return '<p class="muted">No payments yet.</p>';
    return '<ul class="list">' + payments.map(function (p) {
      return '<li><div><div class="t">' + esc(kes(p.amount)) + '</div><div class="s">' + esc(methodLabel(p.method)) + ' · ' + esc(fdatetime(p.created_at)) + (p.reference ? ' · ' + esc(p.reference) : '') + '</div></div><div class="r">' + statusBadge(p.status) + '</div></li>';
    }).join('') + '</ul>';
  }

  // ---------- Tenant views ----------
  var TENANT_TABS = [{ id: 'home', label: 'Home', icon: 'home' }, { id: 'pay', label: 'Pay', icon: 'pay' }, { id: 'ledger', label: 'Accounts', icon: 'book' }, { id: 'settings', label: 'Settings', icon: 'gear' }];
  var ADMIN_TABS = [{ id: 'overview', label: 'Overview', icon: 'users' }, { id: 'bill', label: 'Billing', icon: 'bill' }, { id: 'activity', label: 'Activity', icon: 'pulse' }, { id: 'settings', label: 'Settings', icon: 'gear' }];

  function heroBalance(bal) {
    if (bal > 0) return '<div class="label">Balance due</div><div class="amount due">' + esc(kes(bal)) + '</div>';
    if (bal < 0) return '<div class="label">Credit on account</div><div class="amount clear">' + esc(kes(-bal)) + '</div>';
    return '<div class="label">Balance</div><div class="amount clear">All paid up</div>';
  }

  function tenantHome() {
    var d = S.t, rows = ledger(d.charges, d.payments);
    var water = d.charges.filter(function (c) { return c.kind === 'water'; }).slice(0, 4);
    return '<div class="stack">' +
      '<section class="glass hero">' + heroBalance(d.balance) +
      (d.balance > 0 ? '<div class="row"><span></span><button class="btn small" data-action="nav" data-id="pay">Pay now</button></div>' : '') + '</section>' +
      '<section class="glass"><div class="row"><h3>Rent owed over time</h3></div>' + chartSvg(monthlySeries(rows)) + '</section>' +
      '<section class="glass"><h3>Water bills</h3>' + (water.length ? '<ul class="list">' + water.map(function (c) {
        return '<li><div><div class="t">' + esc(fperiod(c.period)) + '</div><div class="s">' + esc(c.note || 'Water') + '</div></div><div class="r">' + esc(kes(c.amount)) + '</div></li>';
      }).join('') + '</ul>' : '<p class="muted">No water bills yet.</p>') + '</section>' +
      '<section class="glass"><h3>Recent payments</h3>' + paymentList(d.payments.slice(0, 3)) + '</section></div>';
  }

  function tenantPay() {
    var due = Math.floor(S.t.balance);
    return '<div class="stack"><section class="glass hero">' + heroBalance(S.t.balance) + '</section>' +
      '<section class="glass stack"><h2>Pay with M-Pesa</h2>' +
      '<form data-form="pay" class="stack" novalidate>' +
      '<label class="field"><span>M-Pesa phone number</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XX XXX XXX" required></label>' +
      '<label class="field"><span>Amount (KES, whole shillings)</span><input name="amount" type="number" inputmode="numeric" min="1" step="1" value="' + (due > 0 ? due : '') + '" required></label>' +
      '<div class="err" role="alert"></div>' +
      '<button class="btn block" type="submit"' + (S.t.balance <= 0 ? ' disabled' : '') + '>Send M-Pesa prompt</button></form>' +
      '<p class="small muted">You will get a prompt on your phone. Enter your M-Pesa PIN to finish. Your balance updates when payment is confirmed.</p></section>' +
      '<section class="glass stack"><h3>Other ways to pay</h3><div class="chips"><span class="chip">Card – coming soon</span><span class="chip">Bank – coming soon</span><span class="chip">PayPal – coming soon</span></div>' +
      '<p class="small muted">For now, pay your landlord directly for cash or bank deposits and ask them to record it.</p></section></div>';
  }

  function tenantLedger() {
    var rows = ledger(S.t.charges, S.t.payments);
    return '<div class="stack"><section class="glass"><h2>Books of account</h2>' + ledgerTable(rows) + '</section>' +
      '<section class="glass"><h2>Payment history</h2>' + paymentList(S.t.payments) + '</section></div>';
  }

  // ---------- Settings (shared) ----------
  function settingsView() {
    var p = S.profile;
    return '<div class="stack">' +
      '<section class="glass stack"><h2>Appearance</h2>' +
      '<div><span class="small muted ui">Theme</span><div class="seg" role="group" aria-label="Theme">' +
      '<button type="button" data-action="theme" data-v="dark" aria-pressed="' + (S.settings.theme === 'dark') + '">Dark</button>' +
      '<button type="button" data-action="theme" data-v="light" aria-pressed="' + (S.settings.theme === 'light') + '">Light</button></div></div>' +
      '<div><span class="small muted ui">Font</span><div class="seg" role="group" aria-label="Font">' +
      ['serif', 'sans', 'mono'].map(function (f) { return '<button type="button" data-action="font" data-v="' + f + '" aria-pressed="' + (S.settings.font === f) + '">' + cap(f) + '</button>'; }).join('') + '</div></div></section>' +
      '<section class="glass stack"><h2>Account</h2><p class="muted small ui">' + esc(p.email) + '</p>' +
      '<form data-form="name" class="stack" novalidate><label class="field"><span>Full name</span><input name="name" value="' + esc(p.full_name) + '" maxlength="100" autocomplete="name" required></label>' +
      '<div class="err" role="alert"></div><button class="btn ghost" type="submit">Save name</button></form>' +
      '<form data-form="password" class="stack" novalidate>' + pwField('password', 'New password', 'new-password') +
      '<div class="err" role="alert"></div><button class="btn ghost" type="submit">Change password</button></form></section>' +
      '<section class="glass stack">' +
      (S.installPrompt ? '<button class="btn ghost block" data-action="install">Install app on this phone</button>' : '<p class="small muted">To install: open the browser menu and choose “Add to Home screen”.</p>') +
      '<button class="btn danger block" data-action="signout">Sign out</button></section></div>';
  }

  function renderTenant() {
    var body = S.view === 'pay' ? tenantPay() : S.view === 'ledger' ? tenantLedger() : S.view === 'settings' ? settingsView() : tenantHome();
    app.innerHTML = shell({ tabs: TENANT_TABS, body: body });
  }

  // ---------- Owner views ----------
  function tenants() { return S.a.profiles.filter(function (p) { return p.role === 'tenant'; }); }
  function nameOf(id) {
    var p = S.a.profiles.filter(function (x) { return x.id === id; })[0];
    return p ? p.full_name + (p.role === 'tenant' ? ' (Room ' + p.room_number + ')' : ' (owner)') : 'Unknown';
  }

  function adminOverview() {
    var ts = tenants();
    var owed = 0, late = 0;
    ts.forEach(function (t) { var b = S.a.balances[t.id] || 0; if (b > 0) { owed += b; late++; } });
    var now = new Date(), collected = 0;
    S.a.payments.forEach(function (p) {
      if (p.status !== 'confirmed') return;
      var d = new Date(p.confirmed_at || p.created_at);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) collected += Number(p.amount);
    });
    var pending = ts.filter(function (t) { return !t.approved; }).length;
    var sorted = ts.slice().sort(function (a, b) { return (a.approved === b.approved) ? 0 : a.approved ? 1 : -1; });
    return '<div class="stack"><div class="grid3">' +
      '<div class="glass hero stat"><div class="label">Total owed</div><div class="amount due">' + esc(kes(owed)) + '</div></div>' +
      '<div class="glass hero stat"><div class="label">Collected this month</div><div class="amount clear">' + esc(kes(collected)) + '</div></div>' +
      '<div class="glass hero stat"><div class="label">Tenants</div><div class="amount">' + ts.length + '</div><div class="small muted ui">' + late + ' with balance · ' + pending + ' awaiting approval</div></div></div>' +
      '<section class="glass"><h2>Tenants</h2>' + (sorted.length ? '<ul class="list">' + sorted.map(function (t) {
        var b = S.a.balances[t.id] || 0;
        return '<li><div><div class="t">' + esc(t.full_name) + '</div><div class="s">Room ' + esc(t.room_number) + ' · ' + esc(t.email) + '</div></div><div class="r">' +
          (t.approved ? '<div class="' + (b > 0 ? 'neg' : 'pos') + '">' + esc(kes(b)) + '</div>' : '<span class="badge warn">Pending</span>') +
          '<div>' + (t.approved ? '' : '<button class="btn small" data-action="approve" data-id="' + esc(t.id) + '">Approve</button> ') +
          '<button class="btn small ghost" data-action="viewtenant" data-id="' + esc(t.id) + '">Open</button></div></div></li>';
      }).join('') + '</ul>' : '<p class="muted">No tenants have signed up yet. Share the app link and ask them to create accounts.</p>') + '</section></div>';
  }

  function adminDetail() {
    var d = S.detail, t = S.a.profiles.filter(function (p) { return p.id === d.id; })[0];
    if (!t) return '<p class="muted">Tenant not found.</p>';
    var rows = ledger(d.charges, d.payments), bal = rows.length ? rows[rows.length - 1].bal : 0;
    return '<div class="stack"><button class="linkbtn" data-action="back">← All tenants</button>' +
      '<section class="glass hero"><div class="row"><h2>' + esc(t.full_name) + '</h2>' + (t.approved ? '<span class="badge ok">Approved</span>' : '<span class="badge warn">Pending</span>') + '</div>' +
      '<p class="muted small ui">' + esc(t.email) + ' · Joined ' + esc(fdate(t.created_at)) + '</p>' + heroBalance(bal) + '</section>' +
      '<section class="glass stack"><h3>Room &amp; access</h3><form data-form="room" data-id="' + esc(t.id) + '" class="grid2" novalidate>' +
      '<label class="field"><span>Room number</span><input name="room" value="' + esc(t.room_number) + '" maxlength="20" required></label>' +
      '<div class="row"><button class="btn ghost small" type="submit">Save room</button></div><div class="err" role="alert"></div></form>' +
      '<button class="btn ' + (t.approved ? 'danger' : '') + ' small" data-action="' + (t.approved ? 'unapprove' : 'approve') + '" data-id="' + esc(t.id) + '">' + (t.approved ? 'Suspend access' : 'Approve tenant') + '</button></section>' +
      '<section class="glass"><h3>Books of account</h3>' + ledgerTable(rows) + '</section>' +
      '<section class="glass"><h3>Payments</h3>' + paymentList(d.payments) + '</section></div>';
  }

  function adminBill() {
    var ts = tenants().filter(function (t) { return t.approved; });
    var opts = ts.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.full_name) + ' – Room ' + esc(t.room_number) + '</option>'; }).join('');
    var d = new Date(), month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!ts.length) return '<section class="glass"><p class="muted">Approve at least one tenant first (Overview tab).</p></section>';
    return '<div class="stack"><section class="glass stack"><h2>Add a charge</h2>' +
      '<form data-form="charge" class="stack" novalidate>' +
      '<label class="field"><span>Bill</span><select name="tenant"><option value="ALL">All approved tenants</option>' + opts + '</select></label>' +
      '<div class="grid2"><label class="field"><span>Type</span><select name="kind"><option value="rent">Rent</option><option value="water">Water</option><option value="other">Other</option></select></label>' +
      '<label class="field"><span>Month</span><input name="month" type="month" value="' + month + '" required></label></div>' +
      '<label class="field"><span>Amount (KES)</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required></label>' +
      '<label class="field"><span>Note (optional)</span><input name="note" maxlength="120"></label>' +
      '<div class="err" role="alert"></div><button class="btn block" type="submit">Add charge</button></form>' +
      '<p class="small muted">Each tenant can be billed once per type per month. Anyone already billed is skipped.</p></section>' +
      '<section class="glass stack"><h2>Record a payment</h2><p class="small muted">For cash or bank deposits. M-Pesa payments record themselves.</p>' +
      '<form data-form="payment" class="stack" novalidate>' +
      '<label class="field"><span>Tenant</span><select name="tenant">' + opts + '</select></label>' +
      '<div class="grid2"><label class="field"><span>Method</span><select name="method"><option value="cash">Cash</option><option value="bank">Bank</option></select></label>' +
      '<label class="field"><span>Amount (KES)</span><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required></label></div>' +
      '<label class="field"><span>Reference (optional)</span><input name="ref" maxlength="60"></label>' +
      '<div class="err" role="alert"></div><button class="btn block" type="submit">Record payment</button></form></section></div>';
  }

  function summarize(r) {
    var m = r.meta || {}, verb = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed' }[r.action] || r.action;
    if (r.entity === 'charges') return verb + ' ' + (m.kind || '') + ' charge ' + kes(m.amount) + ' for ' + nameOf(m.tenant_id);
    if (r.entity === 'payments') return verb + ' payment ' + kes(m.amount) + ' (' + methodLabel(m.method) + ', ' + (m.status || '') + ') for ' + nameOf(m.tenant_id);
    if (r.entity === 'profiles') return verb + ' profile – ' + (m.full_name || '') + ', room ' + (m.room_number || '') + (m.approved ? ', approved' : ', not approved');
    return cap(r.action);
  }

  function adminActivity() {
    var rows = S.a.log;
    if (!rows.length) return '<section class="glass"><p class="muted">No activity yet.</p></section>';
    return '<section class="glass"><h2>Activity</h2><div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(fdatetime(r.created_at)) + '</td><td>' + (r.actor_id ? esc(nameOf(r.actor_id)) : 'System') + '</td><td>' + esc(summarize(r)) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Showing the latest 150 events. Sign-ins and every change to people, charges and payments are recorded automatically.</p></section>';
  }

  function renderAdmin() {
    var body = S.view === 'bill' ? adminBill() : S.view === 'activity' ? adminActivity() : S.view === 'settings' ? settingsView() : (S.detail ? adminDetail() : adminOverview());
    app.innerHTML = shell({ tabs: ADMIN_TABS, body: body, wide: true });
  }

  // Owner sessions end after 15 minutes without any tap or key press.
  var idleTimer = null, idleBound = false;
  function armIdle() {
    if (!S.profile || S.profile.role !== 'admin') return;
    function reset() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { toast('Signed out after 15 minutes of inactivity.'); sb.auth.signOut(); }, 15 * 60 * 1000);
    }
    if (!idleBound) {
      idleBound = true;
      ['click', 'keydown', 'touchstart'].forEach(function (ev) {
        document.addEventListener(ev, function () { if (S.profile && S.profile.role === 'admin') reset(); }, { passive: true });
      });
    }
    reset();
  }

  function render() {
    if (!S.profile) return;
    if (S.profile.role === 'admin') renderAdmin(); else renderTenant();
    armIdle();
    window.scrollTo(0, 0);
  }

  // ---------- Actions ----------
  async function refreshAll() {
    if (!S.profile) return;
    if (S.profile.role === 'admin') {
      await loadAdmin();
      if (S.detail) await loadDetail(S.detail.id);
    } else {
      await loadTenant();
    }
  }

  async function saveLook() {
    applyLook(); lsSet('pm_theme', S.settings.theme); lsSet('pm_font', S.settings.font);
    if (S.profile) {
      var r = await sb.from('user_settings').upsert({ user_id: S.profile.id, theme: S.settings.theme, font: S.settings.font });
      if (r.error) toast('Saved on this device only.', true);
    }
  }

  async function setApproval(id, yes) {
    var r = await sb.rpc('admin_set_profile', { p_id: id, p_approved: yes, p_room: null });
    if (r.error) { toast('Could not update tenant.', true); return; }
    await refreshAll(); render();
    toast(yes ? 'Tenant approved.' : 'Access suspended.');
  }

  var handlers = {
    nav: function (el) { S.view = el.dataset.id; S.detail = null; render(); },
    togglepw: function (el) {
      var input = el.parentNode.querySelector('input'), show = input.type === 'password';
      input.type = show ? 'text' : 'password'; el.textContent = show ? 'Hide' : 'Show'; el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    },
    logotap: function () {
      S.taps++; clearTimeout(S.tapTimer); S.tapTimer = setTimeout(function () { S.taps = 0; }, 2500);
      if (S.taps >= 5 && !S.profile) { S.taps = 0; renderAuth('owner'); }
    },
    authmode: function (el) { renderAuth(el.dataset.mode); },
    signout: async function () { S.polling = false; await sb.auth.signOut(); },
    recheck: async function () { await enter(S.session); },
    refresh: async function () { if (S.view === 'settings') return; await refreshAll(); render(); toast('Updated.'); },
    theme: function (el) { S.settings.theme = el.dataset.v === 'light' ? 'light' : 'dark'; saveLook(); render(); },
    font: function (el) { var v = el.dataset.v; S.settings.font = ['serif', 'sans', 'mono'].indexOf(v) > -1 ? v : 'serif'; saveLook(); render(); },
    install: async function () {
      if (!S.installPrompt) return;
      S.installPrompt.prompt(); await S.installPrompt.userChoice; S.installPrompt = null; render();
    },
    copykey: async function (el) {
      try { await navigator.clipboard.writeText(el.dataset.key); toast('Key copied. Paste it into your authenticator app.'); }
      catch (e) { toast('Could not copy. Press and hold the key to copy it.', true); }
    },
    approve: function (el) { return setApproval(el.dataset.id, true); },
    unapprove: function (el) { if (window.confirm('Suspend this tenant’s access? Their records stay.')) return setApproval(el.dataset.id, false); },
    viewtenant: async function (el) { await loadDetail(el.dataset.id); render(); },
    back: function () { S.detail = null; render(); }
  };

  var forms = {
    login: function (f) {
      return busy(f, async function () {
        setErr(f, '');
        var email = f.email.value.trim(), pw = f.password.value;
        if (!email || !pw) { setErr(f, 'Enter your email and password.'); return; }
        var r = await sb.auth.signInWithPassword({ email: email, password: pw });
        if (r.error) { setErr(f, friendly(r.error)); return; }
        await enter(r.data.session);
        sb.rpc('log_event', { p_action: 'login' }).then(function () { }, function () { });
      });
    },
    signup: function (f) {
      return busy(f, async function () {
        setErr(f, '');
        var name = f.name.value.trim(), email = f.email.value.trim(), room = f.room.value.trim(), pw = f.password.value;
        if (name.length < 2) { setErr(f, 'Enter your full name.'); return; }
        if (!f.email.checkValidity() || !email) { setErr(f, 'Enter a valid email address.'); return; }
        if (!room) { setErr(f, 'Enter your room number.'); return; }
        if (pw.length < 8) { setErr(f, 'Choose a password with at least 8 characters.'); return; }
        if (!f.consent.checked) { setErr(f, 'Please agree to the consent to continue.'); return; }
        var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { full_name: name, room_number: room, consent: true } } });
        if (r.error) { setErr(f, friendly(r.error)); return; }
        if (r.data.session) { await enter(r.data.session); } else { renderAuth('checkemail'); }
      });
    },
    mfa: function (f) {
      return busy(f, async function () {
        setErr(f, '');
        var code = f.code.value.replace(/\s/g, ''), factorId = f.dataset.factor;
        if (!/^\d{6}$/.test(code)) { setErr(f, 'Enter the 6-digit code.'); return; }
        var ch = await sb.auth.mfa.challenge({ factorId: factorId });
        if (ch.error) { setErr(f, friendly(ch.error)); return; }
        var v = await sb.auth.mfa.verify({ factorId: factorId, challengeId: ch.data.id, code: code });
        if (v.error) { setErr(f, 'That code is wrong or has expired. Try the newest one.'); return; }
        S.view = 'overview'; await loadAdmin(); render();
      });
    },
    name: function (f) {
      return busy(f, async function () {
        var name = f.name.value.trim();
        if (name.length < 2 || name.length > 100) { setErr(f, 'Name must be 2–100 characters.'); return; }
        var r = await sb.from('profiles').update({ full_name: name }).eq('id', S.profile.id);
        if (r.error) { setErr(f, 'Could not save your name.'); return; }
        S.profile.full_name = name; setErr(f, ''); toast('Name saved.');
      });
    },
    password: function (f) {
      return busy(f, async function () {
        var pw = f.password.value;
        if (pw.length < 8) { setErr(f, 'Use at least 8 characters.'); return; }
        var r = await sb.auth.updateUser({ password: pw });
        if (r.error) { setErr(f, friendly(r.error)); return; }
        f.reset(); setErr(f, ''); toast('Password changed.');
      });
    },
    pay: function (f) {
      return busy(f, async function () {
        setErr(f, '');
        var phone = f.phone.value.trim(), amount = Math.floor(Number(f.amount.value));
        if (!/^(?:\+?254|0)[17]\d{8}$/.test(phone.replace(/[\s-]/g, ''))) { setErr(f, 'Enter a valid Safaricom number, like 0712 345 678.'); return; }
        if (!isFinite(amount) || amount < 1) { setErr(f, 'Enter an amount of at least KES 1.'); return; }
        if (amount > Math.floor(S.t.balance)) { setErr(f, 'That is more than your balance due.'); return; }
        var sess = await sb.auth.getSession();
        if (!sess.data.session) { setErr(f, 'Your session expired. Please sign in again.'); return; }
        var before = {};
        S.t.payments.forEach(function (p) { before[p.id] = true; });
        var res = await fetch(SUPABASE_URL + '/functions/v1/mpesa/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sess.data.session.access_token },
          body: JSON.stringify({ phone: phone, amount: amount })
        });
        var out = await res.json().catch(function () { return {}; });
        if (!res.ok || !out.ok) { setErr(f, out.error || 'Payment could not start. Please try again.'); return; }
        toast(out.message || 'Check your phone and enter your M-Pesa PIN.');
        pollPayment(before);
      });
    },
    room: function (f) {
      return busy(f, async function () {
        var room = f.room.value.trim();
        if (!room) { setErr(f, 'Enter a room number.'); return; }
        var t = S.a.profiles.filter(function (p) { return p.id === f.dataset.id; })[0];
        var r = await sb.rpc('admin_set_profile', { p_id: f.dataset.id, p_approved: !!(t && t.approved), p_room: room });
        if (r.error) { setErr(f, 'Could not save the room.'); return; }
        await refreshAll(); render(); toast('Room saved.');
      });
    },
    charge: function (f) {
      return busy(f, async function () {
        setErr(f, '');
        var amount = money2(f.amount.value), kind = f.kind.value, month = f.month.value, who = f.tenant.value, note = f.note.value.trim() || null;
        if (!(amount > 0)) { setErr(f, 'Enter an amount above zero.'); return; }
        if (!/^\d{4}-\d{2}$/.test(month)) { setErr(f, 'Choose a month.'); return; }
        var period = month + '-01';
        if (who === 'ALL') {
          var rowsToAdd = tenants().filter(function (t) { return t.approved; }).map(function (t) { return { tenant_id: t.id, kind: kind, period: period, amount: amount, note: note }; });
          if (!rowsToAdd.length) { setErr(f, 'No approved tenants to bill.'); return; }
          var up = await sb.from('charges').upsert(rowsToAdd, { onConflict: 'tenant_id,kind,period', ignoreDuplicates: true }).select('id');
          if (up.error) { setErr(f, 'Could not add charges.'); return; }
          toast('Billed ' + (up.data || []).length + ' of ' + rowsToAdd.length + ' tenants.');
        } else {
          var ins = await sb.from('charges').insert({ tenant_id: who, kind: kind, period: period, amount: amount, note: note });
          if (ins.error) { setErr(f, ins.error.code === '23505' ? 'That tenant already has this charge for that month.' : 'Could not add the charge.'); return; }
          toast('Charge added.');
        }
        await loadAdmin(); f.amount.value = ''; f.note.value = '';
      });
    },
    payment: function (f) {
      return busy(f, async function () {
        setErr(f, '');
        var amount = money2(f.amount.value), ref = f.ref.value.trim() || null;
        if (!(amount > 0)) { setErr(f, 'Enter an amount above zero.'); return; }
        var ins = await sb.from('payments').insert({ tenant_id: f.tenant.value, amount: amount, method: f.method.value, status: 'confirmed', reference: ref, confirmed_at: new Date().toISOString() });
        if (ins.error) { setErr(f, ins.error.code === '23505' ? 'That reference is already recorded.' : 'Could not record the payment.'); return; }
        toast('Payment recorded.'); f.amount.value = ''; f.ref.value = '';
        await loadAdmin();
      });
    }
  };

  async function pollPayment(before) {
    S.polling = true;
    for (var i = 0; i < 24 && S.polling; i++) {
      await sleep(5000);
      if (!S.polling || !S.profile) return;
      await loadTenant();
      var np = S.t.payments.filter(function (p) { return !before[p.id] && p.method === 'mpesa'; })[0];
      if (np && np.status !== 'pending') {
        S.polling = false;
        if (['home', 'pay', 'ledger'].indexOf(S.view) > -1) render();
        toast(np.status === 'confirmed' ? 'Payment received. Thank you!' : 'Payment was not completed.', np.status !== 'confirmed');
        return;
      }
    }
    S.polling = false;
    toast('Still waiting for M-Pesa. Check Accounts later.');
  }

  // ---------- Events ----------
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || !handlers[el.dataset.action]) return;
    Promise.resolve(handlers[el.dataset.action](el, e)).catch(function (err) { console.error(err); toast('Something went wrong. Please try again.', true); });
  });
  app.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    if (forms[f.dataset.form]) forms[f.dataset.form](f);
  });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installPrompt = e; });

  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      setTimeout(function () { clearTimeout(idleTimer); S.session = null; S.profile = null; S.detail = null; S.polling = false; renderAuth('login'); }, 0);
    }
  });

  // ---------- Boot ----------
  applyLook();
  (async function boot() {
    app.innerHTML = '<div class="loading">Loading…</div>';
    try {
      var r = await sb.auth.getSession();
      if (r.data && r.data.session) { await enter(r.data.session); }
      else { renderAuth(location.hash === '#owner' ? 'owner' : 'login'); }
    } catch (err) {
      console.error(err);
      renderAuth('login');
      toast('Could not reach the server.', true);
    }
  })();

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
  }
})();
