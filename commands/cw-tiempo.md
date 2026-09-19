---
name: cw-tiempo
description: Registra una entrada de tiempo contra un ticket de ConnectWise Manage, preguntando interactivamente los datos que falten.
---

Sigue el "Flujo de entrada de tiempo" del skill `connectwise`. Usa el siguiente texto
del usuario para extraer los campos que ya haya dado (ticket, nota, fecha, hora de
inicio/fin, work role, work type, billable), y pregunta conversacionalmente por los
que falten antes de confirmar y llamar a `add-time-entry`:

$ARGUMENTS
