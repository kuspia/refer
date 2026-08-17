import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://api.pyjamahr.com/api/career/jobs/?company_slug=smallcase&page=1';
const OUTPUT = new URL('../data/jobs.json', import.meta.url);
const SOURCE = 'https://jobs.pyjamahr.com/smallcase';

const jobs = [];
let next = API;

while (next) {
  const url = new URL(next);
  if (url.origin !== 'https://api.pyjamahr.com' || url.pathname !== '/api/career/jobs/') {
    throw new Error(`Refusing unexpected pagination URL: ${url.href}`);
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`PyjamaHR returned ${response.status} for ${url.href}`);
  const page = await response.json();
  if (!Array.isArray(page.results)) throw new Error('PyjamaHR returned an invalid jobs response.');
  page.results.forEach((job) => {
    const id = String(job.id ?? '');
    const title = typeof job.title === 'string' ? job.title.trim() : '';
    const slug = typeof job.slug === 'string' ? job.slug : '';
    if (!/^\d{1,19}$/.test(id) || !title || !slug) throw new Error(`Invalid role returned for Job ID ${id || 'unknown'}.`);
    jobs.push({ id, title, slug });
  });
  next = page.next;
}

const uniqueJobs = [...new Map(jobs.map((job) => [job.id, job])).values()];
const document = { source: SOURCE, updatedAt: new Date().toISOString(), jobs: uniqueJobs };
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`Saved ${uniqueJobs.length} active smallcase roles to data/jobs.json.`);
