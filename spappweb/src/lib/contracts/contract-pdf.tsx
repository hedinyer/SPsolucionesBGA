import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  EMPRESA_PROPIETARIA,
  blocks,
  renderFirma,
  renderIntro,
  renderClausulaTexto,
  type ContratoData,
} from "@/lib/contracts/contrato-renting-clausulas";
import {
  ESTADO_CIVIL_LABELS,
  parseHojaVidaForm,
  type HojaVidaFormData,
} from "@/lib/contracts/hoja-vida-schema";

const TIPO_PDF_CODE: Record<string, string> = {
  ppt: "PPT",
  cc: "CC",
  p: "PV",
  cv: "CV",
};

async function publicImage(file: string): Promise<{ data: Buffer; format: "png" | "jpg" }> {
  const data = await readFile(path.join(process.cwd(), "public", file));
  // ponytail: react-pdf trata jpeg como jpg
  return { data, format: file.endsWith(".png") ? "png" : "jpg" };
}

const serif = "Times-Roman";
const serifBold = "Times-Bold";

const styles = StyleSheet.create({
  page: { paddingTop: 52, paddingBottom: 48, paddingHorizontal: 40, fontSize: 10, fontFamily: serif },
  pageContrato: {
    paddingTop: 80,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: serif,
    color: "#1a1a1a",
    lineHeight: 1.45,
  },
  headerBand: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 44,
  },
  headerLogos: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerLogo: { height: 34, objectFit: "contain" },
  headerBrand: { color: "#0f172a", fontSize: 8, fontFamily: serifBold, letterSpacing: 0.5 },
  logo: { position: "absolute", top: 16, right: 40, height: 36, objectFit: "contain" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#64748b",
    fontFamily: serif,
  },
  title: { textAlign: "center", fontSize: 14, fontFamily: serifBold, marginBottom: 16 },
  titleContrato: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: serifBold,
    marginBottom: 4,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  titleSub: {
    textAlign: "center",
    fontSize: 8,
    color: "#475569",
    marginBottom: 14,
  },
  line: { marginBottom: 6, fontSize: 10 },
  sectionTitle: { fontFamily: serifBold, marginTop: 12, marginBottom: 4 },
  intro: {
    fontSize: 9.5,
    marginBottom: 14,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: "#0f172a",
  },
  blockTitle: {
    fontSize: 10,
    fontFamily: serifBold,
    marginTop: 10,
    marginBottom: 6,
    color: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 3,
  },
  clausulaTitulo: { fontSize: 9.5, fontFamily: serifBold, marginBottom: 3, color: "#0f172a" },
  clausulaTexto: { fontSize: 9, lineHeight: 1.45, marginBottom: 8, textAlign: "justify" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#94a3b8", marginVertical: 12 },
  firmaIntro: { fontSize: 9, marginBottom: 12, textAlign: "justify" },
  firmaRow: { flexDirection: "row", gap: 24 },
  firmaCol: { flex: 1 },
  firmaRole: { fontSize: 9, fontFamily: serifBold, marginBottom: 6, textTransform: "uppercase" },
  sigImg: { height: 52, marginBottom: 6, objectFit: "contain" },
  sigLine: { borderBottomWidth: 1, borderBottomColor: "#334155", marginBottom: 6, height: 1 },
  sigName: { fontSize: 9, fontFamily: serifBold },
  sigMeta: { fontSize: 8, color: "#475569", marginTop: 2 },
});

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>{EMPRESA_PROPIETARIA.razonSocial}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

const BERA_LOGO_FILE = "beralogo.jpg";

function ContratoHeader({
  pinillaLogo,
  beraLogo,
}: {
  pinillaLogo: { data: Buffer; format: "png" | "jpg" };
  beraLogo: { data: Buffer; format: "png" | "jpg" };
}) {
  return (
    <View style={styles.headerBand} fixed>
      <View style={styles.headerLogos}>
        <Image style={styles.headerLogo} src={pinillaLogo} />
        <Image style={styles.headerLogo} src={beraLogo} />
      </View>
      <Text style={styles.headerBrand}>{EMPRESA_PROPIETARIA.razonSocial}</Text>
    </View>
  );
}

function FirmaCol({
  role,
  sigSrc,
  lines,
}: {
  role: string;
  sigSrc: { data: Buffer; format: "png" | "jpg" } | string;
  lines: string[];
}) {
  return (
    <View style={styles.firmaCol}>
      <Text style={styles.firmaRole}>{role}</Text>
      <Image style={styles.sigImg} src={sigSrc} />
      <View style={styles.sigLine} />
      {lines.map((line, i) => (
        <Text key={line} style={i === 0 ? styles.sigName : styles.sigMeta}>
          {line}
        </Text>
      ))}
    </View>
  );
}

export async function generateHojaVidaPdf(args: {
  hoja: Record<string, unknown>;
  signatureDataUrl: string;
  comercial?: {
    placa: string;
    chasis: string;
    color: string;
    referencia: string;
    modelo: string;
    cuotaInicial: string;
    valorCuota: string;
    frecuenciaPago: string;
  };
}): Promise<Buffer> {
  const form: HojaVidaFormData = parseHojaVidaForm(args.hoja);
  const logo = await publicImage(EMPRESA_PROPIETARIA.logoFile);
  const now = new Date();
  const tipo = form.tipo_identificacion ? TIPO_PDF_CODE[form.tipo_identificacion] : "";
  const estado = form.estado_civil ? ESTADO_CIVIL_LABELS[form.estado_civil] : "";
  const x = (cond: boolean) => (cond ? "X" : "_");
  const ref0 = form.referencias[0];
  const ref1 = form.referencias[1];
  const c = args.comercial;

  const Line = ({ children }: { children: string }) => (
    <Text style={styles.line}>{children}</Text>
  );

  const doc = (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Image style={styles.logo} src={logo} fixed />
        <Footer />
        <Text style={styles.title}>HOJA DE VIDA VENTA A CREDITO</Text>
        <Line>NUEVA _____ USADA ______</Line>
        <Line>{`FECHA: ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`}</Line>
        <Line>{`NOMBRE COMPLETO: ${form.nombre_completo}`}</Line>
        <Line>
          {`TIPO IDENTIFICACION: PPT: ${x(tipo === "PPT")} CC: ${x(tipo === "CC")} PV: ${x(tipo === "PV")} CV: ${x(tipo === "CV")} No. ${form.numero_identificacion}`}
        </Line>
        <Line>{`FECHA DE NACIMIENTO ${form.fecha_nacimiento}`}</Line>
        <Line>{`CELULAR    ${form.celular}`}</Line>
        <Line>{`DIRECCION: ${form.direccion}    BARRIO: ${form.barrio}`}</Line>
        <Line>{`CORREO ELECTRONICO: ${form.correo}`}</Line>
        <Line>
          {`TRABAJA EN EMPRESA: SI ${x(form.trabaja_empresa === true)} NO ${x(form.trabaja_empresa === false)}`}
        </Line>
        <Line>{`NOMBRE EMPRESA: ${form.nombre_empresa}    TELEFONO: ${form.telefono_empresa}`}</Line>
        <Line>{`DIRECCION ${form.direccion_empresa}`}</Line>
        <Line>{`INDEPENDIENTE: ${x(form.independiente === true)} HABILIDAD: ${form.habilidad}`}</Line>
        <Line>
          {`ESTADO CIVIL: SOLTERO: ${x(estado === "Soltero(a)")} CASADO: ${x(estado === "Casado(a)")} UNION LIBRE: ${x(estado === "Unión libre")}`}
        </Line>
        <Line>{`NOMBRE CONYUGE: ${form.nombre_conyuge}    CELULAR: ${form.celular_conyuge}`}</Line>
        <Text style={styles.sectionTitle}>REFERENCIAS FAMILIARES Ó PERSONALES</Text>
        {(ref0.nombre || ref0.celular) && (
          <Line>{`NOMBRE: ${ref0.nombre}    CELULAR: ${ref0.celular}`}</Line>
        )}
        {(ref1.nombre || ref1.celular) && (
          <Line>{`NOMBRE: ${ref1.nombre}    CELULAR: ${ref1.celular}`}</Line>
        )}
        <Line> </Line>
        <Line>{`PLACA ASIGNADA: ${c?.placa ?? "_____________________"}`}</Line>
        <Line>{`CHASIS: ${c?.chasis ?? "______________"} COLOR: ${c?.color ?? "________________"} REFERENCIA: ${c?.referencia ?? "___________"}`}</Line>
        <Line>{`MODELO: ${c?.modelo ?? "__________"}`}</Line>
        <Line>VISITA DOMICILIARIA: ________________________________</Line>
        <Text style={styles.sectionTitle}>FORMA DE PAGO</Text>
        <Line>{`CUOTA INICIAL ${c?.cuotaInicial ?? "$__________"} VISITA DOMICILIARIA $ ________ FECHA: ___________`}</Line>
        <Line>MEDIO EFECTIVO ___ NEQUI _____BANCOLOMBIA ___ DAVIPLATA __DAVIVIENDA</Line>
        <Line>MEDIO PAGO-REFRENCIA ________ ____________ _________ _________________</Line>
        <Line>{`VALOR CUOTA: ${c?.valorCuota ?? "$ __________"} TIEMPO: ${c?.frecuenciaPago ?? "________"} MODALIDAD PAGO: ${c?.frecuenciaPago ?? "__________"}`}</Line>
        <Line>OTRAS DEUDAS: ___________ CONCEPTO _____________PLAZO PAGO ___________</Line>
        <Line>COMISION: _______________________________</Line>
        <Line>FECHA DE ENTREGA: ________________________</Line>
        <View>
          <Text style={{ marginTop: 24, fontFamily: serifBold }}>FIRMA DEL SOLICITANTE:</Text>
          <Image style={{ height: 60, marginTop: 8, objectFit: "contain" }} src={args.signatureDataUrl} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

export async function generateContratoPdf(args: {
  contrato: ContratoData;
  signatureDataUrl: string;
}): Promise<Buffer> {
  const { contrato } = args;
  const [logo, beraLogo, firmaProp] = await Promise.all([
    publicImage(EMPRESA_PROPIETARIA.logoFile),
    publicImage(BERA_LOGO_FILE),
    publicImage(EMPRESA_PROPIETARIA.firmaFile),
  ]);
  const e = EMPRESA_PROPIETARIA;

  const doc = (
    <Document>
      <Page size="LETTER" style={styles.pageContrato}>
        <ContratoHeader pinillaLogo={logo} beraLogo={beraLogo} />
        <Footer />
        <Text style={styles.titleContrato}>Contrato de Renting</Text>
        <Text style={styles.titleSub}>{e.razonSocial} · {e.ciudad}</Text>
        <Text style={styles.intro}>{renderIntro(contrato)}</Text>
        {blocks.map((block) => (
          <View key={block.title}>
            <Text style={styles.blockTitle}>{block.title}</Text>
            {block.clausulas.map((c) => (
              <View key={c.titulo}>
                <Text style={styles.clausulaTitulo}>{c.titulo}</Text>
                <Text style={styles.clausulaTexto}>
                  {renderClausulaTexto(c.texto, contrato)}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.divider} />
        <Text style={styles.firmaIntro}>{renderFirma(contrato)}</Text>
        <View style={styles.firmaRow}>
          <FirmaCol
            role="La propietaria"
            sigSrc={firmaProp}
            lines={[
              e.representante,
              e.cedula,
              "Representante legal",
              e.razonSocial,
              `Nit: ${e.nit}`,
            ]}
          />
          <FirmaCol
            role="El contratante"
            sigSrc={args.signatureDataUrl}
            lines={[
              contrato.nombreContratante,
              `${contrato.tipoDocumentoContratante || "C.C."} ${contrato.cedulaContratante}`,
            ]}
          />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
