"""Genera el informe de pricing SPapp / Soluciones Garrido."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = Path(__file__).resolve().parent / "Informe_Pricing_SPapp_Soluciones_Garrido.pdf"

BERA = PUBLIC / "beralogo.jpg"
SG = PUBLIC / "logosolucionesgarrido.jpg"

NAVY = colors.HexColor("#0B1F3A")
ACCENT = colors.HexColor("#C45C26")
LIGHT = colors.HexColor("#F5F1EB")
MUTED = colors.HexColor("#5A6570")
GREEN = colors.HexColor("#1B5E3B")
WARN_BG = colors.HexColor("#FFF4E5")
WARN_BORDER = colors.HexColor("#C45C26")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover_brand": ParagraphStyle(
            "cover_brand",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            textColor=NAVY,
            alignment=TA_CENTER,
            leading=28,
            spaceAfter=10,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            textColor=MUTED,
            alignment=TA_CENTER,
            leading=15,
            spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=14,
            textColor=NAVY,
            spaceBefore=14,
            spaceAfter=8,
            leading=18,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=6,
            leading=14,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=colors.HexColor("#222"),
            alignment=TA_JUSTIFY,
            leading=13,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=colors.HexColor("#222"),
            leading=12.5,
            leftIndent=2,
        ),
        "cell": ParagraphStyle(
            "cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=colors.HexColor("#222"),
            leading=11,
        ),
        "cell_b": ParagraphStyle(
            "cell_b",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            textColor=NAVY,
            leading=11,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            leading=11,
            spaceAfter=4,
        ),
        "rights": ParagraphStyle(
            "rights",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            textColor=GREEN,
            alignment=TA_CENTER,
            leading=14,
        ),
        "rights_body": ParagraphStyle(
            "rights_body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=colors.HexColor("#1B3A28"),
            alignment=TA_JUSTIFY,
            leading=12.5,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }
    return s


def p(text, style):
    return Paragraph(text, style)


def header_table(st):
    logos = []
    if BERA.exists():
        logos.append(Image(str(BERA), width=3.2 * cm, height=1.6 * cm, kind="proportional"))
    else:
        logos.append(p("BERA", st["cell_b"]))
    if SG.exists():
        logos.append(Image(str(SG), width=4.2 * cm, height=1.8 * cm, kind="proportional"))
    else:
        logos.append(p("Soluciones Garrido", st["cell_b"]))

    t = Table([[logos[0], logos[1]]], colWidths=[8.5 * cm, 8.5 * cm])
    t.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return t


def rights_box(st):
    content = [
        p("DERECHOS DE PROPIEDAD INTELECTUAL — A PERPETUIDAD", st["rights"]),
        Spacer(1, 4),
        p(
            "<b>Los derechos patrimoniales y de autor sobre el software SPapp "
            "(código fuente, arquitectura, bases de datos de diseño, documentación, "
            "integraciones, marcas asociadas al producto y obras derivadas)</b> "
            "pertenecen de forma exclusiva, irrevocable y <b>a perpetuidad</b> a "
            "<b>Soluciones Garrido S.A.S.</b> Cualquier licencia de uso, despliegue, "
            "acceso SaaS o cesión operativa a terceros <b>no transfiere la titularidad</b> "
            "del software. El licenciatario obtiene únicamente un derecho de uso "
            "limitado según el plan contratado; Soluciones Garrido conserva en todo "
            "momento la propiedad plena, el derecho a evolucionar el producto y a "
            "decidir su comercialización.",
            st["rights_body"],
        ),
    ]
    inner = Table([[c] for c in content], colWidths=[16.2 * cm])
    wrap = Table([[inner]], colWidths=[16.8 * cm])
    wrap.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8F5EE")),
                ("BOX", (0, 0), (-1, -1), 1.5, GREEN),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return wrap


def make_table(headers, rows, col_widths, st):
    data = [[p(h, st["cell_b"]) for h in headers]]
    for row in rows:
        data.append([p(c, st["cell"]) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), LIGHT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D5DB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    # Force header text white via Paragraph override — redo header cells
    data[0] = [
        Paragraph(
            f'<font color="white"><b>{h}</b></font>',
            ParagraphStyle("hdr", fontName="Helvetica-Bold", fontSize=8, leading=11),
        )
        for h in headers
    ]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(NAVY)
    canvas.setLineWidth(0.6)
    canvas.line(1.8 * cm, 1.4 * cm, A4[0] - 1.8 * cm, 1.4 * cm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        1.8 * cm,
        0.9 * cm,
        "SPapp · Soluciones Garrido S.A.S. · Confidencial · Derechos a perpetuidad",
    )
    canvas.drawRightString(A4[0] - 1.8 * cm, 0.9 * cm, f"Pág. {doc.page}")
    canvas.restoreState()


def build():
    st = styles()
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.5 * cm,
        bottomMargin=2.0 * cm,
        title="Informe de Pricing SPapp — Soluciones Garrido",
        author="Soluciones Garrido S.A.S.",
        subject="Propuesta de precios y costos de infraestructura",
    )

    story = []
    story.append(header_table(st))
    story.append(HRFlowable(width="100%", thickness=1.2, color=NAVY, spaceAfter=10))
    story.append(p("INFORME COMERCIAL Y TÉCNICO", st["cover_brand"]))
    story.append(
        p(
            "Pricing del software SPapp<br/>Renting y financiación de motos en Colombia",
            st["cover_title"],
        )
    )
    story.append(
        p(
            "Mercado objetivo: Bucaramanga y Bogotá · Julio 2026<br/>"
            "Incluye costos de Vercel, Supabase y bot de WhatsApp",
            st["cover_sub"],
        )
    )
    story.append(Spacer(1, 6))
    story.append(rights_box(st))
    story.append(Spacer(1, 10))

    # 1. Producto
    story.append(p("1. Qué es SPapp (valor del producto)", st["h1"]))
    story.append(
        p(
            "SPapp no es un CRM genérico de concesionario. Es el <b>sistema operativo "
            "de renting y financiación de motos</b> de Soluciones Garrido: orquesta "
            "crédito → contrato → entrega → cobro periódico → mora → recuperación GPS "
            "→ taller/POS. Ese posicionamiento vertical permite cobrar por encima de "
            "un CRM de vitrina, siempre bajo licencia de uso sin cesión de titularidad.",
            st["body"],
        )
    )
    story.append(
        make_table(
            ["Capacidad", "Valor para el negocio"],
            [
                [
                    "Pipeline crédito + contrato + entrega",
                    "Menos fricción y errores en el cierre",
                ],
                [
                    "Cobros por frecuencia + OCR de comprobantes",
                    "Menos fugas de caja",
                ],
                [
                    "Mora 3/4 días + visitadores + evidencias",
                    "Recuperación más rápida",
                ],
                ["GPS / bloqueo de motor", "Protección del activo (moto)"],
                ["Garaje + contado + POS + caja", "Operación unificada"],
                [
                    "App cliente + WhatsApp (eventos)",
                    "Menos WhatsApp manual del equipo admin",
                ],
            ],
            [7.5 * cm, 9.3 * cm],
            st,
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        p(
            "Ancla de valor: un renting con <b>50 motos</b> a ~$150.000–$225.000 COP/semana "
            "por unidad mueve del orden de <b>$30–$45 millones COP/mes</b> en cuotas. "
            "Si el software evita una sola moto perdida o mal recuperada (~$5–$12 M COP "
            "de activo), el costo anual del sistema ya se justifica.",
            st["body"],
        )
    )

    # 2. Infra
    story.append(p("2. Costos de infraestructura (piso de costo)", st["h1"]))
    story.append(
        p(
            "Referencia ~$4.000 COP = 1 USD. Para operación comercial se requieren "
            "planes de pago (Hobby/Free no son viables en producción).",
            st["body"],
        )
    )
    story.append(p("2.1 Vercel", st["h2"]))
    story.append(
        make_table(
            ["Concepto", "USD/mes", "COP/mes aprox."],
            [
                ["Pro (1 asiento)", "$20", "~$80.000"],
                ["Uso típico panel admin (bajo tráfico)", "$0–$40", "$0–$160.000"],
                ["<b>Estimado realista</b>", "<b>$20–$60</b>", "<b>~$80k–$240k</b>"],
            ],
            [8 * cm, 4 * cm, 4.8 * cm],
            st,
        )
    )
    story.append(p("2.2 Supabase", st["h2"]))
    story.append(
        make_table(
            ["Concepto", "USD/mes", "COP/mes aprox."],
            [
                ["Pro base", "$25", "~$100.000"],
                ["Compute Small típico (neto con créditos)", "~$15–$30", "~$60k–$120k"],
                ["Storage docs/fotos (dentro de 100 GB)", "$0", "$0"],
                ["Realtime + egress moderado", "$0–$20", "$0–$80k"],
                [
                    "<b>Estimado 1 proyecto productivo</b>",
                    "<b>$30–$70</b>",
                    "<b>~$120k–$280k</b>",
                ],
            ],
            [8 * cm, 4 * cm, 4.8 * cm],
            st,
        )
    )
    story.append(p("2.3 WhatsApp (bot / notificaciones)", st["h2"]))
    story.append(
        p(
            "Meta cobra por <b>mensaje template entregado</b> (no por conversación). "
            "En SPapp el canal opera vía Hermes + cola de eventos; el empaquetado "
            "comercial implica BSP + número + templates.",
            st["body"],
        )
    )
    story.append(
        make_table(
            ["Tipo (Colombia, aprox.)", "USD/msg", "Uso típico"],
            [
                ["Utility (pago, contrato, visita)", "~$0.0008–$0.0014", "Alto"],
                ["Marketing (promos)", "~$0.012–$0.02", "Bajo / opcional"],
                ["Service (respuesta en ventana 24h)", "$0", "Chat inbound"],
            ],
            [7.5 * cm, 4.5 * cm, 4.8 * cm],
            st,
        )
    )
    story.append(Spacer(1, 4))
    story.append(
        make_table(
            ["Capa", "Costo típico"],
            [
                ["Meta (utility masivo)", "Casi irrelevante en COP (ej. 2.000 msgs ≈ $2–$3)"],
                ["BSP / plataforma (360dialog u otro)", "$30–$100 USD/mes (~$120k–$400k COP)"],
                ["Hosting Hermes / agente", "$10–$40 USD/mes"],
            ],
            [7.5 * cm, 9.3 * cm],
            st,
        )
    )
    story.append(
        p(
            "GPS (IOP / System Track): conviene como <b>pass-through</b> al cliente, "
            "no incluido en el plan base sin margen.",
            st["small"],
        )
    )
    story.append(p("2.4 Piso de costo por cliente", st["h2"]))
    story.append(
        make_table(
            ["Modelo", "Infra mensual", "COP aprox."],
            [
                [
                    "SaaS compartido (N clientes)",
                    "$50–$120 amortizados",
                    "~$40k–$100k por cliente (con 5+)",
                ],
                [
                    "Instancia dedicada",
                    "$80–$200",
                    "~$320k–$800k",
                ],
                [
                    "+ WhatsApp + GPS vendors",
                    "+$40–$150",
                    "+$160k–$600k",
                ],
            ],
            [5.5 * cm, 5.5 * cm, 5.8 * cm],
            st,
        )
    )

    # 3. Mercado
    story.append(p("3. Referencia de mercado", st["h1"]))
    story.append(
        make_table(
            ["Producto", "Qué es", "Precio referencia"],
            [
                ["MotoHub (BR)", "CRM + stock motos", "~$25–$90 USD/mes"],
                ["Ropofy CRM", "CRM general (dealers)", "$97–$499 USD/mes"],
                ["DMS/CRM motos (motos.tech, Pilot)", "Cotización", "Suele $150–$400+ USD"],
            ],
            [5 * cm, 6 * cm, 5.8 * cm],
            st,
        )
    )
    story.append(
        p(
            "SPapp es más profundo (cobranza + mora + GPS + renting) que un CRM de "
            "vitrina: se recomienda cobrar por <b>motos en calle / parqueaderos</b>, "
            "no solo por usuarios.",
            st["body"],
        )
    )

    # 4. Precios
    story.append(p("4. Precios recomendados (Colombia)", st["h1"]))
    story.append(p("4.1 Planes de licencia de uso", st["h2"]))
    story.append(
        p(
            "Importante: estos precios son por <b>licencia de uso</b>. La titularidad "
            "del software permanece a perpetuidad en Soluciones Garrido (ver recuadro "
            "inicial y sección 7).",
            st["body"],
        )
    )
    story.append(
        make_table(
            ["Plan", "Ideal para", "Incluye", "Mensual", "Anual"],
            [
                [
                    "<b>Starter</b>",
                    "1 sede, hasta 40 motos",
                    "Panel, clientes, cobros, garaje, caja, POS básico, WhatsApp utility",
                    "$450.000 COP",
                    "$4.500.000",
                ],
                [
                    "<b>Operación</b>",
                    "41–150 motos, 1–2 parqueaderos",
                    "Todo Starter + visitadores + mora + app cliente + WhatsApp + reportes",
                    "$950.000 COP",
                    "$9.500.000",
                ],
                [
                    "<b>Flota</b>",
                    "151–400 motos / multi-sede",
                    "Todo + GPS/bloqueo (pass-through) + prioridad soporte + SLA",
                    "$1.800.000 COP",
                    "$18.000.000",
                ],
            ],
            [2.4 * cm, 3.4 * cm, 5.2 * cm, 2.8 * cm, 2.8 * cm],
            st,
        )
    )
    story.append(Spacer(1, 4))
    story.append(
        p(
            "Fuera de plan: +$8.000–$12.000 COP/moto/mes sobre el tope, o salto al plan "
            "siguiente. Anual ≈ 2 meses de descuento (15–20%).",
            st["body"],
        )
    )
    story.append(p("4.2 Implementación (una sola vez)", st["h2"]))
    story.append(
        make_table(
            ["Concepto", "Precio"],
            [
                [
                    "Onboarding + migración + capacitación (Bogotá / Bucaramanga)",
                    "$2.500.000 – $5.000.000 COP",
                ],
                [
                    "Personalización fuerte / branding / multi-tenant hardening",
                    "Cotizar aparte",
                ],
            ],
            [10.5 * cm, 6.3 * cm],
            st,
        )
    )
    story.append(p("4.3 Mensual vs anual", st["h2"]))
    story.append(
        p(
            "<b>Mensual:</b> más fácil de cerrar en Bucaramanga (caja más ajustada). "
            "<b>Anual:</b> mejor cash flow y menor churn; empujar en Bogotá y "
            "operaciones grandes.",
            st["body"],
        )
    )

    # 5. Margen
    story.append(p("5. Margen (sanity check)", st["h1"]))
    story.append(
        p(
            "Cliente en plan Operación a $950.000 COP/mes:",
            st["body"],
        )
    )
    story.append(
        make_table(
            ["Modelo de servicio", "Costo infra aprox.", "Margen bruto"],
            [
                ["SaaS compartido maduro", "~$80k–$150k COP", "~85%"],
                ["Instancia dedicada + WhatsApp", "~$400k–$700k COP", "~25–55%"],
            ],
            [6.5 * cm, 5.5 * cm, 4.8 * cm],
            st,
        )
    )
    story.append(
        p(
            "Con menos de 3–4 clientes en instancias dedicadas, el margen se consume "
            "en soporte. Preferir multi-tenant compartido o precio Flota ≥ $2 M COP.",
            st["body"],
        )
    )

    # 6. Go-to-market
    story.append(p("6. Enfoque comercial Bucaramanga vs Bogotá", st["h1"]))
    story.append(
        make_table(
            ["Ciudad", "Perfil típico", "Entrada realista"],
            [
                [
                    "Bucaramanga",
                    "20–80 motos, dueño-operador",
                    "Starter / Operación — mora, WhatsApp, caja",
                ],
                [
                    "Bogotá",
                    "80–300+ motos, más staff",
                    "Operación / Flota — GPS, visitadores, multi-parqueadero",
                ],
            ],
            [3.5 * cm, 6.5 * cm, 6.8 * cm],
            st,
        )
    )
    story.append(Spacer(1, 4))
    story.append(
        p(
            "Pitch: <i>«Dejas de cobrar y recuperar en Excel/WhatsApp; el sistema te "
            "dice qué hacer hoy y protege la moto.»</i> Público: renting / financiación "
            "propia / flotillas — no CRM de vitrina Yamaha/AKT.",
            st["body"],
        )
    )

    # 7. Rights detailed
    story.append(p("7. Titularidad a perpetuidad — Soluciones Garrido", st["h1"]))
    story.append(rights_box(st))
    story.append(Spacer(1, 8))
    story.append(
        p(
            "Cláusulas recomendadas en contratos comerciales:",
            st["body"],
        )
    )
    bullets = [
        "Soluciones Garrido S.A.S. es y será la única titular de los derechos patrimoniales del software SPapp a perpetuidad.",
        "La licencia otorgada es de uso no exclusivo, intransferible (salvo autorización escrita) y limitada al plan contratado.",
        "Queda prohibida la ingeniería inversa, sublicencia, reventa del código o creación de productos competidores derivados del software.",
        "Al terminar el contrato, el licenciatario pierde el acceso; no adquiere copia del código fuente ni derechos residuales sobre el producto.",
        "Mejoras, integraciones y módulos desarrollados en el marco del servicio se incorporan al patrimonio de Soluciones Garrido, salvo pacto escrito en contrario.",
        "Bera figura como marca de referencia comercial/operativa en el ecosistema; no altera la titularidad del software SPapp.",
    ]
    for b in bullets:
        story.append(p(f"• {b}", st["bullet"]))
        story.append(Spacer(1, 2))

    # 8. Recomendación
    story.append(p("8. Recomendación práctica", st["h1"]))
    recs = [
        "Precio de lista ancla: plan Operación a <b>$950.000/mes</b> o <b>$9.5 M/año</b>.",
        "Primeros 3 clientes piloto: 30–40% off por 6 meses a cambio de caso de uso y testimonios.",
        "WhatsApp: incluido en Operación/Flota; Meta+BSP como consumo o tope (ej. 3.000 utility/mes).",
        "Vercel Pro + Supabase Pro como mínimo productivo (~$200k–$500k COP/mes de stack base).",
        "Todo documento de venta debe incluir la cláusula de <b>derechos a perpetuidad</b> a favor de Soluciones Garrido.",
    ]
    for i, r in enumerate(recs, 1):
        story.append(p(f"<b>{i}.</b> {r}", st["body"]))

    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.8, color=NAVY, spaceAfter=8))
    story.append(
        p(
            "Documento elaborado para Soluciones Garrido S.A.S. · Julio 2026<br/>"
            "Confidencial — Uso interno y propuestas comerciales autorizadas.<br/>"
            "<b>Software SPapp: derechos de Soluciones Garrido a perpetuidad.</b>",
            st["footer"],
        )
    )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"OK: {OUT}")


if __name__ == "__main__":
    build()
