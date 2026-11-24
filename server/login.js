const fs = require('node:fs');
const path = require('node:path');

const SPSE = 'https://spse.inaproc.id/jabarprov';
const watched = new WeakSet();

function readCredential(root, ppk) {
  const file = path.join(root, 'credential.md');
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw Error('credential.md harus file biasa, maksimal 64 KB.');
  if ((stat.mode & 0o077) !== 0) throw Error('Batasi izin credential.md menjadi 0600 sebelum memakai pengisian otomatis.');
  let accounts;
  try {
    const blocks = [...fs.readFileSync(file, 'utf8').matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gm)];
    if (blocks.length !== 1) throw Error();
    accounts = JSON.parse(blocks[0][1]);
    if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) throw Error();
  } catch { throw Error('Format credential.md tidak valid. Gunakan satu blok JSON sesuai template.'); }
  const account = Object.hasOwn(accounts, ppk) ? accounts[ppk] : null;
  if (!account) return null;
  if (typeof account.username !== 'string' || typeof account.password !== 'string' || account.username.length > 500 || account.password.length > 1000) throw Error('Isian username/password PPK pada credential.md tidak valid.');
  if (!account.username || !account.password) return null;
  return { username: account.username, password: account.password };
}

async function autofillSpse(page, root, ppk) {
  const url = new URL(page.url());
  if (url.origin !== 'https://spse.inaproc.id' || !/^\/jabarprov\/login(?:\/|$)/.test(url.pathname)) return false;
  const credential = readCredential(root, ppk);
  if (!credential) return false;
  try {
    // Recheck the document and form destination atomically before exposing credentials to a page.
    return await page.evaluate(account => {
      if (location.origin !== 'https://spse.inaproc.id' || !/^\/jabarprov\/login(?:\/|$)/.test(location.pathname)) return false;
      let filled = false;
      for (const input of document.querySelectorAll('input[name="txtUserId"], input[type="password"]')) {
        const form = input.form;
        if (!form || input.disabled || input.readOnly || !input.getClientRects().length) continue;
        const action = new URL(form.action, location.href);
        if (action.origin !== location.origin || !/^\/jabarprov\/login(?:\/|$)/.test(action.pathname)) continue;
        const value = input.type === 'password' ? account.password : account.username;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        filled = true;
      }
      return filled;
    }, credential);
  } catch { throw Error('Pengisian otomatis SPSE gagal. Isi form secara manual.'); }
}

function watchSpse(page, root, ppk) {
  if (watched.has(page)) return;
  watched.add(page);
  // Each user-driven login step gets its own fill. Never click Next/Login or submit a form.
  page.on('domcontentloaded', () => autofillSpse(page, root, ppk).catch(() => {}));
}

module.exports = { SPSE, readCredential, autofillSpse, watchSpse };
