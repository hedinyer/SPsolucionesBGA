import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export type VentaCartLine = {
  sku: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
};

function formatCopPdf(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10 },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  date: { fontSize: 9, color: "#616161", marginBottom: 20 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#bdbdbd",
    paddingBottom: 6,
    marginBottom: 4,
    fontWeight: "bold",
    fontSize: 9,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e0e0e0",
    fontSize: 9,
  },
  colProducto: { width: "32%" },
  colSku: { width: "18%" },
  colCant: { width: "10%", textAlign: "center" },
  colPrecio: { width: "20%", textAlign: "right" },
  colSubtotal: { width: "20%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#bdbdbd",
  },
  totalLabel: { fontSize: 12, fontWeight: "bold", marginRight: 12 },
  totalValue: { fontSize: 12, fontWeight: "bold" },
});

export function VentaCotizacionPdfDoc({
  lines,
  total,
  fecha,
}: {
  lines: VentaCartLine[];
  total: number;
  fecha: string;
}) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Cotización</Text>
        <Text style={styles.date}>{fecha}</Text>

        <View style={styles.tableHeader}>
          <Text style={styles.colProducto}>Producto</Text>
          <Text style={styles.colSku}>SKU</Text>
          <Text style={styles.colCant}>Cant.</Text>
          <Text style={styles.colPrecio}>P. unit.</Text>
          <Text style={styles.colSubtotal}>Subtotal</Text>
        </View>

        {lines.map((line) => (
          <View key={line.sku} style={styles.row}>
            <Text style={styles.colProducto}>{line.nombre}</Text>
            <Text style={styles.colSku}>{line.sku}</Text>
            <Text style={styles.colCant}>{line.cantidad}</Text>
            <Text style={styles.colPrecio}>
              {formatCopPdf(line.precioUnitario)}
            </Text>
            <Text style={styles.colSubtotal}>
              {formatCopPdf(line.precioUnitario * line.cantidad)}
            </Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCopPdf(total)}</Text>
        </View>
      </Page>
    </Document>
  );
}
