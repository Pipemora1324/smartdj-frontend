// QA del flujo de autenticación: abre el modal, prueba validaciones y
// confirma que el fetch apunta a la URL correcta del backend.
export default async function run(page, ui) {
  const results = {};

  // 1) URL base resuelta por config.js
  results.apiBase = await page.evaluate(() => window.SMARTDJ_API_URL);

  // 2) Abrir el modal de registro (buscamos el ref real en el snapshot)
  const before = await ui.snapshot();
  const registerRef = before.match(/@(e\d+) button "Crear establecimiento"/)?.[1];
  results.registerRef = registerRef || null;
  if (!registerRef) return { ...results, error: 'no encontré el botón', before };
  await ui.click(registerRef);
  await page.waitForTimeout(300);
  const snap = await ui.snapshot();
  results.modalAbierto = snap.includes('Crea tu venue') || snap.includes('textbox');
  results.snapshot = snap;

  // 3) Probar validación de email inválido sin tocar la red
  await page.evaluate(() => {
    const form = document.querySelector('#authForm');
    const email = form.querySelector('[name="email"]');
    email.value = 'correo-malo';
    form.querySelector('[name="password"]').value = 'abc';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await page.waitForTimeout(200);
  results.erroresVisibles = await page.evaluate(() =>
    [...document.querySelectorAll('.field-error, #formError')]
      .map((el) => el.textContent.trim())
      .filter(Boolean)
  );

  return results;
}