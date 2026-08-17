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
  let confirmationStep = 1;
  let pendingPayload = null;
  let copyResetTimer = null;

  const requiredChecks = [
    () => /^\d{1,19}$/.test(form.jobId.value),
    () => form.jobTitle.value.trim().length > 0,
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

  function showFirstReview(payload) {
    confirmationStep = 1;
    confirmButton.disabled = true;
    document.querySelector('#modal-step').textContent = 'Final review · 1 of 2';
    document.querySelector('#modal-title').textContent = 'Confirm every requirement';
    document.querySelector('#modal-copy').textContent = 'Tap each item to turn it green. If any answer is no, go back and correct it before continuing.';
    document.querySelector('#review-list').innerHTML = `
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>Job ID and job title were copied correctly from the linked smallcase jobs website.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The recommendation is written in the third person—not using I, me, or my.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The third-person recommendation is clear, neatly written, and checked for spelling and grammar errors.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The résumé includes an email address, contact number, GitHub profile, and LinkedIn profile.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The résumé link points to the candidate’s latest and most up-to-date résumé.</span></label>
      <label class="confirm-check"><input type="checkbox" data-confirm-check /><span class="check-icon">✓</span><span>The résumé link is publicly accessible and opens without requesting permission.</span></label>`;
    confirmButton.innerHTML = 'Confirm all to continue <span>→</span>';
    confirmDialog.showModal();
  }

  function showSecondReview() {
    confirmationStep = 2;
    confirmButton.disabled = false;
    document.querySelector('#modal-step').textContent = 'Final confirmation · 2 of 2';
    document.querySelector('#modal-title').textContent = 'Are you sure you want to generate the encrypted link?';
    document.querySelector('#modal-copy').textContent = 'Review the final summary once more. After generation, any correction will require you to create a new link.';
    document.querySelector('#review-list').innerHTML = `
      <div><dt>Role</dt><dd>${escapeHtml(pendingPayload.job.title)} · #${escapeHtml(pendingPayload.job.id)}</dd></div>
      <div><dt>Résumé</dt><dd class="truncate">${escapeHtml(pendingPayload.candidate.resumeUrl)}</dd></div>
      <div><dt>Expected base</dt><dd>${escapeHtml(pendingPayload.candidate.expectedSalary)}</dd></div>
      <div><dt>Recommendation</dt><dd>${pendingPayload.candidate.writeUp.length} characters · third person</dd></div>
      <div><dt>Ratings</dt><dd>${pendingPayload.candidate.communication}/5 communication · ${pendingPayload.candidate.problemSolving}/5 problem solving</dd></div>`;
    confirmButton.innerHTML = 'Yes, generate encrypted link <span>→</span>';
  }

  async function createLink() {
    confirmButton.disabled = true;
    confirmButton.textContent = 'Encrypting…';
    try {
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
  form.jobId.addEventListener('input', (event) => {
    event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 19);
    updateFormState();
  });
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

  confirmButton.addEventListener('click', () => confirmationStep === 1 ? showSecondReview() : createLink());
  document.querySelector('#review-list').addEventListener('change', () => {
    if (confirmationStep !== 1) return;
    const checks = [...document.querySelectorAll('[data-confirm-check]')];
    confirmButton.disabled = checks.length !== 6 || checks.some((check) => !check.checked);
    confirmButton.innerHTML = confirmButton.disabled
      ? 'Confirm all to continue <span>→</span>'
      : 'All confirmed, continue <span>→</span>';
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => confirmDialog.close()));
  copyButton.addEventListener('click', async () => {
    await copyText(generatedLink.value);
    copyButton.textContent = 'Copied to clipboard ✓';
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyButton.textContent = 'Copy again';
    }, 1400);
  });
  document.querySelector('#done-button').addEventListener('click', () => successDialog.close());
  updateExpectedMode();
})();
