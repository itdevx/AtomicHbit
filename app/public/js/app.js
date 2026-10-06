async function toggleHabit(id, btn) {
  try {
    const res = await fetch('/habits/' + id + '/toggle', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json();
    const row = btn.closest('.habit-row');
    if (row) row.classList.toggle('done', data.done);
    btn.textContent = data.done ? '✓' : '';
    const streak = row && row.querySelector('[data-streak]');
    if (streak) streak.textContent = '🔥 ' + data.streak;
    const pct = document.querySelector('[data-percent]');
    if (pct) pct.textContent = data.percent + '%';
    const dc = document.getElementById('rtDone');
    if (dc && data.total != null) dc.textContent = data.doneCount + ' / ' + data.total;
    // refresh dashboard stats if available
    if (typeof window.__applyDash === 'function') {
      fetch('/api/dashboard', { credentials: 'same-origin' })
        .then(r => r.json()).then(window.__applyDash).catch(() => {});
    }
  } catch (e) { console.error(e); }
}
