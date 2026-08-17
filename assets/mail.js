(function () {
  'use strict';

  const RECIPIENT = 'refer@smallcase.pyjamahr.com';
  const REFERRER_NAME = 'Kushagra';
  const GITHUB_TOKEN_KEY = 'kushagraReferralContentsToken';
  const COUNTER_API = 'https://api.github.com/repos/kuspia/refer/contents/data/counter.json';
  const loadingState = document.querySelector('#loading-state');
  const errorState = document.querySelector('#error-state');
  const mailReview = document.querySelector('#mail-review');
  const composeLink = document.querySelector('#open-gmail');

  function githubHeaders(githubToken, withBody = false) {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      ...(withBody ? { 'Content-Type': 'application/json' } : {}),
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function decodeBase64(value) {
    return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), (character) => character.charCodeAt(0)));
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  async function recordReferral(githubToken, attempt = 0) {
    const readResponse = await fetch(`${COUNTER_API}?ref=main&fresh=${Date.now()}`, {
      headers: githubHeaders(githubToken),
      cache: 'no-store',
      keepalive: true
    });
    if (!readResponse.ok) throw new Error(`GitHub counter read returned ${readResponse.status}.`);
    const file = await readResponse.json();
    const counter = JSON.parse(decodeBase64(file.content));
    if (!Number.isSafeInteger(counter.count) || counter.count < 0 || typeof file.sha !== 'string') {
      throw new Error('The counter file has an invalid format.');
    }
    const nextCounter = `${JSON.stringify({ count: counter.count + 1, updatedAt: new Date().toISOString() }, null, 2)}\n`;
    const writeResponse = await fetch(COUNTER_API, {
      method: 'PUT',
      headers: githubHeaders(githubToken, true),
      body: JSON.stringify({
        message: 'Increment referral counter',
        content: encodeBase64(nextCounter),
        sha: file.sha,
        branch: 'main'
      }),
      keepalive: true
    });
    if (writeResponse.ok) return;
    if ((writeResponse.status === 409 || writeResponse.status === 422) && attempt === 0) {
      return recordReferral(githubToken, 1);
    }
    throw new Error(`GitHub counter update returned ${writeResponse.status}.`);
  }

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
      'CANDIDATE DETAILS',
      `Résumé: ${payload.candidate.resumeUrl}`,
      `Current fixed base salary: ${payload.candidate.currentSalary}`,
      `Expected fixed base salary: ${payload.candidate.expectedSalary}`,
      '',
      'WHY THEY ARE A GOOD FIT',
      payload.candidate.writeUp,
      '',
      'PROFICIENCY (SELF-RATED BY CANDIDATE)',
      `Communication: ${payload.candidate.communication}/5`,
      `Problem solving: ${payload.candidate.problemSolving}/5`,
      '',
      'Regards,',
      REFERRER_NAME,
      'Smallcase (Engineering Team)'
    ].join('\n');
    return { subject, body };
  }

  function text(elementId, value) {
    document.getElementById(elementId).textContent = value;
  }

  function render(payload) {
    const email = buildEmail(payload);
    document.title = 'Referral ready · Open in Gmail';
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(RECIPIENT)}&su=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    const mailtoUrl = `mailto:${RECIPIENT}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
    const isAndroid = /Android/i.test(navigator.userAgent);
    composeLink.href = isAndroid ? mailtoUrl : gmailUrl;
    composeLink.innerHTML = isAndroid
      ? 'Open in Android email app <span aria-hidden="true">↗</span>'
      : 'Open in Gmail <span aria-hidden="true">↗</span>';
    if (isAndroid) {
      composeLink.removeAttribute('target');
      composeLink.removeAttribute('rel');
      composeLink.addEventListener('click', async (event) => {
        const githubToken = localStorage.getItem(GITHUB_TOKEN_KEY);
        if (!githubToken) return;
        event.preventDefault();
        composeLink.classList.add('is-busy');
        composeLink.textContent = 'Updating counter…';
        try {
          await recordReferral(githubToken);
        } catch (error) {
          console.warn('Referral counter update failed:', error.message);
        } finally {
          composeLink.classList.remove('is-busy');
          composeLink.innerHTML = 'Open in Android email app <span aria-hidden="true">↗</span>';
          window.location.assign(mailtoUrl);
        }
      });
    } else {
      composeLink.target = '_blank';
      composeLink.rel = 'noopener noreferrer';
    }
    loadingState.classList.add('hidden');
    mailReview.classList.remove('hidden');
  }

  function showError(message) {
    loadingState.classList.add('hidden');
    mailReview.classList.add('hidden');
    text('error-message', message);
    errorState.classList.remove('hidden');
  }

  async function verifyOfficialRole(payload) {
    const jobsUrl = new URL('../data/jobs.json', document.baseURI);
    jobsUrl.searchParams.set('fresh', Date.now());
    const response = await fetch(jobsUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('The official role list is unavailable. Reload this page before opening Gmail.');
    const data = await response.json();
    const matches = Array.isArray(data.jobs) && data.jobs.some((job) => String(job.id) === payload.job.id && job.title === payload.job.title);
    if (!matches) throw new Error('This Job ID and title do not match an active role in the official smallcase careers listing. Do not send this referral.');
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
      await verifyOfficialRole(payload);
      render(payload);
    } catch (error) {
      showError(error.message || 'The secure link is incomplete or damaged.');
    }
  }

  init();
})();
