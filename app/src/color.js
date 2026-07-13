// Utilidades de color para tags/proyectos con color personalizable por el
// usuario (hex arbitrario, no clases Tailwind estáticas: el valor es dinámico).

export function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Estilos inline para un "chip"/badge legible sobre fondo claro u oscuro,
// a partir de un único color hex (fondo suave + texto/borde en el color puro).
export function chipStyle(hex) {
  return {
    backgroundColor: hexToRgba(hex, 0.15),
    borderColor: hexToRgba(hex, 0.4),
    color: hex,
  }
}
