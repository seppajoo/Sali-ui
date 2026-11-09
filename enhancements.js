// Enhancements for the lightweight, offline-first training log.
const $ = (selector, root = document) => root.querySelector(selector);
const KEY = 'sali.custom-exercises.v1';
const safeJSON = (value) => { try { return JSON.parse(value); } catch { return null; } };
const normalize = (value) => value.trim().replace(/\s+/g, ' ');
const exerciseInput = $('#f-exercise');
const catalog = safeJSON(localStorage.getItem(KEY));
let exercises = Array.isArray(catalog) ? catalog.filter((name) => typeof name === 'string').map(normalize).filter(Boolean) : [];

function saveExercises() {
  try {
    localStorage.setItem(KEY, JSON.stringify(exercises));
    return true;
  } catch (error) {
    const toast = $('#toast');
    if (toast) {
      toast.textContent = `Liikkeen tallennus epäonnistui: ${error.message}`;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }
    return false;
  }
}

function addRange(input, stepType) {
  const row = input.closest('.stp-row');
  if (!row) return;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'dial-range';
  slider.dataset.dial = stepType;
  slider.setAttribute('aria-label', stepType === 'weight' ? 'Säädä painoa liu’uttamalla' : 'Säädä toistoja liu’uttamalla');
  slider.min = stepType === 'weight' ? '0' : '1';
  slider.step = stepType === 'weight' ? '0.25' : '1';
  const rowWrap = row.parentElement;
  rowWrap.insertBefore(slider, row.nextSibling);

  const syncRange = () => {
    const value = Number(String(input.value).replace(',', '.'));
    const minMax = stepType === 'weight' ? Math.max(300, Math.ceil((value + 50) / 25) * 25) : Math.max(50, value + 20);
    slider.max = String(minMax);
    slider.value = String(Number.isFinite(value) ? Math.max(Number(slider.min), Math.min(value, minMax)) : Number(slider.min));
  };
  input.addEventListener('input', syncRange);
  input.addEventListener('change', syncRange);
  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    input.value = stepType === 'weight' ? String(Number(value.toFixed(2))) : String(Math.round(value));
    if (Number(slider.value) >= Number(slider.max) - Number(slider.step) * 2) {
      slider.max = String(Number(slider.max) + (stepType === 'weight' ? 100 : 20));
    }
  });
  syncRange();
}

addRange($('#f-weight'), 'weight');
addRange($('#f-reps'), 'reps');

const addButton = document.createElement('button');
addButton.type = 'button';
addButton.className = 'exercise-add';
addButton.textContent = 'Tallenna oma liike';
addButton.addEventListener('click', () => {
  const name = normalize(exerciseInput.value);
  if (!name) {
    exerciseInput.focus();
    exerciseInput.reportValidity?.();
    return;
  }
  if (name.length > 60) {
    exerciseInput.setCustomValidity('Liikkeen nimi voi olla enintään 60 merkkiä.');
    exerciseInput.reportValidity();
    exerciseInput.setCustomValidity('');
    return;
  }
  const existing = exercises.find((item) => item.toLocaleLowerCase('fi') === name.toLocaleLowerCase('fi'));
  if (!existing) {
    exercises.push(name);
    exercises.sort((a, b) => a.localeCompare(b, 'fi'));
    if (!saveExercises()) return;
  }
  exerciseInput.value = existing || name;
  exerciseInput.dispatchEvent(new Event('change', { bubbles: true }));
  syncChoices();
  updateButton();
  if (!existing) showToast('Oma liike tallennettu');
});
$('#recent-chips').insertAdjacentElement('afterend', addButton);

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2000);
}

function updateButton() {
  const name = normalize(exerciseInput.value).toLocaleLowerCase('fi');
  const saved = exercises.some((item) => item.toLocaleLowerCase('fi') === name);
  addButton.classList.toggle('saved', Boolean(name && saved));
  addButton.textContent = name && saved ? 'Oma liike tallennettu' : 'Tallenna oma liike';
}

function syncChoices() {
  const datalist = $('#exercise-options');
  const chips = $('#recent-chips');
  if (!datalist || !chips) return;
  const known = new Set([...datalist.options].map((option) => option.value.toLocaleLowerCase('fi')));
  const allExercises = [...new Set(exercises)];
  for (const name of allExercises) {
    if (!known.has(name.toLocaleLowerCase('fi'))) {
      const option = document.createElement('option');
      option.value = name;
      datalist.append(option);
      known.add(name.toLocaleLowerCase('fi'));
    }
    const alreadyShown = [...chips.querySelectorAll('[data-pick]')]
      .some((button) => button.dataset.pick.toLocaleLowerCase('fi') === name.toLocaleLowerCase('fi'));
    if (!alreadyShown) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.pick = name;
      button.textContent = name;
      chips.append(button);
    }
  }
  chips.querySelectorAll('[data-pick]').forEach((button) => {
    button.classList.toggle('on', button.dataset.pick.toLocaleLowerCase('fi') === normalize(exerciseInput.value).toLocaleLowerCase('fi'));
  });
}

exerciseInput.addEventListener('input', updateButton);
exerciseInput.addEventListener('change', () => { syncChoices(); updateButton(); });
const choiceObserver = new MutationObserver(() => queueMicrotask(syncChoices));
choiceObserver.observe($('#exercise-options'), { childList: true });
choiceObserver.observe($('#recent-chips'), { childList: true });
syncChoices();
updateButton();
