import assert from 'node:assert/strict';
import {test} from 'node:test';

test('endpoint desativado responde 404 JSON em todos os métodos previstos', async () => {
  const route = await import('../app/api/auth/team/route.ts');
  for (const method of ['GET','POST','PUT','PATCH','DELETE']) {
    const response = route[method]();
    assert.equal(response.status,404,method);
    assert.equal(response.headers.get('content-type'),'application/json');
    assert.deepEqual(await response.json(),{error:'Nao encontrado.'});
  }
});
