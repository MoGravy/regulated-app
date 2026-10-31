import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const cli = new URL('../scripts/check-native-release-assets.mjs', import.meta.url);
const api = 'https://regulatedapp.co';
const db = 'https://aynyvirtzioyeshauith.supabase.co';
const addFile = (files, manifest, path, bytes) => {
  files[path] = bytes;
  manifest.files.push({ path, sha256: '' });
};
const nestedEntry = (files, manifest, root, html) => {
  mkdirSync(join(root, 'nested'), { recursive: true });
  delete files['index.html'];
  rmSync(join(root, 'index.html'));
  manifest.files = manifest.files.filter(item => item.path !== 'index.html');
  manifest.entrypoint = 'nested/index.html';
  addFile(files, manifest, 'nested/index.html', html);
};
const cases = [
  ['valid', null, true],
  ...['<!---->', '<!----!>'].flatMap(prefix => [
    ['external after empty comment ' + prefix, f => { f['index.html'] = prefix + '<script src="https://example.com/x.js"></script>'; }],
    ['missing after empty comment ' + prefix, f => { f['index.html'] = prefix + '<script src="missing.js"></script>'; }],
    ['local after empty comment ' + prefix, f => { f['index.html'] = prefix + '<script src="/assets/app.js"></script>'; }, true],
  ]),
  ['stylesheet after empty comment', f => { f['index.html'] = '<!----><link rel="stylesheet" href="missing.css">'; }],
  ['base dot directory requires assets', (f, m, root) => {
    addFile(f, m, 'app.js', f['assets/app.js']);
    delete f['assets/app.js'];
    rmSync(join(root, 'assets/app.js'));
    m.files = m.files.filter(item => item.path !== 'assets/app.js');
    m.runtime_targets.evidence_file = 'app.js';
    f['index.html'] = '<base href="/assets/."><script src="app.js"></script>';
  }],
  ['base dot directory valid target', f => { f['index.html'] = '<base href="/assets/."><script src="app.js"></script>'; }, true],
  ...['%2f', '%2F'].flatMap(slash => [
    ['encoded slash base wrong target ' + slash, f => { f['index.html'] = `<base href="/assets${slash}placeholder"><script src="app.js"></script>`; }],
    ['encoded slash base valid target ' + slash, (f, m, root) => {
      addFile(f, m, 'app.js', f['assets/app.js']);
      delete f['assets/app.js'];
      rmSync(join(root, 'assets/app.js'));
      m.files = m.files.filter(item => item.path !== 'assets/app.js');
      m.runtime_targets.evidence_file = 'app.js';
      f['index.html'] = `<base href="/assets${slash}placeholder"><script src="app.js"></script>`;
    }, true],
  ]),
  ...['', '.', '?view=preview'].flatMap(href => [
    ['nested base rejects root substitute ' + href, (f, m, root) => {
      nestedEntry(f, m, root, `<base href="${href}"><script src="app.js"></script>`);
      addFile(f, m, 'app.js', 'export default 1;');
    }],
    ['nested base valid target ' + href, (f, m, root) => {
      nestedEntry(f, m, root, `<base href="${href}"><script src="app.js"></script>`);
      addFile(f, m, 'nested/app.js', 'export default 1;');
    }, true],
  ]),
  ...['title', 'textarea', 'style', 'script'].map(tag => ['valid Unicode before ' + tag + ' closing tag', f => { f['index.html'] = `<${tag}>\u0130</${tag}><script src="/assets/app.js"></script>`; }, true]),

  ...['title', 'textarea', 'style', 'script'].map(tag => ['Unicode before ' + tag + ' closing tag', f => { f['index.html'] = `<${tag}>\u0130</${tag}><script src="https://example.com/x.js"></script>`; }]),
  ['late base cannot repair earlier script path', f => { f['index.html'] = '<script src="app.js"></script><base href="/assets/">'; }],
  ['root-relative script before late base', f => { f['index.html'] = '<script src="/assets/app.js"></script><base href="/missing/">'; }, true],

  ...['<!-->', '<!--->', '<?ignored " >', '<!ignored " >', '<div data-x=unquoted" >'].map(prefix => ['active script after ' + prefix, f => { f['index.html'] = prefix + '<script src="https://example.com/x.js"></script>">'; }]),
  ['bogus comment contains inactive script', f => { f['index.html'] = '<?ignored <script src="https://example.com/x.js">'; }, true],
  ['abrupt empty comment before local script', f => { f['index.html'] = '<!--><script src="/assets/app.js"></script>'; }, true],

  ['script quoted comment marker', f => { f['index.html'] = '<script>const text = "<!--";</script><script src="/assets/app.js"></script>'; }, true],
  ['ambiguous nested script refused', f => { f['index.html'] = '<script><!--<script></script>--></script>'; }],
  ...['noscript', 'plaintext', 'svg', 'math', 'template'].map(tag => ['unsupported ' + tag + ' refused', f => { f['index.html'] = `<${tag}></${tag}>`; }]),
  ['title RCDATA comment marker', f => { f['index.html'] = '<title><!--</title><script src="https://example.com/x.js"></script>'; }],
  ['textarea RCDATA comment marker', f => { f['index.html'] = '<textarea><!--</textarea><script src="https://example.com/x.js"></script>'; }],
  ...['title', 'textarea', 'style', 'xmp', 'iframe', 'noembed', 'noframes'].map(tag => [tag + ' inactive markup', f => { f['index.html'] = `<${tag}><script src="https://example.com/x.js"></script></${tag}><script src="/assets/app.js"></script>`; }, true]),
  ...['script', 'style'].map(tag => [tag + ' raw comment marker', f => { f['index.html'] = `<${tag}><!--</${tag}><script src="https://example.com/x.js"></script>`; }]),
  ['ordinary text before external script', f => { f['index.html'] = 'ordinary text &lt;!--<script src="https://example.com/x.js"></script>'; }],
  ['ordinary text with valid comment', f => { f['index.html'] = 'ordinary text<!-- <script src="https://example.com/x.js"></script> --><script src="/assets/app.js"></script>'; }, true],
  ['case-insensitive RCDATA close', f => { f['index.html'] = '<TITLE><!--</TiTlE ><script src="https://example.com/x.js"></script>'; }],
  ['RCDATA close-name prefix stays text', f => { f['index.html'] = '<title></titlex><script src="https://example.com/x.js"></script></title>'; }, true],
  ['comment marker in double-quoted attribute', f => { f['index.html'] = '<div title="<!--"></div><script src="https://example.com/x.js"></script>'; }],
  ['comment marker in single-quoted attribute', f => { f['index.html'] = "<div title='<!--'></div><script src='https://example.com/x.js'></script>"; }],
  ['quoted comment marker with local script', f => { f['index.html'] = '<div title="<!-- >"></div><script src="/assets/app.js"></script>'; }, true],
  ['quoted comment end leaves following comment active', f => { f['index.html'] = '<div title="-->"></div><!-- <script src="https://example.com/x.js"></script> -->'; }, true],
  ['quoted marker before active base', f => { f['index.html'] = '<div title="<!--"></div><base href="/missing/"><script src="app.js"></script>'; }],
  ['comment then active external script', f => { f['index.html'] = '<!-- <div title="<!--"> --><script src="https://example.com/x.js"></script>'; }],
  ['commented external script', f => { f['index.html'] += '<!-- <script src="https://example.com/evil.js"></script> -->'; }, true],
  ['first base wins', f => { f['index.html'] = '<base href="/missing/"><base href="/assets/"><script src="app.js"></script>'; }],
  ['later base ignored', f => { f['index.html'] = '<base href="/assets/"><base href="https://example.com/"><script src="app.js"></script>'; }, true],
  ['commented base ignored', f => { f['index.html'] = '<!-- <base href="/missing/"> --><base href="/assets/"><script src="app.js"></script>'; }, true],
  ['quoted greater-than external script', f => { f['index.html'] = '<script data-x=">" src="https://example.com/evil.js"></script>'; }],
  ['quoted greater-than local script', f => { f['index.html'] = '<script data-x=">" src="/assets/app.js"></script>'; }, true],
  ['quoted greater-than external base', f => { f['index.html'] += "<base data-x='>' href='https://example.com/'>"; }],
  ['quoted greater-than external style', f => { f['index.html'] += '<link data-x=">" rel="stylesheet" href="https://example.com/evil.css">'; }],
  ['unterminated attribute', f => { f['index.html'] = '<script data-x="> src="https://example.com/evil.js>'; }],
  ['whitespace-prefixed external script matching listed local path', (f, m, root) => { mkdirSync(join(root, ' https:/example.com'), { recursive: true }); f[' https:/example.com/x.js'] = 'export default 1;'; m.files.push({ path: ' https:/example.com/x.js', sha256: '' }); f['index.html'] = '<script src=" https://example.com/x.js"></script>'; }],
  ...[' //example.com/x.js', '\thttps://example.com/x.js', 'ht\ntps://example.com/x.js', '/assets/app.js '].map(src => ['URL whitespace ' + JSON.stringify(src), f => { f['index.html'] = `<script src="${src}"></script>`; }]),
  ['select hides raw-text start tag', f => { f['index.html'] = '<select><style><script src=https://example.com/x.js></script></style></select>'; }],
  ['frameset refused', f => { f['index.html'] = '<frameset></frameset>'; }],
  ['malformed doctype hides script', f => { f['index.html'] = '<!doctype html "><script src=https://example.com/x.js></script>">'; }],
  ...['<!doctype html>', '<!DOCTYPE html >'].map(doctype => ['valid ' + doctype, f => { f['index.html'] = doctype + '<script src="/assets/app.js"></script>'; }, true]),
  ['stale hash', (f) => { f['assets/app.js'] += '// changed'; }, false, false],
  ['missing file', (f, m, root) => rmSync(join(root, 'assets/app.js'))],
  ['omitted reference', (f, m) => { m.files = m.files.filter(x => x.path !== 'assets/app.js'); }],
  ['traversal', (f, m) => { m.files[0].path = '../index.html'; }],
  ['outside reference', f => { f['index.html'] = '<script src="../outside.js"></script>'; }],
  ['symlink escape', (f, m, root, temp) => { symlinkSync(temp, join(root, 'escape')); }],
  ['external base', f => { f['index.html'] += '<base href="https://example.com/">'; }],
  ['escaping base', f => { f['index.html'] += '<base href="../">'; }],
  ['unlisted lazy JS', (f, m, root) => writeFileSync(join(root, 'assets/lazy.js'), 'export default 1;')],
  ['unlisted CSS', (f, m, root) => writeFileSync(join(root, 'assets/imported.css'), 'body{}')],
  ['wrong API', (f, m) => { m.runtime_targets.api_origin = 'https://example.com'; }],
  ['wrong database', (f, m) => { m.runtime_targets.supabase_origin = 'https://example.com'; }],
  ['missing literal', f => { f['assets/app.js'] = 'export default 1;'; }],
  ...['local-preview.supabase.invalid', 'preview-public-only'].map(marker => [marker, f => { f['assets/app.js'] += `\n// ${marker}`; }]),
  ['localhost allowed', f => { f['assets/app.js'] += '\n// http://localhost'; }, true],
];
const failures = [];
for (const [name, mutate, accepted = false, rehash = true] of cases) {
  const temp = mkdtempSync(join(tmpdir(), 'release-assets-'));
  try {
    const root = join(temp, 'bundle');
    mkdirSync(join(root, 'assets'), { recursive: true });
    const files = { 'index.html': '<html><script type="module" src="/assets/app.js"></script></html>\n', 'assets/app.js': `export const API_ORIGIN="${api}";\nexport const SUPABASE_ORIGIN="${db}";\n` };
    const manifest = { schema_version: 1, purpose: 'synthetic-test', entrypoint: 'index.html', files: Object.keys(files).map(path => ({ path, sha256: '' })), runtime_targets: { api_origin: api, supabase_origin: db, evidence_file: 'assets/app.js' } };
    const hashes = () => { for (const item of manifest.files) if (files[item.path]) item.sha256 = createHash('sha256').update(files[item.path]).digest('hex'); };
    hashes();
    for (const [path, bytes] of Object.entries(files)) writeFileSync(join(root, path), bytes);
    mutate?.(files, manifest, root, temp);
    if (rehash) hashes();
    if (name !== 'missing file') for (const [path, bytes] of Object.entries(files)) writeFileSync(join(root, path), bytes);
    const manifestPath = join(temp, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = spawnSync(process.execPath, [cli.pathname, root, manifestPath], { encoding: 'utf8' });
    if (result.status !== (accepted ? 0 : 1)) {
      failures.push(name);
      console.log(`FAIL ${name}: exit ${result.status}, expected ${accepted ? 0 : 1}`);
      continue;
    }
    assert.match(result.stdout, accepted ? /^PASS\n$/ : /^FAIL [a-z-]+(?: [a-zA-Z0-9_./-]+)?\n$/, name);
    assert.equal(result.stderr, '', name);
    console.log(`PASS ${name}`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
assert.deepEqual(failures, [], 'synthetic failures');
console.log(`PASS ${cases.length} synthetic cases`);
