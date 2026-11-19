/**
 * "Copy photos" bookmark: run by the user on a page they have open in their own browser (an Instagram
 * or Facebook profile they are logged in to, the photos of a Google Maps listing, any gallery), it lists
 * the addresses of the photos shown on that page so they can be copied and pasted into the app
 * ("Find photos online"). Nothing is sent anywhere: the user copies the list by hand.
 *
 * Written without innerHTML (Google Maps refuses it) and without network calls.
 */
function collect() {
  var seen = {};
  var list = [];
  var add = function (u) {
    if (!u || u.indexOf('http') !== 0 || seen[u]) return;
    seen[u] = 1;
    list.push(u);
  };
  var largest = function (set) {
    var best = '';
    var top = 0;
    String(set || '')
      .split(',')
      .forEach(function (part) {
        var p = part.trim().split(/\s+/);
        var n = parseFloat(p[1]) || 1;
        if (p[0] && n >= top) {
          top = n;
          best = p[0];
        }
      });
    return best;
  };
  // Photos shown at a visible size (icons and avatars are small)
  var big = function (el) {
    var r = el.getBoundingClientRect();
    return r.width >= 140 && r.height >= 100;
  };
  Array.prototype.forEach.call(document.querySelectorAll('img'), function (img) {
    if (big(img)) add(largest(img.getAttribute('srcset')) || img.currentSrc || img.src);
  });
  Array.prototype.forEach.call(document.querySelectorAll('div,a,span,button,li,figure'), function (el) {
    var bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || !big(el)) return;
    var m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
    if (m) add(m[1]);
  });
  var box = document.createElement('div');
  box.setAttribute('style', 'position:fixed;z-index:2147483647;top:16px;right:16px;width:360px;max-width:90vw;padding:14px;background:#fff;color:#111;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:14px system-ui,sans-serif');
  var title = document.createElement('div');
  title.textContent = list.length + ' foto trovate in questa pagina';
  title.setAttribute('style', 'font-weight:600;margin-bottom:8px');
  var area = document.createElement('textarea');
  area.value = list.join('\n');
  area.readOnly = true;
  area.setAttribute('style', 'width:100%;height:120px;font:11px monospace;border:1px solid #ccc;border-radius:6px;padding:6px;box-sizing:border-box;color:#111;background:#fff');
  var row = document.createElement('div');
  row.setAttribute('style', 'display:flex;gap:8px;margin-top:10px');
  var button = function (label, primary) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('style', 'flex:1;padding:9px 10px;border-radius:8px;cursor:pointer;font:600 13px system-ui,sans-serif;border:1px solid ' + (primary ? '#4f46e5;background:#4f46e5;color:#fff' : '#ccc;background:#fff;color:#111'));
    return b;
  };
  var copy = button('Copia', true);
  copy.onclick = function () {
    area.focus();
    area.select();
    var done = function () {
      copy.textContent = 'Copiato: incolla nel Site Generator';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(area.value).then(done, function () {
      document.execCommand('copy');
      done();
    });
    else {
      document.execCommand('copy');
      done();
    }
  };
  var close = button('Chiudi', false);
  close.onclick = function () {
    box.remove();
  };
  row.appendChild(copy);
  row.appendChild(close);
  box.appendChild(title);
  box.appendChild(area);
  box.appendChild(row);
  document.body.appendChild(box);
}

/** The bookmark address (javascript:…): dragged to the bookmarks bar from the app. */
export const PHOTO_BOOKMARKLET = `javascript:(${collect.toString().replace(/\s*\n\s*/g, ' ')})();`;
export const collectPhotos = collect;
