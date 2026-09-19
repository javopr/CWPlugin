---
name: cw-ticket
description: Muestra el detalle completo de un ticket de ConnectWise Manage (notas, tiempos, agreement, company, contacto).
---

El usuario quiere el detalle completo de un ticket. Extrae el Ticket ID del texto
siguiente (debe ser un número) y sigue el paso de "detalle" del "Flujo de búsqueda de
tickets" del skill `connectwise`: llama a `get-ticket` y presenta la información en
las secciones descritas ahí (Resumen, Status/Board, Company/Contacto, Notas,
Entradas de tiempo, Agreement).

Si no encuentras un número de ticket claro en el texto, pídeselo al usuario antes de
continuar.

$ARGUMENTS
