// Guided one-step-at-a-time wizard for the spike pages (identical copy lives in share/ and mail/).
// Plain ES module, no dependencies, no network.
//
// Step types:
//   {type:'welcome', paragraphs:[...], startLabel}
//   {type:'setup', build(api) -> {el, update(), status() -> '' | 'missing text', cleanup?()}}
//   {type:'test', id, name, intro?, todo:[...], needsPhoto, run() -> Promise<{status, detail}>,
//                 questions:[{id, text}]}
//   {type:'final'}
// run() is invoked synchronously inside the click handler (user activation is kept).
// status: 'ok' | 'cancelled' | 'failed' | 'unsupported'

import { lsGet, lsSet, copyText, errText } from './common.js';

export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const ANSWERS = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];
const answerLabel = (v) => (ANSWERS.find((a) => a[0] === v) || [0, '(not answered)'])[1];
const FAILED = ['failed', 'unsupported'];

export function createWizard(cfg) {
  const { root, progressTextEl, barFillEl, storageKey, steps } = cfg;
  const testSteps = steps.filter((s) => s.type === 'test');

  function freshState() { return { step: 0, tests: {}, mailApp: '' }; }
  let state;
  try { state = JSON.parse(lsGet(storageKey, '')); } catch { state = null; }
  if (!state || typeof state !== 'object') state = freshState();
  state.tests = state.tests && typeof state.tests === 'object' ? state.tests : {};
  state.mailApp = typeof state.mailApp === 'string' ? state.mailApp : '';
  state.step = Number.isInteger(state.step) ? Math.min(Math.max(state.step, 0), steps.length - 1) : 0;

  const save = () => lsSet(storageKey, JSON.stringify(state));
  const tstate = (id) => (state.tests[id] ||= { ran: false, skipped: false, status: '', detail: '', answers: {}, note: '' });

  let current = null; // {update, cleanup}
  let shownStepIndex = -1;

  function go(i) {
    state.step = Math.min(Math.max(i, 0), steps.length - 1);
    save();
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (current && current.cleanup) current.cleanup();
    root.textContent = '';
    const i = state.step;
    shownStepIndex = i;
    const step = steps[i];
    progressTextEl.textContent = `Step ${i + 1} of ${steps.length}`;
    barFillEl.style.width = `${Math.round(((i + 1) / steps.length) * 100)}%`;
    if (step.type === 'welcome') current = buildWelcome(step);
    else if (step.type === 'setup') current = buildSetup(step, i);
    else if (step.type === 'test') current = buildTest(step, i);
    else current = buildFinal(i);
    if (current.update) current.update();
  }

  function navRow({ back, backTo, nextLabel, onNext }) {
    const backBtn = back ? h('button', { type: 'button', class: 'secondary', text: 'Back', onclick: () => go(backTo) }) : null;
    const nextBtn = nextLabel ? h('button', { type: 'button', class: 'primary', text: nextLabel, onclick: onNext }) : null;
    return { el: h('div', { class: 'navrow' }, backBtn, nextBtn), nextBtn };
  }

  // ---------- welcome ----------
  function buildWelcome(step) {
    const el = h('div', {},
      h('h2', { text: step.title || 'Welcome' }),
      step.paragraphs.map((t) => h('p', { class: 'lead', text: t })),
      h('button', { type: 'button', class: 'primary', text: step.startLabel || 'Start', onclick: () => go(state.step + 1) }),
    );
    root.append(el);
    return {};
  }

  // ---------- setup ----------
  function buildSetup(step, i) {
    const built = step.build({ update: () => api.update() });
    const msg = h('p', { class: 'calm', hidden: true });
    const nav = navRow({ back: true, backTo: i - 1, nextLabel: 'Next', onNext: () => go(i + 1) });
    root.append(h('h2', { text: step.title || 'Before we start' }), built.el, msg, nav.el);
    return {
      update() {
        const missing = built.status();
        msg.hidden = !missing;
        msg.textContent = missing;
        nav.nextBtn.disabled = !!missing;
        if (built.update) built.update();
      },
      cleanup: built.cleanup,
    };
  }

  // ---------- test ----------
  function testTitle(step) {
    return `Test ${testSteps.indexOf(step) + 1} of ${testSteps.length} — ${step.name}`;
  }

  function buildTest(step, i) {
    const ts = tstate(step.id);
    const n = testSteps.indexOf(step) + 1;
    const isLast = n === testSteps.length;

    const photoMissing = h('div', { class: 'calm', hidden: true },
      h('p', { text: 'This test needs a photo, and none is chosen yet.' }),
      h('button', { type: 'button', class: 'secondary', text: 'Choose a photo', onclick: () => go(steps.findIndex((s) => s.type === 'setup')) }),
    );
    const runBtn = h('button', { type: 'button', class: 'primary', text: `Run test ${n}` });
    runBtn.addEventListener('click', () => {
      // run() must be called synchronously here so the browser still sees the tap.
      let p;
      try { p = Promise.resolve(step.run()); } catch (e) { p = Promise.resolve({ status: 'failed', detail: errText(e) }); }
      ts.ran = true; ts.skipped = false; ts.status = 'pending'; ts.detail = '';
      save();
      api.update();
      p.then(
        (r) => { ts.status = (r && r.status) || 'ok'; ts.detail = (r && r.detail) || ''; },
        (e) => { ts.status = 'failed'; ts.detail = errText(e); },
      ).then(() => { save(); if (shownStepIndex === i) api.update(); });
    });

    const working = h('p', { class: 'muted', text: 'Working…', hidden: true });
    const calm = h('p', { class: 'calm', hidden: true });

    // Questions block (built once, shown after the button was pressed).
    const segRefs = [];
    const qBlock = h('div', { hidden: true }, h('h3', { text: 'What did you see?' }));
    for (const q of step.questions) {
      const btns = ANSWERS.map(([val, label]) => {
        const b = h('button', { type: 'button', class: 'seg', text: label, 'aria-pressed': 'false' });
        b.addEventListener('click', () => { ts.answers[q.id] = val; save(); refreshSeg(); });
        return [val, b];
      });
      segRefs.push({ q, btns });
      qBlock.append(h('div', { class: 'question' }, h('p', { class: 'qtext', text: q.text }), h('div', { class: 'segs', role: 'group' }, btns.map((x) => x[1]))));
    }
    function refreshSeg() {
      for (const { q, btns } of segRefs) for (const [val, b] of btns) b.setAttribute('aria-pressed', ts.answers[q.id] === val ? 'true' : 'false');
    }

    const noteBlock = h('div', { hidden: true },
      h('label', { class: 'lbl', for: 'note-' + step.id, text: 'Anything unusual? (optional)' }),
      h('textarea', { id: 'note-' + step.id, rows: '2' }),
    );
    const noteEl = noteBlock.querySelector('textarea');
    noteEl.value = ts.note || '';
    noteEl.addEventListener('input', () => { ts.note = noteEl.value; save(); });

    const nav = navRow({ back: true, backTo: i - 1, nextLabel: isLast ? 'Next' : 'Next test', onNext: () => go(i + 1) });
    const skip = h('button', {
      type: 'button', class: 'linkbtn', text: 'Skip this test',
      onclick: () => { ts.skipped = true; save(); go(i + 1); },
    });

    root.append(
      h('h2', { text: testTitle(step) }),
      // Element.append() would print a literal "null", so spread an empty list instead.
      ...(step.intro ? [h('p', { class: 'lead', text: step.intro })] : []),
      h('h3', { text: 'What to do' }),
      h('ol', { class: 'todo' }, step.todo.map((t) => h('li', { text: t }))),
      photoMissing, runBtn, working, calm, qBlock, noteBlock, nav.el,
      h('p', { class: 'center' }, skip),
    );

    return {
      update() {
        const photoOk = !step.needsPhoto || cfg.hasPhoto();
        photoMissing.hidden = photoOk;
        runBtn.disabled = !photoOk;
        runBtn.textContent = ts.ran ? `Run test ${n} again` : `Run test ${n}`;
        const failed = FAILED.includes(ts.status);
        working.hidden = !(ts.ran && ts.status === 'pending');
        calm.hidden = !(ts.ran && (failed || ts.status === 'cancelled'));
        calm.textContent = failed
          ? 'This way does not work on this device. That is a useful result — go on to the next test.'
          : 'It looks like the list was closed without choosing an app. You can press the button again, or answer below and go on.';
        qBlock.hidden = !(ts.ran && !failed);
        noteBlock.hidden = !ts.ran;
        refreshSeg();
        nav.nextBtn.disabled = !(ts.ran || ts.skipped);
        skip.parentElement.hidden = ts.ran;
      },
    };
  }

  // ---------- final ----------
  function buildFinal(i) {
    const input = h('input', { type: 'text', id: 'mailapp', autocomplete: 'off', placeholder: cfg.mailPlaceholder });
    input.value = state.mailApp;
    input.addEventListener('input', () => { state.mailApp = input.value; save(); });
    const done = h('p', { class: 'ok', hidden: true });
    const paste = h('p', { class: 'lead', hidden: true, text: cfg.pasteInstruction });
    const box = h('textarea', { rows: '10', readonly: true, hidden: true });
    const hint = h('p', { class: 'muted', hidden: true, text: 'If copying did not work, select this text and copy it by hand.' });
    const copyBtn = h('button', { type: 'button', class: 'primary', text: 'Copy my results' });
    copyBtn.addEventListener('click', async () => {
      const text = summary();
      box.value = text;
      box.hidden = false; hint.hidden = false; paste.hidden = false;
      const r = await copyText(text);
      done.hidden = false;
      done.className = r.ok ? 'ok' : 'calm';
      done.textContent = r.ok ? '✓ Copied' : 'Copying did not work automatically. Please copy the text in the box below by hand.';
    });
    const nav = navRow({ back: true, backTo: i - 1 });
    root.append(
      h('h2', { text: 'Almost done' }),
      h('label', { class: 'lbl', for: 'mailapp', text: 'Which e-mail app did you use?' }),
      input,
      h('p', { class: 'lead', text: 'Press the button below. Your answers are copied as text.' }),
      copyBtn, done, paste, box, hint, nav.el,
    );
    return {};
  }

  // ---------- summary ----------
  function summary() {
    const out = [];
    out.push(`ParkStop spike results - ${cfg.pageTitle}`);
    out.push(`Date: ${new Date().toISOString()}`);
    out.push(`Mail app used: ${state.mailApp.trim() || '(not given)'}`);
    for (const step of testSteps) {
      const ts = tstate(step.id);
      out.push('', `== ${testTitle(step)} ==`);
      out.push(`Ran: ${ts.ran ? 'yes' : ts.skipped ? 'no - skipped' : 'no - not reached'}`);
      if (ts.ran) {
        const st = ts.status === 'pending' ? 'pending (the call never finished)' : ts.status || 'unknown';
        out.push(`Technical result: ${st}${ts.detail ? ' - ' + ts.detail : ''}`);
        if (FAILED.includes(ts.status)) out.push('Questions: not asked (call failed or unsupported)');
        else for (const q of step.questions) out.push(`Q: ${q.text} -> ${answerLabel(ts.answers[q.id])}`);
      }
      if ((ts.note || '').trim()) out.push(`Note: ${ts.note.trim().replace(/\n/g, ' / ')}`);
    }
    out.push('', '== Environment ==', cfg.getEnvText(), '', '== Log ==', cfg.getLogText() || '(empty)');
    return out.join('\n');
  }

  // ---------- start over ----------
  cfg.startOverBtn.addEventListener('click', () => {
    if (!window.confirm('Start over? Your answers on this page will be cleared.')) return;
    state = freshState();
    save();
    if (cfg.onReset) cfg.onReset();
    go(0);
  });

  const api = { update: () => { if (current && current.update) current.update(); }, go };
  render();
  return api;
}
