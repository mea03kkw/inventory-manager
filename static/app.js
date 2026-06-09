// ============================================================
// HC R&D Sample Library - Frontend Application
// ============================================================

const API_BASE = '/api';

const APP_LOGIN_URL = "https://moko-sample.up.railway.app/";

var _adminContactEmail = '';

function loadAdminContactEmail() {
    fetch('/api/settings/admin-contact')
        .then(function(r) { return r.json(); })
        .then(function(contact) {
            _adminContactEmail = contact.email || '';
        })
        .catch(function() {
            _adminContactEmail = '';
        });
}

function openAdminDirectMailto(subject, body) {
    var email = _adminContactEmail;
    if (!email) {
        showToast('Could not determine admin contact email', 'error');
        return;
    }
    var mailto = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    window.location.href = mailto;
}

function openRegisterMailto() {
    openAdminDirectMailto(
        'HC R&D Sample Library \u2013 Account Request',
        'Hello,\r\n\r\nPlease create an account for me.\r\n\r\nThanks.'
    );
}

function openForgotPasswordMailto() {
    openAdminDirectMailto(
        'HC R&D Sample Library \u2013 Password Reset',
        'Hello,\r\n\r\nPlease reset my password.\r\n\r\nThanks.'
    );
}

const API = {
    // Auth
    login: () => `${API_BASE}/auth/login`,
    logout: () => `${API_BASE}/auth/logout`,
    me: () => `${API_BASE}/auth/me`,
    register: () => `${API_BASE}/auth/register`,
    changePassword: () => `${API_BASE}/auth/change-password`,
    adminCreateUser: () => `${API_BASE}/auth/admin/create-user`,
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
    userDelete: (id) => `${API_BASE}/users/${id}`,
    // My Samples / My Profile
    mySummary: () => `${API_BASE}/me/sample-summary`,
    myActiveCheckouts: () => `${API_BASE}/me/active-checkouts`,
    myCheckoutHistory: () => `${API_BASE}/me/checkout-history`,
    myProfile: () => `${API_BASE}/me/profile`,
    myChangePassword: () => `${API_BASE}/me/change-password`,
    // Photo
    photoUpload: (id) => `${API_BASE}/items/${id}/photo`,
    photoDelete: (id) => `${API_BASE}/items/${id}/photo`,
    photoGet: (id) => `${API_BASE}/items/${id}/photo`
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
// Photo State (for Add/Edit modal)
// ============================================================

let photoState = {
    file: null,
    previewUrl: null,
    removed: false,
    initialPhotoUrl: null
};

function resetPhotoState() {
    if (photoState.previewUrl && photoState.previewUrl !== photoState.initialPhotoUrl) {
        URL.revokeObjectURL(photoState.previewUrl);
    }
    photoState.file = null;
    photoState.previewUrl = null;
    photoState.removed = false;
    photoState.initialPhotoUrl = null;
}

// ============================================================
// Client-side image compression
// ============================================================

function compressImage(file, maxSizeBytes, maxWidth) {
    return new Promise(function(resolve, reject) {
        if (maxSizeBytes === undefined) maxSizeBytes = 300 * 1024;
        if (maxWidth === undefined) maxWidth = 1280;

        if (file.size <= maxSizeBytes) {
            resolve(file);
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var w = img.width;
                var h = img.height;
                if (w > maxWidth) {
                    var ratio = maxWidth / w;
                    w = maxWidth;
                    h = Math.round(h * ratio);
                }
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);

                var quality = 0.85;
                var lastBlob = null;
                function tryQuality() {
                    canvas.toBlob(function(blob) {
                        if (!blob) {
                            if (lastBlob) {
                                resolve(lastBlob);
                            } else {
                                reject(new Error('Compression failed'));
                            }
                            return;
                        }
                        if (blob.size <= maxSizeBytes || quality <= 0.2) {
                            resolve(blob);
                        } else {
                            lastBlob = blob;
                            quality -= 0.05;
                            tryQuality();
                        }
                    }, 'image/jpeg', quality);
                }
                tryQuality();
            };
            img.onerror = function() {
                reject(new Error('Failed to load image'));
            };
            img.src = e.target.result;
        };
        reader.onerror = function() {
            reject(new Error('Failed to read file'));
        };
        reader.readAsDataURL(file);
    });
}

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
        `;
    }
    updateUIBasedOnRole();
    updateGuestShellVisibility();
}

function updateUIBasedOnRole() {
    const isAdmin = currentUser && currentUser.is_admin;
    const isAuth = currentUser !== null;
    // Toggle admin background indicator on body
    document.body.classList.toggle('admin-mode', isAdmin);
    // Show/hide admin-only navigation tabs
    document.querySelectorAll('[data-admin-only]').forEach(el => {
        if (isAdmin) {
            el.classList.add('admin-visible');
        } else {
            el.classList.remove('admin-visible');
        }
    });
    // Show/hide auth-only navigation tabs
    document.querySelectorAll('[data-auth-only]').forEach(el => {
        if (isAuth) {
            el.classList.add('auth-visible');
        } else {
            el.classList.remove('auth-visible');
        }
    });
    // Apply admin-only button visibility
    applyAdminOnlyVisibility(currentUser);
    // If on Dashboard section and user is not admin, switch to Samples
    const dashboardSection = document.getElementById('dashboard-section');
    if (!isAdmin && !dashboardSection.classList.contains('hidden')) {
        showSection('samples');
    }
    // If on My Samples or My Profile and user is not authenticated, switch to Samples
    const mySamplesSection = document.getElementById('my-samples-page');
    const myProfileSection = document.getElementById('my-profile-page');
    if (!isAuth) {
        if (mySamplesSection && !mySamplesSection.classList.contains('hidden')) {
            showSection('samples');
        }
        if (myProfileSection && !myProfileSection.classList.contains('hidden')) {
            showSection('samples');
        }
    }
}

function applyAdminOnlyVisibility(currentUser) {
    var mobileAdminRow = document.getElementById('mobile-admin-action-row');
    var addWrap = document.getElementById('admin-add-sample-wrap');
    var exportWrap = document.getElementById('admin-export-csv-wrap');
    var isAdmin = !!currentUser && currentUser.is_admin === true;
    if (mobileAdminRow) mobileAdminRow.hidden = !isAdmin;
    if (addWrap) addWrap.hidden = !isAdmin;
    if (exportWrap) exportWrap.hidden = !isAdmin;
}

async function handleLandingLogin(e) {
    e.preventDefault();

    var btn = document.getElementById('landingLoginBtn');
    var errorBox = document.getElementById('landingLoginError');

    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }

    setButtonPending(btn, true, 'Signing in...');

    try {
        var usernameEl = document.getElementById('landingLoginUsername');
        var passwordEl = document.getElementById('landingLoginPassword');

        if (usernameEl) document.getElementById('loginUsername').value = usernameEl.value;
        if (passwordEl) document.getElementById('loginPassword').value = passwordEl.value;

        await submitLogin(e);
    } catch (err) {
        if (errorBox) {
            errorBox.textContent = (err && err.message) || 'Login failed';
            errorBox.style.display = 'block';
        }
    } finally {
        setButtonPending(btn, false);
    }
}

function updateGuestShellVisibility() {
    var guestEntry = document.getElementById('guestEntry');
    var appShell = document.getElementById('appShell');
    var footer = document.querySelector('.app-footer');
    var isAuth = currentUser !== null;

    if (guestEntry) guestEntry.classList.toggle('hidden', isAuth);
    if (appShell) appShell.classList.toggle('hidden-shell', !isAuth);
    if (footer) footer.style.display = isAuth ? '' : 'none';

    if (!isAuth) {
        var btn = document.getElementById('landingLoginBtn');
        var errorBox = document.getElementById('landingLoginError');
        var usernameEl = document.getElementById('landingLoginUsername');
        var passwordEl = document.getElementById('landingLoginPassword');

        setButtonPending(btn, false);

        if (errorBox) {
            errorBox.style.display = 'none';
            errorBox.textContent = '';
        }

        if (usernameEl) usernameEl.value = '';
        if (passwordEl) passwordEl.value = '';
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
        closeModal();
        if (currentUser.must_change_password) {
            showToast('You must change your password before continuing.', 'error');
            openChangePasswordModal();
            return;
        }
        if (currentUser && currentUser.is_admin) {
            showSection('dashboard');
        } else {
            showSection('my-samples');
        }
        showToast('Logged in successfully', 'success');
    } catch (err) {
        setButtonPending(submitBtn, false);
        showToast('Error: ' + err.message, 'error');
    }
}

function showInfoModal(title, message) {
    document.getElementById('infoModalTitle').textContent = title;
    document.getElementById('infoModalMessage').innerHTML = message;
    openModal('infoModal');
}

function showRegisterInfo() {
    fetch('/api/settings/admin-contact').then(r => r.json()).then(contact => {
        const email = contact.email || '';
        const link = email ? `<a href="mailto:${escapeHtml(email)}" style="color:#0B5ED7;text-decoration:underline;">${escapeHtml(email)}</a>` : 'your system administrator';
        showInfoModal('Contact Administrator',
            'Account registration is restricted.<br><br>' +
            `Please contact ${link} for account setup or password reset.`
        );
    }).catch(() => {
        showInfoModal('Contact Administrator',
            'Account registration is restricted.<br><br>' +
            'Please contact your system administrator for account setup or password reset.'
        );
    });
}

function showForgotPasswordInfo() {
    fetch('/api/settings/admin-contact').then(r => r.json()).then(contact => {
        const email = contact.email || '';
        const link = email ? `<a href="mailto:${escapeHtml(email)}" style="color:#0B5ED7;text-decoration:underline;">${escapeHtml(email)}</a>` : 'your system administrator';
        showInfoModal('Forgot Password',
            'Password reset is handled by the administrator.<br><br>' +
            `Please contact ${link}.`
        );
    }).catch(() => {
        showInfoModal('Forgot Password',
            'Password reset is handled by the administrator.<br><br>' +
            'Please contact your system administrator.'
        );
    });
}

async function submitRegister(e) {
    e.preventDefault();
    showRegisterInfo();
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

function openChangePasswordModal() {
    document.getElementById('changePasswordOld').value = '';
    document.getElementById('changePasswordNew').value = '';
    document.getElementById('changePasswordConfirm').value = '';
    document.getElementById('changePasswordError').style.display = 'none';
    document.getElementById('changePasswordSuccess').style.display = 'none';
    const oldGroup = document.getElementById('changePasswordOldGroup');
    if (oldGroup) oldGroup.style.display = '';
    document.getElementById('changePasswordOld').required = true;
    openModal('changePasswordModal');
}

async function submitChangePassword(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    const oldPassword = document.getElementById('changePasswordOld').value;
    const newPassword = document.getElementById('changePasswordNew').value;
    const confirmPassword = document.getElementById('changePasswordConfirm').value;

    if (!oldPassword) {
        errorDiv.textContent = 'Old password is required';
        errorDiv.style.display = 'block';
        return;
    }
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
    if (newPassword.length < 8) {
        errorDiv.textContent = 'New password must be at least 8 characters';
        errorDiv.style.display = 'block';
        return;
    }

    const submitBtn = document.querySelector('#changePasswordModal .form-actions button[type="submit"]');
    setButtonPending(submitBtn, true, 'Changing...');
    try {
        const response = await fetch(API.changePassword(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to change password');
        }
        successDiv.textContent = 'Password changed successfully';
        successDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        setButtonPending(submitBtn, false);
        await loadCurrentUser();
        if (currentUser && currentUser.must_change_password === false) {
            if (currentUser.is_admin) showSection('dashboard');
            else showSection('my-samples');
        }
        document.getElementById('changePasswordOld').value = '';
        document.getElementById('changePasswordNew').value = '';
        document.getElementById('changePasswordConfirm').value = '';
        setTimeout(() => closeModal(), 1500);
    } catch (err) {
        setButtonPending(submitBtn, false);
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    }
}

async function adminCreateUser() {
    const email = document.getElementById('createUserEmail').value.trim();
    const role = document.getElementById('createUserRole').value;
    const resultDiv = document.getElementById('createUserResult');

    if (!email) { showToast('Email is required', 'error'); return; }
    if (!email.endsWith('@philips.com')) { showToast('Email must end with @philips.com', 'error'); return; }

    const submitBtn = document.querySelector('#createUserForm .form-actions button');
    setButtonPending(submitBtn, true, 'Creating...');

    try {
        const response = await fetch(API.adminCreateUser(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to create user');
        }
        const data = await response.json();
        const createdUsername = data.username;
        const createdEmail = data.email;
        const tempPassword = data.temporary_password;
        const adminEmail = data.admin_email || (currentUser && currentUser.email) || '';
        const loginUrl = APP_LOGIN_URL;

        var mailSubject = 'HC R&D Sample Library \u2013 Account Created';
        var mailBody = [
            'Hello,',
            '',
            'An account has been created for you in the HC R&D Sample Library.',
            '',
            'Username: ' + createdUsername,
            'Temporary Password: ' + tempPassword,
            'Login page: ' + loginUrl,
            '',
            'Please log in and change your password immediately on first login.',
            '',
            'If you have any issue, please contact your system administrator.',
            '',
            'Regards,',
            adminEmail,
        ].join('\r\n');

        var mailtoUrl = 'mailto:' + encodeURIComponent(createdEmail) +
            '?subject=' + encodeURIComponent(mailSubject) +
            '&body=' + encodeURIComponent(mailBody);

        resultDiv.setAttribute('data-mailto-url', mailtoUrl);
        resultDiv.setAttribute('data-mail-body', mailBody);
        resultDiv.setAttribute('data-temp-password', tempPassword);

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = [
            '<p style="margin:0 0 8px;font-weight:600;color:#2e7d32;">Account created successfully</p>',
            '<p style="margin:4px 0;"><strong>Username:</strong> ' + escapeHtml(createdUsername) + '</p>',
            '<p style="margin:4px 0;"><strong>Email:</strong> ' + escapeHtml(createdEmail) + '</p>',
            '<p style="margin:4px 0;"><strong>Temporary Password:</strong></p>',
            '<div style="background:#fff;border:1px solid #c8e6c9;border-radius:6px;padding:10px 14px;font-family:monospace;font-size:16px;user-select:all;margin:4px 0 8px;">' + escapeHtml(tempPassword) + '</div>',
            '<div class="create-user-actions">',
            '<button class="action-email-btn" onclick="_emailCreatedUser()">Email User</button>',
            '<button class="action-copy-btn" onclick="_copyCreateUserEmail()">Copy Email</button>',
            '<button class="action-copy-btn" onclick="_copyCreateUserPassword()">Copy Password</button>',
            '</div>',
            '<p style="margin:8px 0 0;color:#e65100;font-size:13px;">User must change password on first login.</p>',
        ].join('');
        document.getElementById('createUserEmail').value = '';
        document.getElementById('createUserDerivedUsername').textContent = '(auto-derived from email)';
        loadUsers();
        showToast('User created successfully', 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        setButtonPending(submitBtn, false);
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
// Clipboard & Create-User Action Helpers
// ============================================================

function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast(successMsg || 'Copied', 'success');
        }).catch(function() {
            fallbackCopyToClipboard(text, successMsg);
        });
    } else {
        fallbackCopyToClipboard(text, successMsg);
    }
}

function fallbackCopyToClipboard(text, successMsg) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast(successMsg || 'Copied', 'success');
    } catch (e) {
        showToast('Copy failed', 'error');
    }
    document.body.removeChild(textarea);
}

function _emailCreatedUser() {
    var div = document.getElementById('createUserResult');
    var url = div ? div.getAttribute('data-mailto-url') : '';
    if (url) window.location.href = url;
}

function _copyCreateUserEmail() {
    var div = document.getElementById('createUserResult');
    var body = div ? div.getAttribute('data-mail-body') : '';
    if (body) copyToClipboard(body, 'Email text copied');
}

function _copyCreateUserPassword() {
    var div = document.getElementById('createUserResult');
    var pw = div ? div.getAttribute('data-temp-password') : '';
    if (pw) copyToClipboard(pw, 'Password copied');
}

function _resetPwGetDiv(id) {
    return document.getElementById(id);
}

function _resetPwEmailUser(id) {
    var div = _resetPwGetDiv(id);
    var url = div ? div.getAttribute('data-mailto-url') : '';
    if (url) window.location.href = url;
}

function _resetPwCopyEmail(id) {
    var div = _resetPwGetDiv(id);
    var body = div ? div.getAttribute('data-mail-body') : '';
    if (body) copyToClipboard(body, 'Email text copied');
}

function _resetPwCopyPassword(id) {
    var div = _resetPwGetDiv(id);
    var pw = div ? div.getAttribute('data-temp-password') : '';
    if (pw) copyToClipboard(pw, 'Password copied');
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
        return '\n            <tr onclick="viewItem(' + item.id + ')" style="cursor:pointer;">\n                <td class="photo-col-cell">' + (item.PhotoLink ? '<img class="table-photo-thumb" src="' + API.photoGet(item.id) + '" alt="">' : '') + '</td>\n                <td>' + escapeHtml(item.ProductName || item.Title || '') + '</td>\n                <td>' + escapeHtml(item.SerialNum || '') + '</td>\n                <td>' + escapeHtml(item.Brand || '') + '</td>\n                <td>' + escapeHtml(item.Category || '') + '</td>\n                <td>' + escapeHtml(item.SampleType || '') + '</td>\n                <td>' + escapeHtml(item.StorageLocationCode || '') + '</td>\n                <td><span class="status-badge ' + statusClass + '">' + statusText + '</span></td>\n                <td>' + actionCellHtml + '</td>\n            </tr>\n        ';
    }).join('');

    if (cardsContainer) {
        cardsContainer.innerHTML = allItems.map(item => {
            const status = normalizeStatus(item.status || item.Status);
            var metaParts = [];
            if (item.Brand) metaParts.push(item.Brand);
            if (item.Category) metaParts.push(item.Category);
            if (item.StorageLocationCode) metaParts.push(item.StorageLocationCode);
            if (item.SampleType) metaParts.push(item.SampleType);
            var metaHtml = metaParts.length > 0
                ? '<div class="inventory-card__meta">' + metaParts.map(function(p) { return '<span class="inventory-card__meta-item">' + escapeHtml(p) + '</span>'; }).join('<span class="inventory-card__meta-sep">·</span>') + '</div>'
                : '';

            var statusText = getDisplayStatusText(item);
            var statusClass = getDisplayStatusClass(item);
            var actionHtml = getPrimaryActionHtml(item, canBorrowReturn);

            var cardHtml;
            if (item.PhotoLink) {
                cardHtml = '\n<div class="inventory-card inventory-card-photo" onclick="viewItem(' + item.id + ')">\n  <div class="inventory-card__photo-layout">\n    <div class="inventory-card__thumb-wrap"><img class="mobile-card-thumb" src="' + API.photoGet(item.id) + '" alt=""></div>\n    <div class="inventory-card__photo-content">\n      <div class="inventory-card__identity">\n        <div class="inventory-card__title">' + escapeHtml(item.ProductName || item.Title || '') + '</div>\n        <div class="inventory-card__serial">' + escapeHtml(item.SerialNum || '') + '</div>\n      </div>\n      <div class="inventory-card__status-row">\n        <span class="status-badge ' + statusClass + '">' + statusText + '</span>\n        ' + (actionHtml ? '<div class="inventory-card__action">' + actionHtml + '</div>' : '') + '\n      </div>\n      ' + metaHtml + '\n    </div>\n  </div>\n</div>';
            } else {
                cardHtml = '\n<div class="inventory-card" onclick="viewItem(' + item.id + ')">\n  <div class="inventory-card__identity">\n    <div class="inventory-card__title">' + escapeHtml(item.ProductName || item.Title || '') + '</div>\n    <div class="inventory-card__serial">' + escapeHtml(item.SerialNum || '') + '</div>\n  </div>\n  <div class="inventory-card__status-row">\n    <span class="status-badge ' + statusClass + '">' + statusText + '</span>\n    ' + (actionHtml ? '<div class="inventory-card__action">' + actionHtml + '</div>' : '') + '\n  </div>\n  ' + metaHtml + '\n</div>';
            }
            return cardHtml;
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

const REQUIRED_FIELDS = ['ProductName', 'Brand', 'Model', 'Category', 'Environment', 'UnitCount', 'DateReceived'];

const FIELD_LABELS = {
    ProductName: 'Product Name',
    Brand: 'Brand',
    Model: 'Model',
    Category: 'Category',
    Environment: 'Box Number',
    UnitCount: 'Unit Count',
    DateReceived: 'Date Received'
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
    // Validate UnitCount is numeric
    var ucEl = document.getElementById('UnitCount');
    if (ucEl && ucEl.value) {
        var uc = parseInt(ucEl.value, 10);
        if (isNaN(uc) || uc <= 0) {
            markFieldInvalid('UnitCount', 'Unit Count must be a positive number');
            if (!firstInvalid) firstInvalid = ucEl;
        }
    }
    if (firstInvalid) {
        firstInvalid.focus();
        return false;
    }
    return true;
}

function normalizeItemFormData() {
    FIELD_LIST.forEach(function(f) {
        var el = document.getElementById(f);
        if (el && el.type !== 'select-one') {
            el.value = (el.value || '').trim();
        }
    });
    var ucEl = document.getElementById('UnitCount');
    if (ucEl && ucEl.value !== '') {
        ucEl.value = String(parseInt(ucEl.value, 10) || 1);
    }
    // Sync generated fields to the legacy field names for backend compatibility
    var synced = {
        Title: 'ProductName',
        SerialNum: 'serial_num_display',
        SampleType: 'sample_type_display'
    };
    for (var dest in synced) {
        var srcEl = document.getElementById(synced[dest]);
        var destEl = document.getElementById(dest);
        if (srcEl && srcEl.value && destEl) {
            destEl.value = srcEl.value;
        }
    }
}

const FIELD_LIST = [
    "Title", "SerialNum", "SampleType", "ProductName", "Brand", "Model",
    "Category", "SubCategory", "DepartmentOwner", "Condition", "DateReceived",
    "StorageLocationCode", "UnitCount", "UnitMeasure", "Status", "PhotoLink",
    "Notes", "Column1", "Attachments", "sample_code", "record_state", "Environment"
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
    // Also clear generated preview fields
    var sc = document.getElementById('sample_code');
    if (sc) sc.value = '';
    var sn = document.getElementById('serial_num_display');
    if (sn) sn.value = '';
    var st = document.getElementById('sample_type_display');
    if (st) st.value = '';
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
    // Populate the displayed generated fields
    var sc = document.getElementById('sample_code');
    if (sc) sc.value = item.sample_code || '';
    var sn = document.getElementById('serial_num_display');
    if (sn) sn.value = item.SerialNum || '';
    var st = document.getElementById('sample_type_display');
    if (st) st.value = item.SampleType || '';
}

function showAddForm() {
    if (!currentUser || !currentUser.is_admin) {
        showToast('Only administrators can add or edit samples.', 'error');
        return;
    }
    resetPhotoState();
    clearForm();
    editingId = null;
    document.getElementById('formTitle').textContent = 'Add New Sample';
    document.getElementById('submitBtn').textContent = 'Add Sample';
    
    // Load master data dropdowns
    loadMasterData();
    
    // Attach live preview listeners (only once)
    var brandEl = document.getElementById('Brand');
    var dateEl = document.getElementById('DateReceived');
    if (brandEl && !brandEl._livePreviewAttached) {
        brandEl.addEventListener('input', updateLivePreview);
        brandEl._livePreviewAttached = true;
    }
    if (dateEl && !dateEl._livePreviewAttached) {
        dateEl.addEventListener('change', updateLivePreview);
        dateEl._livePreviewAttached = true;
    }
    
    openModal('addModal');
    setTimeout(function() {
        var titleEl = document.getElementById('ProductName');
        if (titleEl) titleEl.focus();
    }, 100);
}

function startEdit(id) {
    if (!currentUser || !currentUser.is_admin) {
        showToast('Only administrators can edit samples.', 'error');
        return;
    }
    var item = allItems.find(function(i) { return String(i.id) === String(id); });
    if (!item) {
        console.error('Edit error: item not found in allItems, id=', id);
        return;
    }
    resetPhotoState();
    editingId = id;
    fillForm(item);
    document.getElementById('formTitle').textContent = 'Edit Sample';
    document.getElementById('submitBtn').textContent = 'Save Changes';

    // Load existing photo if present
    var photoSection = document.getElementById('photoSection');
    if (photoSection) photoSection.style.display = currentUser.is_admin ? '' : 'none';
    var photoPreview = document.getElementById('photoPreview');
    var photoActions = document.getElementById('photoActions');
    var photoRemoveBtn = document.getElementById('photoRemoveBtn');

    if (item.PhotoLink) {
        photoState.initialPhotoUrl = API.photoGet(id);
        if (photoPreview) {
            photoPreview.src = API.photoGet(id);
            photoPreview.style.display = '';
        }
        if (photoRemoveBtn) photoRemoveBtn.style.display = '';
        if (photoActions) photoActions.style.display = '';
    } else {
        if (photoPreview) photoPreview.style.display = 'none';
        if (photoRemoveBtn) photoRemoveBtn.style.display = 'none';
    }

    // Load master data for dropdowns
    loadMasterData();

    // Attach live preview listeners
    var brandEl = document.getElementById('Brand');
    var dateEl = document.getElementById('DateReceived');
    if (brandEl && !brandEl._livePreviewAttached) {
        brandEl.addEventListener('input', updateLivePreview);
        brandEl._livePreviewAttached = true;
    }
    if (dateEl && !dateEl._livePreviewAttached) {
        dateEl.addEventListener('change', updateLivePreview);
        dateEl._livePreviewAttached = true;
    }

    openModal('addModal');
    setTimeout(function() {
        var titleEl = document.getElementById('ProductName');
        if (titleEl) titleEl.focus();
    }, 100);
}

function cancelEdit() {
    editingId = null;
    resetPhotoState();
    clearForm();
    document.getElementById('formTitle').textContent = 'Add New Sample';
    document.getElementById('submitBtn').textContent = 'Add Sample';
    var photoPreview = document.getElementById('photoPreview');
    if (photoPreview) photoPreview.style.display = 'none';
    var photoRemoveBtn = document.getElementById('photoRemoveBtn');
    if (photoRemoveBtn) photoRemoveBtn.style.display = 'none';
    var photoStatus = document.getElementById('photoStatus');
    if (photoStatus) photoStatus.textContent = '';
    var photoInput = document.getElementById('photoInput');
    if (photoInput) photoInput.value = '';
    closeModal();
}

// ============================================================
// Master data loading
// ============================================================

async function loadMasterData() {
    // Load departments
    var deptSelect = document.getElementById('DepartmentOwner');
    if (deptSelect && deptSelect.options.length <= 1) {
        try {
            var res = await fetch('/api/master/departments');
            var depts = await res.json();
            depts.forEach(function(d) {
                var opt = document.createElement('option');
                opt.value = d.code;
                opt.textContent = d.name;
                deptSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load departments:', e);
        }
    }
    // Load storage locations
    var locSelect = document.getElementById('StorageLocationCode');
    if (locSelect && locSelect.options.length <= 1) {
        try {
            var res = await fetch('/api/master/storage-locations');
            var locs = await res.json();
            locs.forEach(function(l) {
                var opt = document.createElement('option');
                opt.value = l.code;
                opt.textContent = l.code;
                locSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load storage locations:', e);
        }
    }
    // Load categories
    var catSelect = document.getElementById('Category');
    if (catSelect && catSelect.options.length <= 1) {
        try {
            var res = await fetch('/api/master/categories');
            var cats = await res.json();
            cats.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = c.name;
                catSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load categories:', e);
        }
    }
}

// ============================================================
// Live preview for generated fields
// ============================================================

async function updateLivePreview() {
    var brand = (document.getElementById('Brand').value || '').trim();
    var dateReceived = document.getElementById('DateReceived').value;
    
    var scEl = document.getElementById('sample_code');
    var snEl = document.getElementById('serial_num_display');
    var stEl = document.getElementById('sample_type_display');
    
    if (!brand || !dateReceived) {
        if (stEl) stEl.value = '';
        if (scEl) scEl.value = '';
        if (snEl) snEl.value = '';
        return;
    }
    
    // Client-side preview of SampleType
    var sampleType = brand.toLowerCase() === 'philips' ? 'Philips' : 'Competitor';
    if (stEl) stEl.value = sampleType;
    
    // If we have an editing ID or active draft, try getting the real generated code from backend
    var id = editingId || (document.getElementById('itemId').value ? parseInt(document.getElementById('itemId').value) : null);
    if (id) {
        try {
            var res = await fetch('/api/items/' + id);
            if (res.ok) {
                var item = await res.json();
                if (scEl && item.sample_code) scEl.value = item.sample_code;
                if (snEl && item.SerialNum) snEl.value = item.SerialNum;
                if (stEl && item.SampleType) stEl.value = item.SampleType;
                return;
            }
        } catch (e) {
            // Fall through to client-side preview
        }
    }
    
    // Client-side preview (approximate - real code uses DB ID)
    var prefix = sampleType === 'Philips' ? 'PHI' : 'CMT';
    var year = dateReceived.substring(0, 4);
    if (scEl) scEl.value = prefix + year + '-????';
    if (snEl) snEl.value = year + '????';
}

// ============================================================
// Photo Selection Handlers
// ============================================================

function handlePhotoSelect() {
    var input = document.getElementById('photoInput');
    if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];

    var allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.indexOf(file.type) === -1) {
        showToast('Invalid file type. Allowed: JPG, PNG, WEBP', 'error');
        input.value = '';
        return;
    }

    var photoStatus = document.getElementById('photoStatus');
    if (photoStatus) photoStatus.textContent = 'Compressing...';

    compressImage(file, 300 * 1024, 1280).then(function(compressed) {
        photoState.file = compressed;
        photoState.removed = false;

        var previewUrl = URL.createObjectURL(compressed);
        if (photoState.previewUrl && photoState.previewUrl !== photoState.initialPhotoUrl) {
            URL.revokeObjectURL(photoState.previewUrl);
        }
        photoState.previewUrl = previewUrl;

        var preview = document.getElementById('photoPreview');
        if (preview) {
            preview.src = previewUrl;
            preview.style.display = '';
        }

        var removeBtn = document.getElementById('photoRemoveBtn');
        if (removeBtn) removeBtn.style.display = '';

        var uploadBtn = document.getElementById('photoUploadBtn');
        if (uploadBtn) uploadBtn.textContent = 'Replace Photo';

        var sizeKb = Math.round(compressed.size / 1024);
        if (photoStatus) photoStatus.textContent = 'Compressed: ' + sizeKb + ' KB';
    }).catch(function(err) {
        showToast('Image compression failed: ' + err.message, 'error');
        if (photoStatus) photoStatus.textContent = 'Compression failed';
        input.value = '';
    });
}

function handlePhotoRemove() {
    if (photoState.previewUrl && photoState.previewUrl !== photoState.initialPhotoUrl) {
        URL.revokeObjectURL(photoState.previewUrl);
    }
    photoState.file = null;
    photoState.previewUrl = null;
    photoState.removed = true;

    var preview = document.getElementById('photoPreview');
    if (preview) preview.style.display = 'none';

    var removeBtn = document.getElementById('photoRemoveBtn');
    if (removeBtn) removeBtn.style.display = 'none';

    var uploadBtn = document.getElementById('photoUploadBtn');
    if (uploadBtn) uploadBtn.textContent = 'Choose Photo';

    var input = document.getElementById('photoInput');
    if (input) input.value = '';

    var status = document.getElementById('photoStatus');
    if (status) status.textContent = 'Photo will be removed on save';
}

async function submitItemForm(e) {
    e.preventDefault();
    
    clearFieldValidation();
    normalizeItemFormData();
    if (!validateItemForm()) return;
    
    var submitBtn = document.getElementById('submitBtn');
    setButtonPending(submitBtn, true, 'Saving...');
    
    var data = {};
    FIELD_LIST.forEach(function(f) {
        var el = document.getElementById(f);
        if (el) {
            if (el.tagName === 'SELECT' || el.type === 'checkbox') {
                data[f] = el.value || '';
            } else {
                data[f] = el.value || '';
            }
        }
    });
    
    if (!data.Status || data.Status === '') {
        data.Status = 'IN_STOCK';
    }

    var savedItemId = editingId;
    
    try {
        if (editingId === null) {
            var response = await fetch(API.create(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                var err = await response.json();
                throw new Error(err.detail || 'Failed to create sample');
            }
            var created = await response.json();
            savedItemId = created.id;
            showToast('Sample created successfully', 'success');
        } else {
            var response = await fetch(API.update(editingId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                var err = await response.json();
                throw new Error(err.detail || 'Failed to update sample');
            }
            showToast('Sample updated successfully', 'success');
            editingId = null;
        }

        // Photo upload/delete happens only after sample record save succeeds
        if (savedItemId) {
            if (photoState.file) {
                var formData = new FormData();
                formData.append('file', photoState.file, 'photo.jpg');
                var photoRes = await fetch(API.photoUpload(savedItemId), {
                    method: 'POST',
                    body: formData
                });
                if (!photoRes.ok) {
                    var photoErr = await photoRes.json();
                    showToast('Sample saved but photo upload failed: ' + (photoErr.detail || 'Unknown error'), 'error');
                } else {
                    showToast('Photo uploaded', 'success');
                }
            } else if (photoState.removed && photoState.initialPhotoUrl) {
                var delRes = await fetch(API.photoDelete(savedItemId), {
                    method: 'DELETE'
                });
                if (!delRes.ok) {
                    var delErr = await delRes.json();
                    showToast('Sample saved but photo removal failed: ' + (delErr.detail || 'Unknown error'), 'error');
                } else {
                    showToast('Photo removed', 'success');
                }
            }
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

    // Also delete photo if present
    var item = allItems.find(function(i) { return String(i.id) === String(id); });
    if (item && item.PhotoLink) {
        try {
            await fetch(API.photoDelete(id), { method: 'DELETE' });
        } catch (e) {
            // Non-critical; continue with item deletion
        }
    }

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
                    ${historyHtml}
                </div>
            </div>
        `;

        var stockStatusClass = getDisplayStatusClass(item);
        var stockStatusText = getDisplayStatusText(item);

        var actionsHtml = '';
        if (isAuthenticated) {
            var btns = [];
            if (canCheckout) btns.push('<button class="checkout-btn" onclick="closeModal(); openCheckoutModal(' + item.id + ')">Checkout</button>');
            if (canReturn) btns.push('<button class="return-btn" onclick="closeModal(); openReturnModal(' + item.id + ')">Return</button>');
            if (isAdmin) btns.push('<button class="edit" onclick="closeModal(); startEdit(' + item.id + ')">Edit</button>');
            if (isAdmin) btns.push('<button class="delete" onclick="closeModal(); deleteSample(' + item.id + ')">Delete</button>');
            if (btns.length > 0) {
                actionsHtml = '<div class="detail-actions">' + btns.join('') + '</div>';
            }
        } else {
            actionsHtml = '<div class="guest-hint">Login to checkout or return samples</div>';
        }

        const content = document.getElementById('sampleDetailContent');

        function detailItem(label, value, fullWidth, multiline) {
            var val = (value === null || value === undefined || value === '') ? '\u2014' : value;
            var cls = 'detail-item';
            if (fullWidth) cls += ' detail-item-full';
            if (multiline) {
                return '<div class="' + cls + '"><div class="detail-label">' + label + '</div><div class="detail-value detail-value-multiline">' + val + '</div></div>';
            }
            return '<div class="' + cls + '"><div class="detail-label">' + label + '</div><div class="detail-value">' + val + '</div></div>';
        }

        var stockBadgeHtml = '<span class="status-badge ' + stockStatusClass + '">' + stockStatusText + '</span>';

        var compactGridHtml = '<div class="sample-details-compact-grid">';
        compactGridHtml += detailItem('Product Name', escapeHtml(item.ProductName || item.Title || ''));
        compactGridHtml += detailItem('Sample Code', escapeHtml(item.sample_code || item.SerialNum || ''));
        compactGridHtml += detailItem('Sample Type', escapeHtml(item.SampleType || ''));
        compactGridHtml += detailItem('Serial Number', escapeHtml(item.SerialNum || ''));
        compactGridHtml += detailItem('Brand', escapeHtml(item.Brand || ''));
        compactGridHtml += detailItem('Model', escapeHtml(item.Model || ''));
        compactGridHtml += detailItem('Category', escapeHtml(item.Category || ''));
        compactGridHtml += detailItem('Sub Category', escapeHtml(item.SubCategory || ''));
        compactGridHtml += detailItem('Department Owner', escapeHtml(item.DepartmentOwner || ''));
        compactGridHtml += detailItem('Condition', escapeHtml(item.Condition || ''));
        compactGridHtml += detailItem('Date Received', item.DateReceived ? escapeHtml(item.DateReceived) : '');
        compactGridHtml += detailItem('Storage Rack', escapeHtml(item.StorageLocationCode || ''));
        compactGridHtml += detailItem('Box Number', escapeHtml(item.Environment || ''));
        compactGridHtml += detailItem('Unit Count', escapeHtml(item.UnitCount || ''));
        compactGridHtml += detailItem('Stock', stockBadgeHtml);
        compactGridHtml += detailItem('Notes', escapeHtml(item.Notes || ''), true, true);

        // Photo thumbnail in detail view
        if (item.PhotoLink) {
            compactGridHtml += '<div class="detail-item detail-item-full">';
            compactGridHtml += '<div class="detail-label">Photo</div>';
            compactGridHtml += '<div class="detail-value"><img src="' + API.photoGet(item.id) + '" alt="Sample photo" style="max-width:120px;max-height:120px;border-radius:4px;object-fit:cover;cursor:pointer;" onclick="window.open(\'' + API.photoGet(item.id) + '\', \'_blank\')"></div>';
            compactGridHtml += '</div>';
        }

        compactGridHtml += '</div>';

        content.innerHTML = compactGridHtml + actionsHtml + historySectionHtml;

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
// My Samples / My Profile
// ============================================================

var _mySamplesFilter = 'all';
var _mySamplesHistoryPage = 1;
var _myReturnCheckoutId = null;
var _myReturnMaxQty = 1;

function loadMySamples() {
    if (!currentUser) return;
    loadMySummary();
    loadMyActiveCheckouts();
    loadMyHistory();
}

async function loadMySummary() {
    try {
        var res = await fetch(API.mySummary());
        if (!res.ok) throw new Error('Failed to load summary');
        var data = await res.json();
        document.getElementById('summary-count-checked-out').textContent = data.currently_checked_out || 0;
        document.getElementById('summary-count-overdue').textContent = data.overdue || 0;
        document.getElementById('summary-count-due-soon').textContent = data.due_soon || 0;
        document.getElementById('summary-count-returned-this-month').textContent = data.returned_this_month || 0;
    } catch (err) {
        console.error('Summary load error:', err);
    }
}

async function loadMyActiveCheckouts() {
    var loading = document.getElementById('active-loading');
    if (loading) loading.style.display = '';
    var search = document.getElementById('my-samples-search').value;
    var filter = _mySamplesFilter === 'history' ? 'all' : _mySamplesFilter;
    var url = API.myActiveCheckouts() + '?filter=' + encodeURIComponent(filter);
    if (search) url += '&search=' + encodeURIComponent(search);

    try {
        var res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load active checkouts');
        var items = await res.json();

        var cardsContainer = document.getElementById('active-checkouts-cards');
        var tableBody = document.getElementById('active-checkouts-table-body');
        var emptyState = document.getElementById('active-checkouts-empty');

        if (loading) loading.style.display = 'none';

        if (!items || items.length === 0) {
            cardsContainer.innerHTML = '';
            tableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            var tableContainer = document.getElementById('active-checkouts-table-container');
            if (tableContainer) tableContainer.style.display = 'none';
            return;
        }

        emptyState.classList.add('hidden');
        var activeTableContainer = document.getElementById('active-checkouts-table-container');
        if (activeTableContainer) activeTableContainer.style.display = '';

        // Mobile cards
        cardsContainer.innerHTML = items.map(function(item) {
            var statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ');
            var statusClass = 'status-' + item.status;
            var dueDisplay = item.due_date || '\u2014';
            return '\n<div class="sample-mobile-card" onclick="viewMySample(' + item.sample_id + ')">\n  <div class="sample-mobile-card__top">\n    <div class="sample-mobile-card__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B5ED7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>\n    <div class="sample-mobile-card__title">' + escapeHtml(item.sample_name || '') + '</div>\n    <span class="my-samples-status-badge ' + statusClass + '">' + statusLabel + '</span>\n  </div>\n  <div class="sample-mobile-card__meta">' +
                (item.sample_code ? escapeHtml(item.sample_code) : '') +
                (item.sample_code && item.sample_type ? '<span class="sample-mobile-card__meta-sep">\u00B7</span>' : '') +
                (item.sample_type ? escapeHtml(item.sample_type) : '') +
                (item.category ? '<span class="sample-mobile-card__meta-sep">\u00B7</span>' + escapeHtml(item.category) : '') +
            '</div>\n  <div class="sample-mobile-card__dates">' +
                '<strong>Qty:</strong> ' + item.quantity +
                ' | <strong>Checkout:</strong> ' + escapeHtml(item.checkout_date || '') +
                ' | <strong>Due:</strong> ' + dueDisplay +
            '</div>\n  <div class="sample-mobile-card__actions">\n    <button class="btn-primary" onclick="event.stopPropagation();openMyReturn(' + item.checkout_id + ',' + item.quantity + ')">Return</button>\n  </div>\n</div>';
        }).join('');

        // Desktop table
        tableBody.innerHTML = items.map(function(item) {
            var statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('_', ' ');
            var statusClass = 'status-' + item.status;
            var dueDisplay = item.due_date || '\u2014';
            return '\n<tr onclick="viewMySample(' + item.sample_id + ')">\n  <td><div class="sample-name-cell">' + escapeHtml(item.sample_name || '') + '</div>' +
                (item.sample_code ? '<div class="sample-code-cell">' + escapeHtml(item.sample_code) + '</div>' : '') +
            '</td>\n  <td>' + escapeHtml(item.category || item.sample_type || '') + '</td>\n  <td>' + item.quantity + '</td>\n  <td>' + escapeHtml(item.checkout_date || '') + '</td>\n  <td>' + dueDisplay + '</td>\n  <td><span class="my-samples-status-badge ' + statusClass + '">' + statusLabel + '</span></td>\n  <td class="actions-cell">\n    <button class="btn-primary" onclick="event.stopPropagation();openMyReturn(' + item.checkout_id + ',' + item.quantity + ')">Return</button>\n  </td>\n</tr>';
        }).join('');
    } catch (err) {
        console.error('Active checkouts load error:', err);
        var loadingEl = document.getElementById('active-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        document.getElementById('active-checkouts-cards').innerHTML = '<div class="empty-state-card"><p style="color:#D92D20;">Error loading checkouts. Please try again.</p></div>';
    }
}

async function loadMyHistory() {
    var histLoading = document.getElementById('history-loading');
    if (histLoading) histLoading.style.display = '';
    var search = document.getElementById('my-samples-search').value;
    _mySamplesHistoryPage = 1;
    var url = API.myCheckoutHistory() + '?page=1&page_size=20';
    if (search) url += '&search=' + encodeURIComponent(search);

    try {
        var res = await fetch(url);
        if (!res.ok) throw new Error('Failed to load history');
        var data = await res.json();

        var cardsContainer = document.getElementById('history-cards');
        var tableBody = document.getElementById('history-table-body');
        var emptyState = document.getElementById('history-empty');
        var pagination = document.getElementById('history-pagination');

        if (histLoading) histLoading.style.display = 'none';

        if (!data.items || data.items.length === 0) {
            cardsContainer.innerHTML = '';
            tableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            pagination.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Mobile cards
        cardsContainer.innerHTML = data.items.map(function(item) {
            return '\n<div class="sample-mobile-card" onclick="viewMySample(' + item.sample_id + ')">\n  <div class="sample-mobile-card__top">\n    <div class="sample-mobile-card__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B5ED7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>\n    <div class="sample-mobile-card__title">' + escapeHtml(item.sample_name || '') + '</div>\n  </div>\n  <div class="sample-mobile-card__meta">' +
                (item.sample_code ? escapeHtml(item.sample_code) : '') +
            '</div>\n  <div class="sample-mobile-card__dates">' +
                '<strong>Qty:</strong> ' + (item.quantity || 1) +
                ' | <strong>Checkout:</strong> ' + escapeHtml(item.checkout_date || '') +
                ' | <strong>Returned:</strong> ' + escapeHtml(item.actual_return_date || '') +
            '</div>\n</div>';
        }).join('');

        // Desktop table
        tableBody.innerHTML = data.items.map(function(item) {
            return '\n<tr onclick="viewMySample(' + item.sample_id + ')">\n  <td><div class="sample-name-cell">' + escapeHtml(item.sample_name || '') + '</div>' +
                (item.sample_code ? '<div class="sample-code-cell">' + escapeHtml(item.sample_code) + '</div>' : '') +
            '</td>\n  <td>' + (item.quantity || 1) + '</td>\n  <td>' + escapeHtml(item.checkout_date || '') + '</td>\n  <td>' + escapeHtml(item.actual_return_date || '') + '</td>\n</tr>';
        }).join('');

        // Pagination
        if (data.total > data.page * data.page_size) {
            pagination.classList.remove('hidden');
        } else {
            pagination.classList.add('hidden');
        }
    } catch (err) {
        console.error('History load error:', err);
        document.getElementById('history-cards').innerHTML = '<div class="empty-state-card"><p style="color:#D92D20;">Error loading history.</p></div>';
        var histLoadErr = document.getElementById('history-loading');
        if (histLoadErr) histLoadErr.style.display = 'none';
    }
}

function loadMoreHistory() {
    _mySamplesHistoryPage++;
    var search = document.getElementById('my-samples-search').value;
    var url = API.myCheckoutHistory() + '?page=' + _mySamplesHistoryPage + '&page_size=20';
    if (search) url += '&search=' + encodeURIComponent(search);

    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.items || data.items.length === 0) return;
            var tableBody = document.getElementById('history-table-body');
            var cardsContainer = document.getElementById('history-cards');
            var pagination = document.getElementById('history-pagination');

            data.items.forEach(function(item) {
                // Desktop row
                var row = '\n<tr onclick="viewMySample(' + item.sample_id + ')">\n  <td><div class="sample-name-cell">' + escapeHtml(item.sample_name || '') + '</div>' +
                    (item.sample_code ? '<div class="sample-code-cell">' + escapeHtml(item.sample_code) + '</div>' : '') +
                '</td>\n  <td>' + (item.quantity || 1) + '</td>\n  <td>' + escapeHtml(item.checkout_date || '') + '</td>\n  <td>' + escapeHtml(item.actual_return_date || '') + '</td>\n</tr>';
                tableBody.insertAdjacentHTML('beforeend', row);

                // Mobile card
                var card = '\n<div class="sample-mobile-card" onclick="viewMySample(' + item.sample_id + ')">\n  <div class="sample-mobile-card__top">\n    <div class="sample-mobile-card__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B5ED7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>\n    <div class="sample-mobile-card__title">' + escapeHtml(item.sample_name || '') + '</div>\n  </div>\n  <div class="sample-mobile-card__meta">' +
                    (item.sample_code ? escapeHtml(item.sample_code) : '') +
                '</div>\n  <div class="sample-mobile-card__dates">' +
                    '<strong>Qty:</strong> ' + (item.quantity || 1) +
                    ' | <strong>Checkout:</strong> ' + escapeHtml(item.checkout_date || '') +
                    ' | <strong>Returned:</strong> ' + escapeHtml(item.actual_return_date || '') +
                '</div>\n</div>';
                cardsContainer.insertAdjacentHTML('beforeend', card);
            });

            if (data.total > data.page * data.page_size) {
                pagination.classList.remove('hidden');
            } else {
                pagination.classList.add('hidden');
            }
        })
        .catch(function(err) {
            console.error('Load more history error:', err);
        });
}

function setMySamplesFilter(filter) {
    _mySamplesFilter = filter;
    document.querySelectorAll('#my-samples-filter-bar .filter-chip').forEach(function(chip) {
        chip.classList.remove('active');
    });
    document.querySelectorAll('#my-samples-filter-bar .filter-chip').forEach(function(chip) {
        if (chip.getAttribute('data-filter') === filter) {
            chip.classList.add('active');
        }
    });

    var activeSection = document.getElementById('my-samples-active-section');
    var historySection = document.getElementById('my-samples-history-section');

    if (filter === 'history') {
        if (activeSection) activeSection.style.display = 'none';
        if (historySection) historySection.style.display = '';
    } else {
        if (activeSection) activeSection.style.display = '';
        if (historySection) historySection.style.display = '';
        loadMyActiveCheckouts();
    }
}

function viewMySample(sampleId) {
    closeModal();
    viewItem(sampleId);
}

function openMyReturn(checkoutId, maxQty) {
    _myReturnCheckoutId = checkoutId;
    _myReturnMaxQty = maxQty;
    document.getElementById('myReturnQuantityGroup').style.display = maxQty > 1 ? '' : 'none';
    var qtyInput = document.getElementById('myReturnQuantity');
    qtyInput.value = maxQty;
    qtyInput.min = 1;
    qtyInput.max = maxQty;
    document.getElementById('myReturnModalBody').textContent = 'Confirm return for this checked-out sample.' + (maxQty > 1 ? ' (Max: ' + maxQty + ')' : '');
    document.getElementById('myReturnError').style.display = 'none';
    document.getElementById('myReturnConfirmBtn').disabled = false;
    document.getElementById('myReturnConfirmBtn').textContent = 'Confirm Return';
    openModal('myReturnModal');
}

async function confirmMyReturn() {
    if (!_myReturnCheckoutId) return;

    var qty = parseInt(document.getElementById('myReturnQuantity').value) || 1;
    if (qty < 1 || qty > _myReturnMaxQty) {
        document.getElementById('myReturnError').textContent = 'Quantity must be between 1 and ' + _myReturnMaxQty;
        document.getElementById('myReturnError').style.display = 'block';
        return;
    }

    var today = new Date().toISOString().split('T')[0];
    var btn = document.getElementById('myReturnConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Returning...';

    try {
        var res = await fetch(API.checkoutReturn(_myReturnCheckoutId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: qty, actual_return_date: today, return_remarks: '' })
        });

        if (!res.ok) {
            var err = await res.json();
            throw new Error(err.detail || 'Return failed');
        }

        closeModal();
        showToast('Returned successfully', 'success');
        _myReturnCheckoutId = null;
        loadMySamples();
    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Confirm Return';
        document.getElementById('myReturnError').textContent = err.message;
        document.getElementById('myReturnError').style.display = 'block';
    }
}

// ============================================================
// My Profile
// ============================================================

async function loadMyProfile() {
    if (!currentUser) return;
    try {
        var res = await fetch(API.myProfile());
        if (!res.ok) throw new Error('Failed to load profile');
        var data = await res.json();

        document.getElementById('profile-username').textContent = data.username || '-';
        document.getElementById('profile-email').textContent = data.email || '-';
        var roleLabel = data.role === 'admin' ? 'System Administrator' : 'Regular User';
        document.getElementById('profile-role').textContent = roleLabel;
        var statusLabel = data.status === 'active' ? 'Active' : 'Inactive';
        document.getElementById('profile-status').textContent = statusLabel;
    } catch (err) {
        console.error('Profile load error:', err);
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
    if ((section === 'my-samples' || section === 'my-profile') && !currentUser) {
        alert('Please log in to access your personal area.');
        return;
    }
    closeMenu();
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sec => sec.classList.add('hidden'));
    
    // Activate the matching tab using data-section attribute
    var activeTab = document.querySelector('.nav-tab[data-section="' + section + '"]');
    if (activeTab) {
        activeTab.classList.add('active');
    }

    if (section === 'samples') {
        document.getElementById('samples-section').classList.remove('hidden');
        loadItems();
    } else if (section === 'dashboard') {
        document.getElementById('dashboard-section').classList.remove('hidden');
        loadDashboard();
    } else if (section === 'users') {
        document.getElementById('users-section').classList.remove('hidden');
        loadUsers();
    } else if (section === 'my-samples') {
        document.getElementById('my-samples-page').classList.remove('hidden');
        loadMySamples();
    } else if (section === 'my-profile') {
        document.getElementById('my-profile-page').classList.remove('hidden');
        loadMyProfile();
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
    const cardsContainer = document.getElementById('usersCards');
    if (!users || users.length === 0) {
        const emptyRow = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#999;">No users found</td></tr>';
        tbody.innerHTML = emptyRow;
        if (cardsContainer) cardsContainer.innerHTML = '<div class="users-empty">No users found</div>';
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
                    <button class="edit" onclick="openUserResetPasswordModal(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(email)}')">Reset Password</button>
                    ${!u.is_admin ? `<button class="delete" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    if (cardsContainer) {
        cardsContainer.innerHTML = users.map(u => {
            const role = u.is_admin ? 'System Administrator' : 'Regular User';
            const status = u.is_active ? 'Active' : 'Inactive';
            const email = u.email || '-';
            const statusClass = u.is_active ? 'users-status-active' : 'users-status-inactive';
            return `
                <div class="users-card">
                    <div class="users-card__header">
                        <span class="users-card__username">${escapeHtml(u.username)}</span>
                        <span class="users-card__role">${escapeHtml(role)}</span>
                    </div>
                    <div class="users-card__body">
                        <div class="users-card__row"><span class="users-card__label">Email</span><span class="users-card__value">${escapeHtml(email)}</span></div>
                    </div>
                    <div class="users-card__status-row">
                        <span class="users-status-chip ${statusClass}">${escapeHtml(status)}</span>
                    </div>
                    <div class="users-card__actions">
                        <button class="edit" onclick="openUserEditModal(${u.id})">Edit</button>
                        <button class="edit" onclick="openUserResetPasswordModal(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(email)}')">Reset</button>
                        ${!u.is_admin ? `<button class="delete" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">Delete</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
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
        showToast('User updated successfully', 'success');
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    }
}

function openUserResetPasswordModal(userId, username, email) {
    document.getElementById('resetPasswordUserId').value = userId;
    document.getElementById('resetPasswordUsername').textContent = username;
    document.getElementById('resetPasswordEmail').textContent = email || '';
    document.getElementById('resetPasswordError').style.display = 'none';
    openModal('userResetPasswordModal');
}

function closeUserResetPasswordModal() {
    document.getElementById('resetPasswordError').style.display = 'none';
    document.getElementById('resetPasswordSuccess').style.display = 'none';
    document.getElementById('resetPasswordSuccess').innerHTML = '';
    const form = document.querySelector('#userResetPasswordModal form');
    if (form) form.style.display = '';
    closeModal();
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) return;
    try {
        const response = await fetch(API.userDelete(userId), { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to delete user');
        }
        showToast(`User "${username}" deleted successfully`, 'success');
        loadUsers();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function submitUserResetPassword(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('resetPasswordError');
    const successDiv = document.getElementById('resetPasswordSuccess');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    const userId = parseInt(document.getElementById('resetPasswordUserId').value);

    const submitBtn = document.querySelector('#userResetPasswordModal .form-actions button[type="submit"]');
    setButtonPending(submitBtn, true, 'Resetting...');

    try {
        const response = await fetch(API.userResetPassword(userId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to reset password');
        }
        const data = await response.json();
        setButtonPending(submitBtn, false);

        var tempPassword = data.temporary_password;
        var userEmail = data.email;
        var adminEmail = data.admin_email || (currentUser && currentUser.email) || '';
        var username = document.getElementById('resetPasswordUsername').textContent;
        var loginUrl = APP_LOGIN_URL;
        var mailSubject = 'HC R&D Sample Library \u2013 Password Reset';
        var mailBody = [
            'Hello,',
            '',
            'Your password has been reset in the HC R&D Sample Library.',
            '',
            'Username: ' + username,
            'Temporary Password: ' + tempPassword,
            'Login page: ' + loginUrl,
            '',
            'Please log in and change your password immediately on first login.',
            '',
            'If you have any issue, please contact your system administrator.',
            '',
            'Regards,',
            adminEmail,
        ].join('\r\n');

        var mailtoUrl = 'mailto:' + encodeURIComponent(userEmail) +
            '?subject=' + encodeURIComponent(mailSubject) +
            '&body=' + encodeURIComponent(mailBody);

        var resultId = 'resetPwResult_' + Date.now();
        successDiv.innerHTML = [
            '<div style="background:#e8f5e9;border-radius:8px;padding:16px;border-left:4px solid #2e7d32;" id="' + resultId + '" data-mailto-url="' + mailtoUrl.replace(/"/g, '&quot;') + '" data-mail-body="' + mailBody.replace(/"/g, '&quot;') + '" data-temp-password="' + tempPassword.replace(/"/g, '&quot;') + '">',
            '<p style="margin:0 0 8px;font-weight:600;color:#2e7d32;">Password reset successfully</p>',
            '<p style="margin:4px 0;"><strong>Username:</strong> ' + escapeHtml(username) + '</p>',
            '<p style="margin:4px 0;"><strong>Email:</strong> ' + escapeHtml(userEmail) + '</p>',
            '<p style="margin:4px 0;"><strong>Temporary Password:</strong></p>',
            '<div style="background:#fff;border:1px solid #c8e6c9;border-radius:6px;padding:10px 14px;font-family:monospace;font-size:16px;user-select:all;margin:4px 0 8px;">' + escapeHtml(tempPassword) + '</div>',
            '<div class="create-user-actions">',
            '<button class="action-email-btn" onclick="_resetPwEmailUser(\'' + resultId + '\')">Email User</button>',
            '<button class="action-copy-btn" onclick="_resetPwCopyEmail(\'' + resultId + '\')">Copy Email</button>',
            '<button class="action-copy-btn" onclick="_resetPwCopyPassword(\'' + resultId + '\')">Copy Password</button>',
            '</div>',
            '<p style="margin:0;color:#e65100;font-size:13px;">User must change password on next login.</p>',
            '<button type="button" style="margin-top:10px;" onclick="closeUserResetPasswordModal();loadUsers();">Done</button>',
            '</div>',
        ].join('');
        successDiv.style.display = 'block';
        document.querySelector('#userResetPasswordModal form').style.display = 'none';
    } catch (err) {
        setButtonPending(submitBtn, false);
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

    loadAdminContactEmail();

    loadItems();

    // Email preview for Create User form
    const emailInput = document.getElementById('createUserEmail');
    if (emailInput) {
        emailInput.addEventListener('input', function() {
            const val = this.value.trim();
            const preview = document.getElementById('createUserDerivedUsername');
            if (preview) {
                if (val && val.includes('@')) {
                    preview.textContent = val.split('@')[0];
                } else {
                    preview.textContent = '(auto-derived from email)';
                }
            }
        });
    }
});
