// Session draft: sets are safely retained on-device until the user finishes the workout.
const SETS_KEY = 'sali.sets.v1';
const DRAFT_KEY = 'sali.workout-draft.v1';
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const normalize = (value) => value.trim().replace(/\s+/g, ' ');
const safeRead = (key, fallback) => {
  try { const data = JSON.parse(localStorage.getItem(key)); return data ?? fallback; } catch { return fallback; }
};
let draft = safeRead(DRAFT_KEY, []);
if (!Array.isArray(draft)) draft = [];
const form = $('#log-form');
const dateInput = $('#f-date');
const exerciseInput = $('#f-exercise');
const weightInput = $('#f-weight');
const repsInput = $('#f-reps');
const draftPanel = $('#draft-workout');
const saveButton = document.createElement('button');
saveButton.type = 'button';
saveButton.className = 'save-workout hidden';
saveButton.textContent = 'Tallenna treeni';
form.insertAdjacentElement('afterend', saveButton);

function persistDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    showToast('Treeniä ei voitu tallentaa laitteelle. Vapauta tallennustilaa ja yritä uudelleen.');
    return false;
  }
}
function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}
function renderDraft() {
  saveButton.classList.toggle('hidden', draft.length === 0);
  saveButton.textContent = `Tallenna treeni · ${draft.length} ${draft.length === 1 ? 'sarja' : 'sarjaa'}`;
  if (!draft.length) {
    draftPanel.className = 'hidden';
    draftPanel.replaceChildren();
    return;
  }
  const dates = [...new Set(draft.map((set) => set.date))];
  const dateNote = dates.length === 1 ? ` · ${dates[0]}` : ` · ${dates.length} päivää`;
  draftPanel.className = 'draft-workout';
  draftPanel.innerHTML = `<div class="day-head"><h3>Treeni kesken</h3><span>${draft.length} sarjaa${dateNote}</span></div><div class="group">${draft.map((set) => `
    <div class="row draft-row"><span class="k">${esc(set.exercise)}<small>${set.weight} kg × ${set.reps}</small></span><button type="button" class="draft-delete" data-draft-delete="${esc(set.id)}" aria-label="Poista sarja">Poista</button></div>`).join('')}</div>`;
}

// Capture before the app's normal handler, so each set stays in the recoverable workout draft.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const exercise = normalize(exerciseInput.value);
  const weight = Number(String(weightInput.value).replace(',', '.'));
  const reps = Math.round(Number(repsInput.value));
  if (!exercise || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1 || !dateInput.value) {
    showToast('Tarkista liike, paino, toistot ja päivä.');
    return;
  }
  draft.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    date: dateInput.value,
    exercise,
    weight,
    reps,
    ts: Date.now(),
  });
  if (!persistDraft()) {
    draft.pop();
    return;
  }
  renderDraft();
  showToast('Sarja lisätty treeniin');
}, true);

saveButton.addEventListener('click', () => {
  if (!draft.length) return;
  const saved = safeRead(SETS_KEY, []);
  if (!Array.isArray(saved)) {
    showToast('Aiemmin tallennettuja sarjoja ei voitu lukea.');
    return;
  }
  const existingIds = new Set(saved.map((set) => set.id).filter(Boolean));
  const fresh = draft.filter((set) => !existingIds.has(set.id));
  try {
    localStorage.setItem(SETS_KEY, JSON.stringify([...saved, ...fresh]));
    localStorage.removeItem(DRAFT_KEY);
    draft = [];
    showToast('Treeni tallennettu. Treenifrekvenssi päivitetään päivän perusteella.');
    setTimeout(() => location.reload(), 250);
  } catch {
    showToast('Treeniä ei voitu tallentaa. Vapauta tallennustilaa ja yritä uudelleen.');
  }
});

draftPanel.addEventListener('click', (event) => {
  const button = event.target.closest('[data-draft-delete]');
  if (!button) return;
  draft = draft.filter((set) => set.id !== button.dataset.draftDelete);
  persistDraft();
  renderDraft();
});

// Complete a restored draft when the user returns to the app after a reload.
renderDraft();
