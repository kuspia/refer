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
  let confirmationStep = 1;
  let pendingPayload = null;

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
    confirmButton.disabled = false;
    document.querySelector('#modal-step').textContent = 'Final review · 1 of 2';
    document.querySelector('#modal-title').textContent = 'Is everything correct?';
    document.querySelector('#modal-copy').textContent = 'Please check these important details. They will be included in the referral email.';
    document.querySelector('#review-list').innerHTML = `
      <div><dt>Role</dt><dd>${escapeHtml(payload.job.title)} · #${escapeHtml(payload.job.id)}</dd></div>
      <div><dt>Résumé</dt><dd class="truncate">${escapeHtml(payload.candidate.resumeUrl)}</dd></div>
      <div><dt>Expected base</dt><dd>${escapeHtml(payload.candidate.expectedSalary)}</dd></div>`;
    confirmButton.innerHTML = 'Yes, continue <span>→</span>';
    confirmDialog.showModal();
  }

  function showSecondReview() {
    confirmationStep = 2;
    document.querySelector('#modal-step').textContent = 'Final confirmation · 2 of 2';
    document.querySelector('#modal-title').textContent = 'Ready to lock these details?';
    document.querySelector('#modal-copy').textContent = 'Once generated, changes require a new link. Please confirm that the résumé is publicly accessible and every detail is accurate.';
    document.querySelector('#review-list').innerHTML = `
      <div><dt>Résumé access</dt><dd>Publicly accessible</dd></div>
      <div><dt>Recommendation</dt><dd>${pendingPayload.candidate.writeUp.length} characters · one paragraph</dd></div>
      <div><dt>Ratings</dt><dd>${pendingPayload.candidate.communication}/5 communication · ${pendingPayload.candidate.problemSolving}/5 problem solving</dd></div>`;
    confirmButton.innerHTML = 'Confirm &amp; create link <span>→</span>';
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
      document.querySelector('#copy-button').textContent = 'Copy again';
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
  form.writeUp.addEventListener('input', (event) => {
    const isSingleParagraph = !/[\r\n]/.test(event.currentTarget.value);
    event.currentTarget.setCustomValidity(isSingleParagraph ? '' : 'Please write the recommendation as one paragraph without line breaks.');
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
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => confirmDialog.close()));
  document.querySelector('#copy-button').addEventListener('click', async (event) => {
    await copyText(generatedLink.value);
    event.currentTarget.textContent = 'Copied ✓';
  });
  document.querySelector('#done-button').addEventListener('click', () => successDialog.close());
  updateExpectedMode();
})();
