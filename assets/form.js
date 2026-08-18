(function () {
  'use strict';

  const form = document.querySelector('#referral-form');
  const generateButton = document.querySelector('#generate-button');
  const completedCount = document.querySelector('#completed-count');
  const confirmDialog = document.querySelector('#confirm-dialog');
  const successDialog = document.querySelector('#success-dialog');
  const confirmButton = document.querySelector('#confirm-button');
  const expectedSalary = document.querySelector('#expected-salary');
  const expectedWrap = document.querySelector('#expected-input-wrap');
  const generatedLink = document.querySelector('#generated-link');
  const copyButton = document.querySelector('#copy-button');
  const roleSelect = document.querySelector('#job-role');
  const tokenSetupDialog = document.querySelector('#token-setup-dialog');
  const tokenInput = document.querySelector('#github-token');
  const tokenSetupStatus = document.querySelector('#token-setup-status');
  const GITHUB_TOKEN_KEY = 'kushagraReferralContentsToken';
  const REPOSITORY_API = 'https://api.github.com/repos/kuspia/refer';
  const COUNTER_URL = 'https://raw.githubusercontent.com/kuspia/refer/main/data/counter.json';
  const OFFICIAL_JOBS_API = 'https://kushagra-referral-jobs.kuspia-referral.workers.dev/jobs';
  const DETAILS_REVIEW_MINIMUM_MS = 20000;
  const ACKNOWLEDGEMENT_MINIMUM_MS = 15000;
  let confirmationStep = 1;
  let pendingPayload = null;
  let copyResetTimer = null;
  let readingTimer = null;
  let readingGateComplete = false;
  const officialRoles = new Map();

  function githubHeaders(token) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async function loadReferralCount() {
    try {
      const response = await fetch(`${COUNTER_URL}?fresh=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const counter = await response.json();
      if (!Number.isSafeInteger(counter.count) || counter.count < 0) return;
      document.querySelector('#referral-count').textContent = counter.count.toLocaleString();
      document.querySelector('#referral-counter').classList.remove('hidden');
    } catch {
      // The form remains fully usable if the public counter cannot be loaded.
    }
  }

  async function loadOfficialRoles() {
    try {
      roleSelect.innerHTML = '<option value="">Loading current smallcase roles…</option>';
      roleSelect.disabled = true;
      const jobsUrl = new URL(OFFICIAL_JOBS_API);
      jobsUrl.searchParams.set('fresh', Date.now());
      const response = await fetch(jobsUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Role list returned ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data.jobs) || data.jobs.length === 0) throw new Error('No active roles were returned.');
      officialRoles.clear();
      roleSelect.innerHTML = '<option value="">Select an active smallcase role</option>';
      data.jobs.forEach((job) => {
        const id = String(job.id);
        if (!/^\d{1,19}$/.test(id) || typeof job.title !== 'string' || !job.title.trim()) return;
        officialRoles.set(id, job.title.trim());
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${job.title.trim()} · Job ID ${id}`;
        roleSelect.append(option);
      });
      if (officialRoles.size === 0) throw new Error('The official role list is invalid.');
      roleSelect.disabled = false;
    } catch (error) {
      roleSelect.innerHTML = '<option value="">Official roles unavailable — reload the page</option>';
      roleSelect.disabled = true;
    }
    updateFormState();
  }

  function syncSelectedRole() {
    const title = officialRoles.get(roleSelect.value) || '';
    form.jobId.value = title ? roleSelect.value : '';
    form.jobTitle.value = title;
    updateFormState();
  }

  async function payloadHasOfficialRole(payload) {
    const jobsUrl = new URL(OFFICIAL_JOBS_API);
    jobsUrl.searchParams.set('fresh', Date.now());
    const response = await fetch(jobsUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('The official role list could not be verified. Reload the page and try again.');
    const data = await response.json();
    return Array.isArray(data.jobs) && data.jobs.some((job) =>
      String(job.id) === payload.job.id && job.title === payload.job.title
    );
  }

  function openTokenSetupIfRequested() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') !== '1') return;
    tokenSetupStatus.textContent = localStorage.getItem(GITHUB_TOKEN_KEY)
      ? 'A token is already saved on this device. You can replace or clear it.'
      : 'No token is saved on this device.';
    tokenSetupDialog.showModal();
  }

  async function verifyAndSaveToken() {
    const token = tokenInput.value.trim();
    if (!token) {
      tokenSetupStatus.textContent = 'Paste a token first.';
      return;
    }
    const button = document.querySelector('#save-github-token');
    button.disabled = true;
    button.textContent = 'Verifying…';
    tokenSetupStatus.textContent = 'Checking repository and Contents access…';
    try {
      const response = await fetch(REPOSITORY_API, { headers: githubHeaders(token), cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Token rejected. Check its expiry and Contents permission.' : `GitHub returned ${response.status}.`);
      const repository = await response.json();
      if (!repository?.permissions?.push) throw new Error('The token can read this repository but cannot update files. Grant Contents: read and write.');
      localStorage.setItem(GITHUB_TOKEN_KEY, token);
      tokenInput.value = '';
      tokenSetupStatus.textContent = 'Verified and saved on this device ✓';
    } catch (error) {
      tokenSetupStatus.textContent = error.message || 'Could not verify the token.';
    } finally {
      button.disabled = false;
      button.textContent = 'Verify & save';
    }
  }

  const requiredChecks = [
    () => /^\d{1,19}$/.test(form.jobId.value) && officialRoles.has(form.jobId.value),
    () => officialRoles.get(form.jobId.value) === form.jobTitle.value,
    () => form.resumeUrl.validity.valid && /^https?:\/\//i.test(form.resumeUrl.value),
    () => form.currentSalary.validity.valid,
    () => form.expectedMode.value === 'standards' || expectedSalary.validity.valid,
    () => form.writeUp.value.trim().length >= 350 && form.writeUp.value.trim().length <= 1500,
    () => Boolean(form.communication.value && form.problemSolving.value)
  ];

  function updateFormState() {
    document.querySelectorAll('[data-count-for]').forEach((counter) => {
      counter.textContent = document.getElementById(counter.dataset.countFor).value.length;
    });
    const complete = requiredChecks.filter((check) => check()).length;
    completedCount.textContent = complete;
    generateButton.disabled = complete !== requiredChecks.length || !form.checkValidity();
  }

  function updateExpectedMode() {
    const usesStandards = form.expectedMode.value === 'standards';
    expectedSalary.disabled = usesStandards;
    expectedSalary.required = !usesStandards;
    expectedWrap.classList.toggle('is-disabled', usesStandards);
    updateFormState();
  }

  function readPayload() {
    return {
      v: 1,
      createdAt: new Date().toISOString(),
      job: {
        id: form.jobId.value.trim(),
        title: form.jobTitle.value.trim(),
        description: ''
      },
      candidate: {
        name: '',
        email: '',
        resumeUrl: form.resumeUrl.value.trim(),
        currentSalary: `${Number(form.currentSalary.value)} LPA`,
        expectedSalary: form.expectedMode.value === 'standards' ? 'As per company standards' : `${Number(expectedSalary.value)} LPA`,
        writeUp: form.writeUp.value.trim(),
        communication: Number(form.communication.value),
        problemSolving: Number(form.problemSolving.value)
      }
    };
  }

  // Positional wire format keeps the self-contained URL as short as possible.
  function toWire(payload) {
    return [
      payload.v, payload.createdAt,
      payload.job.id, payload.job.title, payload.job.description,
      payload.candidate.name, payload.candidate.email, payload.candidate.resumeUrl,
      payload.candidate.currentSalary, payload.candidate.expectedSalary, payload.candidate.writeUp,
      payload.candidate.communication, payload.candidate.problemSolving
    ];
  }

  function clearReadingTimer() {
    if (readingTimer) window.clearTimeout(readingTimer);
    readingTimer = null;
    readingGateComplete = false;
  }

  function setReviewTimerVisible(visible) {
    const timer = document.querySelector('#review-timer');
    timer.classList.toggle('hidden', !visible);
    if (!visible) return;
    document.querySelector('#review-bomb').classList.remove('is-complete');
  }

  function startReadingTimer(durationMs) {
    clearReadingTimer();
    setReviewTimerVisible(true);
    const startedAt = performance.now();

    const tick = () => {
      const ratio = Math.min(1, (performance.now() - startedAt) / durationMs);
      if (ratio < 1) {
        readingTimer = window.setTimeout(tick, 100);
        return;
      }
      readingTimer = null;
      readingGateComplete = true;
      document.querySelector('#review-timer').classList.add('is-complete');
      document.querySelector('#review-bomb').classList.add('is-complete');
      updateChecklistAction();
    };

    document.querySelector('#review-timer').classList.remove('is-complete');
    tick();
  }

  function updateChecklistAction() {
    if (confirmationStep !== 1 && confirmationStep !== 3) return;
    const selector = confirmationStep === 1 ? '[data-confirm-check]' : '[data-acknowledgement]';
    const checks = [...document.querySelectorAll(selector)];
    const allChecked = checks.length > 0 && checks.every((check) => check.checked);
    const actionReady = allChecked && readingGateComplete;
    confirmButton.disabled = !actionReady;

    if (confirmationStep === 1) {
      confirmButton.innerHTML = actionReady
        ? 'All confirmed, continue <span>→</span>'
        : allChecked
          ? 'Keep reading to continue <span>→</span>'
          : 'Confirm all to continue <span>→</span>';
    } else {
      confirmButton.innerHTML = actionReady
        ? 'Acknowledged, generate link <span>→</span>'
        : allChecked
          ? 'Keep reading to continue <span>→</span>'
          : 'Acknowledge both to continue <span>→</span>';
    }
  }

  function showFirstReview(payload) {
    confirmationStep = 1;
    document.querySelector('#modal-step').textContent = 'Details review · 1 of 2';
    document.querySelector('#modal-title').textContent = 'Confirm every requirement';
    document.querySelector('#modal-copy').textContent = 'Tap each item to turn it green. If any answer is no, go back and correct it before continuing.';
    document.querySelector('#review-list').innerHTML = `
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The correct active role was selected from the official smallcase careers listing.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The recommendation is written in the third person.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The third-person recommendation is clear, neatly written, and checked for spelling and grammar errors.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>Latest résumé is public and includes email, phone, GitHub, and LinkedIn.</span></label>`;
    startReadingTimer(DETAILS_REVIEW_MINIMUM_MS);
    updateChecklistAction();
    confirmDialog.showModal();
  }

  function showSecondReview() {
    confirmationStep = 2;
    clearReadingTimer();
    setReviewTimerVisible(false);
    confirmButton.disabled = false;
    document.querySelector('#modal-step').textContent = 'Details review · 2 of 2';
    document.querySelector('#modal-title').textContent = 'Are all these details correct?';
    document.querySelector('#modal-copy').textContent = 'Review the final summary once more. You will acknowledge the referral process on the next screen.';
    document.querySelector('#review-list').innerHTML = `
      <div><dt>Role</dt><dd>${escapeHtml(pendingPayload.job.title)} · #${escapeHtml(pendingPayload.job.id)}</dd></div>
      <div><dt>Résumé</dt><dd class="truncate">${escapeHtml(pendingPayload.candidate.resumeUrl)}</dd></div>
      <div><dt>Expected base</dt><dd>${escapeHtml(pendingPayload.candidate.expectedSalary)}</dd></div>
      <div><dt>Recommendation</dt><dd>${pendingPayload.candidate.writeUp.length} characters · third person</dd></div>
      <div><dt>Ratings</dt><dd>${pendingPayload.candidate.communication}/5 communication · ${pendingPayload.candidate.problemSolving}/5 problem solving</dd></div>`;
    confirmButton.innerHTML = 'Details are correct, continue <span>→</span>';
  }

  function showAcknowledgement() {
    confirmationStep = 3;
    document.querySelector('#modal-step').textContent = 'Candidate acknowledgement';
    document.querySelector('#modal-title').textContent = 'Please acknowledge before sharing';
    document.querySelector('#modal-copy').textContent = 'Turn both items green to confirm that you understand the referral process.';
    document.querySelector('#review-list').innerHTML = `
      <label class="confirm-check"><input type="checkbox" data-acknowledgement /><span class="check-icon">✓</span><span>I understand that I do not need to apply separately through the job portal. If I am shortlisted, HR will contact me directly.</span></label>
      <label class="confirm-check"><input type="checkbox" data-acknowledgement /><span class="check-icon">✓</span><span>I understand that Kushagra cannot track my application status. I will not follow up with him for updates; if I am shortlisted, HR will contact me directly.</span></label>`;
    startReadingTimer(ACKNOWLEDGEMENT_MINIMUM_MS);
    updateChecklistAction();
  }

  async function createLink() {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Verifying role…';
    try {
      if (!await payloadHasOfficialRole(pendingPayload)) {
        confirmDialog.close();
        pendingPayload = null;
        alert('Link not generated. Select an active role whose Job ID and title exactly match the official smallcase careers listing.');
        roleSelect.focus();
        return;
      }
      confirmButton.textContent = 'Encrypting…';
      const token = await window.ReferralCodec.pack(toWire(pendingPayload));
      const mailPage = new URL('./mail/', window.location.href);
      mailPage.search = '';
      mailPage.hash = token;
      generatedLink.value = mailPage.href;
      document.querySelector('#link-stats').textContent = `Total length: ${mailPage.href.length.toLocaleString()} characters.`;
      clearTimeout(copyResetTimer);
      copyButton.disabled = false;
      copyButton.textContent = 'Copy again';
      confirmDialog.close();
      await copyText(mailPage.href);
      successDialog.showModal();
    } catch (error) {
      confirmButton.disabled = false;
      confirmButton.textContent = 'Try again';
      alert(error.message || 'Could not create the secure link.');
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      generatedLink.focus();
      generatedLink.select();
      document.execCommand('copy');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  form.addEventListener('input', updateFormState);
  form.addEventListener('change', updateFormState);
  roleSelect.addEventListener('change', syncSelectedRole);
  document.querySelectorAll('input[name="expectedMode"]').forEach((radio) => radio.addEventListener('change', updateExpectedMode));
  document.querySelectorAll('[data-rating-group]').forEach((group) => {
    group.addEventListener('change', () => {
      const selected = group.querySelector('input:checked');
      group.querySelector('[data-rating-value]').textContent = selected ? `${selected.value} out of 5` : 'Not rated';
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity() || requiredChecks.some((check) => !check())) {
      form.reportValidity();
      return;
    }
    pendingPayload = readPayload();
    showFirstReview(pendingPayload);
  });

  confirmButton.addEventListener('click', () => {
    if (confirmationStep === 1) showSecondReview();
    else if (confirmationStep === 2) showAcknowledgement();
    else createLink();
  });
  document.querySelector('#review-list').addEventListener('change', () => {
    updateChecklistAction();
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => confirmDialog.close()));
  confirmDialog.addEventListener('close', clearReadingTimer);
  copyButton.addEventListener('click', async () => {
    await copyText(generatedLink.value);
    copyButton.textContent = 'Copied to clipboard ✓';
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyButton.textContent = 'Copy again';
    }, 1400);
  });
  document.querySelector('#done-button').addEventListener('click', () => {
    successDialog.close();
    form.reset();
    syncSelectedRole();
    pendingPayload = null;
    confirmationStep = 1;
    generatedLink.value = '';
    document.querySelector('#link-stats').textContent = '';
    copyButton.textContent = 'Copy again';
    document.querySelectorAll('[data-rating-value]').forEach((value) => { value.textContent = 'Not rated'; });
    updateExpectedMode();
    updateFormState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.querySelector('#save-github-token').addEventListener('click', verifyAndSaveToken);
  document.querySelector('#clear-github-token').addEventListener('click', () => {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    tokenInput.value = '';
    tokenSetupStatus.textContent = 'Saved token cleared from this device.';
  });
  document.querySelector('#close-token-setup').addEventListener('click', () => tokenSetupDialog.close());
  updateExpectedMode();
  loadOfficialRoles();
  loadReferralCount();
  openTokenSetupIfRequested();
})();
