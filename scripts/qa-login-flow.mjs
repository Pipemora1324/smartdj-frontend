// QA end-to-end del flujo de login -> /venues.
// Interceptamos las llamadas al backend para simular: login 200 con accessToken
// y /venues que SOLO responde 200 si recibe el header Authorization: Bearer.
export default async function run(page, ui) {
  const seen = { venuesAuthHeader: null, loginBody: null };

  const origin = 'http://127.0.0.1:8085';
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  await page.route('**/api/auth/login', async (route) => {
    const req = route.request();
    seen.loginBody = req.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify({
        accessToken: 'TOKEN_DE_PRUEBA_123',
        user: { id: 'u1', email: 'demo@gmail.com', name: 'Demo', role: 'owner' },
      }),
    });
  });

  // /venues exige el header; si falta, devolvemos 401 como el backend real.
  await page.route('**/api/venues', async (route) => {
    seen.venuesAuthHeader = route.request().headers()['authorization'] || null;
    if (!seen.venuesAuthHeader) {
      return route.fulfill({ status: 401, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'No autorizado' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify([]) });
  });

  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));

  // Abrir login e ingresar credenciales válidas.
  const snap1 = await ui.snapshot();
  const loginBtn = snap1.match(/@(e\d+) button "Ingresar"/)?.[1];
  await ui.click(loginBtn);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const form = document.querySelector('#authForm');
    form.querySelector('[name="email"]').value = 'demo@gmail.com';
    form.querySelector('[name="password"]').value = 'Clave1234';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await page.waitForTimeout(600);

  return {
    ...seen,
    tokenGuardado: await page.evaluate(() => localStorage.getItem('accessToken')),
    modalCerrado: await page.evaluate(() => !document.querySelector('#authDialog')?.open),
    dashboardVisible: await page.evaluate(() => document.querySelector('#authContent')?.textContent.includes('Hola, Demo')),
  };
}