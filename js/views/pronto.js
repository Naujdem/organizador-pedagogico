/* Marcador de posición para los módulos 2, 3 y 4 */
import {esc} from '../ui.js';

export function make(title, text) {
  return {
    render(root) {
      root.innerHTML = `<h2>${esc(title)}</h2><div class="empty">${esc(text)}<br><br>
        <span class="hint">Próximamente. Mientras tanto, usa tus bibliotecas y la Planeación.</span></div>`;
    },
  };
}
