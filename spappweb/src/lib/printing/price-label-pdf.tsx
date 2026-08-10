import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PriceLabelData } from "@/lib/printing/price-label";
import type { PriceLabelPrintOptions } from "@/lib/printing/price-label-print-options";
import {
  labelPlacement,
  labelSlotsForPages,
} from "@/lib/printing/price-label-print-options";

function mm(mmValue: number) {
  return mmValue * 2.834645669291;
}

function labelStyles(scale: number, rotated: boolean) {
  const qrSize = rotated ? 14 : 14;

  return StyleSheet.create({
    page: {
      padding: 0,
    },
    label: {
      position: "absolute",
      paddingHorizontal: 2,
      paddingVertical: 1,
      justifyContent: "space-between",
      alignItems: "center",
    },
    name: {
      fontSize: (rotated ? 4 : 5) * scale,
      textAlign: "center",
      maxLines: 1,
    },
    qr: {
      width: mm(qrSize * scale),
      height: mm(qrSize * scale),
      objectFit: "contain",
    },
    price: {
      fontSize: (rotated ? 6 : 7) * scale,
      fontWeight: "bold",
      textAlign: "center",
    },
  });
}

export function PriceLabelPdfDoc({
  data,
  qrSrc,
  options,
}: {
  data: PriceLabelData;
  qrSrc: string;
  options: PriceLabelPrintOptions;
}) {
  const rotated = options.rotationDeg === 90;
  const styles = labelStyles(options.contentScale, rotated);
  const pages = labelSlotsForPages(options);
  const sample = labelPlacement(options, 0);

  return (
    <Document>
      {pages.map((slots, pageIndex) => (
        <Page
          key={pageIndex}
          size={[mm(sample.pageWidthMm), mm(sample.pageHeightMm)]}
          style={styles.page}
        >
          {slots.map((slot) => {
            const place = labelPlacement(options, slot);
            return (
              <View
                key={`${pageIndex}-${slot}`}
                style={[
                  styles.label,
                  {
                    left: mm(place.leftMm),
                    top: mm(place.topMm),
                    width: mm(place.widthMm),
                    height: mm(place.heightMm),
                  },
                ]}
              >
                <Text style={styles.name}>{data.nombre}</Text>
                <Image src={qrSrc} style={styles.qr} />
                <Text style={styles.price}>{data.precioFormatted}</Text>
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}
