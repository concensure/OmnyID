import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const blogRoot = resolve(projectRoot, 'wedding', 'blog');
const index = readFileSync(resolve(projectRoot, 'wedding', 'blog.html'), 'utf8');
const taxonomy = JSON.parse(readFileSync(resolve(projectRoot, 'wedding', 'blog-taxonomy.json'), 'utf8'));
const csv = readFileSync(resolve(projectRoot, 'Documents', 'marketing', 'wedding planning', 'posts', 'blog', 'blog-publication-catalogue.csv'), 'utf8');
const failures = [];
const articles = readdirSync(blogRoot).filter((name) => name.endsWith('.html')).sort();
const catalogueRows = csv.trim().split(/\r?\n/).slice(1);
const indexed = new Set(Array.from(index.matchAll(/href="blog\/([^"]+\.html)"/g), (match) => match[1]));
const stages = new Set();
const expectedArticleCount = 55;

if (articles.length !== expectedArticleCount) failures.push(`expected ${expectedArticleCount} articles, found ${articles.length}`);
if (indexed.size !== articles.length) failures.push(`index has ${indexed.size} unique article links for ${articles.length} articles`);
if (catalogueRows.length !== articles.length) failures.push(`CSV has ${catalogueRows.length} records for ${articles.length} articles`);
if ((index.match(/<!-- omnyid-catalogue:start -->/g) || []).length !== 1) failures.push('generated catalogue block is not singular');

for (const name of articles) {
  const slug = name.replace(/\.html$/, '');
  const html = readFileSync(resolve(blogRoot, name), 'utf8');
  const tags = taxonomy[slug];
  if (!tags) { failures.push(`${name}: missing taxonomy record`); continue; }
  stages.add(tags.stage);
  if (!Array.isArray(tags.stakeholders) || !tags.stakeholders.length) failures.push(`${name}: no stakeholder tag`);
  if (!Array.isArray(tags.emotions) || !tags.emotions.length) failures.push(`${name}: no emotion tag`);
  if (!tags.stage) failures.push(`${name}: no stage tag`);
  if (!html.includes('name="wedding:search-tags"')) failures.push(`${name}: no search metadata`);
  if (!html.includes('class="article-taxonomy"')) failures.push(`${name}: no in-article tag display`);
  if (!indexed.has(name)) failures.push(`${name}: not linked from blog index`);
  const cardPattern = new RegExp(`<a\\s+class="blog-card"[^>]*href="blog/${name.replace('.', '\\.')}"[^>]*>`);
  const card = index.match(cardPattern)?.[0] || '';
  if (!/data-keywords="[^"]+"/.test(card)) failures.push(`${name}: index card lacks searchable taxonomy`);
}

for (const required of ['Plan & budget', 'Venue & date', 'Celebrant & suppliers', 'Details & invites', 'Final prep', 'Wedding & after']) {
  if (!stages.has(required)) failures.push(`catalogue does not cover stage ${required}`);
}
if (Object.keys(taxonomy).length !== articles.length) failures.push('taxonomy contains an article-count mismatch');

if (failures.length) {
  console.error('Blog catalogue smoke failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Blog catalogue smoke passed.');
