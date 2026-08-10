"""Informe PDF: stock y motos (base SolucionesBGA)."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import LETTER, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "informe-motos-data.json").read_text(encoding="utf-8"))
OUT = ROOT / "informe-motos-stock-vendidas.pdf"
FECHA = date.fromisoformat(DATA["fecha_informe"])

pdfmetrics.registerFont(TTFont("Segoe", r"C:\Windows\Fonts\segoeui.ttf"))
pdfmetrics.registerFont(TTFont("SegoeBold", r"C:\Windows\Fonts\segoeuib.ttf"))

INK = colors.HexColor("#152018")
MUTED = colors.HexColor("#5A6B5E")
LINE = colors.HexColor("#D5DDD6")
BAND = colors.HexColor("#EEF3EF")
HEADER_BG = colors.HexColor("#1B3A2A")
ACCENT = colors.HexColor("#2F6B4F")
STOCK_BG = colors.HexColor("#E8F2EC")
SOLD_BG = colors.HexColor("#F3EEE6")
PIPE_BG = colors.HexColor("#F0EFE8")
WHITE = colors.white


def cop(n) -> str:
    if n is None:
        return "—"
    return f"$ {int(n):,}".replace(",", ".")


def styles():
    base = getSampleStyleSheet()
    return {
        "brand": ParagraphStyle("brand", fontName="SegoeBold", fontSize=22, textColor=WHITE, leading=26),
        "brand_sub": ParagraphStyle("brand_sub", fontName="Segoe", fontSize=10, textColor=colors.HexColor("#C5D9CB"), leading=14),
        "h1": ParagraphStyle("h1", fontName="SegoeBold", fontSize=13, textColor=INK, spaceBefore=12, spaceAfter=6, leading=16),
        "body": ParagraphStyle("body", fontName="Segoe", fontSize=9, textColor=MUTED, leading=12, spaceAfter=8),
        "kpi_label": ParagraphStyle("kpi_label", fontName="Segoe", fontSize=7.5, textColor=MUTED, alignment=TA_CENTER, leading=9),
        "kpi_value": ParagraphStyle("kpi_value", fontName="SegoeBold", fontSize=16, textColor=INK, alignment=TA_CENTER, leading=20),
        "kpi_hint": ParagraphStyle("kpi_hint", fontName="Segoe", fontSize=7, textColor=MUTED, alignment=TA_CENTER, leading=9),
        "cell": ParagraphStyle("cell", fontName="Segoe", fontSize=7, textColor=INK, leading=8.5),
        "cell_muted": ParagraphStyle("cell_muted", fontName="Segoe", fontSize=7, textColor=MUTED, leading=8.5),
        "th": ParagraphStyle("th", fontName="SegoeBold", fontSize=7, textColor=WHITE, leading=8.5),
        "right": ParagraphStyle("right", fontName="Segoe", fontSize=7, textColor=INK, alignment=TA_RIGHT, leading=8.5),
        "right_bold": ParagraphStyle("right_bold", fontName="SegoeBold", fontSize=7.5, textColor=INK, alignment=TA_RIGHT, leading=9),
    }


def header_banner(s):
    data = [[
        Paragraph("SP SolucionesBGA", s["brand"]),
        Paragraph(
            f"Informe de motos<br/>Desde el inicio · hasta {FECHA.strftime('%d/%m/%Y')}<br/>Base SolucionesBGA · stock y crédito",
            s["brand_sub"],
        ),
    ]]
    t = Table(data, colWidths=[4.0 * inch, 6.2 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 18),
        ("RIGHTPADDING", (0, 0), (-1, -1), 18),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    return t


def kpi_card(label, value, hint, s, bg):
    inner = Table([
        [Paragraph(label, s["kpi_label"])],
        [Paragraph(str(value), s["kpi_value"])],
        [Paragraph(hint, s["kpi_hint"])],
    ], colWidths=[1.9 * inch])
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return inner


def section_table(headers, rows, col_widths, s, header_color=HEADER_BG):
    head = [Paragraph(h, s["th"]) for h in headers]
    data = [head] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, BAND]),
    ]))
    return t


def footer(canvas, doc):
    canvas.saveState()
    w, _ = landscape(LETTER)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 12 * mm, w - 18 * mm, 12 * mm)
    canvas.setFont("Segoe", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 7 * mm, "SP SolucionesBGA · Informe interno · fuente: SolucionesBGA")
    canvas.drawRightString(w - 18 * mm, 7 * mm, f"Página {doc.page}")
    canvas.restoreState()


def build():
    s = styles()
    credito = DATA["credito"]
    patio = DATA["stock_patio"]
    catalogo = DATA["stock_catalogo"]
    contado = DATA["vendidas_contado"]

    entregadas = [r for r in credito if r["estado"] == "entregada"]
    pipeline = [r for r in credito if r["estado"] in ("pendiente_pago", "lista_retiro")]
    stock_cat = sum(r["unidades"] for r in catalogo)

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=landscape(LETTER),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=15 * mm,
        title="Informe motos — stock y crédito SolucionesBGA",
        author="SP SolucionesBGA",
    )
    story = []
    story.append(header_banner(s))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Crédito: entregadas (vendidas en calle) más operaciones en proceso (pendiente de pago / lista para retiro). "
        "Stock: unidades físicas en patio y unidades de catálogo. Contado: sin registros en esta base.",
        s["body"],
    ))

    kpis = Table([[
        kpi_card("Entregadas crédito", len(entregadas), "vendidas a crédito", s, SOLD_BG),
        kpi_card("En proceso", len(pipeline), "pendiente / lista retiro", s, PIPE_BG),
        kpi_card("En patio", len(patio), "unidades físicas", s, STOCK_BG),
        kpi_card("Stock catálogo", stock_cat, "modelo/color disponibles", s, STOCK_BG),
        kpi_card("Contado", len(contado), "ventas_moto", s, SOLD_BG),
    ]], colWidths=[2.05 * inch] * 5)
    kpis.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(kpis)

    # Stock patio
    story.append(Paragraph("Stock — patio / garaje", s["h1"]))
    patio_rows = [[
        Paragraph(r["placa"], s["cell"]),
        Paragraph(r["modelo"], s["cell"]),
        Paragraph(r["color"], s["cell"]),
        Paragraph(r["condicion"], s["cell_muted"]),
        Paragraph(r["estado"], s["cell"]),
        Paragraph(r.get("referencia") or "—", s["cell_muted"]),
    ] for r in patio]
    story.append(section_table(
        ["Placa", "Modelo", "Color", "Condición", "Estado", "Referencia"],
        patio_rows,
        [1.0 * inch, 2.0 * inch, 1.0 * inch, 1.3 * inch, 1.2 * inch, 2.0 * inch],
        s, ACCENT,
    ))

    story.append(Paragraph("Stock — catálogo", s["h1"]))
    if catalogo:
        cat_rows = [[
            Paragraph(r["modelo"], s["cell"]),
            Paragraph(r["color"], s["cell"]),
            Paragraph(str(r["unidades"]), s["right"]),
        ] for r in catalogo]
        story.append(section_table(
            ["Modelo", "Color", "Unidades"],
            cat_rows,
            [3.2 * inch, 2.0 * inch, 1.0 * inch],
            s, ACCENT,
        ))
    else:
        story.append(Paragraph("Sin unidades de catálogo con stock > 0.", s["body"]))

    # Entregadas
    story.append(Paragraph(f"Vendidas a crédito — entregadas ({len(entregadas)})", s["h1"]))
    ent_rows = [[
        Paragraph(r["fecha"] or "—", s["cell_muted"]),
        Paragraph(r["modelo"], s["cell"]),
        Paragraph(r["color"], s["cell"]),
        Paragraph(r["placa"] or "—", s["cell"]),
        Paragraph((r["chasis"] or "—")[:18], s["cell_muted"]),
        Paragraph(r["comprador"], s["cell"]),
        Paragraph(r["cedula"], s["cell_muted"]),
        Paragraph(cop(r["inicial"]), s["right"]),
        Paragraph(f"{cop(r['cuota'])} / {r['frecuencia']}", s["right"]),
    ] for r in entregadas]
    story.append(section_table(
        ["Fecha", "Modelo", "Color", "Placa", "Chasis", "Cliente", "Cédula", "Inicial", "Cuota"],
        ent_rows,
        [0.72 * inch, 1.25 * inch, 0.7 * inch, 0.75 * inch, 1.15 * inch, 2.15 * inch, 0.9 * inch, 0.85 * inch, 1.15 * inch],
        s,
    ))

    # Pipeline
    story.append(Paragraph(f"Crédito en proceso — pendiente / lista retiro ({len(pipeline)})", s["h1"]))
    if pipeline:
        pipe_rows = [[
            Paragraph(r["fecha"] or "—", s["cell_muted"]),
            Paragraph(r["estado"], s["cell"]),
            Paragraph(r["modelo"], s["cell"]),
            Paragraph(r["color"], s["cell"]),
            Paragraph(r["placa"] or "—", s["cell"]),
            Paragraph(r["comprador"], s["cell"]),
            Paragraph(r["cedula"], s["cell_muted"]),
            Paragraph(cop(r["inicial"]), s["right"]),
            Paragraph(f"{cop(r['cuota'])} / {r['frecuencia']}", s["right"]),
        ] for r in pipeline]
        story.append(section_table(
            ["Fecha", "Estado", "Modelo", "Color", "Placa", "Cliente", "Cédula", "Inicial", "Cuota"],
            pipe_rows,
            [0.72 * inch, 1.0 * inch, 1.25 * inch, 0.7 * inch, 0.75 * inch, 2.2 * inch, 0.9 * inch, 0.85 * inch, 1.15 * inch],
            s,
        ))
    else:
        story.append(Paragraph("Ninguna operación en proceso.", s["body"]))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        f"Totales: {len(entregadas)} entregadas + {len(pipeline)} en proceso = {len(credito)} operaciones a crédito activas "
        f"(excluye canceladas). Patio: {len(patio)}. Catálogo: {stock_cat}. Contado en esta base: {len(contado)}.",
        s["body"],
    ))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUT)
    print(f"entregadas={len(entregadas)} pipeline={len(pipeline)} patio={len(patio)} catalogo={stock_cat}")


if __name__ == "__main__":
    build()
