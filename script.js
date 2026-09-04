// ===== REMOVER SERVICE WORKERS =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
            registration.unregister();
        }
    });
}

// ------------------- CONFIGURAÇÕES -------------------
const WHATSAPP_NUMBER = "5551980148248";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAqXgUkflVFcZptI36ZT1j8e_2WYHWbJN8",
    authDomain: "vitrine-adega.firebaseapp.com",
    projectId: "vitrine-adega",
    storageBucket: "vitrine-adega.firebasestorage.app",
    messagingSenderId: "919658366165",
    appId: "1:919658366165:web:b027a8ac52eb748a69ce5c"
};

const isFirebaseConfigured = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

// ------------------- ESTADO -------------------
let PRODUCTS = [];
let activeCategory = "Todos";
let activeBrand = "Todas";
let searchTerm = "";
let isAdmin = false;
let pendingImageData = null;
let editingProductId = null;

const $ = (sel) => document.querySelector(sel);

// ------------------- FUNÇÕES UTILITÁRIAS -------------------
function toast(msg, type = "ok") {
    const box = document.getElementById("toastBox");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

function money(v) {
    return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function placeholderImg() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`
        <svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
            <rect width='100%' height='100%' fill='#171412'/>
            <text x='50%' y='50%' fill='#ff8a1e' font-size='20' font-family='sans-serif' text-anchor='middle' dy='.3em'>Sem foto</text>
        </svg>`);
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxSize = 800;
                let width = img.width;
                let height = img.height;

                if (width > height && width > maxSize) {
                    height = height * (maxSize / width);
                    width = maxSize;
                } else if (height > maxSize) {
                    width = width * (maxSize / height);
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL("image/jpeg", 0.6));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ------------------- CAMADA DE DADOS -------------------
let dataLayer;

if (isFirebaseConfigured) {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const productsCol = collection(db, "products");

    dataLayer = {
        mode: "firebase",
        subscribe(cb) {
            const q = query(productsCol, orderBy("createdAt", "desc"));
            onSnapshot(q, (snap) => {
                cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        },
        async addProduct(product, imageFile) {
            let imageUrl = "";
            if (imageFile) imageUrl = await compressImage(imageFile);
            await addDoc(productsCol, { ...product, imageUrl, createdAt: Date.now() });
        },
        async updateProduct(id, updates, imageFile) {
            let imageUrl = updates.imageUrl || "";
            if (imageFile) imageUrl = await compressImage(imageFile);
            await updateDoc(doc(db, "products", id), { ...updates, imageUrl });
        },
        async deleteProduct(id) {
            await deleteDoc(doc(db, "products", id));
        },
        async login(email, password) {
            await signInWithEmailAndPassword(auth, email, password);
        },
        async logout() { await signOut(auth); },
        onAuth(cb) { onAuthStateChanged(auth, (u) => cb(!!u)); }
    };
} else {
    const LS_PRODUCTS = "vitrine_products";
    const LS_ADMIN = "vitrine_admin_session";
    const DEMO_PASSWORD = "admin123";

    function readLS() {
        try { return JSON.parse(localStorage.getItem(LS_PRODUCTS)) || []; } catch { return []; }
    }
    function writeLS(list) { localStorage.setItem(LS_PRODUCTS, JSON.stringify(list)); }

    let listeners = [];
    dataLayer = {
        mode: "demo",
        subscribe(cb) { listeners.push(cb); cb(readLS()); },
        notify() { const list = readLS(); listeners.forEach(cb => cb(list)); },
        async addProduct(product, imageFile) {
            let imageUrl = "";
            if (imageFile) imageUrl = await compressImage(imageFile);
            const list = readLS();
            list.unshift({ id: String(Date.now()), ...product, imageUrl, createdAt: Date.now() });
            writeLS(list);
            this.notify();
        },
        async updateProduct(id, updates, imageFile) {
            let imageUrl = updates.imageUrl || "";
            if (imageFile) imageUrl = await compressImage(imageFile);
            const list = readLS();
            const index = list.findIndex(p => p.id === id);
            if (index !== -1) {
                list[index] = { ...list[index], ...updates, imageUrl };
                writeLS(list);
                this.notify();
            }
        },
        async deleteProduct(id) {
            writeLS(readLS().filter(p => p.id !== id));
            this.notify();
        },
        async login(email, password) {
            if (password !== DEMO_PASSWORD) throw new Error("Senha incorreta.");
            sessionStorage.setItem(LS_ADMIN, "1");
        },
        async logout() { sessionStorage.removeItem(LS_ADMIN); this._authCb && this._authCb(false); },
        onAuth(cb) { this._authCb = cb; cb(sessionStorage.getItem(LS_ADMIN) === "1"); }
    };
}

// ===== DEMO BANNER =====
if (!isFirebaseConfigured) {
    const bannerWrap = document.getElementById("demoBannerWrap");
    if (bannerWrap) {
        bannerWrap.innerHTML = `
            <div class="demo-banner">
                <span>⚠️</span>
                <div><b>Modo demonstração.</b> Adicione <code>?adm</code> na URL para gerenciar.</div>
            </div>`;
    }
}

// ===== LOGIN POR URL =====
const currentUrl = window.location.href;
if (currentUrl.includes('adm')) {
    document.body.classList.add('admin-mode');
    const badge = document.getElementById('adminBadge');
    if (badge) { badge.style.display = 'flex'; document.getElementById('openPanelBtn').style.display = 'none'; }
    setTimeout(() => { openModal('loginModal'); toast('Faça login para acessar o painel admin', 'ok'); }, 500);
}

// ===== LOGIN FORM =====
document.getElementById('loginForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const msg = document.getElementById('loginMsg');
    if (msg) msg.className = 'form-msg';

    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');
    if (!email || !password) return;

    try {
        await dataLayer.login(email.value, password.value);
        closeModal('loginModal');
        isAdmin = true;
        document.body.classList.add('admin-mode');
        document.getElementById('openPanelBtn').style.display = 'flex';
        document.getElementById('adminBadge').style.display = 'flex';
        renderAll();
        toast('🛠️ Painel admin disponível!', 'ok');
        loginForm.reset();
    } catch (err) {
        if (msg) { msg.textContent = err.message || 'Erro ao fazer login.'; msg.classList.add('show', 'error'); }
    }
});

// ===== CATEGORIAS COM SUBMENU (CORRIGIDO) =====
function renderCategories() {
    const list = document.getElementById("categoryList");
    if (!list) return;
    const cats = ["Todos", ...Array.from(new Set(PRODUCTS.map(p => p.category).filter(Boolean))).sort()];

    list.innerHTML = cats.map(cat => {
        const count = cat === "Todos" ? PRODUCTS.length : PRODUCTS.filter(p => p.category === cat).length;
        const isActive = cat === activeCategory;

        let brandsHtml = '';
        if (isActive && cat !== "Todos") {
            const brands = new Set(PRODUCTS.filter(p => p.category === cat).map(p => p.brand).filter(Boolean));
            if (brands.size > 0) {
                brandsHtml = `<ul class="brand-sublist">
                    <li><button class="cat-btn sub-btn ${activeBrand === "Todas" ? "active" : ""}" data-brand="Todas"><span>Todas as marcas</span></button></li>
                    ${Array.from(brands).sort().map(brand => `
                        <li><button class="cat-btn sub-btn ${brand === activeBrand ? "active" : ""}" data-brand="${escapeHtml(brand)}"><span>${escapeHtml(brand)}</span></button></li>
                    `).join("")}
                </ul>`;
            }
        }

        return `<li>
            <button class="cat-btn ${isActive ? "active" : ""}" data-cat="${escapeHtml(cat)}">
                <span>${escapeHtml(cat)}</span><span class="count">${count}</span>
            </button>
            ${brandsHtml}
        </li>`;
    }).join("");

    // Eventos de categorias (CORRIGIDO)
    document.querySelectorAll("[data-cat]").forEach(btn => btn.addEventListener("click", () => {
        const cat = btn.dataset.cat;
        activeCategory = cat;
        activeBrand = "Todas";

        // Verifica se a categoria tem marcas (submenu)
        const categoryProducts = PRODUCTS.filter(p => p.category === cat);
        const hasBrands = categoryProducts.some(p => p.brand && p.brand.trim() !== '');

        if (window.innerWidth <= 1023) {
            // Só fecha se NÃO tiver submenu OU for "Todos"
            if (cat === "Todos" || !hasBrands) {
                closeSidebar();
            }
            // Se tiver submenu, mantém aberta
        }

        renderAll();
    }));

    // Eventos de marcas (fecha ao selecionar)
    document.querySelectorAll("[data-brand]").forEach(btn => btn.addEventListener("click", () => {
        activeBrand = btn.dataset.brand;
        if (window.innerWidth <= 1023) closeSidebar();
        renderAll();
    }));
}

// ===== FILTRO =====
function filteredProducts() {
    return PRODUCTS.filter(p => {
        const matchCat = activeCategory === "Todos" || p.category === activeCategory;
        const matchBrand = activeBrand === "Todas" || (p.brand || "") === activeBrand;
        const matchSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchCat && matchBrand && matchSearch;
    });
}

// ===== CARRINHO =====
let cart = [];
const CART_STORAGE_KEY = 'vitrine_cart';

function loadCart() {
    try { cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || []; } catch { cart = []; }
    updateCartUI();
}

function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    updateCartUI();
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const floatBadge = document.getElementById('cartFloatBadge');
    if (floatBadge) { floatBadge.textContent = count; floatBadge.style.display = count > 0 ? 'flex' : 'none'; }
}

function renderCartModal() {
    const container = document.getElementById('cartItems');
    const summary = document.getElementById('cartSummary');
    const totalEl = document.getElementById('cartTotal');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `<p style="color:var(--muted);text-align:center;padding:20px 0;">🛒 Seu carrinho está vazio.</p>`;
        if (summary) summary.style.display = 'none';
        return;
    }

    let total = 0;
    container.innerHTML = cart.map(item => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        return `
            <div class="cart-item">
                <img src="${item.image}" alt="${escapeHtml(item.name)}" class="cart-item-img">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${money(item.price)}</div>
                </div>
                <div class="cart-item-actions">
                    <button onclick="window.removeFromCart('${item.id}')">−</button>
                    <span class="cart-item-qty">${item.qty}</span>
                    <button onclick="window.addToCart('${item.id}', '${escapeHtml(item.name)}', ${item.price}, '${item.image}', true)">+</button>
                    <button onclick="window.removeItemCompletely('${item.id}')" style="color:var(--danger);border-color:rgba(230,67,47,0.3);">✕</button>
                </div>
            </div>
        `;
    }).join('');

    if (totalEl) totalEl.textContent = money(total);
    if (summary) summary.style.display = 'block';
    toggleDeliveryFields();
    togglePaymentFields();
}

function toggleDeliveryFields() {
    const dt = document.getElementById('deliveryType');
    const af = document.getElementById('addressField');
    if (dt && af) af.style.display = dt.value === 'tele' ? 'block' : 'none';
}

function togglePaymentFields() {
    const pm = document.getElementById('paymentMethod');
    const cf = document.getElementById('changeField');
    if (pm && cf) cf.style.display = pm.value === 'dinheiro' ? 'block' : 'none';
}

window.toggleDeliveryFields = toggleDeliveryFields;
window.togglePaymentFields = togglePaymentFields;

function checkoutCart() {
    if (cart.length === 0) { toast('🛒 Carrinho vazio!', 'error'); return; }

    const deliveryType = document.getElementById('deliveryType');
    const deliveryAddress = document.getElementById('deliveryAddress');
    const paymentMethod = document.getElementById('paymentMethod');
    const changeAmount = document.getElementById('changeAmount');

    if (deliveryType?.value === 'tele' && (!deliveryAddress || !deliveryAddress.value.trim())) {
        toast('Digite o endereço!', 'error');
        if (deliveryAddress) deliveryAddress.focus();
        return;
    }

    let changeMessage = '';
    if (paymentMethod?.value === 'dinheiro' && changeAmount?.value) {
        changeMessage = `Troco para: ${money(parseFloat(changeAmount.value))}`;
    }

    let total = 0;
    let message = 'Novo Pedido - Vitrine Adega e Tabacaria\n\n *Itens:*\n';

    cart.forEach((item, i) => {
        const subtotal = item.price * item.qty;
        total += subtotal;
        message += `${i + 1}. ${item.name} - ${item.qty}x ${money(item.price)} = ${money(subtotal)}\n`;
    });

    message += `\nTotal: ${money(total)}\n\n`;
    message += `Entrega: ${deliveryType?.value === 'tele' ? 'Tele-entrega' : 'Retirar no local'}\n`;
    if (deliveryType?.value === 'tele') message += `Endereço: ${deliveryAddress.value.trim()}\n`;

    const labels = { pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro' };
    message += `Pagamento:* ${labels[paymentMethod?.value] || paymentMethod?.value}\n`;
    if (changeMessage) message += `${changeMessage}\n`;
    message += '\nObrigado!';

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');

    setTimeout(() => {
        cart = []; saveCart(); renderCartModal(); closeModal('cartModal');
        toast('✅ Pedido enviado!', 'ok');
    }, 1000);
}

// ===== FUNÇÕES GLOBAIS =====
window.addToCart = function (id, name, price, image, fromModal = false) {
    const existing = cart.find(i => i.id === id);
    if (existing) existing.qty += 1;
    else cart.push({ id, name, price, image: image || placeholderImg(), qty: 1 });
    saveCart();
    if (fromModal) renderCartModal();
    else toast(`✅ ${name} adicionado!`, 'ok');
};

window.removeFromCart = function (id) {
    const existing = cart.find(i => i.id === id);
    if (existing) {
        if (existing.qty > 1) existing.qty -= 1;
        else cart = cart.filter(i => i.id !== id);
    }
    saveCart(); renderCartModal();
};

window.removeItemCompletely = function (id) {
    cart = cart.filter(i => i.id !== id);
    saveCart(); renderCartModal();
};

window.clearCart = function () {
    if (cart.length === 0) return;
    if (confirm('Esvaziar carrinho?')) { cart = []; saveCart(); toast('🛒 Carrinho esvaziado', 'ok'); }
};

window.renderCartModal = renderCartModal;
window.checkoutCart = checkoutCart;
window.closeModal = closeModal;

// ===== EVENTOS CARRINHO =====
document.getElementById('cartFloat')?.addEventListener('click', function (e) {
    e.preventDefault(); renderCartModal(); openModal('cartModal');
});
document.getElementById('cartCheckout')?.addEventListener('click', checkoutCart);
document.getElementById('cartClear')?.addEventListener('click', function () { clearCart(); renderCartModal(); });

// ===== RENDER GRID =====
function renderGrid() {
    const grid = document.getElementById("productGrid");
    if (!grid) return;
    const list = filteredProducts();
    document.getElementById("gridTitle").textContent = activeCategory === "Todos" ? "Todos os produtos" : activeCategory;
    document.getElementById("gridCount").textContent = `${list.length} produto${list.length === 1 ? "" : "s"}`;
    document.getElementById("emptyState").hidden = list.length > 0;

    grid.innerHTML = list.map(p => {
        const safeName = escapeHtml(p.name);
        const safeDesc = escapeHtml(p.description || "");
        const safeCategory = escapeHtml(p.category || "Geral");
        const safeBrand = escapeHtml(p.brand || "");
        const imageUrl = p.imageUrl || placeholderImg();
        const promoBadge = p.promo === 'sim' ? `<span class="promo-badge">🔥 Promoção</span>` : '';

        return `
            <article class="card">
                <button class="card-del" data-del="${p.id}">🗑</button>
                <button class="card-edit" data-edit="${p.id}">✏️</button>
                <div class="card-img-wrap" data-zoom="${imageUrl}" data-name="${safeName}">
                    ${promoBadge}
                    <img src="${imageUrl}" alt="${safeName}" loading="lazy">
                    <span class="card-zoom-icon">🔍</span>
                </div>
                <div class="card-body">
                    <div class="card-tags">
                        <span class="card-category">${safeCategory}</span>
                        ${safeBrand ? `<span class="card-brand">${safeBrand}</span>` : ""}
                    </div>
                    <h3 class="card-name">${safeName}</h3>
                    ${safeDesc ? `<p class="card-desc">${safeDesc}</p>` : ""}
                    <p class="card-price">${money(p.price)}</p>
                    <button class="btn-add-cart" onclick="window.addToCart('${p.id}', '${safeName}', ${p.price}, '${imageUrl}')">Adicionar ao Carrinho</button>
                </div>
            </article>
        `;
    }).join("");

    document.querySelectorAll("[data-zoom]").forEach(el => el.addEventListener("click", () => {
        document.getElementById("zoomImg").src = el.dataset.zoom;
        document.getElementById("zoomOverlay").classList.add("open");
    }));

    document.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Excluir?")) return;
        await dataLayer.deleteProduct(btn.dataset.del);
        toast("Produto excluído.", "ok");
    }));

    document.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(btn.dataset.edit);
    }));
}

// ===== EDITAR PRODUTO (FOTO PRESERVADA) =====
function openEditModal(productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    editingProductId = productId;
    pendingImageData = null;

    document.getElementById('productName').value = product.name || '';
    document.getElementById('productPrice').value = product.price || '';
    document.getElementById('productBrand').value = product.brand || '';
    document.getElementById('productPromo').value = product.promo || 'nao';
    document.getElementById('productDesc').value = product.description || '';

    const sel = document.getElementById('productCategorySelect');
    if (product.category) {
        const option = Array.from(sel.options).find(o => o.value === product.category);
        if (option) { sel.value = product.category; }
        else { sel.value = '__new__'; document.getElementById('productCategoryNew').value = product.category; }
        toggleNewCategoryField();
    }

    const imgDrop = document.getElementById('imgDrop');
    if (product.imageUrl) {
        imgDrop.classList.add('has-img');
        imgDrop.innerHTML = `<img src="${product.imageUrl}" alt="Pré-visualização"><input type="file" id="productImage" accept="image/*">`;
        bindImageInput();
    }

    document.getElementById('saveProductBtn').textContent = 'Atualizar Produto';
    openModal('panelModal');
}

// ===== ADMIN LIST =====
function renderAdminList() {
    const box = document.getElementById("adminProductList");
    if (!box) return;
    document.getElementById("adminListCount").textContent = `Produtos (${PRODUCTS.length})`;
    box.innerHTML = PRODUCTS.map(p => {
        const promoBadge = p.promo === 'sim' ? ' 🔥' : '';
        return `
            <div class="admin-row">
                <img src="${p.imageUrl || placeholderImg()}" alt="${escapeHtml(p.name)}">
                <div class="info">
                    <div class="n">${escapeHtml(p.name)}${promoBadge}</div>
                    <div class="c">${escapeHtml(p.category || "Geral")}${p.brand ? ' • ' + escapeHtml(p.brand) : ''} • ${money(p.price)}</div>
                </div>
                <button class="btn-edit" data-edit2="${p.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-del2="${p.id}">Excluir</button>
            </div>
        `;
    }).join("") || `<p class="hint">Nenhum produto cadastrado.</p>`;

    document.querySelectorAll("[data-del2]").forEach(btn => btn.addEventListener("click", async () => {
        if (!confirm("Excluir?")) return;
        await dataLayer.deleteProduct(btn.dataset.del2);
        toast("Produto excluído.", "ok");
    }));

    document.querySelectorAll("[data-edit2]").forEach(btn => btn.addEventListener("click", () => {
        openEditModal(btn.dataset.edit2);
    }));
}

// ===== CATEGORY SELECT =====
function renderCategorySelect() {
    const sel = document.getElementById("productCategorySelect");
    if (!sel) return;
    const cats = Array.from(new Set(PRODUCTS.map(p => p.category).filter(Boolean))).sort();
    sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("") + `<option value="__new__">+ Nova categoria</option>`;
    sel.value = cats.length ? cats[0] : "__new__";
    toggleNewCategoryField();
}

function toggleNewCategoryField() {
    const sel = document.getElementById("productCategorySelect");
    const field = document.getElementById("newCategoryField");
    if (sel && field) field.style.display = sel.value === "__new__" ? "block" : "none";
}

// ===== RENDER ALL =====
function renderAll() {
    renderCategories();
    renderGrid();
    if (isAdmin) { renderAdminList(); renderCategorySelect(); }
}

dataLayer.subscribe((list) => { PRODUCTS = list; renderAll(); });

// ===== SIDEBAR =====
function openSidebar() { document.body.classList.add("sidebar-open"); document.getElementById("sidebar")?.classList.add("open"); }
function closeSidebar() { document.body.classList.remove("sidebar-open"); document.getElementById("sidebar")?.classList.remove("open"); }

document.getElementById("menuToggle")?.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    const sb = document.getElementById("sidebar");
    if (sb) sb.classList.contains("open") ? closeSidebar() : openSidebar();
});

document.getElementById("sidebarOverlay")?.addEventListener("click", closeSidebar);

// ===== BUSCA =====
const siM = document.getElementById("searchInput");
const siD = document.getElementById("searchInputDesktop");
if (siM) siM.addEventListener("input", (e) => { searchTerm = e.target.value; if (siD) siD.value = e.target.value; renderGrid(); });
if (siD) siD.addEventListener("input", (e) => { searchTerm = e.target.value; if (siM) siM.value = e.target.value; renderGrid(); });

// ===== ZOOM =====
document.getElementById("zoomClose")?.addEventListener("click", () => document.getElementById("zoomOverlay")?.classList.remove("open"));
document.getElementById("zoomOverlay")?.addEventListener("click", (e) => { if (e.target.id === "zoomOverlay") e.target.classList.remove("open"); });

// ===== MODALS =====
function openModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add("open"); m.style.display = "flex"; document.body.style.overflow = "hidden"; }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove("open"); m.style.display = "none"; document.body.style.overflow = "auto"; }
}

document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
document.querySelectorAll(".modal-overlay").forEach(ov => ov.addEventListener("click", (e) => {
    if (e.target === ov) { ov.classList.remove("open"); ov.style.display = "none"; document.body.style.overflow = "auto"; }
}));

// ===== LOGOUT =====
document.getElementById("logoutBtn")?.addEventListener("click", async function () {
    await dataLayer.logout();
    isAdmin = false;
    document.body.classList.remove('admin-mode');
    document.getElementById('adminBadge').style.display = 'none';
    toast('Sessão encerrada.', 'ok');
});

// ===== AUTH =====
dataLayer.onAuth((authed) => { isAdmin = authed; document.body.classList.toggle("admin-mode", isAdmin); if (isAdmin) renderAll(); });

// ===== PAINEL ADMIN =====
function resetProductForm() {
    editingProductId = null;
    pendingImageData = null;
    const form = document.getElementById("productForm");
    if (form) form.reset();
    const imgDrop = document.getElementById("imgDrop");
    if (imgDrop) { imgDrop.classList.remove("has-img"); imgDrop.innerHTML = `<span id="imgDropText">Toque para escolher uma foto</span><input type="file" id="productImage" accept="image/*">`; }
    document.getElementById("saveProductBtn").textContent = 'Salvar produto';
    bindImageInput();
}

document.getElementById("openPanelBtn")?.addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    resetProductForm(); renderCategorySelect(); renderAdminList(); openModal("panelModal");
});

// ===== PRODUCT FORM =====
document.getElementById("productCategorySelect")?.addEventListener("change", toggleNewCategoryField);

document.getElementById("productForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("productMsg");
    if (msg) msg.className = "form-msg";

    const name = document.getElementById("productName")?.value.trim();
    const price = parseFloat(document.getElementById("productPrice")?.value);
    let category = document.getElementById("productCategorySelect")?.value;
    if (category === "__new__") category = document.getElementById("productCategoryNew")?.value.trim();
    const description = document.getElementById("productDesc")?.value.trim() || "";
    const brand = document.getElementById("productBrand")?.value.trim() || "";
    const promo = document.getElementById("productPromo")?.value || "nao";

    if (!name || !price || !category) {
        if (msg) { msg.textContent = "Preencha nome, preço e categoria."; msg.classList.add("show", "error"); }
        return;
    }

    const btn = document.getElementById("saveProductBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }

    try {
        const productData = { name, price, category, description, brand, promo };

        if (editingProductId) {
            const existing = PRODUCTS.find(p => p.id === editingProductId);
            if (existing?.imageUrl && !pendingImageData) productData.imageUrl = existing.imageUrl;
            await dataLayer.updateProduct(editingProductId, productData, pendingImageData);
            toast("✅ Produto atualizado!", "ok");
        } else {
            await dataLayer.addProduct(productData, pendingImageData);
            toast("✅ Produto salvo!", "ok");
        }

        resetProductForm();
        closeModal('panelModal');
    } catch (err) {
        if (msg) { msg.textContent = "Erro: " + (err.message || err); msg.classList.add("show", "error"); }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Salvar produto"; }
    }
});

// ===== IMAGE INPUT =====
function bindImageInput() {
    const input = document.getElementById("productImage");
    if (input) {
        input.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            pendingImageData = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const imgDrop = document.getElementById("imgDrop");
                if (imgDrop) { imgDrop.classList.add("has-img"); imgDrop.innerHTML = `<img src="${ev.target.result}" alt="Pré-visualização"><input type="file" id="productImage" accept="image/*">`; }
                bindImageInput();
            };
            reader.readAsDataURL(file);
        });
    }
}
bindImageInput();

// ===== INICIAR =====
loadCart();
console.log("🚀 Site carregado!");