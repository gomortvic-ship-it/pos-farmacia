// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE APPS SCRIPT — Farmacia JN (3 Sucursales)
// ═══════════════════════════════════════════════════════════════════════════════

const SHEET_ID = "1N2U8y3cwfZSLzwcaEWLUNaYccqREUQSo-DnvClfzSk8";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.tipo === "corte") return registrarCorte(data);
    if (data.tipo === "entrada") return registrarEntrada(data);
    if (data.tipo === "acceso") return registrarAcceso(data);
    return registrarVenta(data);
  } catch (err) {
    return respuesta("error", err.toString());
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Farmacia JN API activa ✓");
}

function registrarVenta(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const suc = data.sucursal || "Sin Sucursal";

  // ── Hoja VENTAS por sucursal ──────────────────────────────────────────────
  const nombreHoja = "Ventas-" + suc.replace(" ", "");
  let h = ss.getSheetByName(nombreHoja);
  if (!h) {
    h = ss.insertSheet(nombreHoja);
    h.appendRow(["Fecha","Hora","Vendedor","Código","Producto","Cantidad","Precio Unit.","Descuento","Importe","Total Venta"]);
    h.getRange(1,1,1,10).setFontWeight("bold").setBackground("#0e1a2e").setFontColor("#00e5ff");
    h.setFrozenRows(1);
    h.setColumnWidth(5, 260);
  }
  data.items.forEach(item => {
    h.appendRow([data.fecha, data.hora, data.vendedor, item.codigo, item.nombre,
      Number(item.cantidad), Number(item.precio), item.descuento,
      Number(item.importe), Number(data.total)]);
  });

  // ── Hoja TOTAL POR DÍA por sucursal ──────────────────────────────────────
  actualizarTotalDia(ss, data.fecha, data.vendedor, Number(data.total), suc);

  // ── Hoja RESUMEN GENERAL (todas las sucursales juntas) ────────────────────
  let rg = ss.getSheetByName("Resumen General");
  if (!rg) {
    rg = ss.insertSheet("Resumen General");
    rg.appendRow(["Fecha","Hora","Sucursal","Vendedor","# Productos","Total"]);
    rg.getRange(1,1,1,6).setFontWeight("bold").setBackground("#1a1a0e").setFontColor("#ffff00");
    rg.setFrozenRows(1);
    rg.setColumnWidth(3, 120);
  }
  rg.appendRow([data.fecha, data.hora, suc, data.vendedor, data.items.length, Number(data.total)]);

  return respuesta("ok", "Venta registrada en " + suc);
}

function actualizarTotalDia(ss, fecha, vendedor, monto, sucursal) {
  const nombreHoja = "TotalDia-" + sucursal.replace(" ", "");
  let hd = ss.getSheetByName(nombreHoja);
  if (!hd) {
    hd = ss.insertSheet(nombreHoja);
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

function registrarCorte(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const suc = data.sucursal || "Sin Sucursal";

  let hd = ss.getSheetByName("TotalDia-" + suc.replace(" ", ""));
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

  let hc = ss.getSheetByName("Cortes");
  if (!hc) {
    hc = ss.insertSheet("Cortes");
    hc.appendRow(["Fecha","Hora","Sucursal","Quien Cortó","# Ventas","Total Normal","Total c/Desc","Total del Día"]);
    hc.getRange(1,1,1,8).setFontWeight("bold").setBackground("#1a0e2e").setFontColor("#ff99ff");
    hc.setFrozenRows(1);
  }
  hc.appendRow([data.fecha, data.hora, suc, data.vendedor,
    data.numVentas, Number(data.totalNormal), Number(data.totalDescuento), Number(data.totalDia)]);

  return respuesta("ok", "Corte registrado en " + suc);
}



function registrarAcceso(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let ha = ss.getSheetByName("Accesos");
  if (!ha) {
    ha = ss.insertSheet("Accesos");
    ha.appendRow(["Fecha","Hora","Sucursal","Nombre","IP","Dispositivo","Navegador","ID Dispositivo","Bloqueado"]);
    ha.getRange(1,1,1,9).setFontWeight("bold").setBackground("#1a0a0a").setFontColor("#ff4d6d");
    ha.setFrozenRows(1);
    ha.setColumnWidth(6, 180);
    ha.setColumnWidth(8, 200);
  }

  const fila = [
    data.fecha, data.hora, data.sucursal, data.vendedor,
    data.ip, data.dispositivo, data.navegador,
    data.deviceId, data.bloqueado
  ];
  ha.appendRow(fila);

  // Si fue bloqueado, colorear de rojo
  if (data.bloqueado && data.bloqueado.includes("SÍ")) {
    const lastRow = ha.getLastRow();
    ha.getRange(lastRow, 1, 1, 9).setBackground("#3d0000").setFontColor("#ff8fa3");
  }

  return respuesta("ok", "Acceso registrado");
}
function registrarEntrada(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let he = ss.getSheetByName("Entradas");
  if (!he) {
    he = ss.insertSheet("Entradas");
    he.appendRow(["Fecha", "Hora Entrada", "Sucursal", "Vendedor"]);
    he.getRange(1,1,1,4).setFontWeight("bold").setBackground("#0e2e1a").setFontColor("#00ff99");
    he.setFrozenRows(1);
  }
  he.appendRow([data.fecha, data.hora, data.sucursal, data.vendedor]);
  return respuesta("ok", "Entrada registrada");
}

function respuesta(status, msg) {
  return ContentService.createTextOutput(JSON.stringify({status, msg}))
    .setMimeType(ContentService.MimeType.JSON);
}
