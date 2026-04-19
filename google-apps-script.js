// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE APPS SCRIPT — Farmacia JN
// ═══════════════════════════════════════════════════════════════════════════════

// 👇 PON AQUÍ EL ID DE TU GOOGLE SHEET
const SHEET_ID = "PEGA_AQUI_EL_ID_DE_TU_GOOGLE_SHEET";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.tipo === "corte") return registrarCorte(data);
    return registrarVenta(data);
  } catch (err) {
    return respuesta("error", err.toString());
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Farmacia JN API activa ✓");
}

// ── REGISTRAR VENTA ───────────────────────────────────────────────────────────
function registrarVenta(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Hoja VENTAS (detalle de cada producto)
  let h = ss.getSheetByName("Ventas");
  if (!h) {
    h = ss.insertSheet("Ventas");
    h.appendRow(["Fecha","Hora","Vendedor","Código","Producto","Cantidad","Precio Unit.","Descuento","Importe","Total Venta"]);
    h.getRange(1,1,1,10).setFontWeight("bold").setBackground("#0e1a2e").setFontColor("#00e5ff");
    h.setFrozenRows(1);
    h.setColumnWidth(5, 260);
  }
  data.items.forEach(item => {
    h.appendRow([data.fecha, data.hora, data.vendedor, item.codigo, item.nombre,
      Number(item.cantidad), Number(item.precio), item.descuento, Number(item.importe), Number(data.total)]);
  });

  // Hoja RESUMEN (una fila por venta)
  let r = ss.getSheetByName("Resumen");
  if (!r) {
    r = ss.insertSheet("Resumen");
    r.appendRow(["Fecha","Hora","Vendedor","# Productos","Total"]);
    r.getRange(1,1,1,5).setFontWeight("bold").setBackground("#0e1a2e").setFontColor("#00e5ff");
    r.setFrozenRows(1);
  }
  r.appendRow([data.fecha, data.hora, data.vendedor, data.items.length, Number(data.total)]);

  // Actualizar total acumulado del día
  actualizarTotalDia(ss, data.fecha, data.vendedor, Number(data.total));

  return respuesta("ok", "Venta registrada");
}

// ── TOTAL ACUMULADO POR DÍA ───────────────────────────────────────────────────
function actualizarTotalDia(ss, fecha, vendedor, monto) {
  let hd = ss.getSheetByName("Total por Día");
  if (!hd) {
    hd = ss.insertSheet("Total por Día");
    hd.appendRow(["Fecha","# Ventas","Vendedores","Total del Día","Corte"]);
    hd.getRange(1,1,1,5).setFontWeight("bold").setBackground("#0e1a2e").setFontColor("#00ff99");
    hd.setFrozenRows(1);
    hd.setColumnWidth(1,110); hd.setColumnWidth(3,180); hd.setColumnWidth(4,130);
  }

  const datos = hd.getDataRange().getValues();
  let fila = -1;
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === fecha) { fila = i + 1; break; }
  }

  if (fila === -1) {
    hd.appendRow([fecha, 1, vendedor, monto, "Pendiente"]);
  } else {
    const numVentas = datos[fila-1][1];
    const vendedoresStr = datos[fila-1][2] || "";
    const totalActual = datos[fila-1][3];
    const lista = vendedoresStr ? vendedoresStr.split(", ").filter(Boolean) : [];
    if (!lista.includes(vendedor)) lista.push(vendedor);
    hd.getRange(fila,2).setValue(numVentas + 1);
    hd.getRange(fila,3).setValue(lista.join(", "));
    hd.getRange(fila,4).setValue(totalActual + monto);
  }
}

// ── REGISTRAR CORTE ───────────────────────────────────────────────────────────
function registrarCorte(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Marcar corte en Total por Día
  let hd = ss.getSheetByName("Total por Día");
  if (hd) {
    const datos = hd.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][0] === data.fecha) {
        const celda = hd.getRange(i+1, 5);
        celda.setValue("✅ " + data.hora + " — " + data.vendedor);
        celda.setFontColor("#00ff99").setFontWeight("bold");
        break;
      }
    }
  }

  // Hoja CORTES
  let hc = ss.getSheetByName("Cortes");
  if (!hc) {
    hc = ss.insertSheet("Cortes");
    hc.appendRow(["Fecha","Hora","Quien Cortó","# Ventas","Total Normal","Total c/Desc","Total del Día"]);
    hc.getRange(1,1,1,7).setFontWeight("bold").setBackground("#1a0e2e").setFontColor("#ff99ff");
    hc.setFrozenRows(1);
  }
  hc.appendRow([data.fecha, data.hora, data.vendedor,
    data.numVentas, Number(data.totalNormal), Number(data.totalDescuento), Number(data.totalDia)]);

  return respuesta("ok", "Corte registrado");
}

function respuesta(status, msg) {
  return ContentService.createTextOutput(JSON.stringify({status, msg}))
    .setMimeType(ContentService.MimeType.JSON);
}
