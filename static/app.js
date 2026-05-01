const API_BASE = '/api';

let editingId = null;

const FIELD_LIST = [
    "Title", "SerialNum", "SampleType", "ProductName", "Brand", "Model",
    "Category", "SubCategory", "DepartmentOwner", "Condition", "DateReceived",
    "StorageLocationCode", "UnitCount", "UnitMeasure", "Status", "PhotoLink",
    "Notes", "Column1", "Attachments"
];

function clearForm() {
    FIELD_LIST.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = "";
    });
}

function fillForm(item) {
    FIELD_LIST.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.value = item[f] || "";
    });
}

async function loadItems() {
    const response = await fetch(`${API_BASE}/items`);
    const items = await response.json();
    // Keep cache synchronized for edit lookups
    window.allItems = items;
    const tbody = document.getElementById('inventory');
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.Title || ""}</td>
            <td>${item.SerialNum || ""}</td>
            <td>${item.ProductName || ""}</td>
            <td>${item.SampleType || ""}</td>
            <td>${item.Status || ""}</td>
            <td>${item.StorageLocationCode || ""}</td>
            <td>${item.DateReceived || ""}</td>
            <td>
                <button class="edit" onclick="startEdit(${item.id})">Edit</button>
                <button class="delete" onclick="deleteItem(${item.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function startEdit(id) {
    const item = window.allItems?.find(i => i.id === id);
    if (!item) return;
    editingId = id;
    fillForm(item);
    document.getElementById('submitBtn').textContent = 'Save Changes';
    document.getElementById('cancelBtn').style.display = 'inline-block';
}

function cancelEdit() {
    editingId = null;
    clearForm();
    document.getElementById('submitBtn').textContent = 'Add Item';
    document.getElementById('cancelBtn').style.display = 'none';
}

async function submitForm(e) {
    e.preventDefault();
    const data = {};
    FIELD_LIST.forEach(f => {
        data[f] = document.getElementById(f).value || "";
    });

    if (editingId === null) {
        await fetch(`${API_BASE}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch(`${API_BASE}/items/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        editingId = null;
        document.getElementById('submitBtn').textContent = 'Add Item';
        document.getElementById('cancelBtn').style.display = 'none';
    }
    clearForm();
    loadItems();
}

async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
    loadItems();
}

async function init() {
    // Ensure form is in Add mode on page load
    editingId = null;
    document.getElementById('submitBtn').textContent = 'Add Item';
    document.getElementById('cancelBtn').style.display = 'none';
    await loadItems();
}

init();
