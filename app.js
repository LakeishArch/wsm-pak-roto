// --- API CONFIG ---
const API_URL = 'http://localhost:3000/api';

// --- STATE ---
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('warung_user')) || null;
let MOCK_PRODUCTS = []; // Will be populated from server
// orders array is managed per view now

// --- DOM ELEMENTS ---
const menuContainer = document.getElementById('menu-container');
const cartCount = document.getElementById('cart-count');
const cartItemsContainer = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const checkoutTotal = document.getElementById('checkout-total');

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    await fetchMenu();
    updateCartUI();
    setupEventListeners();
    updateAuthUI();
});

// --- API FETCHES ---
async function fetchMenu() {
    try {
        const res = await fetch(`${API_URL}/products`);
        if (!res.ok) throw new Error('Network error');
        MOCK_PRODUCTS = await res.json();
        renderMenu();
    } catch (e) {
        console.error("Failed to fetch menu", e);
        menuContainer.innerHTML = '<p style="text-align:center;width:100%">Gagal memuat menu. Pastikan server nyala.</p>';
    }
}

// --- RENDER MENU ---
function renderMenu() {
    if(!MOCK_PRODUCTS || MOCK_PRODUCTS.length === 0) return;
    menuContainer.innerHTML = MOCK_PRODUCTS.map(p => `
        <div class="menu-card">
            <div class="menu-image-container">
                <img src="${p.image}" alt="${p.name}" class="menu-image">
            </div>
            <div class="menu-content">
                <h3 class="menu-title">${p.name}</h3>
                <div class="menu-price">${formatRupiah(p.price)}</div>
                <p class="menu-desc">${p.desc}</p>
                <button class="btn btn-primary btn-block" onclick="addToCart(${p.id})">Tambah ke Keranjang</button>
            </div>
        </div>
    `).join('');
}

// --- CART LOGIC ---
function addToCart(productId) {
    const product = MOCK_PRODUCTS.find(p => p.id === productId);
    if(!product) return;
    
    const existing = cart.find(item => item.id === productId);
    
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ ...product, qty: 1 });
    }
    updateCartUI();
    
    const icon = document.getElementById('btn-cart');
    icon.style.transform = 'scale(1.3)';
    setTimeout(() => { icon.style.transform = 'scale(1)'; }, 200);
}

function updateQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(i => i.id !== productId);
        }
        updateCartUI();
    }
}

function updateCartUI() {
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    cartCount.textContent = totalItems;
    
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<div class="empty-state">Keranjang Anda masih kosong.</div>';
        cartTotal.textContent = 'Rp 0';
        checkoutTotal.textContent = 'Rp 0';
        document.getElementById('btn-checkout').disabled = true;
        return;
    }
    
    document.getElementById('btn-checkout').disabled = false;
    cartItemsContainer.innerHTML = cart.map(item => `
        <div class="cart-item">
            <img src="${item.image}" alt="${item.name}" class="cart-item-img">
            <div class="cart-item-info">
                <div class="cart-item-title">${item.name}</div>
                <div class="cart-item-price">${formatRupiah(item.price)}</div>
            </div>
            <div class="cart-qty-controls">
                <button class="btn-qty" onclick="updateQty(${item.id}, -1)">-</button>
                <span>${item.qty}</span>
                <button class="btn-qty" onclick="updateQty(${item.id}, 1)">+</button>
            </div>
        </div>
    `).join('');
    
    cartTotal.textContent = formatRupiah(totalPrice);
    checkoutTotal.textContent = formatRupiah(totalPrice);
}

// --- MODALS ALIGNMENT ---
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function openCheckout() {
    if(cart.length === 0) return;
    closeModal('modal-cart');
    openModal('modal-checkout');
}

function goToTracking() {
    closeModal('modal-checkout');
    openModal('modal-user');
    updateUserOrdersUI();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    document.getElementById('btn-cart').addEventListener('click', () => openModal('modal-cart'));
    document.getElementById('btn-acc').addEventListener('click', () => {
        updateAuthUI();
        openModal('modal-user');
    });
    
    document.getElementById('btn-admin').addEventListener('click', () => {
        if(currentUser && currentUser.role === 'admin') {
            loadAdminData();
            openModal('modal-admin');
        } else {
            alert('Akses Ditolak: Anda harus masuk menggunakan akun Admin (Lake) terlebih dahulu untuk mengakses fitur ini.');
        }
    });
    
    document.getElementById('form-checkout').addEventListener('submit', (e) => {
        e.preventDefault();
        processCheckout();
    });
    
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.remove('hidden');
        });
    });
}

// --- CHECKOUT / PAYMENT (REAL) ---
async function processCheckout() {
    const name = document.getElementById('chk-name').value;
    const address = document.getElementById('chk-address').value;
    const method = document.getElementById('chk-payment-method').value;
    
    const targetName = currentUser ? currentUser.name : name;
    const orderId = 'ORD-' + Math.floor(Math.random() * 100000);
    
    const payload = {
        order_id: orderId,
        user_name: targetName,
        address: address,
        method: method,
        items: cart.map(c => ({ name: c.name, qty: c.qty, price: c.price }))
    };

    try {
        const res = await fetch(`${API_URL}/checkout`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if(!res.ok) throw new Error('Checkout gagal');
        
        cart = []; // Empty cart after success
        updateCartUI();
        
        document.getElementById('form-checkout').classList.add('hidden');
        document.getElementById('payment-success').classList.remove('hidden');
        
        setTimeout(() => {
            document.getElementById('form-checkout').reset();
            document.getElementById('form-checkout').classList.remove('hidden');
            document.getElementById('payment-success').classList.add('hidden');
        }, 5000);
    } catch(err) {
        alert("Terjadi kesalahan saat memproses pesanan.");
        console.error(err);
    }
}

// --- USER & AUTH (REAL) ---
async function mockLogin() {
    const name = document.getElementById('login-name').value.trim();
    const pass = document.getElementById('login-password').value;
    
    if(!name || !pass) {
        alert("Harap masukkan nama dan kata sandi.");
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, password: pass })
        });
        
        const data = await res.json();
        if(!res.ok) {
            alert(data.error || "Gagal masuk");
            return;
        }
        
        currentUser = data; // {id, name, role}
        localStorage.setItem('warung_user', JSON.stringify(currentUser));
        document.getElementById('login-password').value = '';
        updateAuthUI();
    } catch(err) {
        console.error(err);
        alert("Gagal koneksi ke server");
    }
}

async function mockRegister() {
    const name = document.getElementById('login-name').value.trim();
    const pass = document.getElementById('login-password').value;
    
    if(!name || !pass) {
        alert("Harap lengkapi nama dan sandi untuk mendaftar.");
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, password: pass })
        });
        
        const data = await res.json();
        if(!res.ok) {
            alert(data.error || "Gagal mendaftar");
            return;
        }
        
        currentUser = data;
        localStorage.setItem('warung_user', JSON.stringify(currentUser));
        document.getElementById('login-password').value = '';
        updateAuthUI();
        alert("Pendaftaran berhasil!");
    } catch(err) {
        console.error(err);
        alert("Gagal koneksi ke server");
    }
}

function mockLogout() {
    currentUser = null;
    localStorage.removeItem('warung_user');
    updateAuthUI();
}

function updateAuthUI() {
    const loginState = document.getElementById('auth-state');
    const profileState = document.getElementById('user-profile-state');
    
    if(currentUser) {
        loginState.classList.add('hidden');
        profileState.classList.remove('hidden');
        document.getElementById('profile-greeting').textContent = `Halo, ${currentUser.name}!`;
        if(!document.getElementById('modal-user').classList.contains('hidden')) {
            updateUserOrdersUI();
        }
    } else {
        loginState.classList.remove('hidden');
        profileState.classList.add('hidden');
    }
}

async function updateUserOrdersUI() {
    if(!currentUser) return;
    
    const container = document.getElementById('order-history');
    container.innerHTML = '<p>Memuat pesanan...</p>';
    
    try {
        const res = await fetch(`${API_URL}/orders?user=${encodeURIComponent(currentUser.name)}`);
        const userOrders = await res.json();
        
        if(userOrders.length === 0) {
            container.innerHTML = '<p class="text-sm">Belum ada pesanan.</p>';
            return;
        }
        
        container.innerHTML = userOrders.map(o => `
            <div class="order-card">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <strong>${o.id}</strong>
                    <span class="status-badge status-${o.status}">${translateStatus(o.status)}</span>
                </div>
                <div class="text-sm">Waktu: ${new Date(o.created_at).toLocaleString()}</div>
                <div class="text-sm">Metode: ${o.method.toUpperCase()}</div>
                <div class="mt-2 text-sm text-primary">
                    ${(o.items||[]).map(i => `${i.qty}x ${i.product_name}`).join(', ')}
                </div>
            </div>
        `).join('');
    } catch(err) {
        container.innerHTML = '<p class="text-sm" style="color:red">Gagal memuat pesanan.</p>';
    }
}

function translateStatus(s) {
    if(s === 'pending') return 'Menunggu Konfirmasi';
    if(s === 'cooking') return 'Sedang Dimasak';
    if(s === 'delivery') return 'Dalan Pengiriman';
    if(s === 'completed') return 'Selesai';
    return s;
}

// --- ADMIN (REAL) ---
async function loadAdminData() {
    // Orders
    try {
        const res = await fetch(`${API_URL}/orders`);
        const allOrders = await res.json();
        const container = document.getElementById('admin-order-list');
        
        if(allOrders.length === 0) {
            container.innerHTML = '<p>Belum ada pesanan masuk.</p>';
        } else {
            container.innerHTML = allOrders.map(o => `
                <div class="order-card">
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <strong>${o.id}</strong> - ${o.user_name}
                            <div class="text-sm">${o.address}</div>
                        </div>
                        <div>
                            <select onchange="updateOrderStatus('${o.id}', this.value)" class="form-control" style="width: auto; padding: 4px;">
                                <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="cooking" ${o.status === 'cooking' ? 'selected' : ''}>Cooking</option>
                                <option value="delivery" ${o.status === 'delivery' ? 'selected' : ''}>Delivery</option>
                                <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Completed</option>
                            </select>
                        </div>
                    </div>
                    <p class="text-sm mt-2">${(o.items||[]).map(i => `${i.qty}x ${i.product_name}`).join(', ')}</p>
                </div>
            `).join('');
        }
    } catch(err) {
        console.error("Admin order load error", err);
    }
    
    // Products
    const prodContainer = document.getElementById('admin-product-list');
    prodContainer.innerHTML = MOCK_PRODUCTS.map(p => `
        <div class="order-card" style="display: flex; gap: 10px; align-items: center;">
            <img src="${p.image}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
            <div style="flex: 1;">
                <strong>${p.name}</strong>
                <div class="text-sm">${formatRupiah(p.price)}</div>
            </div>
            <button class="btn btn-outline btn-sm">Edit (Mock)</button>
        </div>
    `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        await fetch(`${API_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: newStatus })
        });
        // Success
    } catch(err) {
        alert("Gagal mengupdate status");
    }
}

// --- UTILS ---
function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(number);
}
