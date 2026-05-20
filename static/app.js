// ============================================================
// Sample Management System - Frontend Application
// ============================================================

const API_BASE = '/api';

const API = {
    // Auth
    login: () => `${API_BASE}/auth/login`,
    logout: () => `${API_BASE}/auth/logout`,
    me: () => `${API_BASE}/auth/me`,
    register: () => `${API_BASE}/auth/register`,
    // Samples
    list: () => `${API_BASE}/items`,
    create: () => `${API_BASE}/items`,
    update: (id) => `${API_BASE}/items/${id}`,
    delete: (id) => `${API_BASE}/items/${id}`,
    detail: (id) => `${API_BASE}/items/${id}`,
    // Checkout
    checkout: () => `${API_BASE}/checkout`,
    checkoutReturn: (id) => `${API_BASE}/checkout/${id}/return`,
    itemReturn: (id) => `${API_BASE}/items/${id}/return`,
    checkoutRecords: (id) => `${API_BASE}/checkout/records?sample_id=${id}`,
    overdue: () => `${API_BASE}/checkout/overdue`,
    // Dashboard
    stats: () => `${API_BASE}/dashboard/stats`,
    rackSummary: () => `${API_BASE}/dashboard/rack-summary`,
    currentCheckout: () => `${API_BASE}/dashboard/current-checkout`,
    recentReturns: (limit = 10) => `${API_BASE}/dashboard/recent-returns?limit=${limit}`,
    // Users
    users: () => `${API_BASE}/users`,
    userDetail: (id) => `${API_BASE}/users/${id}`,
    userUpdate: (id) => `${API_BASE}/users/${id}`,
    userResetPassword: (id) => `${API_BASE}/users/${id}/reset-password`,
    userDelete: (id) => `${API_BASE}/users/${id}`
};

// ============================================================
// Global State
// ============================================================

let editingId = null;
let allItems = [];
let allRacks = new Set();
let currentUser = null;
let sortColumn = '';
let sortDirection = 'asc';

// ============================================================
// Auth Functions
// ============================================================

// ============================================================
// Auth / Session
// ============================================================

function updateAuthUI() {
    // Close any open modals to avoid stale admin UI
    closeModal();
    const bar = document.getElementById('authBar');
    if (currentUser) {
        bar.innerHTML = `
            <span style="margin-right:12px;font-size:14px;color:#333;">
                <strong>${escapeHtml(currentUser.display_name || currentUser.username)}</strong>
                ${currentUser.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
            </span>
            <button class="edit" onclick="logout()">Logout</button>
        `;
    } else {
        bar.innerHTML = `
            <button class="edit" onclick="openLoginModal()">Login</button>
            <button class="edit" onclick="openRegisterModal()">Register</button>
        `;
    }
    updateUIBasedOnRole();
}

function updateUIBasedOnRole() {
    const isAdmin = currentUser && currentUser.is_admin;
    // Show/hide admin-only navigation tabs
    document.querySelectorAll('[data-admin-only]').forEach(el => {
        if (isAdmin) {
            el.classList.add('admin-visible');
        } else {
            el.classList.remove('admin-visible');
        }
    });
    // If on Dashboard section and user is not admin, switch to Samples
    const dashboardSection = document.getElementById('dashboard-section');
    if (!isAdmin && !dashboardSection.classList.contains('hidden')) {
        showSection('samples');
    }
}

async function loadCurrentUser() {
    try {
        const response = await fetch(API.me());
        if (response.ok) {
            currentUser = await response.json();
        } else {
            currentUser = null;
        }
    } catch (err) {
        currentUser = null;
    }
    updateAuthUI();
    // Re-render items to reflect correct action buttons for current user
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection.classList.contains('hidden')) {
        loadItems();
    }
}

function openLoginModal() {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    openModal('loginModal');
}

function openRegisterModal() {
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirmPassword').value = '';
    openModal('registerModal');
}

async function submitLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.querySelector('#loginModal .form-actions button[type="submit"]');
    setButtonPending(submitBtn, true, 'Logging in...');
    try {
        const response = await fetch(API.login(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Login failed');
        }
        const data = await response.json();
        currentUser = data.user || data;
        updateAuthUI();
        // Navigate to correct section after login
        if (currentUser && currentUser.is_admin) {
            showSection('dashboard');
        } else {
            showSection('samples');
        }
        closeModal();
        showToast('Logged in successfully', 'success');
    } catch (err) {
        setButtonPending(submitBtn, false);
        showToast('Error: ' + err.message, 'error');
    }
}

async function submitRegister(e) {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    if (!email) {
        alert('Email is required');
        return;
    }
    if (!email.endsWith('@philips.com')) {
        alert('Email must end with @philips.com');
        return;
    }
    if (!password) {
        alert('Password is required');
        return;
    }
    if (!confirmPassword) {
        alert('Confirm password is required');
        return;
    }
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    try {
        const response = await fetch(API.register(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Registration failed');
        }
        const data = await response.json();
        closeModal();
        const username = email.split('@')[0];
        document.getElementById('loginUsername').value = username;
        document.getElementById('loginPassword').value = '';
        openModal('loginModal');
        showToast('Account created successfully. Please log in.', 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function logout() {
    try {
        await fetch(API.logout(), { method: 'POST' });
        currentUser = null;
        updateAuthUI();
        closeMenu();
        loadItems();
        showToast('Logged out', 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

function toggleMenu() {
    const menu = document.getElementById('navMenu');
    menu.classList.toggle('open');
}

function closeMenu() {
    const menu = document.getElementById('navMenu');
    menu.classList.remove('open');
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('navMenu');
    const btn = document.getElementById('hamburgerBtn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.remove('open');
    }
});

// Close menu on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
});

// ============================================================
// Utility Functions
// ============================================================

// ============================================================
// UI Helpers
// ============================================================

function getStatusBadgeClass(status) {
    const cls = {
        'IN_STOCK': 'status-IN_STOCK',
        'CHECKED_OUT': 'status-CHECKED_OUT',
        'OUT': 'status-CHECKED_OUT',
        'RETURNED': 'status-IN_STOCK',
        'LOST': 'status-LOST',
        'SCRAPPED': 'status-SCRAPPED'
    };
    return cls[status] || 'status-IN_STOCK';
}

function formatStatus(status) {
    if (!status) return 'IN_STOCK';
    return status.replace(/_/g, ' ');
}

function normalizeStatus(s) {
    if (!s || s === '') return 'IN_STOCK';
    return s;
}

function getTotalQty(item) {
    if (item.UnitCount !== undefined && item.UnitCount !== null) {
        var uc = parseInt(item.UnitCount, 10);
        if (!isNaN(uc) && uc > 0) return uc;
    }
    if (item.quantity !== undefined && item.quantity !== null) {
        var q = parseInt(item.quantity, 10);
        if (!isNaN(q) && q > 0) return q;
    }
    return 1;
}

function getAvailableQty(item) {
    if (item.available_quantity !== undefined && item.available_quantity !== null) {
        var aq = parseInt(item.available_quantity, 10);
        if (!isNaN(aq)) return aq;
    }
    return getTotalQty(item);
}

function getDisplayStatusText(item) {
    var status = normalizeStatus(item.status || item.Status);
    if (status === 'LOST') return 'Lost';
    if (status === 'SCRAPPED') return 'Scrapped';
    return getStockState(item).label;
}

function getDisplayStatusClass(item) {
    var status = normalizeStatus(item.status || item.Status);
    if (status === 'LOST') return 'status-lost';
    if (status === 'SCRAPPED') return 'status-scrapped';
    return 'status-' + getStockState(item).key.toLowerCase();
}

function getPrimaryActionHtml(item, showActions) {
    if (!showActions) return '';
    var status = normalizeStatus(item.status || item.Status);
    if (status === 'LOST' || status === 'SCRAPPED') return '';
    var avail = getAvailableQty(item);
    var total = getTotalQty(item);
    var buttons = '';
    if (avail > 0) {
        buttons += '<button class="checkout-btn" onclick="event.stopPropagation();openCheckoutModal(' + item.id + ')">Checkout</button>';
    }
    if (avail < total) {
        buttons += '<button class="return-btn" onclick="event.stopPropagation();openReturnModal(' + item.id + ')">Return</button>';
    }
    return buttons;
}

function normalizeStatusFilter(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (normalized === 'CHECKED_OUT') return '';
    return normalized;
}

function getNumericQty(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function getStockState(sample) {
    const total = getNumericQty(sample.quantity);
    const available = getNumericQty(sample.available_quantity);

    if (available <= 0) {
        return {
            key: 'Out',
            label: `Out (${available}/${total})`,
            className: 'stock-out',
            total,
            available,
        };
    }

    if (total > 0 && available >= total) {
        return {
            key: 'Full',
            label: `Full (${available}/${total})`,
            className: 'stock-full',
            total,
            available,
        };
    }

    return {
        key: 'Partial',
        label: `Partial (${available}/${total})`,
        className: 'stock-partial',
        total,
        available,
    };
}

function isAuthenticatedUser() {
    return currentUser !== null;
}

function matchesStatusFilter(sample, selectedStatus) {
    if (!selectedStatus || selectedStatus === '') {
        return true;
    }

    const dbStatus = normalizeStatus(sample.status || sample.Status);
    if (dbStatus === 'LOST' || dbStatus === 'SCRAPPED') {
        return selectedStatus === dbStatus;
    }

    const stock = getStockState(sample);

    switch (selectedStatus) {
        case 'IN_STOCK':
            return stock.available > 0;
        case 'CHECKED_OUT':
            return stock.available <= 0;
        case 'LOST':
            return dbStatus === 'LOST';
        case 'SCRAPPED':
            return dbStatus === 'SCRAPPED';
        default:
            return true;
    }
}

// ============================================================
// Toast / Feedback Helpers
// ============================================================

function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type === 'error' ? 'error' : 'success');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
}

function setButtonPending(button, isPending, pendingLabel) {
    if (!button) return;
    if (isPending) {
        button._originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = pendingLabel || 'Processing...';
        button.classList.add('btn-pending');
    } else {
        button.disabled = false;
        button.textContent = button._originalLabel || button.textContent;
        button.classList.remove('btn-pending');
    }
}

function toggleHistorySection() {
    const container = document.getElementById('historyContainer');
    const arrow = document.getElementById('historyArrow');
    if (!container || !arrow) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        arrow.textContent = '\u25b2';
    } else {
        container.classList.add('hidden');
        arrow.textContent = '\u25bc';
    }
}

// ============================================================
// Modal Functions
// ============================================================

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    resetModalButtons();
    resetCheckoutForm();
    resetReturnForm();
}

function resetModalButtons() {
    document.querySelectorAll('.modal .btn-pending').forEach(function(btn) {
        btn.disabled = false;
        if (btn._originalLabel) {
            btn.textContent = btn._originalLabel;
            delete btn._originalLabel;
        }
        btn.classList.remove('btn-pending');
    });
}

function resetCheckoutForm() {
    document.getElementById('checkoutSampleId').value = '';
    document.getElementById('checkoutBorrowerName').textContent = '';
    document.getElementById('borrowerDepartment').value = '';
    document.getElementById('borrowerEmail').value = '';
    document.getElementById('expectedReturnDate').value = '';
    document.getElementById('checkoutRemarks').value = '';
    document.getElementById('checkoutSampleInfo').innerHTML = '';
    document.getElementById('checkoutQuantity').value = 1;
    document.getElementById('checkoutQuantity').max = 99999;
    document.getElementById('checkoutAvailQty').textContent = '0';
    document.getElementById('checkoutTotalQty').textContent = '0';
}

function resetReturnForm() {
    document.getElementById('returnRecordId').value = '';
    document.getElementById('actualReturnDate').value = '';
    document.getElementById('returnRemarks').value = '';
    document.getElementById('returnSampleInfo').innerHTML = '';
    document.getElementById('returnQuantity').value = 1;
    document.getElementById('returnQuantity').min = 1;
    document.getElementById('returnQuantity').max = 1;
    document.getElementById('returnQuantity').readOnly = false;
}

// ============================================================
// Sample Operations
// ============================================================

// ============================================================
// Item List / Rendering
// ============================================================

async function loadItems() {
    const search = document.getElementById('searchBox').value;
    const rawStatus = document.getElementById('statusFilter').value;
    const rack = document.getElementById('rackFilter').value;
    
    let url = `${API.list()}?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    // Only send LOST/SCRAPPED to server (actual DB statuses, not quantity-based)
    if (rawStatus === 'LOST' || rawStatus === 'SCRAPPED') {
        url += `status=${encodeURIComponent(rawStatus)}&`;
    }
    if (rack) url += `rack=${encodeURIComponent(rack)}&`;
    
    const response = await fetch(url);
    let items = await response.json();
    
    // Client-side status filtering using quantity-based stock logic
    items = items.filter(item => matchesStatusFilter(item, rawStatus));
    
    allItems = items;
    
    // Collect racks
    allRacks.clear();
    allItems.forEach(item => {
        if (item.StorageLocationCode) allRacks.add(item.StorageLocationCode);
    });
    updateRackFilter();
    
    renderItems();
}

function sortBy(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    updateSortIndicators();
    renderItems();
}

function updateSortIndicators() {
    document.querySelectorAll('.sortable .sort-indicator').forEach(function(el) {
        el.textContent = '';
    });
    if (sortColumn) {
        var header = document.querySelector('th[onclick*="' + sortColumn + '"] .sort-indicator');
        if (header) {
            header.textContent = sortDirection === 'asc' ? ' \u2191' : ' \u2193';
        }
    }
}

function getSortValue(item, column) {
    var val = item[column];
    if (val === null || val === undefined) return '';
    if (column === 'Status') return getDisplayStatusText(item);
    return String(val).toLowerCase();
}

function renderItems() {
    const tbody = document.getElementById('inventory');
    const cardsContainer = document.getElementById('inventoryCards');

    if (!allItems || allItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#999;">No samples found</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div class="inventory-empty">No samples found</div>';
        return;
    }

    // Sort items before rendering
    var sortedItems = allItems.slice();
    if (sortColumn) {
        sortedItems.sort(function(a, b) {
            var av = getSortValue(a, sortColumn);
            var bv = getSortValue(b, sortColumn);
            if (av < bv) return sortDirection === 'asc' ? -1 : 1;
            if (av > bv) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const canBorrowReturn = isAuthenticatedUser();
    const isAdmin = currentUser && currentUser.is_admin;

    const actionsHeader = document.getElementById('actionsHeader');
    if (actionsHeader) {
        actionsHeader.style.display = canBorrowReturn ? '' : 'none';
    }

    tbody.innerHTML = sortedItems.map(function(item) {
        var actionCellHtml = '';
        var status = normalizeStatus(item.status || item.Status);
        if (canBorrowReturn && status !== 'LOST' && status !== 'SCRAPPED') {
            var avail = getAvailableQty(item);
            var total = getTotalQty(item);
            var btns = [];
            if (avail > 0) {
                btns.push('<button class="checkout-btn" onclick="event.stopPropagation();openCheckoutModal(' + item.id + ')">Checkout</button>');
            }
            if (avail < total) {
                btns.push('<button class="return-btn" onclick="event.stopPropagation();openReturnModal(' + item.id + ')">Return</button>');
            }
            actionCellHtml = btns.join(' ');
        }
        var statusText = getDisplayStatusText(item);
        var statusClass = getDisplayStatusClass(item);
        return '\n            <tr onclick="viewItem(' + item.id + ')" style="cursor:pointer;">\n                <td>' + escapeHtml(item.Title || '') + '</td>\n                <td>' + escapeHtml(item.SerialNum || '') + '</td>\n                <td>' + escapeHtml(item.SampleType || '') + '</td>\n                <td>' + escapeHtml(item.StorageLocationCode || '') + '</td>\n                <td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>\n                <td>' + actionCellHtml + '</td>\n            </tr>\n        ';
    }).join('');

    if (cardsContainer) {
        cardsContainer.innerHTML = allItems.map(item => {
            const status = normalizeStatus(item.status || item.Status);
            var metaParts = [];
            if (item.StorageLocationCode) metaParts.push(item.StorageLocationCode);
            if (item.SampleType) metaParts.push(item.SampleType);
            var metaHtml = metaParts.length > 0
                ? '<div class="inventory-card__meta">' + metaParts.map(function(p) { return '<span class="inventory-card__meta-item">' + escapeHtml(p) + '</span>'; }).join('<span class="inventory-card__meta-sep">·</span>') + '</div>'
                : '';

            var statusText = getDisplayStatusText(item);
            var statusClass = getDisplayStatusClass(item);
            var actionHtml = getPrimaryActionHtml(item, canBorrowReturn);

            return '\n<div class="inventory-card" onclick="viewItem(' + item.id + ')">\n  <div class="inventory-card__identity">\n    <div class="inventory-card__title">' + escapeHtml(item.Title || '') + '</div>\n    <div class="inventory-card__serial">' + escapeHtml(item.SerialNum || '') + '</div>\n  </div>\n  <div class="inventory-card__status-row">\n    <span class="status-badge ' + statusClass + '">' + statusText + '</span>\n    ' + (actionHtml ? '<div class="inventory-card__action">' + actionHtml + '</div>' : '') + '\n  </div>\n  ' + metaHtml + '\n</div>';
        }).join('');
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateRackFilter() {
    const select = document.getElementById('rackFilter');
    const current = select.value;
    const racks = Array.from(allRacks).sort();
    select.innerHTML = '<option value="">All Racks</option>' + 
        racks.map(r => `<option value="${escapeHtml(r)}" ${r === current ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('');
}

function applyFilters() {
    loadItems();
}

function exportSamplesCsv() {
    if (!currentUser || !currentUser.is_admin) return;
    var search = document.getElementById('searchBox').value;
    var rawStatus = document.getElementById('statusFilter').value;
    var rack = document.getElementById('rackFilter').value;
    var params = new URLSearchParams();
    if (search) params.set('search', search);
    var normalizedStatus = normalizeStatusFilter(rawStatus);
    if (normalizedStatus) params.set('status', normalizedStatus);
    if (rack) params.set('rack', rack);
    var url = '/api/export/items.csv?' + params.toString();
    try {
        var link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
    }
}

// ============================================================
// Add/Edit Form
// ============================================================

// ============================================================
// Create / Edit / Delete
// ============================================================

const REQUIRED_FIELDS = ['Title', 'SerialNum', 'SampleType', 'StorageLocationCode'];

const FIELD_LABELS = {
    Title: 'Title',
    SerialNum: 'Serial Number',
    SampleType: 'Sample Type',
    StorageLocationCode: 'Storage Rack'
};

function clearFieldValidation() {
    document.querySelectorAll('.form-group.is-invalid').forEach(function(el) {
        el.classList.remove('is-invalid');
    });
    document.querySelectorAll('.field-error').forEach(function(el) {
        if (el.parentNode) el.parentNode.removeChild(el);
    });
}

function markFieldInvalid(fieldId, message) {
    var el = document.getElementById(fieldId);
    if (!el) return;
    var formGroup = el.closest('.form-group');
    if (formGroup) formGroup.classList.add('is-invalid');
    var existingErr = formGroup ? formGroup.querySelector('.field-error') : null;
    if (!existingErr) {
        var errEl = document.createElement('div');
        errEl.className = 'field-error';
        errEl.textContent = message;
        if (formGroup) formGroup.appendChild(errEl);
    }
}

function validateItemForm() {
    clearFieldValidation();
    var firstInvalid = null;
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
        var f = REQUIRED_FIELDS[i];
        var el = document.getElementById(f);
        var val = el ? (el.value || '').trim() : '';
        if (!val) {
            var label = FIELD_LABELS[f] || f;
            markFieldInvalid(f, label + ' is required');
            if (!firstInvalid) firstInvalid = el;
        }
    }
    if (firstInvalid) {
        firstInvalid.focus();
        return false;
    }
    return true;
}

function normalizeItemFormData() {
    // Trim all text fields and normalize UnitCount to string
    FIELD_LIST.forEach(function(f) {
        var el = document.getElementById(f);
        if (el && el.type !== 'select-one') {
            el.value = (el.value || '').trim();
        }
    });
    // Ensure UnitCount is preserved as string-compatible
    var ucEl = document.getElementById('UnitCount');
    if (ucEl && ucEl.value !== '') {
        ucEl.value = String(ucEl.value);
    }
}

const FIELD_LIST = [
    "Title", "SerialNum", "SampleType", "ProductName", "Brand", "Model",
    "Category", "SubCategory", "DepartmentOwner", "Condition", "DateReceived",
    "StorageLocationCode", "UnitCount", "UnitMeasure", "Status", "PhotoLink",
    "Notes", "Column1", "Attachments"
];

function clearForm() {
    clearFieldValidation();
    FIELD_LIST.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
            if (el.tagName === 'SELECT') el.selectedIndex = 0;
            else el.value = '';
        }
    });
    // Default status to IN_STOCK
    const statusEl = document.getElementById('Status');
    if (statusEl) statusEl.value = 'IN_STOCK';
}

function fillForm(item) {
    FIELD_LIST.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
            const val = item[f] || (f === 'Status' ? 'IN_STOCK' : '');
            // Don't populate Status if it's CHECKED_OUT (not in select options)
            if (f === 'Status' && val === 'CHECKED_OUT') return;
            el.value = val;
        }
    });
}

function showAddForm() {
    if (!currentUser || !currentUser.is_admin) {
        showToast('Only administrators can add or edit samples.', 'error');
        return;
    }
    // Clear form and set to add mode
    clearForm();
    editingId = null;
    document.getElementById('formTitle').textContent = 'Add New Sample';
    document.getElementById('submitBtn').textContent = 'Add Sample';
    // Open modal
    openModal('addModal');
    // Focus first field after modal opens
    setTimeout(() => {
        const titleEl = document.getElementById('Title');
        if (titleEl) titleEl.focus();
    }, 100);
}

function startEdit(id) {
    if (!currentUser || !currentUser.is_admin) {
        showToast('Only administrators can edit samples.', 'error');
        return;
    }
    const item = allItems.find(i => String(i.id) === String(id));
    if (!item) {
        console.error('Edit error: item not found in allItems, id=', id);
        return;
    }
    editingId = id;
    fillForm(item);
    document.getElementById('formTitle').textContent = 'Edit Sample';
    document.getElementById('submitBtn').textContent = 'Save Changes';
    openModal('addModal');
    setTimeout(() => {
        const titleEl = document.getElementById('Title');
        if (titleEl) titleEl.focus();
    }, 100);
}

function cancelEdit() {
    editingId = null;
    clearForm();
    document.getElementById('formTitle').textContent = 'Add New Sample';
    document.getElementById('submitBtn').textContent = 'Add Sample';
    closeModal();
}

async function submitItemForm(e) {
    e.preventDefault();
    
    clearFieldValidation();
    normalizeItemFormData();
    if (!validateItemForm()) return;
    
    const submitBtn = document.getElementById('submitBtn');
    setButtonPending(submitBtn, true, 'Saving...');
    
    const data = {};
    FIELD_LIST.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
            if (el.tagName === 'SELECT' || el.type === 'checkbox') {
                data[f] = el.value || '';
            } else {
                data[f] = el.value || '';
            }
        } else {
            console.error('Form field not found:', f);
        }
    });
    
    // Ensure Status has a valid value
    if (!data.Status || data.Status === '') {
        data.Status = 'IN_STOCK';
    }
    
    try {
        if (editingId === null) {
            const response = await fetch(API.create(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to create sample');
            }
            showToast('Sample created successfully', 'success');
        } else {
            const response = await fetch(API.update(editingId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to update sample');
            }
            showToast('Sample updated successfully', 'success');
            editingId = null;
        }
        
        cancelEdit();
        await loadItems();
    } catch (err) {
        console.error(err);
        setButtonPending(submitBtn, false);
        showToast('Save failed: ' + err.message, 'error');
    }
}

async function deleteSample(id) {
    if (!currentUser || !currentUser.is_admin) {
        showToast('Only administrators can delete samples.', 'error');
        return;
    }
    if (!confirm('Are you sure you want to delete this sample?')) return;
    try {
        var delBtn = document.querySelector('.detail-modal .delete');
        if (delBtn) setButtonPending(delBtn, true, 'Deleting...');
        const response = await fetch(API.delete(id), { method: 'DELETE' });
        if (!response.ok) {
            let errorMsg = 'Failed to delete';
            try {
                const err = await response.json();
                errorMsg = err.detail || errorMsg;
            } catch {
                try {
                    const text = await response.text();
                    if (text) errorMsg = text;
                } catch {
                    // keep default message
                }
            }
            throw new Error(errorMsg);
        }
        closeModal();
        await loadItems();
        showToast('Deleted successfully', 'success');
    } catch (err) {
        if (delBtn) setButtonPending(delBtn, false);
        showToast('Delete failed: ' + err.message, 'error');
    }
}

// ============================================================
// Checkout Operations
// ============================================================

// ============================================================
// Checkout / Return
// ============================================================

async function openCheckoutModal(sampleId) {
    if (!isAuthenticatedUser()) {
        showToast('Please log in to checkout samples', 'error');
        return;
    }
    const item = allItems.find(i => String(i.id) === String(sampleId));
    if (!item) return;

    var availQty = getAvailableQty(item);
    var totalQty = getTotalQty(item);

    if (availQty <= 0) {
        showToast('This sample is out of stock', 'error');
        return;
    }

    document.getElementById('checkoutSampleId').value = sampleId;
    document.getElementById('checkoutAvailQty').textContent = availQty;
    document.getElementById('checkoutTotalQty').textContent = totalQty;

    var qtyInput = document.getElementById('checkoutQuantity');
    qtyInput.value = 1;
    qtyInput.min = 1;
    qtyInput.max = availQty;

    var hint = document.getElementById('checkoutMaxHint');
    if (hint) {
        hint.textContent = '(Max: ' + availQty + ')';
    }

    const borrowerDisplay = document.getElementById('checkoutBorrowerName');
    if (currentUser) {
        borrowerDisplay.textContent = currentUser.display_name || currentUser.username || 'Unknown User';
    } else {
        borrowerDisplay.textContent = 'Not logged in';
    }

    const info = document.getElementById('checkoutSampleInfo');
    info.innerHTML = `
        <div class="sample-info-box">
            <p><strong>Title:</strong> ${escapeHtml(item.Title || '')}</p>
            <p><strong>Serial:</strong> ${escapeHtml(item.SerialNum || '')}</p>
            <p><strong>Type:</strong> ${escapeHtml(item.SampleType || '')}</p>
            <p><strong>Rack:</strong> ${escapeHtml(item.StorageLocationCode || '')}</p>
        </div>
    `;

    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    const yyyy = defaultDate.getFullYear();
    const mm = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const dd = String(defaultDate.getDate()).padStart(2, '0');
    document.getElementById('expectedReturnDate').value = `${yyyy}-${mm}-${dd}`;

    openModal('checkoutModal');
}

async function submitCheckout(e) {
    e.preventDefault();
    
    const sampleId = document.getElementById('checkoutSampleId').value;
    const submitBtn = document.querySelector('#checkoutModal .form-actions button[type="submit"]');
    setButtonPending(submitBtn, true, 'Checking out...');
    
    const data = {
        sample_id: parseInt(sampleId),
        quantity: parseInt(document.getElementById('checkoutQuantity').value) || 1,
        borrower_department: document.getElementById('borrowerDepartment').value.trim(),
        borrower_email: document.getElementById('borrowerEmail').value.trim(),
        expected_return_date: document.getElementById('expectedReturnDate').value,
        checkout_remarks: document.getElementById('checkoutRemarks').value.trim()
    };
    
    try {
        const response = await fetch(API.checkout(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Checkout failed');
        }
        
        closeModal();
        await loadItems();
        showToast('Checked out successfully', 'success');
    } catch (err) {
        console.error(err);
        setButtonPending(submitBtn, false);
        showToast('Checkout failed: ' + err.message, 'error');
    }
}

// ============================================================
// Return Operations
// ============================================================

async function openReturnModal(sampleId) {
    if (!isAuthenticatedUser()) {
        showToast('Please log in to return samples', 'error');
        return;
    }
    const item = allItems.find(i => String(i.id) === String(sampleId));
    if (!item) return;

    var availQty = getAvailableQty(item);
    var totalQty = getTotalQty(item);
    var totalCheckedOut = totalQty - availQty;

    if (availQty >= totalQty) {
        showToast('This sample is not currently checked out', 'error');
        return;
    }

    try {
        const response = await fetch(API.checkoutRecords(sampleId));
        const records = await response.json();
        const activeRecords = records.filter(r => r.checkout_status === 'OUT');

        if (activeRecords.length === 0) {
            showToast('No active checkout record found', 'error');
            return;
        }

        document.getElementById('returnRecordId').value = sampleId;

        var qtyInput = document.getElementById('returnQuantity');
        qtyInput.value = totalCheckedOut;
        qtyInput.min = 1;
        qtyInput.max = totalCheckedOut;
        qtyInput.readOnly = false;

        var hint = document.getElementById('returnMaxHint');
        if (hint) {
            hint.textContent = '(Max: ' + totalCheckedOut + ')';
        }

        const info = document.getElementById('returnSampleInfo');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('actualReturnDate').value = today;

        var recordsHtml = activeRecords.map(function(r, i) {
            return '<p style="font-size:13px;color:#555;margin:2px 0;">Record ' + (i+1) + ': ' + escapeHtml(r.borrower_name || '') + ' - Qty: ' + (r.quantity || 1) + '</p>';
        }).join('');

        info.innerHTML = `
            <div class="sample-info-box">
                <p><strong>Sample:</strong> ${escapeHtml(item.Title || '')} / ${escapeHtml(item.SerialNum || '')}</p>
                <p><strong>Checked Out:</strong> ${totalCheckedOut} / ${totalQty} units (across ${activeRecords.length} record(s))</p>
                <p><strong>Stock Available after return:</strong> ${availQty} / ${totalQty}</p>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd;">${recordsHtml}</div>
            </div>
        `;

        openModal('returnModal');
    } catch (err) {
        console.error(err);
        showToast('Error: Could not load checkout records', 'error');
    }
}

async function submitReturn(e) {
    e.preventDefault();

    const sampleId = document.getElementById('returnRecordId').value;
    const submitBtn = document.querySelector('#returnModal .form-actions button[type="submit"]');
    setButtonPending(submitBtn, true, 'Returning...');

    const data = {
        quantity: parseInt(document.getElementById('returnQuantity').value) || 1,
        actual_return_date: document.getElementById('actualReturnDate').value,
        return_remarks: document.getElementById('returnRemarks').value.trim()
    };

    try {
        const response = await fetch(API.itemReturn(sampleId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Return failed');
        }

        closeModal();
        await loadItems();
        showToast('Returned successfully', 'success');
    } catch (err) {
        console.error(err);
        setButtonPending(submitBtn, false);
        showToast('Return failed: ' + err.message, 'error');
    }
}

// ============================================================
// Detail View
// ============================================================

async function viewItem(id) {
    try {
        const response = await fetch(API.detail(id));
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to load item details');
        }
        const item = await response.json();

        var status = normalizeStatus(item.status || item.Status);
        var availQty = getAvailableQty(item);
        var totalQty = getTotalQty(item);

        const isAuthenticated = isAuthenticatedUser();
        const isAdmin = currentUser && currentUser.is_admin;
        const isExceptionalStatus = status === 'LOST' || status === 'SCRAPPED';
        const canCheckout = isAuthenticated && !isExceptionalStatus && availQty > 0;
        const canReturn = isAuthenticated && !isExceptionalStatus && item.checkout_history && item.checkout_history.some(function(h) { return h.checkout_status === 'OUT'; });

        let historyHtml = '';
        var historyCount = (item.checkout_history && item.checkout_history.length) || 0;
        if (historyCount > 0) {
            historyHtml = `
                <div class="history-table-wrapper">
                    <table class="detail-history-table">
                        <thead>
                            <tr>
                                <th>Borrower</th>
                                <th>Department</th>
                                <th>Qty</th>
                                <th>Checkout</th>
                                <th>Expected Return</th>
                                <th>Actual Return</th>
                                <th>Status</th>
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${item.checkout_history.map(h => `
                                <tr>
                                    <td>${escapeHtml(h.borrower_name || '')}</td>
                                    <td>${escapeHtml(h.borrower_department || '')}</td>
                                    <td>${h.quantity || 1}</td>
                                    <td>${escapeHtml(h.checkout_date || '')}</td>
                                    <td>${escapeHtml(h.expected_return_date || '')}</td>
                                    <td>${escapeHtml(h.actual_return_date || '')}</td>
                                    <td><span class="status-badge ${getStatusBadgeClass(h.checkout_status)}">${h.checkout_status}</span></td>
                                    <td>${escapeHtml(h.checkout_remarks || h.return_remarks || '')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            historyHtml = `<p style="color:#999;padding:12px;">No checkout history</p>`;
        }
        var historySectionHtml = `
            <div class="detail-history-section">
                <button type="button" class="history-toggle" onclick="toggleHistorySection()">
                    <span>Borrow/Return History (<span id="historyCount">${historyCount}</span> records)</span>
                    <span id="historyArrow">\u25bc</span>
                </button>
                <div id="historyContainer" class="history-container hidden">
                    <div class="history-table-wrapper">
                        ${historyHtml}
                    </div>
                </div>
            </div>
        `;

        var stockStatusClass = getDisplayStatusClass(item);
        var stockStatusText = getDisplayStatusText(item);

        var statusRowHtml = '';
        var stockRowHtml = '';

        if (isExceptionalStatus) {
            statusRowHtml = `
                <div class="detail-row">
                    <div>
                        <div class="detail-label">Status</div>
                        <div class="detail-value"><span class="status-badge ${stockStatusClass}">${stockStatusText}</span></div>
                    </div>
                    <div>
                        <div class="detail-label">Stock</div>
                        <div class="detail-value">${availQty} / ${totalQty}</div>
                    </div>
                </div>
            `;
        } else {
            stockRowHtml = `
                <div class="detail-row">
                    <div>
                        <div class="detail-label">Stock</div>
                        <div class="detail-value"><span class="detail-stock-value"><span class="status-badge ${stockStatusClass}">${stockStatusText}</span></span></div>
                    </div>
                    <div>
                        <div class="detail-label">Unit Measure</div>
                        <div class="detail-value">${escapeHtml(item.UnitMeasure || '')}</div>
                    </div>
                </div>
            `;
        }

        var actionsHtml = '';
        if (isAuthenticated) {
            var btns = [];
            if (canCheckout) btns.push('<button class="checkout-btn" onclick="closeModal(); openCheckoutModal(' + item.id + ')">Checkout</button>');
            if (canReturn) btns.push('<button class="return-btn" onclick="closeModal(); openReturnModal(' + item.id + ')">Return</button>');
            if (isAdmin) btns.push('<button class="edit" onclick="closeModal(); startEdit(' + item.id + ')">Edit</button>');
            if (isAdmin) btns.push('<button class="delete" onclick="closeModal(); deleteSample(' + item.id + ')">Delete</button>');
            if (btns.length > 0) {
                actionsHtml = '<div class="form-actions">' + btns.join('') + '</div>';
            }
        } else {
            actionsHtml = '<div class="guest-hint">Login to checkout or return samples</div>';
        }

        const content = document.getElementById('sampleDetailContent');
        content.innerHTML = `
            <div class="detail-row">
                <div>
                    <div class="detail-label">Title</div>
                    <div class="detail-value">${escapeHtml(item.Title || '')}</div>
                </div>
                <div>
                    <div class="detail-label">Serial Number</div>
                    <div class="detail-value">${escapeHtml(item.SerialNum || '')}</div>
                </div>
            </div>
            <div class="detail-row">
                <div>
                    <div class="detail-label">Sample Type</div>
                    <div class="detail-value">${escapeHtml(item.SampleType || '')}</div>
                </div>
                <div>
                    <div class="detail-label">Storage Rack</div>
                    <div class="detail-value">${escapeHtml(item.StorageLocationCode || '')}</div>
                </div>
            </div>
            <div class="detail-row">
                <div>
                    <div class="detail-label">Category</div>
                    <div class="detail-value">${escapeHtml(item.Category || '')}</div>
                </div>
                <div>
                    <div class="detail-label">Sub Category</div>
                    <div class="detail-value">${escapeHtml(item.SubCategory || '')}</div>
                </div>
            </div>
            <div class="detail-row">
                <div>
                    <div class="detail-label">Brand</div>
                    <div class="detail-value">${escapeHtml(item.Brand || '')}</div>
                </div>
                <div>
                    <div class="detail-label">Model</div>
                    <div class="detail-value">${escapeHtml(item.Model || '')}</div>
                </div>
            </div>
            <div class="detail-row">
                <div>
                    <div class="detail-label">Department Owner</div>
                    <div class="detail-value">${escapeHtml(item.DepartmentOwner || '')}</div>
                </div>
                <div>
                    <div class="detail-label">Condition</div>
                    <div class="detail-value">${escapeHtml(item.Condition || '')}</div>
                </div>
            </div>
            <div class="detail-row">
                <div>
                    <div class="detail-label">Date Received</div>
                    <div class="detail-value">${escapeHtml(item.DateReceived || '')}</div>
                </div>
                ${isExceptionalStatus ? '<div><div class="detail-label">Unit Measure</div><div class="detail-value">' + escapeHtml(item.UnitMeasure || '') + '</div></div>' : '<div></div>'}
            </div>
            ${statusRowHtml}
            ${stockRowHtml}
            <div class="detail-row" style="grid-column: 1 / -1;">
                <div class="detail-label">Notes</div>
                <div class="detail-value" style="margin-top:5px;">${escapeHtml(item.Notes || '')}</div>
            </div>
            ${actionsHtml}
            ${historySectionHtml}
        `;

        const historyContainer = document.getElementById('historyContainer');
        const historyArrow = document.getElementById('historyArrow');
        if (historyContainer) historyContainer.classList.add('hidden');
        if (historyArrow) historyArrow.textContent = '\u25bc';

        openModal('detailModal');
    } catch (err) {
        console.error(err);
        showToast('Error loading details', 'error');
    }
}

// ============================================================
// Dashboard Functions
// ============================================================

// ============================================================
// Dashboard
// ============================================================

async function loadDashboard() {
    try {
        // Stats
        const statsRes = await fetch(API.stats());
        if (!statsRes.ok) throw new Error(`Failed to load stats: ${statsRes.status}`);
        const stats = await statsRes.json();
        
        document.getElementById('statTotal').textContent = stats.total_samples || 0;
        document.getElementById('statInStock').textContent = stats.in_stock || 0;
        document.getElementById('statCheckedOut').textContent = stats.checked_out || 0;
        document.getElementById('statOverdue').textContent = stats.overdue || 0;
        document.getElementById('statLost').textContent = stats.lost || 0;
        document.getElementById('statScrapped').textContent = stats.scrapped || 0;
        
        // Current Checkout
        const curRes = await fetch(API.currentCheckout());
        if (!curRes.ok) throw new Error(`Failed to load current checkout: ${curRes.status}`);
        const current = await curRes.json();
        renderCurrentCheckout(current);
        
        // Overdue
        const overdueRes = await fetch(API.overdue());
        if (!overdueRes.ok) throw new Error(`Failed to load overdue: ${overdueRes.status}`);
        const overdue = await overdueRes.json();
        renderOverdue(overdue);
        
        // Rack Summary
        const rackRes = await fetch(API.rackSummary());
        if (!rackRes.ok) throw new Error(`Failed to load rack summary: ${rackRes.status}`);
        const racks = await rackRes.json();
        renderRackSummary(racks);
        
        // Recent Returns
        const recentRes = await fetch(API.recentReturns());
        if (!recentRes.ok) throw new Error(`Failed to load recent returns: ${recentRes.status}`);
        const recent = await recentRes.json();
        renderRecentReturns(recent);
        
    } catch (err) {
        console.error('Dashboard load error:', err);
        // Show error message in dashboard sections
        document.getElementById('statTotal').textContent = 'Error';
        document.getElementById('statInStock').textContent = 'Error';
        document.getElementById('statCheckedOut').textContent = 'Error';
        document.getElementById('statOverdue').textContent = 'Error';
        document.getElementById('statLost').textContent = 'Error';
        document.getElementById('statScrapped').textContent = 'Error';
        
        document.getElementById('currentCheckoutContainer').innerHTML = 
            '<p style="color:#c62828;padding:20px;">Error loading data. Please check console for details.</p>';
        document.getElementById('overdueContainer').innerHTML = 
            '<p style="color:#c62828;padding:20px;">Error loading data. Please check console for details.</p>';
        document.getElementById('rackSummaryBody').innerHTML = 
            '<tr><td colspan="6" style="text-align:center;padding:20px;color:#c62828;">Error loading data</td></tr>';
        document.getElementById('recentReturnsContainer').innerHTML = 
            '<p style="color:#c62828;padding:20px;">Error loading data. Please check console for details.</p>';
    }
}

function renderCurrentCheckout(items) {
    const container = document.getElementById('currentCheckoutContainer');
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color:#999;padding:20px;">No items currently checked out</p>';
        return;
    }
    
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f8f8f8;">
                    <th style="padding:8px;text-align:left;font-size:12px;">Sample</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Rack</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Borrower</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Dept</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Checkout</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Expected</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.sample_title || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.storage_location_code || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.borrower_name || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.borrower_department || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.checkout_date || '')}</td>
                        <td style="padding:8px;font-size:13px;color:#d32f2f;">${escapeHtml(item.expected_return_date || '')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderOverdue(items) {
    const container = document.getElementById('overdueContainer');
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color:#4CAF50;padding:20px;">No overdue items!</p>';
        return;
    }
    
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f8f8f8;">
                    <th style="padding:8px;text-align:left;font-size:12px;">Sample</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Rack</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Borrower</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Dept</th>
                    <th style="padding:8px;text-align:left;font-size:12px;color:#d32f2f;">Expected</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Days Overdue</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => {
                    const overdueDays = Math.floor((new Date() - new Date(item.expected_return_date)) / (1000 * 60 * 60 * 24));
                    return `
                        <tr style="border-bottom:1px solid #ffcdd2;">
                            <td style="padding:8px;font-size:13px;">${escapeHtml(item.sample_title || '')}</td>
                            <td style="padding:8px;font-size:13px;">${escapeHtml(item.storage_location_code || '')}</td>
                            <td style="padding:8px;font-size:13px;">${escapeHtml(item.borrower_name || '')}</td>
                            <td style="padding:8px;font-size:13px;">${escapeHtml(item.borrower_department || '')}</td>
                            <td style="padding:8px;font-size:13px;color:#d32f2f;">${escapeHtml(item.expected_return_date || '')}</td>
                            <td style="padding:8px;font-size:13px;color:#d32f2f;font-weight:bold;">${overdueDays} days</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderRackSummary(racks) {
    const tbody = document.getElementById('rackSummaryBody');
    if (!racks || racks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">No rack data</td></tr>';
        return;
    }
    
    tbody.innerHTML = racks.map(r => `
        <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 12px;font-weight:600;">${escapeHtml(r.rack || 'N/A')}</td>
            <td style="padding:10px 12px;">${r.total || 0}</td>
            <td style="padding:10px 12px;color:#2e7d32;">${r.in_stock || 0}</td>
            <td style="padding:10px 12px;color:#1565c0;">${r.checked_out || 0}</td>
            <td style="padding:10px 12px;color:#7b1fa2;">${r.lost || 0}</td>
            <td style="padding:10px 12px;color:#616161;">${r.scrapped || 0}</td>
        </tr>
    `).join('');
}

function renderRecentReturns(items) {
    const container = document.getElementById('recentReturnsContainer');
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color:#999;padding:20px;">No recent returns</p>';
        return;
    }
    
    container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f8f8f8;">
                    <th style="padding:8px;text-align:left;font-size:12px;">Sample</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Borrower</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Dept</th>
                    <th style="padding:8px;text-align:left;font-size:12px;">Returned</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.sample_title || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.borrower_name || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.borrower_department || '')}</td>
                        <td style="padding:8px;font-size:13px;">${escapeHtml(item.actual_return_date || '')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ============================================================
// Navigation
// ============================================================

function showSection(section) {
    if ((section === 'dashboard' || section === 'users') && (!currentUser || !currentUser.is_admin)) {
        const label = section === 'dashboard' ? 'Dashboard' : 'Users';
        alert(label + ' access is restricted to administrators.');
        return;
    }
    closeMenu();
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sec => sec.classList.add('hidden'));
    
    if (section === 'samples') {
        document.querySelectorAll('.nav-tab')[0].classList.add('active');
        document.getElementById('samples-section').classList.remove('hidden');
        loadItems();
    } else if (section === 'dashboard') {
        document.querySelectorAll('.nav-tab')[1].classList.add('active');
        document.getElementById('dashboard-section').classList.remove('hidden');
        loadDashboard();
    } else if (section === 'users') {
        document.querySelectorAll('.nav-tab')[2].classList.add('active');
        document.getElementById('users-section').classList.remove('hidden');
        loadUsers();
    }
}

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    try {
        const response = await fetch(API.users());
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#c62828;">Access denied</td></tr>';
                return;
            }
            throw new Error('Failed to load users');
        }
        const users = await response.json();
        renderUsers(users);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#c62828;">Error loading users</td></tr>';
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#999;">No users found</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => {
        const role = u.is_admin ? 'System Administrator' : 'Regular User';
        const status = u.is_active ? 'Active' : 'Inactive';
        const email = u.email || '-';
        return `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:14px 15px;font-size:14px;color:#555;">${escapeHtml(u.username)}</td>
                <td style="padding:14px 15px;font-size:14px;color:#555;">${escapeHtml(role)}</td>
                <td style="padding:14px 15px;font-size:14px;color:#555;">${escapeHtml(email)}</td>
                <td style="padding:14px 15px;font-size:14px;color:#555;">${escapeHtml(status)}</td>
                <td style="padding:14px 15px;font-size:14px;color:#555;">
                    <button class="edit" onclick="openUserEditModal(${u.id})">Edit</button>
                    <button class="edit" onclick="openUserResetPasswordModal(${u.id}, '${escapeHtml(u.username)}')">Reset Password</button>
                    ${!u.is_admin ? `<button class="delete" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

async function openUserEditModal(userId) {
    document.getElementById('userEditError').style.display = 'none';
    document.getElementById('userEditError').textContent = '';
    try {
        const response = await fetch(API.userDetail(userId));
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to load user');
        }
        const user = await response.json();
        document.getElementById('userEditId').value = user.id;
        document.getElementById('userEditUsername').textContent = user.username;
        document.getElementById('userEditEmail').value = user.email || '';
        document.getElementById('userEditRole').value = user.is_admin ? 'admin' : 'regular';
        document.getElementById('userEditStatus').value = user.is_active ? 'active' : 'inactive';
        openModal('userEditModal');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function closeUserEditModal() {
    document.getElementById('userEditError').style.display = 'none';
    closeModal();
}

async function submitUserEdit(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('userEditError');
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';

    const userId = parseInt(document.getElementById('userEditId').value);
    const email = document.getElementById('userEditEmail').value.trim();
    const is_admin = document.getElementById('userEditRole').value === 'admin';
    const is_active = document.getElementById('userEditStatus').value === 'active';

    const data = { email, is_admin, is_active };

    try {
        const response = await fetch(API.userUpdate(userId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to update user');
        }
        closeUserEditModal();
        loadUsers();
        alert('User updated successfully');
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    }
}

function openUserResetPasswordModal(userId, username) {
    document.getElementById('resetPasswordUserId').value = userId;
    document.getElementById('resetPasswordUsername').textContent = username;
    document.getElementById('resetPasswordNew').value = '';
    document.getElementById('resetPasswordConfirm').value = '';
    document.getElementById('resetPasswordError').style.display = 'none';
    openModal('userResetPasswordModal');
}

function closeUserResetPasswordModal() {
    document.getElementById('resetPasswordError').style.display = 'none';
    closeModal();
}

async function submitUserResetPassword(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('resetPasswordError');
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';

    const userId = parseInt(document.getElementById('resetPasswordUserId').value);
    const newPassword = document.getElementById('resetPasswordNew').value;
    const confirmPassword = document.getElementById('resetPasswordConfirm').value;

    if (!newPassword) {
        errorDiv.textContent = 'New password is required';
        errorDiv.style.display = 'block';
        return;
    }
    if (!confirmPassword) {
        errorDiv.textContent = 'Confirm password is required';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(API.userResetPassword(userId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPassword })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to reset password');
        }
        closeUserResetPasswordModal();
        alert('Password reset successfully');
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    }
}

async function deleteUser(userId, username) {
    if (!confirm('Are you sure you want to delete user "' + username + '"? This action cannot be undone.')) {
        return;
    }
    try {
        const response = await fetch(API.userDelete(userId), {
            method: 'DELETE'
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to delete user');
        }
        loadUsers();
        alert('User deleted successfully');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ============================================================
// Initialization
// ============================================================

// ============================================================
// Event Listeners
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Restore auth session
    loadCurrentUser();

    loadItems();
});
