"""PDF comercial resumido SPapp — para mostrar al cliente."""

from pathlib import Path

from PIL import Image, ImageFilter, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SHOTS = Path(__file__).resolve().parent / "screenshots"
OUT = Path(__file__).resolve().parent / "SPapp_Propuesta_Comercial_Cliente.pdf"

BERA = PUBLIC / "beralogo.jpg"
SG = PUBLIC / "logosolucionesgarrido.jpg"

NAVY = colors.HexColor("#0B1F3A")
GREEN = colors.HexColor("#1B5E3B")
MUTED = colors.HexColor("#5A6570")
LIGHT = colors.HexColor("#F5F1EB")
ACCENT = colors.HexColor("#C45C26")


def blur_pii(src: Path, dst: Path, boxes_pct):
    """Difumina regiones sensibles (porcentajes 0-1: x0,y0,x1,y1)."""
    im = Image.open(src).convert("RGB")
    w, h = im.size
    for x0, y0, x1, y1 in boxes_pct:
        box = (int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))
        region = im.crop(box).filter(ImageFilter.GaussianBlur(radius=14))
        im.paste(region, box)
    draw = ImageDraw.Draw(im)
    label = "Datos de demostración · privacidad"
    draw.rectangle((8, h - 28, 260, h - 8), fill=(11, 31, 58))
    draw.text((14, h - 25), label, fill=(255, 255, 255))
    im.save(dst, quality=90)


def prepare_shots():
    SHOTS.mkdir(parents=True, exist_ok=True)
    # Clientes: tarjetas con fotos/nombres
    blur_pii(
        SHOTS / "02-clientes.png",
        SHOTS / "02-clientes-safe.png",
        [(0.22, 0.28, 0.98, 0.98)],
    )
    # En calle: columna cliente
    blur_pii(
        SHOTS / "08-en-calle.png",
        SHOTS / "08-en-calle-safe.png",
        [(0.22, 0.38, 0.38, 0.98)],
    )
    return {
        "hoy": SHOTS / "01-hoy-inbox.png",
        "clientes": SHOTS / "02-clientes-safe.png",
        "pipeline": SHOTS / "03-pipeline-cliente.png",
        "garaje": SHOTS / "04-garaje.png",
        "catalogo": SHOTS / "05-catalogo.png",
        "venta": SHOTS / "06-venta-pos.png",
        "caja": SHOTS / "07-caja.png",
        "calle": SHOTS / "08-en-calle-safe.png",
    }


def styles():
    base = getSampleStyleSheet()
    return {
        "brand": ParagraphStyle(
            "brand",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "title",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            textColor=NAVY,
            alignment=TA_CENTER,
            leading=24,
            spaceAfter=6,
        ),
        "sub": ParagraphStyle(
            "sub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=MUTED,
            alignment=TA_CENTER,
            leading=13,
            spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=13,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=colors.HexColor("#222"),
            alignment=TA_JUSTIFY,
            leading=12,
            spaceAfter=5,
        ),
        "cap": ParagraphStyle(
            "cap",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceBefore=3,
            spaceAfter=8,
        ),
        "cell": ParagraphStyle(
            "cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10.5,
            textColor=colors.HexColor("#222"),
        ),
        "cell_b": ParagraphStyle(
            "cell_b",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10.5,
            textColor=NAVY,
        ),
        "rights": ParagraphStyle(
            "rights",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=GREEN,
            alignment=TA_CENTER,
            leading=12,
        ),
        "rights_b": ParagraphStyle(
            "rights_b",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=colors.HexColor("#1B3A28"),
            alignment=TA_JUSTIFY,
            leading=11,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "price": ParagraphStyle(
            "price",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=NAVY,
            alignment=TA_CENTER,
            leading=14,
        ),
    }


def p(text, st):
    return Paragraph(text, st)


def header(st):
    left = RLImage(str(BERA), width=3.0 * cm, height=1.5 * cm, kind="proportional") if BERA.exists() else p("BERA", st["cell_b"])
    right = RLImage(str(SG), width=3.8 * cm, height=1.6 * cm, kind="proportional") if SG.exists() else p("Soluciones Garrido", st["cell_b"])
    t = Table([[left, right]], colWidths=[8.5 * cm, 8.5 * cm])
    t.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def rights_box(st):
    inner = [
        [p("DERECHOS DEL SOFTWARE — A PERPETUIDAD", st["rights"])],
        [
            p(
                "El software <b>SPapp</b> y todos sus componentes (código, diseño, "
                "documentación e integraciones) son propiedad exclusiva e irrevocable "
                "de <b>Soluciones Garrido S.A.S.</b>, <b>a perpetuidad</b>. "
                "La contratación otorga <b>licencia de uso</b>; no transfiere la titularidad.",
                st["rights_b"],
            )
        ],
    ]
    t = Table(inner, colWidths=[16.5 * cm])
    wrap = Table([[t]], colWidths=[17 * cm])
    wrap.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8F5EE")),
                ("BOX", (0, 0), (-1, -1), 1.4, GREEN),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return wrap


def shot(path: Path, width_cm=16.8, max_h_cm=8.2):
    im = Image.open(path)
    w, h = im.size
    if w <= 0 or h <= 0:
        raise ValueError(f"Imagen inválida: {path}")
    aspect = h / float(w)
    width = float(width_cm * cm)
    height = width * aspect
    max_h = float(max_h_cm * cm)
    if height > max_h:
        height = max_h
        width = height / aspect
    return RLImage(str(path), width=width, height=height, kind="proportional")


def shot_block(path: Path, caption: str, st, width_cm=16.8, max_h_cm=7.6):
    return KeepTogether([shot(path, width_cm, max_h_cm), p(caption, st["cap"])])


def price_table(st):
    headers = ["Plan", "Para quién", "Mensual", "Anual"]
    rows = [
        ["Starter", "Hasta 40 motos · 1 sede", "$450.000", "$4.500.000"],
        ["Operación", "41–150 motos · 1–2 sedes", "$950.000", "$9.500.000"],
        ["Flota", "151–400 motos · multi-sede", "$1.800.000", "$18.000.000"],
    ]
    data = [
        [
            Paragraph(f'<font color="white"><b>{h}</b></font>', st["cell"])
            for h in headers
        ]
    ]
    for r in rows:
        data.append([p(c, st["cell_b"] if i == 0 else st["cell"]) for i, c in enumerate(r)])
    t = Table(data, colWidths=[3.2 * cm, 6.2 * cm, 3.6 * cm, 3.8 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT, colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D5DB")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(NAVY)
    canvas.setLineWidth(0.5)
    canvas.line(1.6 * cm, 1.3 * cm, A4[0] - 1.6 * cm, 1.3 * cm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        1.6 * cm,
        0.8 * cm,
        "SPapp · Soluciones Garrido S.A.S. · Licencia de uso · Derechos a perpetuidad",
    )
    canvas.drawRightString(A4[0] - 1.6 * cm, 0.8 * cm, f"Pág. {doc.page}")
    canvas.restoreState()


def build():
    shots = prepare_shots()
    st = styles()
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.3 * cm,
        bottomMargin=1.8 * cm,
        title="SPapp — Propuesta comercial",
        author="Soluciones Garrido S.A.S.",
    )
    story = []

    # Portada
    story.append(header(st))
    story.append(HRFlowable(width="100%", thickness=1.2, color=NAVY, spaceAfter=8))
    story.append(p("PROPUESTA COMERCIAL", st["brand"]))
    story.append(p("SPapp — Sistema de renting y cobro de motos", st["title"]))
    story.append(
        p(
            "Todo el ciclo en un solo panel: crédito · contrato · cobros · mora · GPS · tienda<br/>"
            "Operación lista para Bucaramanga y Bogotá · Julio 2026",
            st["sub"],
        )
    )
    story.append(rights_box(st))
    story.append(Spacer(1, 8))
    story.append(
        p(
            "<b>En una frase:</b> dejas de cobrar y recuperar en Excel/WhatsApp. "
            "SPapp te dice qué hacer hoy y protege cada moto de la flota.",
            st["body"],
        )
    )

    # Qué incluye
    story.append(p("1. Qué incluye", st["h1"]))
    bullets = [
        "<b>Bandeja Hoy</b> — colas del día: solicitudes, pagos, visitas, mora, taller.",
        "<b>Pipeline del cliente</b> — crédito → moto → contrato → pagos → visita → entrega.",
        "<b>Cobros flexibles</b> — diario / semanal / quincenal / mensual + confirmación de abonos.",
        "<b>Mora y recuperación</b> — alertas a 3 y 4+ días, visitadores, evidencias.",
        "<b>GPS / bloqueo</b> — ubicación de la moto y seguimiento intensivo en mora.",
        "<b>Garaje y catálogo</b> — stock, modelos, precios y cuotas.",
        "<b>Tienda + caja</b> — POS de repuestos, QR, cotización WhatsApp, cuadre diario.",
        "<b>WhatsApp</b> — notificaciones automáticas del proceso (pagos, contrato, visitas).",
    ]
    for b in bullets:
        story.append(p(f"• {b}", st["body"]))

    story.append(PageBreak())

    # Pantallas
    story.append(p("2. Así se ve el sistema", st["h1"]))
    story.append(
        p(
            "Capturas reales del panel operativo. Datos personales de clientes aparecen "
            "difuminados por privacidad.",
            st["body"],
        )
    )
    story.append(
        shot_block(
            shots["hoy"],
            "Bandeja «Hoy»: tareas del día (solicitudes, pagos, mora, taller).",
            st,
            max_h_cm=8.0,
        )
    )
    story.append(
        shot_block(
            shots["pipeline"],
            "Ficha del cliente: cuotas, historial de pagos y GPS de la moto.",
            st,
            max_h_cm=7.5,
        )
    )

    story.append(PageBreak())
    story.append(
        shot_block(
            shots["garaje"],
            "Garaje: stock de motos nuevas por modelo y color (BERA).",
            st,
            max_h_cm=7.2,
        )
    )
    story.append(
        shot_block(
            shots["catalogo"],
            "Modelos: cuota inicial, cuota diaria y estado comercial.",
            st,
            max_h_cm=7.0,
        )
    )

    story.append(PageBreak())
    story.append(
        shot_block(
            shots["venta"],
            "POS: escaneo QR, carrito y cotización por WhatsApp.",
            st,
            max_h_cm=7.0,
        )
    )
    story.append(
        shot_block(
            shots["caja"],
            "Caja: apertura, cierre y cuadre exacto del día.",
            st,
            max_h_cm=7.0,
        )
    )
    story.append(
        shot_block(
            shots["calle"],
            "En calle: flota entregada, mora y estado físico de cada moto.",
            st,
            max_h_cm=6.5,
        )
    )

    story.append(PageBreak())
    story.append(
        shot_block(
            shots["clientes"],
            "Clientes: pipeline ordenado por atraso (datos difuminados).",
            st,
            max_h_cm=8.5,
        )
    )

    story.append(PageBreak())

    # Precios
    story.append(p("3. Inversión (licencia de uso)", st["h1"]))
    story.append(
        p(
            "Precios en COP. Incluyen panel, app de flujo operativo y notificaciones WhatsApp "
            "utility según plan. GPS de terceros se factura aparte (pass-through).",
            st["body"],
        )
    )
    story.append(price_table(st))
    story.append(Spacer(1, 6))
    story.append(
        p(
            "<b>Implementación</b> (una vez): $2.500.000 – $5.000.000 COP "
            "(migración + capacitación).<br/>"
            "<b>Anual</b> = ~2 meses de descuento. Plan recomendado para arrancar: "
            "<b>Operación</b>.",
            st["body"],
        )
    )
    story.append(Spacer(1, 4))
    story.append(
        p(
            "Si evitas perder o recuperar tarde <b>una sola moto</b>, el sistema del año "
            "ya se paga solo.",
            st["price"],
        )
    )

    # Infra breve
    story.append(p("4. Infraestructura incluida en la operación", st["h1"]))
    story.append(
        p(
            "Hosting productivo en <b>Vercel</b> + base de datos y archivos en <b>Supabase</b> "
            "+ canal <b>WhatsApp</b> (mensajes utility). El cliente no administra servidores: "
            "recibe el sistema listo y con soporte de Soluciones Garrido.",
            st["body"],
        )
    )

    # Cierre derechos
    story.append(Spacer(1, 8))
    story.append(rights_box(st))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.7, color=NAVY, spaceAfter=6))
    story.append(
        p(
            "Soluciones Garrido S.A.S. · BERA · Colombia<br/>"
            "Contacto comercial bajo solicitud · Documento confidencial<br/>"
            "<b>SPapp: derechos a perpetuidad de Soluciones Garrido.</b>",
            st["footer"],
        )
    )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"OK: {OUT}")


if __name__ == "__main__":
    build()
