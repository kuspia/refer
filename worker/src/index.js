const FIRST_PAGE = 'https://api.pyjamahr.com/api/career/jobs/?company_slug=smallcase&page=1';
const ALLOWED_ORIGIN = 'https://kuspia.github.io';

function responseHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
    Expires: '0',
    Pragma: 'no-cache',
    Vary: 'Origin'
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders() });
}

async function fetchAllJobs() {
  const jobs = [];
  let next = FIRST_PAGE;
  let pages = 0;

  while (next) {
    pages += 1;
    if (pages > 50) throw new Error('PyjamaHR returned too many pages.');
    const url = new URL(next);
    if (url.origin !== 'https://api.pyjamahr.com' || url.pathname !== '/api/career/jobs/') {
      throw new Error('PyjamaHR returned an unexpected pagination URL.');
    }
    url.searchParams.set('_fresh', Date.now());
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`PyjamaHR returned ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page.results)) throw new Error('PyjamaHR returned an invalid response.');
    page.results.forEach((job) => {
      const id = String(job.id ?? '');
      const title = typeof job.title === 'string' ? job.title.trim() : '';
      if (!/^\d{1,19}$/.test(id) || !title) throw new Error('PyjamaHR returned an invalid role.');
      jobs.push({ id, title });
    });
    next = page.next;
  }

  return [...new Map(jobs.map((job) => [job.id, job])).values()];
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders() });
    if (request.method !== 'GET' || url.pathname !== '/jobs') return json({ error: 'Not found.' }, 404);
    try {
      return json({ source: FIRST_PAGE, fetchedAt: new Date().toISOString(), jobs: await fetchAllJobs() });
    } catch (error) {
      return json({ error: error.message || 'Could not load official roles.' }, 502);
    }
  }
};
