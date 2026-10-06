const express = require('express');
const store = require('../models/store');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', { title: 'ورود', error: null });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  const user = store.findUserByEmail(email) || store.findUserByUsername(email);
  if (!user || !store.verifyPassword(user, password)) {
    return res.render('auth/login', { title: 'ورود', error: 'اطلاعات ورود نادرست است' });
  }
  req.session.user = { id: user.id, email: user.email, name: user.name, username: user.username };
  res.redirect('/dashboard');
});

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/register', { title: 'ثبت‌نام', error: null });
});

router.post('/register', (req, res) => {
  const { email, name, username, password } = req.body;
  if (!email || !username || !password || password.length < 6) {
    return res.render('auth/register', { title: 'ثبت‌نام', error: 'ایمیل، نام کاربری یکتا و رمز (حداقل ۶) الزامی است' });
  }
  const result = store.createUser({ email: email.trim(), name, username, password });
  if (result.error) return res.render('auth/register', { title: 'ثبت‌نام', error: result.error });
  store.seedDemo(result.user.id);
  req.session.user = { id: result.user.id, email: result.user.email, name: result.user.name, username: result.user.username };
  res.redirect('/dashboard');
});

// Google OAuth — requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(501).render('auth/login', {
      title: 'ورود',
      error: 'ورود با گوگل فعال نیست. GOOGLE_CLIENT_ID را در سرور تنظیم کنید یا با ایمیل ثبت‌نام کنید.'
    });
  }
  const redirect = encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT||4000}/auth/google/callback`);
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=openid%20email%20profile`;
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) {
    return res.redirect('/auth/login');
  }
  try {
    const redirect = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT||4000}/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirect, grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    const access = tokenData.access_token;
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + access }
    });
    const profile = await profileRes.json();
    let user = store.findUserByGoogleId(profile.id) || store.findUserByEmail(profile.email);
    if (!user) {
      const baseUser = (profile.email || 'user').split('@')[0].replace(/[^a-z0-9]/gi, '') || 'user';
      let username = baseUser.slice(0, 16);
      let i = 0;
      while (store.findUserByUsername(username)) { i++; username = baseUser.slice(0, 12) + i; }
      const created = store.createUser({
        email: profile.email, name: profile.name, username, google_id: profile.id
      });
      if (created.error) return res.render('auth/login', { title: 'ورود', error: created.error });
      user = created.user;
      store.seedDemo(user.id);
    } else if (!user.google_id) {
      user.google_id = profile.id;
    }
    req.session.user = { id: user.id, email: user.email, name: user.name, username: user.username };
    res.redirect('/dashboard');
  } catch (e) {
    res.render('auth/login', { title: 'ورود', error: 'خطا در ورود گوگل' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
