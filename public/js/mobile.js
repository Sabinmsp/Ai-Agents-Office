// Phone layout: the office fills the screen and the chat lives in a glass sheet that slides up from the bottom.
// Tap the handle (or drag it) to open and close the sheet. The handle previews the latest message and counts running jobs.
export const PHONE = matchMedia('(max-width: 760px)').matches;

const $ = id => document.getElementById(id);
const side = $('side'), handle = $('sheetHandle'), chatEl = $('chat'), jobsEl = $('jobs');
const narrow = matchMedia('(max-width: 760px)');
const root = document.documentElement;
const PEEK = () => handle.offsetHeight + $('composer').offsetHeight;
const OPEN = () => Math.round(innerHeight * 0.64);

let open = false, unread = false;
function setSheet(next, height) {
  open = next;
  side.classList.toggle('open', open);
  handle.setAttribute('aria-expanded', String(open));
  handle.setAttribute('aria-label', open ? 'Hide chat and jobs' : 'Show chat and jobs');
  const h = height ?? (open ? OPEN() : PEEK());
  side.style.height = h + 'px';
  root.style.setProperty('--sheet-h', h + 'px');       // cards and the activity log sit just above the sheet
  if (open) { unread = false; handle.classList.remove('unread'); chatEl.scrollTop = 1e9; }
}

// Tap to toggle; drag to resize, then snap open or closed by where it was let go and how fast.
let drag = null;
handle.addEventListener('pointerdown', e => {
  if (!narrow.matches) return;
  drag = { y: e.clientY, h: side.offsetHeight, t: performance.now(), moved: false };
  handle.setPointerCapture(e.pointerId);
  side.classList.add('dragging');
});
handle.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = drag.y - e.clientY;
  if (Math.abs(dy) > 4) drag.moved = true;
  if (!drag.moved) return;
  const h = Math.min(innerHeight * 0.88, Math.max(PEEK(), drag.h + dy));
  side.style.height = h + 'px';
});
const endDrag = e => {
  if (!drag) return;
  side.classList.remove('dragging');
  const d = drag; drag = null;
  if (!d.moved) return setSheet(!open);
  const dy = d.y - e.clientY, speed = dy / Math.max(1, performance.now() - d.t);     // px per ms, up is positive
  const h = side.offsetHeight;
  if (Math.abs(speed) > 0.5) return setSheet(speed > 0);
  if (h > OPEN() * 0.9) return setSheet(true, Math.min(h, innerHeight * 0.88));        // let people keep a taller sheet
  setSheet(h > (PEEK() + OPEN()) / 2);
};
handle.addEventListener('pointerup', endDrag);
handle.addEventListener('pointercancel', endDrag);
handle.addEventListener('click', e => { if (e.detail === 0) setSheet(!open); });     // keyboard: Enter / Space

// The handle shows the latest message and how many jobs are running.
function refreshPeek() {
  const last = [...chatEl.querySelectorAll('.msg')].pop();
  if (last) {
    const from = last.querySelector('.from')?.textContent || '', label = from || (last.classList.contains('me') ? 'You' : '');
    const text = (last.textContent || '').slice(from.length).replace(/\s+/g, ' ').trim();
    $('sheetPeek').innerHTML = '';
    if (label) { const b = document.createElement('b'); b.textContent = label + ' '; $('sheetPeek').append(b); }
    $('sheetPeek').append(text);
  }
  const running = jobsEl.querySelectorAll('.job:not(.done):not(.fail)').length;
  $('sheetJobs').hidden = !running;
  $('sheetJobs').textContent = running + (running === 1 ? ' job' : ' jobs');
}
new MutationObserver(() => {
  refreshPeek();
  if (!open && narrow.matches) { unread = true; handle.classList.add('unread'); }
}).observe(chatEl, { childList: true });
new MutationObserver(refreshPeek).observe(jobsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

// Keep the sheet right when the phone rotates or the window crosses the phone breakpoint.
function layout() {
  if (narrow.matches) setSheet(open);
  else { side.style.height = ''; root.style.removeProperty('--sheet-h'); }
}
narrow.addEventListener('change', layout);
addEventListener('resize', () => { if (narrow.matches && !drag) setSheet(open); });
requestAnimationFrame(layout);
refreshPeek();
