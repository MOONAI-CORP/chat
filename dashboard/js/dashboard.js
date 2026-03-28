/**
 * Cozy Cloud Chat — Admin Dashboard
 */
(function () {
  'use strict';

  const API = window.location.origin;

  function getAuthHeaders() {
    const creds = btoa(`${localStorage.getItem('cc_admin_user') || 'admin'}:${localStorage.getItem('cc_admin_pass') || ''}`);
    return { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' };
  }

  // Prompt for credentials if not stored
  function ensureAuth() {
    if (!localStorage.getItem('cc_admin_pass')) {
      const user = prompt('Admin username:', 'admin');
      const pass = prompt('Admin password:');
      if (user && pass) {
        localStorage.setItem('cc_admin_user', user);
        localStorage.setItem('cc_admin_pass', pass);
      }
    }
  }

  async function api(endpoint) {
    const res = await fetch(`${API}${endpoint}`, { headers: getAuthHeaders() });
    if (res.status === 401) {
      localStorage.removeItem('cc_admin_pass');
      ensureAuth();
      return api(endpoint);
    }
    return res.json();
  }

  async function apiPost(endpoint, body) {
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // ── Tab Navigation ──

  document.querySelectorAll('.dash-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;

      document.querySelectorAll('.dash-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');

      if (tab === 'overview') loadOverview();
      if (tab === 'conversations') loadConversations();
      if (tab === 'emails') loadEmails();
      if (tab === 'settings') loadSettings();
    });
  });

  // ── Overview ──

  async function loadOverview() {
    const days = document.getElementById('date-range').value;

    try {
      const [overview, triggers, pages, daily] = await Promise.all([
        api(`/api/analytics/overview?days=${days}`),
        api('/api/analytics/triggers'),
        api('/api/analytics/pages'),
        api(`/api/analytics/daily?days=${days}`),
      ]);

      document.getElementById('stat-conversations').textContent = overview.totalConversations;
      document.getElementById('stat-visitors').textContent = overview.uniqueVisitors;
      document.getElementById('stat-emails').textContent = overview.emailsCaptured;
      document.getElementById('stat-cvr').textContent = overview.conversionRate + '%';
      document.getElementById('stat-revenue').textContent = '$' + (overview.totalRevenue || 0).toFixed(2);
      document.getElementById('stat-avg-msgs').textContent = overview.avgMessagesPerConvo;

      // Triggers
      const triggersList = document.getElementById('triggers-list');
      triggersList.innerHTML = (triggers.triggers || []).map(t =>
        `<div class="dash-list-item"><span>${t.trigger_type || 'Direct'}</span><span class="dash-list-count">${t.count}</span></div>`
      ).join('') || '<div style="color:var(--d-text-light);font-size:14px;">No data yet</div>';

      // Pages
      const pagesList = document.getElementById('pages-list');
      pagesList.innerHTML = (pages.pages || []).map(p =>
        `<div class="dash-list-item"><span>${p.source_page}</span><span class="dash-list-count">${p.count}</span></div>`
      ).join('') || '<div style="color:var(--d-text-light);font-size:14px;">No data yet</div>';

      // Daily table
      const tbody = document.getElementById('daily-table-body');
      tbody.innerHTML = (daily.daily || []).map(d =>
        `<tr><td>${d.date}</td><td>${d.conversations}</td><td>${d.messages}</td><td>${d.visitors}</td><td>${d.conversions}</td></tr>`
      ).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--d-text-light);">No data yet</td></tr>';
    } catch (e) {
      console.error('Failed to load overview:', e);
    }
  }

  document.getElementById('date-range').addEventListener('change', loadOverview);

  // ── Conversations ──

  async function loadConversations() {
    const status = document.getElementById('convo-filter').value;
    try {
      const data = await api(`/api/analytics/conversations?status=${status}&limit=50`);
      const list = document.getElementById('conversations-list');
      const detail = document.getElementById('conversation-detail');
      detail.style.display = 'none';
      list.style.display = 'flex';

      list.innerHTML = (data.conversations || []).map(c =>
        `<div class="dash-convo-item" data-id="${c.id}">
          <div class="dash-convo-info">
            <div class="dash-convo-id">${c.visitor_id.substring(0, 16)}...</div>
            <div class="dash-convo-meta">
              <span>${c.message_count} messages</span>
              <span>${c.source_page}</span>
              <span>${new Date(c.started_at).toLocaleDateString()}</span>
              ${c.email ? `<span>📧 ${c.email}</span>` : ''}
            </div>
          </div>
          <span class="dash-convo-badge ${c.status}">${c.status}</span>
        </div>`
      ).join('') || '<div style="padding:40px;text-align:center;color:var(--d-text-light);">No conversations yet</div>';

      // Click handlers
      list.querySelectorAll('.dash-convo-item').forEach(item => {
        item.addEventListener('click', () => loadConversationDetail(item.dataset.id));
      });
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }

  document.getElementById('convo-filter').addEventListener('change', loadConversations);

  async function loadConversationDetail(id) {
    try {
      const data = await api(`/api/analytics/conversations/${id}`);
      const list = document.getElementById('conversations-list');
      const detail = document.getElementById('conversation-detail');
      const viewer = document.getElementById('conversation-messages');

      list.style.display = 'none';
      detail.style.display = 'block';

      viewer.innerHTML = (data.messages || []).map(m =>
        `<div class="dash-msg ${m.role}">${m.content}</div>`
      ).join('');
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  }

  document.getElementById('back-to-list').addEventListener('click', () => {
    document.getElementById('conversations-list').style.display = 'flex';
    document.getElementById('conversation-detail').style.display = 'none';
  });

  // ── Emails ──

  async function loadEmails() {
    try {
      const data = await api('/api/analytics/emails');
      const tbody = document.getElementById('emails-table-body');
      tbody.innerHTML = (data.emails || []).map(e =>
        `<tr><td>${e.email}</td><td>${e.discount_code || '-'}</td><td>${e.source_page || '-'}</td><td>${new Date(e.created_at).toLocaleDateString()}</td></tr>`
      ).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--d-text-light);">No emails captured yet</td></tr>';
    } catch (e) {
      console.error('Failed to load emails:', e);
    }
  }

  document.getElementById('export-emails').addEventListener('click', async () => {
    const data = await api('/api/analytics/emails?limit=10000');
    const csv = 'Email,Discount Code,Page,Date\n' +
      (data.emails || []).map(e =>
        `${e.email},${e.discount_code || ''},${e.source_page || ''},${e.created_at}`
      ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cozy-cloud-emails.csv';
    a.click();
  });

  // ── Settings ──

  function loadSettings() {
    const host = window.location.origin;
    document.getElementById('integration-code').textContent =
      `<script src="${host}/loader.js" defer><\/script>`;
  }

  // ── Product Sync ──

  async function syncProducts(btn) {
    const statusEl = btn.parentElement.querySelector('#sync-status') || btn.nextElementSibling;
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    try {
      const data = await apiPost('/api/products/sync', {});
      btn.textContent = 'Sync Now';
      btn.disabled = false;
      if (statusEl) statusEl.textContent = ` Synced ${data.count} products!`;
    } catch (e) {
      btn.textContent = 'Sync Now';
      btn.disabled = false;
      if (statusEl) statusEl.textContent = ' Sync failed — check API token.';
    }
  }

  document.getElementById('sync-products-btn').addEventListener('click', function() { syncProducts(this); });
  document.getElementById('sync-products-btn-2')?.addEventListener('click', function() { syncProducts(this); });

  // ── Init ──
  ensureAuth();
  loadOverview();
})();
