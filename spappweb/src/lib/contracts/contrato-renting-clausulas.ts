/**
 * Texto legal del Contrato de Renting (plantilla Soluciones Pinilla).
 * Placeholders comerciales los completa la asignación de moto al firmar.
 */

import type { FrecuenciaPago } from "../pipeline/types";
import { FRECUENCIA_LABELS } from "../pipeline/types";
import { formatCop } from "../utils/format-cop";

export const EMPRESA_PROPIETARIA = {
  razonSocial: "SOLUCIONES PINILLA S.A.S.",
  razonSocialCorto: "SOLUCIONES PINILLA SAS",
  representante: "MARISOL PINILLA RUEDA",
  cedula: "37.547.626",
  ciudad: "Bucaramanga",
  nit: "901.397.015-2",
  email: "marisolpinilla@hotmail.com",
  direccion: "centro la calle 37 #20-49 Bucaramanga",
  daviviendaConvenio: "1642750",
  llave: "@9013970152",
  daviplata: "3168101010",
  daviplataTitular: "JOSE MANUEL RUEDA FORERO",
  comprobanteBera: "3166953000",
  comprobanteNkd: "3165772514",
  marcaMoto: "BERA",
  logoFile: "solucionespinillalogo.jpeg",
  firmaFile: "marisolpinilla.png",
} as const;

export interface ContratoData {
  nombreContratante: string;
  cedulaContratante: string;
  /** Abreviatura del doc del contratante en firma (PPT, C.C., …). */
  tipoDocumentoContratante: string;
  direccionNotificaciones: string;
  ciudadContratante: string;
  departamentoContratante: string;
  fechaFirmaDia: string;
  fechaFirmaMes: string;
  fechaFirmaAnio: string;
  marca: string;
  modelo: string;
  linea: string;
  estado: string;
  chasis: string;
  motor: string;
  placa: string;
  color: string;
  referencia: string;
  cuotaInicial: string;
  valorCuota: string;
  frecuenciaPago: string;
  totalContrato: string;
  formaPagoSaldo: string;
  mediosPago: string;
}

export interface CompraContratoInput {
  modelo: string;
  color: string;
  placa: string;
  chasis: string;
  referencia: string | null;
  frecuencia_pago: FrecuenciaPago;
  cuota_inicial_monto: number;
  monto_cuota_periodo: number;
}

export interface Clausula {
  titulo: string;
  texto: string;
}

export interface ClausulaBlock {
  title: string;
  clausulas: Clausula[];
}

const PERIODOS_ANUALES: Record<FrecuenciaPago, number> = {
  diario: 365,
  semanal: 52,
  quincenal: 24,
  mensual: 12,
};

const PERIODO_LABEL: Record<FrecuenciaPago, string> = {
  diario: "365 CUOTAS DIARIAS",
  semanal: "52 CUOTAS SEMANALES",
  quincenal: "24 CUOTAS QUINCENALES",
  mensual: "12 CUOTAS MENSUALES",
};

export function buildFormaPagoSaldoText(
  frecuencia: FrecuenciaPago,
  valorCuota: string,
): string {
  return `El saldo restante, será cancelado directamente por el CONTRANTANTE a favor de la PROPIETARIA en ${PERIODO_LABEL[frecuencia]} DE ${valorCuota} MCTE (${valorCuota}).`;
}

export function buildMediosPagoText(): string {
  const e = EMPRESA_PROPIETARIA;
  return `DAVIVIENDA CONVENIO ${e.daviviendaConvenio} O POR LA LLAVE ${e.llave} de titularidad de ${e.razonSocialCorto} Ó DAVIPLATA ${e.daviplata} a nombre de ${e.daviplataTitular}. Numero autorizado de pasar el comprobante de pago para moto BERA ${e.comprobanteBera} Y para moto NKD ${e.comprobanteNkd} con nombre y placa`;
}

export function totalContratoMonto(
  cuotaInicial: number,
  montoCuotaPeriodo: number,
  frecuencia: FrecuenciaPago,
): number {
  return cuotaInicial + montoCuotaPeriodo * PERIODOS_ANUALES[frecuencia];
}

export function buildContratoComercial(compra: CompraContratoInput): Omit<
  ContratoData,
  | "nombreContratante"
  | "cedulaContratante"
  | "tipoDocumentoContratante"
  | "direccionNotificaciones"
  | "ciudadContratante"
  | "departamentoContratante"
  | "fechaFirmaDia"
  | "fechaFirmaMes"
  | "fechaFirmaAnio"
> {
  const valorCuota = formatCop(compra.monto_cuota_periodo);
  const cuotaInicial = formatCop(compra.cuota_inicial_monto);
  const total = formatCop(
    totalContratoMonto(
      compra.cuota_inicial_monto,
      compra.monto_cuota_periodo,
      compra.frecuencia_pago,
    ),
  );
  return {
    marca: EMPRESA_PROPIETARIA.marcaMoto,
    modelo: compra.modelo,
    linea: compra.modelo,
    estado: "Nueva",
    chasis: compra.chasis,
    motor: "N/A",
    placa: compra.placa,
    color: compra.color,
    referencia: compra.referencia?.trim() || "—",
    cuotaInicial,
    valorCuota,
    frecuenciaPago: FRECUENCIA_LABELS[compra.frecuencia_pago],
    totalContrato: total,
    formaPagoSaldo: buildFormaPagoSaldoText(compra.frecuencia_pago, valorCuota),
    mediosPago: buildMediosPagoText(),
  };
}

const FRECUENCIAS: FrecuenciaPago[] = ["diario", "semanal", "quincenal", "mensual"];

function asFrecuencia(value: unknown): FrecuenciaPago {
  return FRECUENCIAS.includes(value as FrecuenciaPago)
    ? (value as FrecuenciaPago)
    : "diario";
}

/** Reconstruye ContratoData desde contrato_data guardado (+ compra si hay). */
export function buildContratoDataFromStored(
  stored: Record<string, unknown>,
  compra?: CompraContratoInput | null,
): ContratoData {
  const comercial = buildContratoComercial({
    modelo: String(compra?.modelo ?? stored.moto_modelo ?? ""),
    color: String(compra?.color ?? stored.moto_color ?? ""),
    placa: String(compra?.placa ?? stored.moto_placa ?? ""),
    chasis: String(compra?.chasis ?? stored.moto_chasis ?? ""),
    referencia: compra?.referencia ?? null,
    frecuencia_pago: asFrecuencia(
      compra?.frecuencia_pago ?? stored.frecuencia_pago,
    ),
    cuota_inicial_monto: Number(
      compra?.cuota_inicial_monto ?? stored.cuota_inicial ?? 0,
    ),
    monto_cuota_periodo: Number(
      compra?.monto_cuota_periodo ?? stored.valor_cuota ?? 0,
    ),
  });

  const tipoRaw = String(stored.tipo_documento_contratante ?? "").toLowerCase();
  const tipoDocumentoContratante =
    tipoRaw === "ppt"
      ? "PPT"
      : tipoRaw === "p"
        ? "PV"
        : tipoRaw === "cv"
          ? "CV"
          : "C.C.";

  return {
    nombreContratante: String(stored.nombre_contratante ?? ""),
    cedulaContratante: String(stored.cedula_contratante ?? ""),
    tipoDocumentoContratante,
    direccionNotificaciones: String(stored.direccion_notificaciones ?? ""),
    ciudadContratante: String(stored.ciudad_contratante ?? ""),
    departamentoContratante: String(stored.departamento_contratante ?? ""),
    fechaFirmaDia: String(stored.fecha_firma_dia ?? ""),
    fechaFirmaMes: String(stored.fecha_firma_mes ?? ""),
    fechaFirmaAnio: String(stored.fecha_firma_anio ?? ""),
    ...comercial,
  };
}

export const introTemplate = `El día [DIA] del mes de [MES] de [ANIO], en la ciudad de Bucaramanga, Santander, entre los suscrito a saber, MARISOL PINILLA RUEDA, mayor de edad, vecina y domiciliada en la ciudad de Bucaramanga, identificada como aparece al pie de su firma, quien en adelante se denominará LA PROPIETARIA, y por otro [NOMBRE_CONTRATANTE], mayor de edad, vecino y domiciliado en Bucaramanga, quien se identifica como aparece al pie de su firma y en adelante se denominará quien en adelante será denominado "EL CONTRATANTE", acuerdan celebrar un "CONTRATO DE RENTING" regido por las siguientes cláusulas:`;

export const blocks: ClausulaBlock[] = [
  {
    title: "Cláusulas 1 a 4",
    clausulas: [
      {
        titulo: "PRIMERA – OBJETO",
        texto:
          "En virtud del presente contrato, LA PROPIETARIA entrega a título de renting y estos reciben de aquella, la simple tenencia del bien objeto del presente contrato, por el tiempo que aquí mismo se estipula. EL CONTRATANTE, como contraprestación pagará LA PROPIETARIA una remuneración, seguido de un pago diario durante la vigencia del contrato, y a su vencimiento podrá optar por alguna de las opciones de que trata la Décima cuarta del presente contrato.\n\nEl siguiente bien mueble de titularidad de la PROPIETARIA:\n\nMARCA: [MARCA]    MODELO: [MODELO]    LINEA: [LINEA]    ESTADO: [ESTADO]\nCHASIS: [CHASIS]  MOTOR: [MOTOR]      PLACA: [PLACA]    COLOR: [COLOR]",
      },
      {
        titulo: "SEGUNDA",
        texto:
          "EL CONTRATANTE reconoce recibir en perfecto estado de uso y a su entera satisfacción el bien descrito en la cláusula primera del presente contrato, conoce la situación jurídica del bien, esto es, que se trata de un bien sin limitaciones al dominio, embargos y/o medidas cautelares.",
      },
      {
        titulo: "TERCERA – DURACIÓN",
        texto:
          "El término del presente contrato es de un 12 meses contado a partir del día siguiente de la suscripción del presente contrato.",
      },
      {
        titulo: "CUARTA",
        texto:
          "El precio por el uso del bien objeto del presente contrato es por la suma total de [TOTAL_CONTRATO] ([TOTAL_CONTRATO]) M/cte., los cuales tendrán la siguiente forma de pago.\n\nPARAGRAFO PRIMERO - FORMA DE PAGO: Un primer pago equivalente a la suma de [CUOTA_INICIAL] la cual será pagadera al momento de la entrega de la motocicleta a favor del CONTRATANTE.\n\n[FORMA_PAGO_SALDO]\n\nPARAGRAFO SEGUNDO: Las cuotas diarias descritas en la presente clausula deberán ser entregadas en efectivo a favor de LA PROPIETARIA, a las 5 p.m. de cada día empezando a partir del día siguiente de la suscripción del presente contrato.\n\nEn caso de imposibilidad de parte del CONTRATANTE o la PROPIETARIA, se podrán consignar en la siguiente cuenta de [MEDIOS_PAGO]",
      },
    ],
  },
  {
    title: "Cláusulas 5 a 7",
    clausulas: [
      {
        titulo: "QUINTA",
        texto:
          "Se entenderá como día de uso el de los de desplazamiento de la máquina.",
      },
      {
        titulo: "SEXTA – DESTINACIÓN",
        texto:
          "El bien objeto del presente contrato será utilizado solamente por EL COTRATANTE, siendo responsables por la utilización del mismo, su conservación y mantenimiento. El bien será utilizado para los fines a los cuales está destinado según su naturaleza, con el cuidado debido. Se entenderá como uso normal, el derivado del uso personal o de la explotación comercial del mismo en la prestación del servicio de mensajería. El uso del bien solo se podrá realizar dentro de los límites del Área Metropolitana de Bucaramanga, Santander.\n\nEL CONTRATANTE, tendrá a su cargo todos los gastos de funcionamiento y mantenimiento del bien y en especial los repuestos y sus costos de instalación. Los repuestos se consideran parte del bien y pasaran a ser de propiedad de la PROPIETARIA, sin que EL CONTRATANTE, pueda reclamar ningún derecho por compensación o indemnización derivado de este concepto.",
      },
      {
        titulo: "SÉPTIMA. OBLIGACIONES DE LA PROPIETARIA",
        texto:
          "La PROPIETARIA declara, que el pleno dominio del objeto del contrato dando en arrendamiento le pertenece, quien cede su uso al CONTRATANTE. Por lo tanto, se obliga para con el CONTRATANTE a:\n\nLa entrega material del objeto del contrato a favor de EL CONTRATANTE.\n\nLA PROPIETATARIA, se obliga a librar a EL CONTRATANTE, de toda turbación ilegitima e imputable directamente a ella y que impida el goce del bien, para lo cual EL CONTRATANTE, deberá darle aviso tan pronto como aquella se presente.\n\nPARAGRAFO: Si la perturbación proviene del no pago de obligaciones fiscales inherentes al bien, estas no podrán ser resuelta por LA PROPIETARIA, por lo tanto, EL CONTRATANTE, renuncia a cualquier requerimiento derivado de la perturbación en la tenencia que emane de autoridades judiciales o administrativas.",
      },
    ],
  },
  {
    title: "Cláusulas 8 a 9",
    clausulas: [
      {
        titulo: "OCTAVA. OBLIGACIONES DEL CONTRATANTE O ARRENDATARIO",
        texto:
          "Son obligaciones de EL CONTRATANTE, además de las señaladas en las demás secciones y cláusulas del presente contrato, las que se establecen a continuación:\n\nPagar a las autoridades correspondientes el valor de todos los impuestos, tasas y contribuciones que afecte el bien materia de este contrato, tanto si gravan la propiedad como si se refieren a su tenencia o disfrute. Si el LA PROPIETARIA por cualquier razón, se viere obligada a pagar los citados impuestos, tasas y/o contribuciones por cuenta de EL CONTRATANTE, este deberá reintegrarle la totalidad de lo pagado por dicho concepto, para lo cual EL CONTRATANTE se obligan a reembolsarle inmediatamente las sumas pagadas, dentro de los tres (3) días siguientes al envió del aviso que en ese sentido le dé LA PROPIETARIA, acompañado de copia de los correspondientes recibos de pago. En caso de no recibir el pago de las sumas pagadas dentro del término anteriormente establecido, EL CONTRATANTE autoriza de forma expresa e irrevocable que dichas sumas sean cargadas a la presente operación de renting. Por cada día de retardo se causará a cargo de EL CONTRATANTE y a favor del LA PROPIETARIA, intereses a la tasa moratoria máxima fijada por las autoridades competentes a la fecha en que efectivamente se realice el pago, la cual se liquidará sobre el valor de las sumas pendientes de pago.\n\nSi con ocasión de la explotación del bien se llegaren a imponer multas a LA PROPIETARIA en su condición de propietaria de los mismos, EL CONTRATANTE se obligan a asumir directamente el pago de las mismas. En caso de que, por razones de cualquier orden, el LA PROPIETARIA se viere forzada a pagar dichas multas, EL CONTRATANTE se obligan a reembolsarle inmediatamente las sumas pagadas, dentro de los tres (3) días siguientes al envío del aviso que en ese sentido le dé LA PROPIETARIA, acompañado de copia de los correspondientes recibos de pago. En caso de no recibir el pago de las sumas pagadas dentro del término anteriormente establecido, EL CONTRATANTE autorizan de forma expresa e irrevocable que dichas sumas sean cargadas a la presente operación de renting. En caso de retardo se harán exigibles a cargo de EL CONTRATANTE y a favor del LA PROPIETARIA intereses a la tasa moratoria máxima fijada por las autoridades competentes a la fecha en que efectivamente se realice el pago, la cual se liquidará sobre el valor de las sumas pendientes de pago.\n\nEn caso de que EL CONTRATANTE, ejerzan la opción de compra del bien objeto del contrato, se obligan a hacer entrega al LA PROPIETARIA, de todos y cada uno de los documentos que se requieran para realizar el traspaso del bien, tales como copia de los formularios de pago de impuestos sobre vehículos automotores correspondientes a los periodos gravables desde la fecha en que se efectúo la matrícula del vehículo hasta el año en que se va a ejercer la opción de compra, certificado de tradición del vehículo con una vigencia no mayor a 30 días, fotocopia del SOAT vigente, fotocopia de la tarjeta de propiedad del vehículo, formulario único de tránsito debidamente firmado con improntas, y los demás documentos que se requieran para realizar el mencionado trámite. En caso que EL CONTRATANTE, no efectúen la entrega de los documentos anteriormente enunciados de forma completa en el término establecido, se entenderá que existe un incumplimiento del presente contrato y por ende se podrá dar por terminado de forma unilateral el mismo por parte del LA PROPIETARIA.",
      },
      {
        titulo: "NOVENA. - DETERIORO O PÉRDIDA DEL BIEN. EL CONTRATANTE",
        texto:
          "es responsable de cualquier deterioro del bien o de su pérdida, cualquiera que sea la causa que los produjere aun cuando dicha causa provenga de fuerza mayor o caso fortuito. En cualquier evento de deterioro o pérdida EL CONTRATANTE deberán avisar inmediatamente al LA PROPIETARIA y cumplir una de las siguientes tres obligaciones, a decisión del LA PROPIETARIA.\n\nReparar por su cuenta el bien y ponerlo en buenas condiciones de funcionamiento a criterio del LA PROPIETARIA, dentro del término que esta indique. Toda reparación deberá hacerse con autorización previa y escrita del LA PROPIETARIA. Es entendido que la reparación sólo podrá hacerse por los fabricantes del bien o por sus representantes en el país, salvo que el LA PROPIETARIA autorice previamente y por escrito su reparación en otras condiciones. Las piezas de repuestos deberán ser técnicamente adecuadas y no podrán cambiar la función original del bien arrendado\n\nReemplazar el bien deteriorado y/o perdido por otro de similares condiciones de presentación, mantenimiento y funcionamiento, a satisfacción del LA PROPIETARIA, caso en el cual se podrá celebrar un nuevo contrato de renting.\n\nPagar al LA PROPIETARIA el valor de los cánones que aún falten para terminar el contrato a partir del momento en que ocurra el daño o la pérdida del bien, más el valor correspondiente a la opción de compra.",
      },
    ],
  },
  {
    title: "Cláusulas 10 a 13",
    clausulas: [
      {
        titulo: "DÉCIMA - PROHIBICIONES DEL CONTRATANTE",
        texto:
          "EL CONTRATANTE no podrá ceder ni subarrendar el objeto del presente contrato ni subrogar a persona física o jurídica los derechos emanados de este contrato. De igual manera, le está prohibido a EL CONTRATANTE usar el bien por fuera de los límites del Área Metropolitana de Bucaramanga, so pena de incurrir en incumplimiento del presente contrato.\n\nPARAGRAFO: Pese a lo anterior, EL CONTRATANTE, podrá ceder la opción de compra derivada del presente contrato, siempre que notifique a la PROPIETARIA dentro de los 30 días siguientes a la expiración del presente contrato.\n\nPARAGRAFO 2: EL CONTRATANTE, no podrá manipular el GPS de la motocicleta ya que constituye una falta grave y procede a la perdida de los derechos.",
      },
      {
        titulo: "DÉCIMA PRIMERA: RESPONSABILIDAD POR EL USO DEL BIEN",
        texto:
          "EL CONTRATANTE, en virtud a haber recibido de la propietaria la tenencia, uso, goce, explotación, administración y vigilancia del bien, reconoce y declara que la PROPIETARIA, desprovista materialmente del bien, de su guarda y su custodia, no tiene ninguna responsabilidad civil, contractual, extracontractual, penal, ni de ninguna otra índole o carácter, por daños o perjuicios que con el uso del bien se le cause al mismo CONTRATANTE o a TERCEROS, ya sea en su integridad personal o en sus bienes, ya que el CONTRATANTE asume para sí todos los riegos previsibles o no, que se generan por tener la explotación  o uso de los bienes, sin que esto se pueda predicar la PROPIETARIA. Igualmente, EL CONTRATANTE, es responsable hasta la culpa leve ante la PROPIETARIA, por el cuidado, conservación, buen uso y mantenimiento del bien\n\nEn las situaciones en que LA PROPIETARIA, sea demandada a fin de reducir su responsabilidad civil, contractual, extracontractual, penal, o de cualquier otra índole o carácter, EL CONTRANTE, se obliga a poner todos los medios de defensa al alcance de la PROPIETARIA y se compromete a reembolsar en forma inmediata a esta los gastos que la actuación judicial cause, tales como honorarios, costas, agencias en derecho, y en el caso que la sentencia sea adversa a los intereses de la PROPIETARIA a reembolsar el monto de la indemnización a que sea condenada a la PROPIETARIA.\n\nEn todo caso la PROPIETARIA, podrá y así lo autoriza EL CONTRATANTE, de forma expresa e irrevocable cargar a la operación de renting las sumas que por cualquier concepto y en relación con cualquier tipo de reclamación ya sea judicial o no, la PROPIETARIA deba asumir en defensa de sus intereses. Así mismo, por cada día de retardo en el pago de las sumas adeudadas a la PROPIETARIA, por virtud de lo dispuesto en la presente clausula, se causarán a cargo del CONTRATANTE y a favor de la PROPIETARIA, intereses a la tasa moratoria máxima fijada por las autoridades competentes a la fecha en que efectivamente se realice el pago, la cual se liquidará sobre el valor de las sumas pendientes de pago con el correspondiente cobro de intereses moratorios por cada día de retardo en el pago.",
      },
      {
        titulo: "DÉCIMA SEGUNDA",
        texto:
          "El simple retardo en las cuotas descritas en la cláusula cuarta del presente contrato o una vez se tenga conocimiento de un uso indebido del objeto del contrato de parte del CONTRATANTE, autoriza irrevocablemente a la PROPIETARIA para obtener la restitución del objeto del contrato, bien sea a través de restitución voluntaria de parte del CONTRATANTE, o a través del medio más expedito, una vez obtenida la restitución del bien, el presente contrato quedará resuelto.",
      },
      {
        titulo: "DÉCIMA TERCERA – INSPECCIÓN",
        texto:
          "LA PROPIETARIA podrá inspeccionar el estado en que se encuentra el bien, y podrá ordenar su inmovilización si considera que el trabajo que está realizando puede ocasionar averías, asimismo será extensible esta prerrogativa en caso de retardo en el pago de las cuotas descritas en la cláusula segunda del presente contrato.",
      },
    ],
  },
  {
    title: "Cláusulas 14 a 17",
    clausulas: [
      {
        titulo: "DÉCIMA CUARTA. - OPCIONES",
        texto:
          "Al vencimiento del término de duración del contrato y siempre que EL CONTRATANTE, hayan cumplido todas las obligaciones del presente contrato, este tendrá una de las siguientes opciones:\nAdquirir la propiedad del bien por el valor estipulado en la cláusula cuarta.\n\nCelebrar un nuevo contrato, siempre y cuando se acuerde el termino de duración y los valores de los cánones de arrendamiento.\n\nEL CONTRATANTE que vaya a ejercer alguna de las opciones antes indicadas, deberá informar a LA PROPIETARIA, en forma escrita y con treinta (30) días de anticipación a la fecha de terminación del contrato, por cuál de las opciones consignadas en su favor opta. En caso de que optare por la de adquisición, deberá cancelar su valor el día de la terminación del contrato. Una vez ejercida y pagada la opción de compra EL CONTRATANTE, autorizan de forma expresa e irrevocable que la PROPIETARIA, proceda a realizar, previo pago por parte de LOS CONTRATANTES de los costos y gastos que dicho trámite genere, el traspaso del bien objeto del contrato, para lo cual EL CONTRATANTE, autoriza desde ahora de forma voluntaria e irrevocable que todos los trámites relativos al traspaso del bien lo realice directamente la persona designada por la PROPIETARIA, razón por la cual, LOS CONTRATANTES, se obligan desde ahora a asumir todos y cada uno de los costos y/o gastos que estos trámites generen, inclusive el valor de los honorarios del tramitador contratado para el efecto. En caso de omisión en el cumplimiento de esta obligación, EL CONTRATANTE, exoneran expresamente al LA PROPIETARIA de todo hecho que dé lugar a responsabilidad civil, tributaria, administrativa y/o de cualquier tipo, y en su lugar se compromete a indemnizar cualquier perjuicio que se cause al LA PROPIETARIA.",
      },
      {
        titulo: "DÉCIMA QUINTA – TERMINACIÓN",
        texto:
          "Este contrato terminará:\n\nPor mutuo consentimiento de las partes. Las partes por mutuo consentimiento podrán acordar la terminación anticipada del presente contrato, bajo las siguientes condiciones:\n\na) EL CONTRATANTE deben asumir los gastos, costos, impuestos, derechos, valorizaciones, tasas, contribuciones, derechos notariales y cualquier otro que con la terminación anticipada se causen directa o indirectamente; b) En el evento de que la terminación del contrato implique la restitución del(los) bien(es), este se deberá efectuar en un plazo no menor de cinco (5) días contados a partir del acuerdo de terminación del contrato y el(los) bien(es) deberá(n) entregarse a paz y salvo por impuestos, y después de haber pagado los valores de las cuotas que se hayan causado y no pagado, junto con las penas o intereses que por el retardo en el pago de los valores de los cánones de arrendamiento se hayan causado. Para efectos de este caso, se entiende que la terminación anticipada trae como consecuencia que no haya lugar a las opciones establecidas en la Cláusula Décima Cuarta; c) El acuerdo de terminación anticipada del contrato deberá constar por escrito para que tenga validez; Por vencimiento del término de vigencia del contrato; y, Por el incumplimiento de las obligaciones contenidas en el presente contrato y contraídas por las partes, y en especial por la ocurrencia de una cualquiera de las siguientes situaciones, las cuales se tendrán como JUSTAS CAUSAS para la terminación del contrato:\n\ni. El no pago oportuno de uno de las cuotas descritas en la cláusula cuarta del presente contrato.\n\nii. El uso indebido del(los) bien(es) arrendado(s), entre otros, el uso contrario a su normal destinación; su empleo para la realización de actividades ilícitas; el subarriendo o disposición del bien de cualquier forma sin autorización expresa del propietario; su empleo para el transporte de sustancias tóxicas, psicotrópicas, armamento; etc.\n\niii. Si EL CONTRATANTE gravaren con cualquier clase de cargas o garantías el(los) bien(es) objeto del presente contrato y/o cuando este (estos) sea(n) afectado(s) por medidas cautelares o por cualquier acción judicial que provengan de hechos ajenos a LA PROPIETARIA;\n\niv. Por sub-arrendar el(los) bien(es) objeto del presente contrato, o entregarlo(s) a terceros para su explotación bajo cualquier modalidad contractual, o por ceder este contrato, sin autorización previa y escrita del LA PROPIETARIA;\n\nv. Por incurrir uno de EL CONTRATANTE en concordato, liquidación voluntaria u obligatoria, en causal de disolución y/o haber sido demandado en vía ejecutiva;\n\nvi. Por la existencia de cualquier acción judicial que involucre el(los) bien(es) objeto de este contrato;\n\nvii. Por el retiro o manipulación del GPS;\n\nviii. Por la falta de pago de mas de tres (3) tarifas. (Tiene 3 días para recuperarla)\n\nix. Por la pérdida o destrucción total del(los) bien(es).\n\nLas partes establecen que si el contratante incumple con el pago de (3) tres tarifas se enviará un cobrador contratado externamente el cual por ir a recoger o cobrar tendrá una multa de $25.000= en el área metropolitana por falta de pago si la moto es recogida tendrá una espera de hasta (3) tres días hábiles para realizar el pago y recuperar la moto.\n\nPARÁGRAFO PRIMERO: Las partes acuerdan que en cualquiera de las situaciones o causales establecidas en el numeral 3. de la presente cláusula, el LA PROPIETARIA podrá unilateralmente dar por terminado el presente contrato antes del vencimiento del término, sin necesidad de declaración judicial, y exigir la restitución del(los) bien(es), así como las demás prestaciones a que haya lugar.\n\nEn ese sentido, EL CONTRATANTE desde ya acepta que, recibida esta manifestación de terminación unilateral de parte del LA PROPIETARIA, restituirá voluntariamente el (los) bien(es) objeto del contrato y efectuará la entrega material en un término no mayor a cinco (5) días siguientes a la manifestación unilateral de terminación con justa causa. Esto sin perjuicio del pago de las cuotas adeudadas y no pagados al momento de dicha restitución y las sumas adeudadas por concepto de impuestos, sanciones, costos y demás gastos que en el presente Contrato se pacten como de cargo de EL CONTRATANTE.\n\nPARÁGRAFO SEGUNDO: CLAUSULA PENAL: Así mismo, en los eventos de terminación del contrato por cualquiera de las causales antes señaladas en el numeral 3 de esta Cláusula, EL CONTRATANTE pagarán a título de pena la suma entregada en la cláusula segunda del presente contrato sin perjuicio de su obligación de devolver el(los) bien(es) y de pagar los cánones de arrendamiento que se hayan causado y no se hayan pagado.",
      },
      {
        titulo: "DÉCIMA SEXTA",
        texto:
          "Autorizo de manera expresa e inequívoca a la PROPIETARIA, para que dé tratamiento sobre la recolección, almacenamiento, uso, circulación y la supresión de los datos personales indispensables, opcionales y sensibles que se hayan recolectado en fechas anteriores o que se requieran en un futuro para el desarrollo adecuado de la relación entre las partes del presente contrato, autorizo la Cesión Nacional o Transferencia Internacional de datos a: i) entidades públicas o administrativas en ejercicio de sus funciones legales o por orden judicial; ii) terceros con los cuales la propietaria haya celebrado contratos, para la realización de tareas tercerizadas relacionadas con la venta de vehículos automotores.\n\nCon mi firma certifico conocer la política de Protección de Datos Personales del responsable del Tratamiento y los derechos que me asisten en mi calidad de Titular de Datos Personales, entre los que se encuentran los siguientes: i) Conocer, actualizar y rectificar sus Datos Personales ii) Solicitar prueba de la autorización otorgada, salvo cuando la ley no lo requiera; iii) Previa solicitud, ser informado sobre el uso que se ha dado a sus Datos Personales, por el responsable o quienes por cuenta de éste realicen el Tratamiento de sus Datos Personales; iv) Presentar ante las autoridades competente quejas por violaciones al régimen legal colombiano de protección de datos personales; v) Revocar la presente autorización y/o solicitar la supresión de sus Datos Personales cuando la autoridad competente determine que el responsable incurrió en conductas contrarias a la ley y a la Constitución, y, vi) Acceder en forma gratuita a sus Datos Personales que hayan sido objeto de Tratamiento. Estos los puedo ejercer a través de los canales dispuestos y disponibles en marisolpinilla@hotmail.com",
      },
      {
        titulo: "DÉCIMA SÉPTIMA: SOLUCION DE CONFLICTOS- CLAUSULA COMPROMISORIA",
        texto:
          "Toda controversia o diferencia relativa a este contrato, su celebración, ejecución, desarrollo, a su terminación, a su liquidación, o al cumplimiento de cualquiera de las obligaciones señaladas en el mismo, se resolverá por un Tribunal de Arbitramento, el cual será administrado por la Cámara de Comercio de Bucaramanga o directamente una conciliación con la empresa SOLUCIONES PINILLA SAS.\n\nEl Tribunal de arbitramento se regirá de acuerdo a las siguientes reglas:\n\nPRIMERA: El Tribunal estará integrado por 1 árbitro, de conformidad a la cuantía del proceso, elegidos de común acuerdo por las partes, de la lista oficial que para tal efecto lleva el Centro de Conciliación y Arbitraje de la Cámara de Comercio de Bucaramanga. En caso de no existir acuerdo, las partes delegan expresamente en el Centro de Conciliación y Arbitraje de la Cámara de Comercio de Bucaramanga, la designación de los Árbitros de conformidad con lo normado en su reglamento interno.\n\nSEGUNDA: La legislación procesal aplicable será la estipulada en la ley 1563 de 2012, y sus normas concordantes, así como las que las sustituyan.\n\nTERCERA: El Tribunal decidirá en Derecho.\n\nCUARTA: El secretario del Tribunal de Arbitramento será elegido de la lista de oficial de secretarios que para tal efecto lleve el Centro de Conciliación y Arbitraje de la Cámara de Comercio de Bucaramanga.\n\nQUINTA: El Tribunal sesionará en las instalaciones del Centro de Conciliación y Arbitraje de la Cámara de Comercio de Bucaramanga.",
      },
    ],
  },
  {
    title: "Cláusulas 18 a 23",
    clausulas: [
      {
        titulo: "DÉCIMA OCTAVA",
        texto:
          "El valor del traspaso de la moto será asumido por el comprador, incluyendo impuestos, gestoría y multas si las ha cometido el comprador.",
      },
      {
        titulo: "DECIMA NOVENA",
        texto:
          "Para efectos de notificaciones LA PROPIETARIA las recibirán en la dirección electrónica marisolpinilla@hotmail.com o en [DIRECCION_EMPRESA], y EL CONTRATANTE, en la dirección: [DIRECCION_NOTIFICACIONES]",
      },
      {
        titulo: "VIGÉSIMA",
        texto:
          "la motocicleta cuenta con un sistema de GPS; que no puede ser manipulado ni modificado si no es un agente autorizado de la empresa lo cual si se es manipulado o desconectado este contrato se dará por terminado y perderá la totalidad del dinero cancelado.",
      },
      {
        titulo: "VIGÉSIMA PRIMERA",
        texto: buildClausulaMantenimientoText(),
      },
      {
        titulo: "VIGÉSIMA SEGUNDA",
        texto:
          "al terminar la totalidad de la deuda cumpliendo las cuotas establecidas en el presente contrato tendrá derecho a ser efectuado el traspaso que tiene un costo adicional que será asumido por el comprador; para ser efectivo este traspaso debe de estar al día con los documentos de la motocicleta como el SOAT, Revisión técnico-mecánica y sin comparendos.",
      },
      {
        titulo: "VIGESIMA TERCERA: DOMICILIO CONTRACTUAL",
        texto:
          "Para todos los efectos legales del presente Contrato, se tendrá como domicilio contractual la ciudad de Bucaramanga.",
      },
    ],
  },
];

export function buildClausulaMantenimientoText(): string {
  return "Se informa al contratante que el primer cambio de aceite se realizará entre los 500 a 1000 kilómetros segundo, tercero, cuarto, quinto, sexto, octavo, noveno, decimo, onceavo y doceavo cambio de aceite se contará 1000 kilómetros más desde el ultimo cambio de aceite todos los aceites se deberá pagar hay mantenimientos preventivos adicionales, como mantenimiento preventivo, mantenimiento medio y mantenimiento general obligatorios para obtener la garantía que serán en la tercera, sexta y novena revisión el cual ese mantenimiento deberá ser pago, según las tarifas establecidas.";
}

export const firmaTemplate = `Para constancia se firma en Bucaramanga a los [DIA] (xx) día del mes de [MES] de dos mil [ANIO] ([ANIO_NUM]), por quienes en el intervinieron.

LA PROPIETARIA
MARISOL PINILLA RUEDA
37.547.626
Representante legal
SOLUCIONES PINILLA S.A.S.
Nit: 901.397.015-2

EL CONTRATANTE
[NOMBRE_CONTRATANTE]
[TIPO_DOC_CONTRATANTE] [CEDULA_CONTRATANTE]`;

function applyContratantePlaceholders(text: string, form: ContratoData): string {
  return text
    .replaceAll("[CIUDAD_CONTRATANTE]", form.ciudadContratante || "_________________________")
    .replaceAll(
      "[DEPARTAMENTO_CONTRATANTE]",
      form.departamentoContratante || "_________________________",
    )
    .replaceAll(
      "[DIRECCION_NOTIFICACIONES]",
      form.direccionNotificaciones || "_________________________",
    )
    .replaceAll("[DIRECCION_EMPRESA]", EMPRESA_PROPIETARIA.direccion);
}

function applyComercialPlaceholders(text: string, form: ContratoData): string {
  return text
    .replaceAll("[MARCA]", form.marca)
    .replaceAll("[MODELO]", form.modelo)
    .replaceAll("[LINEA]", form.linea)
    .replaceAll("[ESTADO]", form.estado)
    .replaceAll("[CHASIS]", form.chasis)
    .replaceAll("[MOTOR]", form.motor)
    .replaceAll("[PLACA]", form.placa)
    .replaceAll("[COLOR]", form.color)
    .replaceAll("[REFERENCIA]", form.referencia)
    .replaceAll("[TOTAL_CONTRATO]", form.totalContrato)
    .replaceAll("[CUOTA_INICIAL]", form.cuotaInicial)
    .replaceAll("[FORMA_PAGO_SALDO]", form.formaPagoSaldo)
    .replaceAll("[MEDIOS_PAGO]", form.mediosPago)
    .replaceAll("[VALOR_CUOTA]", form.valorCuota)
    .replaceAll("[FRECUENCIA_PAGO]", form.frecuenciaPago);
}

export function renderIntro(form: ContratoData): string {
  return applyContratantePlaceholders(
    introTemplate
      .replaceAll("[DIA]", form.fechaFirmaDia)
      .replaceAll("[MES]", form.fechaFirmaMes)
      .replaceAll("[ANIO]", form.fechaFirmaAnio)
      .replaceAll("[NOMBRE_CONTRATANTE]", form.nombreContratante),
    form,
  );
}

export function renderClausulaTexto(texto: string, form: ContratoData): string {
  return applyComercialPlaceholders(
    applyContratantePlaceholders(texto, form),
    form,
  );
}

export function renderFirma(form: ContratoData): string {
  return firmaTemplate
    .replaceAll("[DIA]", form.fechaFirmaDia)
    .replaceAll("[MES]", form.fechaFirmaMes)
    .replaceAll("[ANIO]", form.fechaFirmaAnio)
    .replaceAll("[ANIO_NUM]", form.fechaFirmaAnio)
    .replaceAll("[NOMBRE_CONTRATANTE]", form.nombreContratante)
    .replaceAll(
      "[TIPO_DOC_CONTRATANTE]",
      form.tipoDocumentoContratante || "C.C.",
    )
    .replaceAll("[CEDULA_CONTRATANTE]", form.cedulaContratante);
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Partes de la fecha actual en Colombia (UTC-5) para prellenar el contrato. */
export function colombiaDateParts(): {
  dia: string;
  mes: string;
  anio: string;
} {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return {
    dia: String(d.getUTCDate()),
    mes: MESES[d.getUTCMonth()],
    anio: String(d.getUTCFullYear()),
  };
}

/** ponytail: runnable self-check — node -e "require('./...')" or import in dev */
export function contratoClausulasSelfCheck(): void {
  const saldo = buildFormaPagoSaldoText("semanal", "$50.000");
  if (!saldo.includes("52 CUOTAS SEMANALES")) {
    throw new Error("buildFormaPagoSaldoText semanal");
  }
  const mant = buildClausulaMantenimientoText();
  if (!mant.includes("500") || !mant.includes("1000")) {
    throw new Error("buildClausulaMantenimientoText");
  }
  const medios = buildMediosPagoText();
  if (!medios.includes(EMPRESA_PROPIETARIA.daviviendaConvenio)) {
    throw new Error("buildMediosPagoText");
  }
  if (!medios.includes("SOLUCIONES PINILLA")) {
    throw new Error("buildMediosPagoText empresa");
  }
  const intro = renderIntro({
    nombreContratante: "JUAN PEREZ",
    cedulaContratante: "1.000.000",
    tipoDocumentoContratante: "C.C.",
    direccionNotificaciones: "Calle 1",
    ciudadContratante: "Bucaramanga",
    departamentoContratante: "Santander",
    fechaFirmaDia: "14",
    fechaFirmaMes: "julio",
    fechaFirmaAnio: "2026",
    marca: "BERA",
    modelo: "X",
    linea: "X",
    estado: "Nueva",
    chasis: "1",
    motor: "N/A",
    placa: "ABC123",
    color: "Rojo",
    referencia: "—",
    cuotaInicial: "$1",
    valorCuota: "$1",
    frecuenciaPago: "Diario",
    totalContrato: "$1",
    formaPagoSaldo: "",
    mediosPago: "",
  });
  if (!intro.includes("MARISOL PINILLA RUEDA") || !intro.includes("LA PROPIETARIA")) {
    throw new Error("renderIntro pinilla");
  }

  const rebuilt = buildContratoDataFromStored({
    nombre_contratante: "Ana Lopez",
    cedula_contratante: "123",
    tipo_documento_contratante: "ppt",
    direccion_notificaciones: "Calle 1, barrio Centro",
    ciudad_contratante: "Bucaramanga",
    departamento_contratante: "Santander",
    fecha_firma_dia: "4",
    fecha_firma_mes: "agosto",
    fecha_firma_anio: "2026",
    moto_modelo: "X1",
    moto_color: "Rojo",
    moto_placa: "ABC123",
    moto_chasis: "CH1",
    frecuencia_pago: "semanal",
    cuota_inicial: 100000,
    valor_cuota: 50000,
  });
  if (rebuilt.nombreContratante !== "Ana Lopez" || rebuilt.placa !== "ABC123") {
    throw new Error("buildContratoDataFromStored");
  }
  if (rebuilt.tipoDocumentoContratante !== "PPT") {
    throw new Error("buildContratoDataFromStored tipo PPT");
  }
  if (!rebuilt.formaPagoSaldo.includes("52 CUOTAS SEMANALES")) {
    throw new Error("buildContratoDataFromStored frecuencia");
  }
  const firmaPpt = renderFirma({ ...rebuilt, tipoDocumentoContratante: "PPT" });
  if (!firmaPpt.includes("PPT 123")) {
    throw new Error("renderFirma PPT");
  }
}
