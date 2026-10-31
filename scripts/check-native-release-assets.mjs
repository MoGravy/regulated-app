import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, relative, posix, join } from 'node:path';
import { createHash } from 'node:crypto';
const fail = category => { throw new Error(category); };
const safePath = path => typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');
try {
  if (process.argv.length !== 4) fail('arguments');
  const suppliedRoot = resolve(process.argv[2]);
  if (lstatSync(suppliedRoot).isSymbolicLink()) fail('root');
  const root = realpathSync(suppliedRoot);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) fail('root');
  const manifest = JSON.parse(readFileSync(process.argv[3], 'utf8'));
  if (manifest.schema_version !== 1 || typeof manifest.purpose !== 'string' || !manifest.purpose.trim() || !Array.isArray(manifest.files)) fail('manifest');
  const allowed = new Map();
  for (const item of manifest.files) {
    if (!safePath(item.path) || allowed.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('manifest-path');
    allowed.set(item.path, item.sha256);
  }
  const targets = manifest.runtime_targets;
  if (!targets || targets.api_origin !== 'https://regulatedapp.co' || targets.supabase_origin !== 'https://aynyvirtzioyeshauith.supabase.co') fail('runtime-origin');
  if (!allowed.has(manifest.entrypoint) || !allowed.has(targets.evidence_file)) fail('required-file');
  const shipped = [];
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail('symlink');
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && /\.(html|js|mjs|css)$/i.test(name)) shipped.push(relative(root, path).split('\\').join('/'));
      else if (!stat.isFile()) fail('file-type');
    }
  };
  walk(root);
  for (const path of shipped) if (!allowed.has(path)) fail('unlisted-file');
  const contents = new Map();
  for (const [path, expected] of allowed) {
    const absolute = resolve(root, path);
    const real = realpathSync(absolute);
    if (relative(root, real).startsWith('..') || !lstatSync(absolute).isFile()) fail('outside-root');
    const bytes = readFileSync(absolute);
    if (createHash('sha256').update(bytes).digest('hex') !== expected) fail('hash');
    contents.set(path, bytes.toString('utf8'));
  }
  for (const path of shipped) if (/local-preview\.supabase\.invalid|preview-public-only/.test(contents.get(path))) fail('fixture-target');
  const evidence = contents.get(targets.evidence_file);
  if (!evidence.includes(targets.api_origin) || !evidence.includes(targets.supabase_origin) || !shipped.includes(targets.evidence_file)) fail('runtime-evidence');
  const html = contents.get(manifest.entrypoint);
  const tags = [];
  const readTag = source => {
    const tag = source.match(/^<(\/?)([a-z][a-z0-9:-]*)(?=[\t\n\f\r />])([\s\S]*)>$/i);
    if (!tag) fail('html-tag');
    const attributes = new Map();
    let rest = tag[3];
    while (rest.trim() && rest.trim() !== '/') {
      const attribute = rest.match(/^\s+([^\s="'<>/`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/);
      if (!attribute) fail('html-attribute');
      const name = attribute[1].toLowerCase();
      if (attributes.has(name)) fail('html-attribute');
      attributes.set(name, attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      rest = rest.slice(attribute[0].length);
    }
    if (tag[1]) return;
    const name = tag[2].toLowerCase();
    if (['base', 'script', 'link'].includes(name)) tags.push({ name, attributes });
    return name;
  };
  let state = 'text';
  let tagStart = 0;
  let quote = '';
  let textElement = '';
  for (let i = 0; i < html.length; i++) {
    const char = html[i];
    if (state === 'raw-text' || state === 'rcdata') {
      const closing = '</' + textElement;
      if (html.slice(i, i + closing.length).toLowerCase() === closing && /[\t\n\f\r />]/.test(html[i + closing.length] ?? '')) {
        tagStart = i;
        state = 'tag';
      }
      // Script double-escaped data needs the full HTML tokenizer; refuse ambiguous nesting.
      else if (textElement === 'script' && /^<script[\t\n\f\r />]/i.test(html.slice(i))) fail('unsupported-script-data');
    } else if (state === 'bogus-comment') {
      if (char === '>') state = 'text';
    } else if (state === 'comment-start') {
      if (char === '>') state = 'text';
      else if (char === '-') state = 'comment-start-dash';
      else { state = 'comment'; i--; }
    } else if (state === 'comment-start-dash') {
      if (char === '>') state = 'text';
      // The previously consumed dash can begin the empty comment's closing delimiter.
      else if (char === '-') { state = 'comment'; i -= 2; }
      else { state = 'comment'; i--; }
    } else if (state === 'comment') {
      const end = html.startsWith('-->', i) ? 3 : html.startsWith('--!>', i) ? 4 : 0;
      if (end) { state = 'text'; i += end - 1; }
    } else if (state === 'quoted') {
      if (char === quote) state = 'tag';
    } else if (state === 'tag') {
      if (char === '"' || char === "'") { quote = char; state = 'quoted'; }
      else if (char === '>') {
        const name = readTag(html.slice(tagStart, i + 1));
        state = 'text';
        if (name === 'title' || name === 'textarea') state = 'rcdata';
        else if (['script', 'style', 'xmp', 'iframe', 'noembed', 'noframes'].includes(name)) state = 'raw-text';
        // select and frameset ignore raw-text start tags, which this lexer cannot model.
        else if (['noscript', 'plaintext', 'svg', 'math', 'template', 'select', 'frameset'].includes(name)) fail('unsupported-html-context');
        if (state === 'raw-text' || state === 'rcdata') textElement = name;
      }
      else if (char === '<') fail('html-tag');
    } else if (html.startsWith('<!--', i)) {
      state = 'comment-start';
      i += 3;
    } else if (/^<!doctype/i.test(html.slice(i, i + 9))) {
      // Malformed doctypes become bogus up to the first '>', so accept only the plain HTML form.
      const doctype = html.slice(i).match(/^<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>/i);
      if (!doctype) fail('html-doctype');
      i += doctype[0].length - 1;
    } else if (html.startsWith('<?', i) || html.startsWith('<!', i)) {
      state = 'bogus-comment';
      i++;
    } else if (char === '<' && /[a-z/!?]/i.test(html[i + 1] ?? '')) {
      tagStart = i;
      state = 'tag';
    }
  }
  if (state === 'tag' || state === 'quoted') fail('html-tag');
  let base = posix.dirname(manifest.entrypoint) + '/';
  const documentURL = new URL(manifest.entrypoint.split('/').map(encodeURIComponent).join('/'), 'https://native-bundle.invalid/');
  const local = (value, directory) => {
    // Browsers strip leading/trailing whitespace and inner tabs/newlines from URLs.
    // eslint-disable-next-line no-control-regex -- Deliberately reject raw URL control characters before browser normalization.
    if (/[\\&\x00-\x20\x7f]/.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) fail('reference');
    let decoded;
    try { decoded = decodeURIComponent(value.split(/[?#]/)[0]); } catch { fail('reference'); }
    if (decoded.includes('\\') || decoded.split('/').includes('..')) fail('outside-reference');
    const path = posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : posix.join(directory, decoded));
    if (path.startsWith('../')) fail('outside-reference');
    return path;
  };
  let baseSeen = false;
  for (const tag of tags) {
    if (tag.name === 'base') {
      if (!baseSeen && tag.attributes.has('href')) {
        const value = tag.attributes.get('href');
        local(value, posix.dirname(manifest.entrypoint));  // retain the restrictive reference checks
        const parsedBase = new URL(value, documentURL);
        if (parsedBase.origin !== documentURL.origin) fail('reference');
        // Choose the URL directory before decoding: an encoded slash is not a URL separator.
        const directory = parsedBase.pathname.slice(0, parsedBase.pathname.lastIndexOf('/') + 1);
        base = local(directory, '');
        baseSeen = true;
      }
      continue;
    }
    const script = tag.name === 'script';
    if (!script && !/\bstylesheet\b/i.test(tag.attributes.get('rel') ?? '')) continue;
    const value = tag.attributes.get(script ? 'src' : 'href');
    if (value === undefined) continue;
    const path = local(value, base);
    if (!allowed.has(path)) fail('unlisted-reference');
  }
  // shortcut: media and dynamic runtime traffic are outside contract v1; verify them in native acceptance.
  console.log('PASS');
} catch (error) {
  const category = /^[a-z-]+$/.test(error.message) ? error.message : 'input';
  console.log(`FAIL ${category}`);
  process.exitCode = 1;
}
