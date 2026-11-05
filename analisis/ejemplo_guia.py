"""Ejemplo ejecutable de la sección 6 de la guía (Fase 2) con los tres cambios pedidos.

Uso: python3 analisis/ejemplo_guia.py
Datos simulados; no requiere instalar nada. Imprime una tabla esperado/observado en Markdown.
"""


def evaluar_aviso(aviso):
    requerido = ("tipo", "ubicacion", "verificado")
    if any(aviso.get(c) is None for c in requerido):
        return {"estado": "desconocido", "accion": "pedir_datos"}
    if aviso["verificado"] is False:
        return {"estado": "pendiente", "accion": "revision_humana"}
    if aviso["tipo"] == "riesgo_paso":
        return {"estado": "confirmado", "accion": "priorizar_revision", "regla": "R01"}
    return {"estado": "confirmado", "accion": "orientar_proceso", "regla": "R02"}


BASE = {"tipo": "riesgo_paso", "ubicacion": "zona_A", "verificado": True}

CASOS = [
    ("Original", dict(BASE), {"estado": "confirmado", "accion": "priorizar_revision", "regla": "R01"}),
    ("(a) Sin ubicación", {k: v for k, v in BASE.items() if k != "ubicacion"},
     {"estado": "desconocido", "accion": "pedir_datos"}),
    ("(b) verificado = False", {**BASE, "verificado": False},
     {"estado": "pendiente", "accion": "revision_humana"}),
    ("(c) Otro tipo de aviso", {**BASE, "tipo": "riego_habitual"},
     {"estado": "confirmado", "accion": "orientar_proceso", "regla": "R02"}),
]

EXPLICACION = {
    "Original": "Riesgo verificado: se prioriza la revisión (R01).",
    "(a) Sin ubicación": "Falta un dato requerido: se abstiene y pide el dato; no supone la ubicación.",
    "(b) verificado = False": "El reporte no está verificado: escala a revisión humana.",
    "(c) Otro tipo de aviso": "No es riesgo de paso: orienta al proceso ordinario (R02).",
}

if __name__ == "__main__":
    print("| Caso | Entrada | Esperado | Observado | ¿Coincide? | Explicación |")
    print("|---|---|---|---|---|---|")
    fallos = 0
    for nombre, entrada, esperado in CASOS:
        observado = evaluar_aviso(entrada)
        ok = observado == esperado
        fallos += 0 if ok else 1
        print(f"| {nombre} | `{entrada}` | `{esperado}` | `{observado}` | {'Sí' if ok else 'No'} | {EXPLICACION[nombre]} |")
    urgentes, observados = 6, 10  # valores ficticios de la guía
    print(f"\nFrecuencia observada (ficticia): {urgentes}/{observados} = {urgentes / observados:.2f}")
    raise SystemExit(1 if fallos else 0)
