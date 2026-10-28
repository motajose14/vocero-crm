# Tasks — 032 App Secret de WhatsApp

- [x] T1 — Agregar columnas y persistencia cifrada del App Secret, con migración aditiva. S1. Checks: test de cifrado en reposo y redescifrado; migración y snapshot revisados.
- [x] T2 — Permitir guardar y conservar el App Secret desde Ajustes → WhatsApp sin exponerlo en API/UI. S1. Checks: test de la ruta, preservación al dejar vacío e indicador sin exponer valor; formulario inspeccionado.
- [x] T3 — Validar firmas WhatsApp usando los secretos de los números del payload y fallar cerrado ante mezcla entre tenants. S1. Checks: tests de secreto por número, múltiples números con mismo secreto, fallback, secretos mixtos y ausencia de secreto.
