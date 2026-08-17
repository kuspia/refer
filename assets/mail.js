(function () {
  'use strict';

  const RECIPIENT = 'refer@smallcase.pyjamahr.com';
  const REFERRER_NAME = 'Kushagra';
  const loadingState = document.querySelector('#loading-state');
  const errorState = document.querySelector('#error-state');
  const mailReview = document.querySelector('#mail-review');
  let gmailUrl = '';

  function fromWire(wire) {
    if (!Array.isArray(wire) || wire.length !== 13) throw new Error('The referral data has an unsupported format.');
    return {
      v: wire[0], createdAt: wire[1],
      job: { id: wire[2], title: wire[3], description: wire[4] },
      candidate: {
        name: wire[5], email: wire[6], resumeUrl: wire[7], currentSalary: wire[8],
        expectedSalary: wire[9], writeUp: wire[10], communication: wire[11], problemSolving: wire[12]
      }
    };
  }

  function isValidPayload(payload) {
    return payload?.v === 1 &&
      /^\d{1,19}$/.test(payload.job?.id) &&
      typeof payload.job?.title === 'string' && payload.job.title.length <= 100 &&
      typeof payload.job?.description === 'string' && payload.job.description.length <= 200 &&
      typeof payload.candidate?.name === 'string' && payload.candidate.name.length <= 100 &&
      typeof payload.candidate?.email === 'string' && payload.candidate.email.length <= 254 &&
      /^https?:\/\//i.test(payload.candidate?.resumeUrl) && payload.candidate.resumeUrl.length <= 500 &&
      typeof payload.candidate?.writeUp === 'string' && payload.candidate.writeUp.length >= 350 && payload.candidate.writeUp.length <= 1500 &&
      [1, 2, 3, 4, 5].includes(payload.candidate?.communication) &&
      [1, 2, 3, 4, 5].includes(payload.candidate?.problemSolving);
  }

  function buildEmail(payload) {
    const subject = `Referral | Job ID ${payload.job.id} | ${payload.job.title}`;
    const body = [
      'Hi Team,',
      '',
      `I would like to refer ${payload.candidate.name} for the ${payload.job.title} role (Job ID: ${payload.job.id}).`,
      '',
      'JOB DETAILS',
      `Job title: ${payload.job.title}`,
      `Job ID: ${payload.job.id}`,
      '',
      'CANDIDATE DETAILS',
      `Name: ${payload.candidate.name}`,
      `Email: ${payload.candidate.email}`,
      `Résumé: ${payload.candidate.resumeUrl}`,
      `Current fixed base salary: ${payload.candidate.currentSalary}`,
      `Expected fixed base salary: ${payload.candidate.expectedSalary}`,
      '',
      'WHY THEY ARE A GOOD FIT',
      payload.candidate.writeUp,
      '',
      'PROFICIENCY',
      `Communication: ${payload.candidate.communication}/5`,
      `Problem solving: ${payload.candidate.problemSolving}/5`,
      '',
      'Regards,',
      REFERRER_NAME
    ].join('\n');
    return { subject, body };
  }

  function text(elementId, value) {
    document.getElementById(elementId).textContent = value;
  }

  function render(payload) {
    const email = buildEmail(payload);
    document.title = `${payload.candidate.name} · Referral review`;
    text('candidate-heading', `${payload.candidate.name} · ${payload.job.title}`);
    text('email-to', RECIPIENT);
    text('email-subject', email.subject);
    text('email-body', email.body);
    document.querySelector('#summary-grid').innerHTML = '';
    [
      ['Candidate', payload.candidate.name],
      ['Role', payload.job.title],
      ['Job ID', payload.job.id],
      ['Current base', payload.candidate.currentSalary],
      ['Expected base', payload.candidate.expectedSalary],
      ['Ratings', `${payload.candidate.communication}/5 · ${payload.candidate.problemSolving}/5`]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'summary-item';
      const labelNode = document.createElement('span');
      labelNode.textContent = label;
      const valueNode = document.createElement('strong');
      valueNode.textContent = value;
      item.append(labelNode, valueNode);
      document.querySelector('#summary-grid').append(item);
    });
    gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(RECIPIENT)}&su=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    loadingState.classList.add('hidden');
    mailReview.classList.remove('hidden');
  }

  function showError(message) {
    loadingState.classList.add('hidden');
    mailReview.classList.add('hidden');
    text('error-message', message);
    errorState.classList.remove('hidden');
  }

  async function init() {
    const token = window.location.hash.slice(1);
    if (!token) {
      showError('The encrypted part after # is missing. Ask the candidate to copy and share the complete link.');
      return;
    }
    try {
      const payload = fromWire(await window.ReferralCodec.unpack(token));
      if (!isValidPayload(payload)) throw new Error('The referral data does not pass validation. Please ask the candidate to generate a new link.');
      render(payload);
    } catch (error) {
      showError(error.message || 'The secure link is incomplete or damaged.');
    }
  }

  document.querySelector('#open-gmail').addEventListener('click', () => {
    if (gmailUrl) window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  });
  init();
})();
