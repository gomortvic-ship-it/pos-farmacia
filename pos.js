// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxS27jK5fHWAaB_H4-1lRTYjbvMOmNr-ADhHxauH45Ch6NaIDjEJ7uEHQshsDOopRQ/exec";
const SUCURSAL = "Principal";
const CLAVE_ACCESO = "1806"; // <-- pon aquí la contraseña que quieras usar

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let productos = [];
let venta = [];
let productoActual = null;
let vendedor = "";
let scannerActivo = false;
let codeReader = null;
let timeoutBusqueda;

// ─── HISTORIAL DEL DÍA (persiste aunque se cierre la app) ────────────────────
function cargarHistorial() {
  try {
    const hoy = new Date().toLocaleDateString("es-MX");

    // Intentar recuperar de localStorage (puede no estar disponible en incógnito)
    let guardado = null;
    try { guardado = localStorage.getItem("historial_dia"); } catch(e) {}

    if (guardado) {
      const data = JSON.parse(guardado);
      if (data.fecha === hoy) {
        ventasDia = data.ventas || [];
        vendedor = data.vendedor || "";
        if (vendedor) {
          document.getElementById("nombre-vendedor").textContent = vendedor;
          document.getElementById("modal-vendedor").style.display = "none";
        }
        actualizarResumenDia();
        renderHistorialVentas();
        mostrarToast("📋 " + ventasDia.length + " ventas restauradas");
        return;
      }
    }
  } catch(e) {}
  ventasDia = [];
}

// ─── SEGURIDAD ───────────────────────────────────────────────────────────────

function detectarIncognito() {
  return new Promise((resolve) => {
    // Método 1: localStorage
    try {
      localStorage.setItem("_sec", "1");
      localStorage.removeItem("_sec");
    } catch(e) {
      resolve(true); return;
    }
    // Método 2: Storage quota (Chrome incógnito tiene quota muy baja)
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => {
        resolve(est.quota < 120000000); // menos de 120MB = incógnito
      }).catch(() => resolve(false));
    } else {
      resolve(false);
    }
  });
}

function obtenerInfoDispositivo() {
  const ua = navigator.userAgent;
  let dispositivo = "Desconocido";
  let navegador = "Desconocido";

  // Detectar dispositivo
  if (/iPhone/.test(ua)) dispositivo = "iPhone";
  else if (/iPad/.test(ua)) dispositivo = "iPad";
  else if (/Android/.test(ua)) {
    const match = ua.match(/Android [^;]+; ([^)]+)/);
    dispositivo = match ? match[1].trim() : "Android";
  } else if (/Windows/.test(ua)) dispositivo = "Windows PC";
  else if (/Mac/.test(ua)) dispositivo = "Mac";

  // Detectar navegador
  if (/CriOS/.test(ua)) navegador = "Chrome iOS";
  else if (/Chrome/.test(ua)) navegador = "Chrome";
  else if (/Firefox/.test(ua)) navegador = "Firefox";
  else if (/Safari/.test(ua)) navegador = "Safari";
  else if (/Edge/.test(ua)) navegador = "Edge";

  return { dispositivo, navegador };
}

function obtenerOIDDispositivo() {
  // ID único persistente del dispositivo
  let id = null;
  try { id = localStorage.getItem("_device_id"); } catch(e) {}
  if (!id) {
    id = "DEV-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).substr(2,5).toUpperCase();
    try { localStorage.setItem("_device_id", id); } catch(e) {}
  }
  return id;
}

async function obtenerIP() {
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json();
    return d.ip;
  } catch(e) { return "No disponible"; }
}

function guardarHistorial() {
  try {
    const hoy = new Date().toLocaleDateString("es-MX");
    localStorage.setItem("historial_dia", JSON.stringify({
      fecha: hoy,
      vendedor: vendedor,
      ventas: ventasDia
    }));
  } catch(e) {
    // Si falla localStorage (modo incógnito), continuar sin guardar localmente
    // Las ventas ya están en Google Sheets
    console.warn("localStorage no disponible — ventas guardadas en Google Sheets");
  }
}

let ventasDia = [];

// ─── INICIO ───────────────────────────────────────────────────────────────────
fetch('./data.json')
  .then(r => r.json())
  .then(data => {
    productos = data;
    cargarHistorial();

  })
  .catch(() => {
    console.warn("No se pudo cargar data.json");
    cargarHistorial();
  });

async function iniciarSesion() {
  const nombre = document.getElementById("input-vendedor").value.trim();
  const clave = document.getElementById("input-clave").value;

  if (!nombre) { mostrarError("Escribe tu nombre"); return; }
  if (clave !== CLAVE_ACCESO) {
    mostrarError("Contraseña incorrecta");
    registrarAcceso(nombre, false, "SÍ - CONTRASEÑA INCORRECTA");
    return;
  }

  const btn = document.getElementById("btn-entrar");
  btn.textContent = "Verificando..."; btn.disabled = true;

  // Bloquear si modo incógnito
  const esIncognito = await detectarIncognito();
  if (esIncognito) {
    btn.textContent = "Entrar al sistema"; btn.disabled = false;
    document.getElementById("modal-vendedor").innerHTML = `
      <div class="modal-box" style="border-color:#ff4d6d;">
        <div class="icon">🚫</div>
        <h2 style="color:#ff4d6d;">Acceso bloqueado</h2>
        <p style="color:#ff4d6d;font-weight:700;margin-bottom:12px;">Modo incógnito detectado</p>
        <p>Esta aplicación no permite el modo incógnito.<br><br>
        Cierra esta ventana y abre la app en <strong>Chrome normal</strong> para continuar.</p>
        <div style="margin-top:16px;background:#1a0e0e;border-radius:10px;padding:12px;font-size:12px;color:#ff8fa3;">
          ⚠️ Este intento ha sido registrado con fecha, hora y dispositivo.
        </div>
      </div>`;
    // Registrar intento bloqueado
    registrarAcceso(nombre, true);
    return;
  }

  vendedor = nombre;
  document.getElementById("nombre-vendedor").textContent = nombre;
  document.getElementById("sucursal-header") && (document.getElementById("sucursal-header").textContent = "Farmacia " + SUCURSAL);
  document.getElementById("modal-vendedor").style.display = "none";
  guardarHistorial();
  btn.textContent = "Entrar al sistema"; btn.disabled = false;

  // Registrar acceso legítimo
  registrarAcceso(nombre, false);
}

async function registrarAcceso(nombre, bloqueado, motivoExtra) {
  const ahora = new Date();
  const { dispositivo, navegador } = obtenerInfoDispositivo();
  const deviceId = obtenerOIDDispositivo();
  const ip = await obtenerIP();

  const payload = {
    tipo: "acceso",
    sucursal: SUCURSAL,
    vendedor: nombre,
    fecha: ahora.toLocaleDateString("es-MX"),
    hora: ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    ip: ip,
    dispositivo: dispositivo,
    navegador: navegador,
    deviceId: deviceId,
    bloqueado: motivoExtra || (bloqueado ? "SÍ - INTENTO INCÓGNITO" : "No")
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch(e) {}
}

function mostrarError(msg) {
  const el = document.getElementById("login-error");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("input-vendedor").addEventListener("keydown", e => {
    if (e.key === "Enter") iniciarSesion();
  });
  document.getElementById("input-clave").addEventListener("keydown", e => {
    if (e.key === "Enter") iniciarSesion();
  });
});

// ─── BÚSQUEDA ─────────────────────────────────────────────────────────────────
function buscarProducto(texto) {
  clearTimeout(timeoutBusqueda);
  timeoutBusqueda = setTimeout(() => _buscar(texto), 150);
}

function _buscar(texto) {
  const t = texto.toLowerCase().trim();
  const div = document.getElementById("sugerencias");
  if (t.length < 1) { div.style.display = "none"; return; }
  const resultados = productos.filter(p =>
    p.PRODUCTO.toLowerCase().includes(t) || p.CODIGO.includes(t)
  ).slice(0, 6);
  if (!resultados.length) { div.style.display = "none"; return; }
  div.innerHTML = resultados.map(p => `
    <div class="sug-item" onclick="seleccionarProducto('${p.CODIGO}')">
      <div class="sug-nombre">${p.PRODUCTO}</div>
      <div class="sug-meta">
        <span>${p.CODIGO}</span> &nbsp;·&nbsp;
        <span class="sug-precio">$${parseFloat(p.PRECIO).toFixed(2)}</span>
        &nbsp;·&nbsp; Desc: $${parseFloat(p.DESCUENTO).toFixed(2)}
      </div>
    </div>
  `).join("");
  div.style.display = "block";
}

function seleccionarProducto(codigo) {
  const p = productos.find(x => x.CODIGO === codigo);
  if (!p) return;
  productoActual = p;
  document.getElementById("prod-nombre").textContent = p.PRODUCTO;
  document.getElementById("prod-codigo").textContent = "Código: " + p.CODIGO;
  document.getElementById("lbl-precio-normal").textContent = "$" + parseFloat(p.PRECIO).toFixed(2);
  document.getElementById("lbl-precio-desc").textContent = "$" + parseFloat(p.DESCUENTO).toFixed(2);
  document.getElementById("prod-cantidad").value = 1;
  document.getElementById("prod-tipo-precio").value = "normal";
  document.getElementById("producto-panel").style.display = "block";
  document.getElementById("sugerencias").style.display = "none";
  document.getElementById("buscador").value = "";
  calcularImporte();
}

function calcularImporte() {
  if (!productoActual) return;
  const cant = parseInt(document.getElementById("prod-cantidad").value) || 1;
  const tipo = document.getElementById("prod-tipo-precio").value;
  const precio = tipo === "descuento" ? parseFloat(productoActual.DESCUENTO) : parseFloat(productoActual.PRECIO);
  document.getElementById("lbl-importe").textContent = "$" + (cant * precio).toFixed(2);
}

// ─── AGREGAR A VENTA ──────────────────────────────────────────────────────────
function agregarProducto() {
  if (!productoActual) return;
  const cant = parseInt(document.getElementById("prod-cantidad").value) || 1;
  const tipo = document.getElementById("prod-tipo-precio").value;
  const precioNormal = parseFloat(productoActual.PRECIO);
  const precioUsado = tipo === "descuento" ? parseFloat(productoActual.DESCUENTO) : precioNormal;
  venta.push({
    codigo: productoActual.CODIGO,
    nombre: productoActual.PRODUCTO,
    cantidad: cant,
    precio: precioUsado,
    precioNormal,
    conDescuento: tipo === "descuento",
    importe: cant * precioUsado
  });
  document.getElementById("producto-panel").style.display = "none";
  productoActual = null;
  renderTabla();
  mostrarToast("Producto agregado ✓");
}

function renderTabla() {
  const div = document.getElementById("filas-venta");
  if (!venta.length) {
    div.innerHTML = '<div id="empty-msg">Agrega productos para comenzar</div>';
    document.getElementById("badge-count").textContent = "0";
    actualizarTotales();
    return;
  }
  div.innerHTML = venta.map((item, i) => `
    <div class="venta-row">
      <div>
        <div class="venta-nombre">${item.nombre}</div>
        <div class="venta-cod">${item.codigo}
          ${item.conDescuento ? '<span class="venta-desc-tag">DESCUENTO</span>' : ''}
        </div>
      </div>
      <div class="venta-num">${item.cantidad}</div>
      <div class="venta-precio">$${item.precio.toFixed(2)}</div>
      <div class="venta-importe">$${item.importe.toFixed(2)}</div>
      <button class="btn-del" onclick="eliminarFila(${i})">✕</button>
    </div>
  `).join("");
  document.getElementById("badge-count").textContent = venta.length;
  actualizarTotales();
}

function eliminarFila(i) { venta.splice(i, 1); renderTabla(); }

function actualizarTotales() {
  const subtotal = venta.reduce((s, x) => s + x.cantidad * x.precioNormal, 0);
  const total = venta.reduce((s, x) => s + x.importe, 0);
  document.getElementById("lbl-subtotal").textContent = "$" + subtotal.toFixed(2);
  document.getElementById("lbl-descuentos").textContent = "-$" + (subtotal - total).toFixed(2);
  document.getElementById("lbl-total").textContent = "$" + total.toFixed(2);
}

function limpiarVenta() {
  if (!venta.length) return;
  if (!confirm("¿Limpiar la venta actual?")) return;
  venta = []; renderTabla();
}

// ─── GENERAR VENTA ────────────────────────────────────────────────────────────
async function generarVenta() {
  if (!venta.length) { mostrarToast("⚠️ Agrega productos primero"); return; }
  if (!vendedor) { mostrarToast("⚠️ Ingresa tu nombre"); return; }

  const total = venta.reduce((s, x) => s + x.importe, 0);
  const ahora = new Date();
  const payload = {
    sucursal: SUCURSAL,
    vendedor,
    fecha: ahora.toLocaleDateString("es-MX"),
    hora: ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    total: total.toFixed(2),
    items: venta.map(x => ({
      codigo: x.codigo, nombre: x.nombre, cantidad: x.cantidad,
      precio: x.precio.toFixed(2), descuento: x.conDescuento ? "Sí" : "No",
      importe: x.importe.toFixed(2)
    }))
  };

  const btn = document.querySelector(".btn-generar");
  btn.textContent = "⏳ Enviando..."; btn.disabled = true;

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    mostrarToast("✅ Venta registrada en Google Sheets");
    ventaRegistrada(total.toFixed(2), [...venta]);
    setTimeout(() => { venta = []; renderTabla(); }, 1500);
  } catch(err) {
    mostrarToast("❌ Error al enviar. Verifica conexión.");
  } finally {
    btn.textContent = "✅ Generar venta y enviar"; btn.disabled = false;
  }
}

// ─── HISTORIAL DE VENTAS DEL DÍA ─────────────────────────────────────────────
function ventaRegistrada(total, items) {
  const ahora = new Date();
  ventasDia.push({
    hora: ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    total,
    items
  });
  guardarHistorial();
  actualizarResumenDia();
  renderHistorialVentas();
}

function renderHistorialVentas() {
  const div = document.getElementById("historial-ventas");
  if (!div) return;

  // Actualizar badge
  const badge = document.getElementById("badge-historial");
  if (badge) badge.textContent = ventasDia.length + (ventasDia.length === 1 ? " venta" : " ventas");

  if (!ventasDia.length) {
    div.innerHTML = '<p style="color:var(--muted);text-align:center;font-size:13px;padding:16px;">Sin ventas registradas aún</p>';
    return;
  }

  // Mostrar ventas de más reciente a más antigua
  div.innerHTML = [...ventasDia].reverse().map((v, idx) => {
    const numVenta = ventasDia.length - idx;
    return `
    <div style="background:var(--surface2);border-radius:10px;padding:12px;margin-bottom:8px;border-left:3px solid var(--accent);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-family:'Rajdhani',sans-serif;font-size:14px;color:var(--accent);font-weight:700;">
          Venta #${numVenta} — ${v.hora}
        </span>
        <span style="font-family:'Rajdhani',sans-serif;font-size:16px;color:var(--accent2);font-weight:700;">
          $${parseFloat(v.total).toFixed(2)}
        </span>
      </div>
      ${v.items.map(item => `
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="flex:2;color:var(--text);">${item.nombre.substring(0, 35)}</span>
          <span style="flex:0.5;text-align:center;">x${item.cantidad}</span>
          <span style="flex:0.8;text-align:right;color:${item.conDescuento ? 'var(--accent2)' : 'var(--text)'};">$${parseFloat(item.importe).toFixed(2)}</span>
        </div>
      `).join("")}
    </div>
  `}).join("");
}

function actualizarResumenDia() {
  const n = ventasDia.length;
  const t = ventasDia.reduce((s, v) => s + parseFloat(v.total), 0);
  const tN = ventasDia.reduce((s, v) => s + v.items.reduce((si, i) => si + (i.conDescuento ? 0 : parseFloat(i.importe)), 0), 0);
  const tD = ventasDia.reduce((s, v) => s + v.items.reduce((si, i) => si + (i.conDescuento ? parseFloat(i.importe) : 0), 0), 0);
  document.getElementById("lbl-num-ventas").textContent = n;
  document.getElementById("lbl-total-dia").textContent = "$" + t.toFixed(2);
  document.getElementById("lbl-total-normal-dia").textContent = "$" + tN.toFixed(2);
  document.getElementById("lbl-total-desc-dia").textContent = "$" + tD.toFixed(2);
}

// ─── CORTE DEL DÍA ────────────────────────────────────────────────────────────
async function hacerCorte() {
  if (!vendedor) { mostrarToast("⚠️ Ingresa tu nombre primero"); return; }
  if (!ventasDia.length) { mostrarToast("⚠️ No hay ventas registradas hoy"); return; }

  const totalDia = ventasDia.reduce((s, v) => s + parseFloat(v.total), 0);
  if (!confirm(`¿Realizar corte del día?\n\nTotal: $${totalDia.toFixed(2)}\nVentas: ${ventasDia.length}\n\nEsto borrará el historial del día.`)) return;

  const ahora = new Date();
  const tN = ventasDia.reduce((s,v) => s + v.items.reduce((si,i) => si + (i.conDescuento ? 0 : parseFloat(i.importe)), 0), 0);
  const tD = ventasDia.reduce((s,v) => s + v.items.reduce((si,i) => si + (i.conDescuento ? parseFloat(i.importe) : 0), 0), 0);

  const payload = {
    tipo: "corte", sucursal: SUCURSAL, vendedor,
    fecha: ahora.toLocaleDateString("es-MX"),
    hora: ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    numVentas: ventasDia.length,
    totalNormal: tN.toFixed(2),
    totalDescuento: tD.toFixed(2),
    totalDia: totalDia.toFixed(2)
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    mostrarToast("✅ Corte registrado correctamente");
    // Solo borra después del corte manual
    ventasDia = [];
    localStorage.removeItem("historial_dia");
    actualizarResumenDia();
    renderHistorialVentas();
  } catch(err) {
    mostrarToast("❌ Error al enviar corte");
  }
}

// ─── SCANNER ──────────────────────────────────────────────────────────────────
function toggleScanner() { scannerActivo ? detenerScanner() : iniciarScanner(); }

async function iniciarScanner() {
  document.getElementById("scanner-container").style.display = "block";
  scannerActivo = true;
  document.getElementById("btn-scan").textContent = "⏹";
  codeReader = new ZXing.BrowserMultiFormatReader();
  try {
    await codeReader.decodeFromVideoDevice(null, "video-scanner", (result) => {
      if (result) { seleccionarProductoPorCodigo(result.getText()); detenerScanner(); }
    });
  } catch(err) { alert("No se pudo acceder a la cámara."); detenerScanner(); }
}

function detenerScanner() {
  if (codeReader) codeReader.reset();
  scannerActivo = false;
  document.getElementById("scanner-container").style.display = "none";
  document.getElementById("btn-scan").textContent = "📷";
}

function seleccionarProductoPorCodigo(codigo) {
  const p = productos.find(x => x.CODIGO === codigo);
  if (p) { seleccionarProducto(p.CODIGO); mostrarToast("📦 " + p.PRODUCTO.substring(0, 30)); }
  else mostrarToast("⚠️ Código no encontrado: " + codigo);
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimeout;
function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 2500);
}

document.addEventListener("click", e => {
  if (!e.target.closest(".search-box"))
    document.getElementById("sugerencias").style.display = "none";
});
