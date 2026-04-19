// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// 👇 Pega aquí la URL de tu Google Apps Script después de desplegarlo
const GOOGLE_SCRIPT_URL = "PEGA_AQUI_TU_URL_DE_GOOGLE_APPS_SCRIPT";

// ─── ESTADO ───────────────────────────────────────────────────────────────────
let productos = [];
let venta = [];
let productoActual = null;
let vendedor = "";
let scannerActivo = false;
let codeReader = null;
let timeoutBusqueda;

// ─── INICIO ───────────────────────────────────────────────────────────────────
fetch('./data.json')
  .then(r => r.json())
  .then(data => { productos = data; })
  .catch(() => console.warn("No se pudo cargar data.json"));

function iniciarSesion() {
  const nombre = document.getElementById("input-vendedor").value.trim();
  if (!nombre) { alert("Ingresa tu nombre"); return; }
  vendedor = nombre;
  document.getElementById("nombre-vendedor").textContent = nombre;
  document.getElementById("modal-vendedor").style.display = "none";
}

document.getElementById("input-vendedor").addEventListener("keydown", e => {
  if (e.key === "Enter") iniciarSesion();
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

  if (resultados.length === 0) { div.style.display = "none"; return; }

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
  const precio = tipo === "descuento"
    ? parseFloat(productoActual.DESCUENTO)
    : parseFloat(productoActual.PRECIO);
  document.getElementById("lbl-importe").textContent = "$" + (cant * precio).toFixed(2);
}

// ─── AGREGAR A VENTA ──────────────────────────────────────────────────────────
function agregarProducto() {
  if (!productoActual) return;
  const cant = parseInt(document.getElementById("prod-cantidad").value) || 1;
  const tipo = document.getElementById("prod-tipo-precio").value;
  const precioNormal = parseFloat(productoActual.PRECIO);
  const precioDesc = parseFloat(productoActual.DESCUENTO);
  const precioUsado = tipo === "descuento" ? precioDesc : precioNormal;
  const importe = cant * precioUsado;

  venta.push({
    codigo: productoActual.CODIGO,
    nombre: productoActual.PRODUCTO,
    cantidad: cant,
    precio: precioUsado,
    precioNormal: precioNormal,
    conDescuento: tipo === "descuento",
    importe: importe
  });

  document.getElementById("producto-panel").style.display = "none";
  productoActual = null;
  renderTabla();
  mostrarToast("Producto agregado ✓");
}

// ─── TABLA DE VENTAS ──────────────────────────────────────────────────────────
function renderTabla() {
  const div = document.getElementById("filas-venta");

  if (venta.length === 0) {
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

function eliminarFila(i) {
  venta.splice(i, 1);
  renderTabla();
}

function actualizarTotales() {
  const subtotal = venta.reduce((s, x) => s + (x.cantidad * x.precioNormal), 0);
  const total = venta.reduce((s, x) => s + x.importe, 0);
  const descuentos = subtotal - total;

  document.getElementById("lbl-subtotal").textContent = "$" + subtotal.toFixed(2);
  document.getElementById("lbl-descuentos").textContent = "-$" + descuentos.toFixed(2);
  document.getElementById("lbl-total").textContent = "$" + total.toFixed(2);
}

function limpiarVenta() {
  if (venta.length === 0) return;
  if (!confirm("¿Limpiar toda la venta?")) return;
  venta = [];
  renderTabla();
}

// ─── GENERAR VENTA → GOOGLE SHEETS ───────────────────────────────────────────
async function generarVenta() {
  if (venta.length === 0) { mostrarToast("⚠️ Agrega productos primero"); return; }
  if (!vendedor) { mostrarToast("⚠️ Ingresa tu nombre"); return; }

  if (GOOGLE_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_GOOGLE_APPS_SCRIPT") {
    alert("⚠️ Falta configurar la URL de Google Apps Script.\nSigue las instrucciones del archivo INSTRUCCIONES.txt");
    return;
  }

  const total = venta.reduce((s, x) => s + x.importe, 0);
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("es-MX");
  const hora = ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  const payload = {
    vendedor,
    fecha,
    hora,
    total: total.toFixed(2),
    items: venta.map(x => ({
      codigo: x.codigo,
      nombre: x.nombre,
      cantidad: x.cantidad,
      precio: x.precio.toFixed(2),
      descuento: x.conDescuento ? "Sí" : "No",
      importe: x.importe.toFixed(2)
    }))
  };

  const btn = document.querySelector(".btn-generar");
  btn.textContent = "⏳ Enviando...";
  btn.disabled = true;

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    mostrarToast("✅ Venta registrada en Google Sheets");
    ventaRegistrada(total.toFixed(2), [...venta]);
    setTimeout(() => {
      venta = [];
      renderTabla();
    }, 1500);

  } catch (err) {
    mostrarToast("❌ Error al enviar. Verifica conexión.");
  } finally {
    btn.textContent = "✅ Generar venta y enviar";
    btn.disabled = false;
  }
}

// ─── SCANNER ──────────────────────────────────────────────────────────────────
function toggleScanner() {
  scannerActivo ? detenerScanner() : iniciarScanner();
}

async function iniciarScanner() {
  const contenedor = document.getElementById("scanner-container");
  contenedor.style.display = "block";
  scannerActivo = true;
  document.getElementById("btn-scan").textContent = "⏹";

  codeReader = new ZXing.BrowserMultiFormatReader();
  try {
    await codeReader.decodeFromVideoDevice(null, "video-scanner", (result, err) => {
      if (result) {
        const codigo = result.getText();
        seleccionarProductoPorCodigo(codigo);
        detenerScanner();
      }
    });
  } catch (err) {
    alert("No se pudo acceder a la cámara.");
    detenerScanner();
  }
}

function detenerScanner() {
  if (codeReader) codeReader.reset();
  scannerActivo = false;
  document.getElementById("scanner-container").style.display = "none";
  document.getElementById("btn-scan").textContent = "📷";
}

function seleccionarProductoPorCodigo(codigo) {
  const p = productos.find(x => x.CODIGO === codigo);
  if (p) {
    seleccionarProducto(p.CODIGO);
    mostrarToast("📦 " + p.PRODUCTO.substring(0, 30));
  } else {
    mostrarToast("⚠️ Código no encontrado: " + codigo);
  }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimeout;
function mostrarToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove("show"), 2500);
}

// Cerrar sugerencias al tocar fuera
document.addEventListener("click", e => {
  if (!e.target.closest(".search-box")) {
    document.getElementById("sugerencias").style.display = "none";
  }
});

// ─── CORTE DEL DÍA ────────────────────────────────────────────────────────────
async function hacerCorte() {
  if (!vendedor) { mostrarToast("⚠️ Ingresa tu nombre primero"); return; }

  if (GOOGLE_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_GOOGLE_APPS_SCRIPT") {
    alert("⚠️ Falta configurar la URL de Google Apps Script.");
    return;
  }

  // Calcular totales del día desde la venta actual + historial local
  const totalDia = parseFloat(document.getElementById("lbl-total-dia").textContent.replace("$","")) || 0;
  const totalNormal = parseFloat(document.getElementById("lbl-total-normal-dia").textContent.replace("$","")) || 0;
  const totalDesc = parseFloat(document.getElementById("lbl-total-desc-dia").textContent.replace("$","")) || 0;
  const numVentas = parseInt(document.getElementById("lbl-num-ventas").textContent) || 0;

  if (numVentas === 0) { mostrarToast("⚠️ No hay ventas registradas hoy"); return; }

  if (!confirm(`¿Realizar corte del día?\n\nTotal: $${totalDia.toFixed(2)}\nVentas: ${numVentas}`)) return;

  const ahora = new Date();
  const payload = {
    tipo: "corte",
    fecha: ahora.toLocaleDateString("es-MX"),
    hora: ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    vendedor,
    numVentas,
    totalNormal: totalNormal.toFixed(2),
    totalDescuento: totalDesc.toFixed(2),
    totalDia: totalDia.toFixed(2)
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    mostrarToast("✅ Corte registrado correctamente");
    // Resetear acumulado del día en pantalla
    ventasDia = []; actualizarResumenDia();
  } catch (err) {
    mostrarToast("❌ Error al enviar corte");
  }
}

// ─── RESUMEN DEL DÍA (acumulado local) ───────────────────────────────────────
let ventasDia = [];

function ventaRegistrada(total, items) {
  ventasDia.push({ total, items });
  actualizarResumenDia();
}

function actualizarResumenDia() {
  const numVentas = ventasDia.length;
  const totalDia = ventasDia.reduce((s, v) => s + parseFloat(v.total), 0);
  const totalNormal = ventasDia.reduce((s, v) =>
    s + v.items.reduce((si, i) => si + (i.conDescuento ? 0 : parseFloat(i.importe)), 0), 0);
  const totalDesc = ventasDia.reduce((s, v) =>
    s + v.items.reduce((si, i) => si + (i.conDescuento ? parseFloat(i.importe) : 0), 0), 0);

  document.getElementById("lbl-num-ventas").textContent = numVentas;
  document.getElementById("lbl-total-dia").textContent = "$" + totalDia.toFixed(2);
  document.getElementById("lbl-total-normal-dia").textContent = "$" + totalNormal.toFixed(2);
  document.getElementById("lbl-total-desc-dia").textContent = "$" + totalDesc.toFixed(2);
}
