/* ═══════════════════════════════════════════════════════
   BeSA – AWS Foundations  |  main.js
═══════════════════════════════════════════════════════ */

/* ── Photo upload ────────────────────────────────────── */
(function initPhotoUpload() {
  const input       = document.getElementById('photoInput');
  const preview     = document.getElementById('photoPreview');
  const placeholder = document.getElementById('photoPlaceholder');
  const uploadBtn   = document.getElementById('uploadBtn');

  function applyFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  }

  input.addEventListener('change', (e) => applyFile(e.target.files[0]));
  uploadBtn.addEventListener('click', () => input.click());

  const circle = document.getElementById('photoCircle');
  circle.addEventListener('dragover', (e) => { e.preventDefault(); circle.style.borderColor = '#00fff6'; });
  circle.addEventListener('dragleave', ()  => { circle.style.borderColor = ''; });
  circle.addEventListener('drop', (e) => {
    e.preventDefault();
    circle.style.borderColor = '';
    applyFile(e.dataTransfer.files[0]);
  });
})();


/* ── S3 Version Explorer ─────────────────────────────── */
(function initVersionExplorer() {
  const loadBtn    = document.getElementById('loadVersionsBtn');
  const bucketUrlEl = document.getElementById('bucketUrl');
  const grid       = document.getElementById('versionsGrid');
  const status     = document.getElementById('versionsStatus');

  /* ── helpers ── */
  function setStatus(msg, type = '') {
    status.innerHTML = msg;
    status.className = 'versions__status ' + type;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Parse the S3 object URL into bucket, region, and object key.
   * Supports both path-style and virtual-hosted-style URLs.
   * Examples:
   *   https://my-bucket.s3.us-east-1.amazonaws.com/img/photo.png  → virtual-hosted
   *   https://s3.us-east-1.amazonaws.com/my-bucket/img/photo.png  → path-style
   */
  function parseS3Url(rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { return null; }

    const host = url.hostname; // e.g. my-bucket.s3.us-east-1.amazonaws.com
    const pathParts = url.pathname.replace(/^\//, '').split('/'); // remove leading /

    // Virtual-hosted style: bucket.s3[.region].amazonaws.com/key
    const vhMatch = host.match(/^(.+?)\.s3[.\-]([^.]+)\.amazonaws\.com$/);
    if (vhMatch) {
      const bucket = vhMatch[1];
      const region = vhMatch[2]; // e.g. us-east-1
      const key    = pathParts.join('/');
      return { bucket, region, key,
               listUrl: `https://${bucket}.s3.${region}.amazonaws.com/?versions&prefix=${encodeURIComponent(key)}`,
               objectBase: `https://${bucket}.s3.${region}.amazonaws.com/${key}` };
    }

    // Path style: s3[.region].amazonaws.com/bucket/key  OR  s3-region.amazonaws.com/bucket/key
    const psMatch = host.match(/^s3[.\-]([^.]+)\.amazonaws\.com$/);
    if (psMatch) {
      const region = psMatch[1];
      const bucket = pathParts[0];
      const key    = pathParts.slice(1).join('/');
      return { bucket, region, key,
               listUrl: `https://${bucket}.s3.${region}.amazonaws.com/?versions&prefix=${encodeURIComponent(key)}`,
               objectBase: `https://${bucket}.s3.${region}.amazonaws.com/${key}` };
    }

    return null;
  }

  /**
   * Fetch the S3 ListObjectVersions XML and return an array of version objects.
   * { versionId, key, isLatest, lastModified, size }
   */
  async function fetchVersions(listUrl) {
    const resp = await fetch(listUrl);
    if (!resp.ok) {
      const text = await resp.text();
      // Try to extract S3 error message
      const codeMatch  = text.match(/<Code>([^<]+)<\/Code>/);
      const msgMatch   = text.match(/<Message>([^<]+)<\/Message>/);
      const errCode    = codeMatch  ? codeMatch[1]  : resp.status;
      const errMsg     = msgMatch   ? msgMatch[1]   : resp.statusText;
      throw new Error(`S3 error ${errCode}: ${errMsg}`);
    }

    const xml  = await resp.text();
    const doc  = new DOMParser().parseFromString(xml, 'application/xml');
    const ns   = 'http://s3.amazonaws.com/doc/2006-03-01/';

    // Helper: get text of a named child element
    const txt = (parent, tag) => {
      // try with namespace first, then without
      let el = parent.getElementsByTagNameNS(ns, tag)[0]
             || parent.getElementsByTagName(tag)[0];
      return el ? el.textContent.trim() : '';
    };

    // Collect <Version> elements (skip <DeleteMarker>)
    const versionEls = [...doc.getElementsByTagNameNS(ns, 'Version')];
    // Fallback: no namespace
    const fallback   = versionEls.length === 0
      ? [...doc.getElementsByTagName('Version')]
      : [];
    const els = versionEls.length ? versionEls : fallback;

    if (els.length === 0) {
      throw new Error('No versions found. Check that versioning is enabled on the bucket and the object key is correct.');
    }

    return els.map(el => ({
      versionId:    txt(el, 'VersionId'),
      key:          txt(el, 'Key'),
      isLatest:     txt(el, 'IsLatest') === 'true',
      lastModified: txt(el, 'LastModified'),
      size:         txt(el, 'Size'),
    }));
  }

  /* ── Render one card ── */
  // index = position in S3 array (0 = newest/latest), total = array length
  function renderCard(objectBase, version, index, total) {
    const { versionId, isLatest, lastModified, size } = version;

    const imgUrl = `${objectBase}?versionId=${encodeURIComponent(versionId)}`;

    // S3 returns newest first. Chronological number = total - index.
    // e.g. 3 versions: index0=v3(latest), index1=v2, index2=v1
    const chronNum = total - index;
    const label = isLatest ? `Latest (v${chronNum})` : `v${chronNum}`;

    const date   = lastModified
      ? new Date(lastModified).toLocaleString()
      : '—';

    const sizeKb = size
      ? (parseInt(size, 10) / 1024).toFixed(1) + ' KB'
      : '—';

    const shortId = versionId.length > 24
      ? versionId.slice(0, 24) + '…'
      : versionId;

    const card = document.createElement('div');
    card.className = 'version-card';
    card.style.animationDelay = `${index * 80}ms`;

    card.innerHTML = `
      <div class="version-card__img-wrap">
        <img src="${imgUrl}" alt="${escapeHtml(label)}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=\\'version-card__err\\'>Could not load image.<br/>Check bucket permissions.</div>'" />
        <span class="version-card__badge">${escapeHtml(label)}</span>
      </div>
      <div class="version-card__body">
        <p class="version-card__label">Version ID</p>
        <p class="version-card__id" title="${escapeHtml(versionId)}">${escapeHtml(shortId)}</p>
        <p class="version-card__meta">📅 ${escapeHtml(date)}</p>
        <p class="version-card__meta">💾 ${escapeHtml(sizeKb)}</p>
        <a class="version-card__link" href="${imgUrl}" target="_blank" rel="noopener noreferrer">
          Open in new tab ↗
        </a>
      </div>
    `;

    grid.appendChild(card);
  }

  /* ── Main action ── */
  async function loadVersions() {
    const rawUrl = bucketUrlEl.value.trim();
    if (!rawUrl) {
      setStatus('⚠ Please enter an S3 object URL.', 'error');
      bucketUrlEl.focus();
      return;
    }

    const parsed = parseS3Url(rawUrl);
    if (!parsed) {
      setStatus('⚠ Could not parse the S3 URL. Use the full object URL, e.g. https://bucket.s3.region.amazonaws.com/key.png', 'error');
      return;
    }

    grid.innerHTML = '';
    setStatus('⏳ Fetching versions from S3…', 'loading');
    loadBtn.disabled = true;

    try {
      const versions = await fetchVersions(parsed.listUrl);

      versions.forEach((v, i) => renderCard(parsed.objectBase, v, i, versions.length));

      setStatus(
        `✅ Found <strong>${versions.length}</strong> version${versions.length !== 1 ? 's' : ''} for <code>${escapeHtml(parsed.key)}</code>.`
      );
    } catch (err) {
      grid.innerHTML = '';
      // Detect CORS/network errors specifically
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        setStatus(
          `❌ <strong>CORS / Network error.</strong> ` +
          `If you're opening this file locally (<code>file://</code>), the browser blocks cross-origin requests. ` +
          `<br><br>Fix: add a CORS policy to your S3 bucket (see README), then serve this site from S3 or a local server ` +
          `(<code>npx serve .</code> or <code>python -m http.server</code>).`,
          'error'
        );
      } else {
        setStatus(`❌ ${escapeHtml(err.message)}`, 'error');
      }
    } finally {
      loadBtn.disabled = false;
    }
  }

  loadBtn.addEventListener('click', loadVersions);
  bucketUrlEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadVersions(); });

  // Pre-fill from URL query param ?bucket=...
  const params = new URLSearchParams(window.location.search);
  if (params.get('bucket')) {
    bucketUrlEl.value = params.get('bucket');
    loadVersions();
  }
})();
