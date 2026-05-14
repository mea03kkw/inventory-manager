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
    userUpdate: (id) => `${API_BASE}/users/${id}`
};

// ============================================================
// Global State
// ============================================================

let editingId = null;
let allItems = [];
let allRacks = new Set();
let currentUser = null;

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
        alert('Logged in successfully');
    } catch (err) {
        alert('Error: ' + err.message);
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
        alert('Account created successfully. Please log in.');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function logout() {
    try {
        await fetch(API.logout(), { method: 'POST' });
        currentUser = null;
        updateAuthUI();
        closeMenu();
        loadItems();
        alert('Logged out');
    } catch (err) {
        alert('Error: ' + err.message);
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
    resetCheckoutForm();
    resetReturnForm();
}

function resetCheckoutForm() {
    document.getElementById('checkoutSampleId').value = '';
    document.getElementById('checkoutBorrowerName').textContent = '';
    document.getElementById('borrowerDepartment').value = '';
    document.getElementById('borrowerEmail').value = '';
    document.getElementById('expectedReturnDate').value = '';
    document.getElementById('checkoutRemarks').value = '';
    document.getElementById('checkoutSampleInfo').innerHTML = '';
}

function resetReturnForm() {
    document.getElementById('returnRecordId').value = '';
    document.getElementById('actualReturnDate').value = '';
    document.getElementById('returnRemarks').value = '';
    document.getElementById('returnSampleInfo').innerHTML = '';
}

// ============================================================
// Sample Operations
// ============================================================

// ============================================================
// Item List / Rendering
// ============================================================

async function loadItems() {
    const search = document.getElementById('searchBox').value;
    const status = document.getElementById('statusFilter').value;
    const rack = document.getElementById('rackFilter').value;
    
    let url = `${API.list()}?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (rack) url += `rack=${encodeURIComponent(rack)}&`;
    
    const response = await fetch(url);
    allItems = await response.json();
    
    // Collect racks
    allRacks.clear();
    allItems.forEach(item => {
        if (item.StorageLocationCode) allRacks.add(item.StorageLocationCode);
    });
    updateRackFilter();
    
    renderItems();
}

function renderItems() {
    const tbody = document.getElementById('inventory');

    if (!allItems || allItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#999;">No samples found</td></tr>';
        return;
    }

    const isLoggedIn = currentUser !== null;
    const isAdmin = isLoggedIn && currentUser.is_admin;

    tbody.innerHTML = allItems.map(item => {
        const status = normalizeStatus(item.Status);
        const badgeClass = getStatusBadgeClass(status);

        // Check if there's an active checkout
        const currentBorrower = item.current_borrower_name;
        const borrowerDisplay = currentBorrower ? currentBorrower : '-';
        const expectedDisplay = item.current_expected_return_date || '-';

        const showCheckout = isLoggedIn && !isAdmin && status === 'IN_STOCK';
        const showReturn = isLoggedIn && !isAdmin && status === 'CHECKED_OUT';

        return `
             <tr>
                 <td>${escapeHtml(item.Title || '')}</td>
                 <td>${escapeHtml(item.SerialNum || '')}</td>
                 <td>${escapeHtml(item.SampleType || '')}</td>
                 <td>${escapeHtml(item.StorageLocationCode || '')}</td>
                 <td><span class="status-badge ${badgeClass}">${formatStatus(status)}</span></td>
                 <td>${escapeHtml(borrowerDisplay)}</td>
                 <td>${escapeHtml(expectedDisplay)}</td>
                 <td>
                     <button class="view-btn" onclick="viewItem(${item.id})">View</button>
                     ${isAdmin ? `${status === 'IN_STOCK' ? `<button class="checkout-btn" onclick="openCheckoutModal(${item.id})">Checkout</button>` : ''}${status === 'CHECKED_OUT' ? `<button class="return-btn" onclick="openReturnModal(${item.id})">Return</button>` : ''}` : ''}
                     ${showCheckout ? `<button class="checkout-btn" onclick="openCheckoutModal(${item.id})">Checkout</button>` : ''}
                     ${showReturn ? `<button class="return-btn" onclick="openReturnModal(${item.id})">Return</button>` : ''}
                     ${isAdmin ? `<button class="edit" onclick="startEdit(${item.id})">Edit</button>` : ''}
                     ${isAdmin ? `<button class="delete" onclick="deleteSample(${item.id})">Delete</button>` : ''}
                 </td>
             </tr>
           `;
    }).join('');
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

// ============================================================
// Add/Edit Form
// ============================================================

// ============================================================
// Create / Edit / Delete
// ============================================================

const FIELD_LIST = [
    "Title", "SerialNum", "SampleType", "ProductName", "Brand", "Model",
    "Category", "SubCategory", "DepartmentOwner", "Condition", "DateReceived",
    "StorageLocationCode", "UnitCount", "UnitMeasure", "Status", "PhotoLink",
    "Notes", "Column1", "Attachments"
];

function clearForm() {
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
        alert('Only administrators can add or edit samples.');
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
        alert('Only administrators can edit samples.');
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
            // Create
            const response = await fetch(API.create(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to create sample');
            }
        } else {
            // Update
            console.log('Updating item id:', editingId, 'data:', data);
            const response = await fetch(API.update(editingId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Failed to update sample');
            }
            editingId = null;
        }
        
        cancelEdit();
        await loadItems();
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
    }
}

async function deleteSample(id) {
    if (!currentUser || !currentUser.is_admin) {
        alert('Only administrators can delete samples.');
        return;
    }
    if (!confirm('Are you sure you want to delete this sample?')) return;
    try {
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
        await loadItems();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// ============================================================
// Checkout Operations
// ============================================================

// ============================================================
// Checkout / Return
// ============================================================

async function openCheckoutModal(sampleId) {
    const item = allItems.find(i => String(i.id) === String(sampleId));
    if (!item) return;
    
    const status = normalizeStatus(item.Status);
    if (status !== 'IN_STOCK') {
        alert('This sample cannot be checked out (status: ' + formatStatus(status) + ')');
        return;
    }
    
    document.getElementById('checkoutSampleId').value = sampleId;
    
    // Display current user as borrower
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
    
    // Set default return date to 7 days from now
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
    
    const data = {
        sample_id: parseInt(sampleId),
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
        alert('Sample checked out successfully');
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
    }
}

// ============================================================
// Return Operations
// ============================================================

async function openReturnModal(sampleId) {
    const item = allItems.find(i => String(i.id) === String(sampleId));
    if (!item) return;
    
    const status = normalizeStatus(item.Status);
    if (status !== 'CHECKED_OUT') {
        alert('This sample is not currently checked out');
        return;
    }
    
    // Find the active checkout record
    try {
        const response = await fetch(API.checkoutRecords(sampleId));
        const records = await response.json();
        const active = records.find(r => r.checkout_status === 'OUT');
        
        if (!active) {
            alert('No active checkout record found');
            return;
        }
        
        document.getElementById('returnRecordId').value = active.id;
        
        const info = document.getElementById('returnSampleInfo');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('actualReturnDate').value = today;
        
        info.innerHTML = `
            <div class="sample-info-box">
                <p><strong>Sample:</strong> ${escapeHtml(active.sample_title || item.Title || '')}</p>
                <p><strong>Serial:</strong> ${escapeHtml(active.sample_serial || item.SerialNum || '')}</p>
                <p><strong>Borrower:</strong> ${escapeHtml(active.borrower_name || '')}</p>
                <p><strong>Department:</strong> ${escapeHtml(active.borrower_department || '')}</p>
                <p><strong>Checked Out:</strong> ${escapeHtml(active.checkout_date || '')}</p>
                <p><strong>Expected Return:</strong> ${escapeHtml(active.expected_return_date || '')}</p>
                <p><strong>Checkout Remarks:</strong> ${escapeHtml(active.checkout_remarks || '')}</p>
            </div>
        `;
        
        openModal('returnModal');
    } catch (err) {
        console.error(err);
        alert('Error: Could not load checkout record');
    }
}

async function submitReturn(e) {
    e.preventDefault();
    
    const recordId = document.getElementById('returnRecordId').value;
    const data = {
        actual_return_date: document.getElementById('actualReturnDate').value,
        return_remarks: document.getElementById('returnRemarks').value.trim()
    };
    
    try {
        const response = await fetch(API.checkoutReturn(recordId), {
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
        alert('Sample returned successfully');
    } catch (err) {
        console.error(err);
        alert('Error: ' + err.message);
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
        
        const status = normalizeStatus(item.Status);
        
        let historyHtml = '';
        if (item.checkout_history && item.checkout_history.length > 0) {
            historyHtml = `
                <div class="history-section">
                    <h4>Borrow/Return History</h4>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Borrower</th>
                                    <th>Department</th>
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
                </div>
            `;
        } else {
            historyHtml = `<p style="color:#999;">No checkout history</p>`;
        }
        
        let currentBorrowerHtml = '';
        if (item.current_borrower_name) {
            currentBorrowerHtml = `
                <div class="sample-info-box">
                    <p><strong>Current Borrower:</strong> ${escapeHtml(item.current_borrower_name)}</p>
                    <p><strong>Department:</strong> ${escapeHtml(item.current_borrower_department || '')}</p>
                    <p><strong>Email:</strong> ${escapeHtml(item.current_borrower_email || '')}</p>
                    <p><strong>Expected Return:</strong> ${escapeHtml(item.current_expected_return_date || '')}</p>
                </div>
            `;
        }
        
         const content = document.getElementById('sampleDetailContent');
         const isAdmin = currentUser && currentUser.is_admin;
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
                 <div>
                     <div class="detail-label">Status</div>
                     <div class="detail-value"><span class="status-badge ${getStatusBadgeClass(status)}">${formatStatus(status)}</span></div>
                 </div>
             </div>
             <div class="detail-row">
                 <div>
                     <div class="detail-label">Unit Count</div>
                     <div class="detail-value">${escapeHtml(item.UnitCount || '')}</div>
                 </div>
                 <div>
                     <div class="detail-label">Unit Measure</div>
                     <div class="detail-value">${escapeHtml(item.UnitMeasure || '')}</div>
                 </div>
             </div>
             <div class="detail-row" style="grid-column: 1 / -1;">
                 <div class="detail-label">Notes</div>
                 <div class="detail-value" style="margin-top:5px;">${escapeHtml(item.Notes || '')}</div>
             </div>
             ${currentBorrowerHtml}
             ${historyHtml}
              <div style="margin-top:20px;padding-top:20px;border-top:1px solid #ddd;display:flex;gap:10px;">
                  ${status === 'IN_STOCK' ? `<button class="checkout-btn" onclick="closeModal(); openCheckoutModal(${item.id})">Checkout</button>` : ''}
                  ${status === 'CHECKED_OUT' ? `<button class="return-btn" onclick="closeModal(); openReturnModal(${item.id})">Return</button>` : ''}
                  ${isAdmin ? `<button class="edit" onclick="closeModal(); startEdit(${item.id})">Edit</button>` : ''}
              </div>
         `;
        
        openModal('detailModal');
    } catch (err) {
        console.error(err);
        alert('Error loading details');
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
