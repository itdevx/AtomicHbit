const express = require('express');
const store = require('../models/store');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
}

router.get('/', requireAuth, (req, res) => {
  const habits = store.getHabits(req.session.user.id).map(h => ({
    ...h,
    streak: store.getStreak(req.session.user.id, h.id)
  }));
  res.render('habits/list', { title: 'عادت‌ها', habits });
});

router.get('/new', requireAuth, (req, res) => {
  res.render('habits/form', { title: 'عادت جدید', habit: null, error: null });
});

router.post('/new', requireAuth, (req, res) => {
  const result = store.createHabit(req.session.user.id, req.body);
  if (result.error) {
    return res.render('habits/form', { title: 'عادت جدید', habit: req.body, error: result.error });
  }
  res.redirect('/dashboard');
});

router.get('/:id/edit', requireAuth, (req, res) => {
  const habit = store.getHabit(req.params.id, req.session.user.id);
  if (!habit) return res.status(404).render('404', { title: 'یافت نشد' });
  res.render('habits/form', { title: 'ویرایش عادت', habit, error: null });
});

router.post('/:id/edit', requireAuth, (req, res) => {
  const result = store.updateHabit(req.params.id, req.session.user.id, req.body);
  if (result.error) {
    return res.render('habits/form', { title: 'ویرایش عادت', habit: { ...req.body, id: req.params.id }, error: result.error });
  }
  res.redirect('/habits');
});

router.post('/:id/delete', requireAuth, (req, res) => {
  store.deleteHabit(req.params.id, req.session.user.id);
  res.redirect('/habits');
});

router.post('/:id/toggle', requireAuth, (req, res) => {
  const result = store.toggleLog(req.session.user.id, Number(req.params.id), req.body.date);
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    const dash = store.getDashboard(req.session.user.id);
    return res.json({
      done: result.done,
      percent: dash.percent,
      doneCount: dash.doneCount,
      total: dash.total,
      streak: store.getStreak(req.session.user.id, Number(req.params.id))
    });
  }
  res.redirect(req.body.redirect || '/dashboard');
});

module.exports = router;
