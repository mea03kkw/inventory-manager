const API_BASE = '/api';

async function loadItems() {
    const response = await fetch(`${API_BASE}/items`);
    const items = await response.json();
    const tbody = document.getElementById('inventory');
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>${item.item_number}</td>
            <td>${item.value ? 'Yes' : 'No'}</td>
            <td>
                <button class="${item.value ? 'no' : 'yes'}" onclick="toggleItem(${item.id}, ${!item.value})">
                    ${item.value ? 'Set No' : 'Set Yes'}
                </button>
                <button class="delete" onclick="deleteItem(${item.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function toggleItem(id, value) {
    await fetch(`${API_BASE}/items/${id}?value=${value}`, { method: 'PUT' });
    loadItems();
}

async function deleteItem(id) {
    await fetch(`${API_BASE}/items/${id}`, { method: 'DELETE' });
    loadItems();
}

async function addItem() {
    const itemNumber = document.getElementById('newItemNumber').value;
    const value = document.getElementById('newItemValue').value === 'true';
    await fetch(`${API_BASE}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_number: parseInt(itemNumber), value })
    });
    document.getElementById('newItemNumber').value = '';
    loadItems();
}

loadItems();