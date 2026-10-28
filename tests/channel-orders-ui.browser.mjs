// UI contract checks with synthetic API responses only: no login or database writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const {chromium} = await import(process.env.QA_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.QA_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.QA_BROWSER_EXECUTABLE ? {executablePath:process.env.QA_BROWSER_EXECUTABLE} : {})});
const out = process.env.QA_EVIDENCE_DIR || 'C:/Users/mateu/Desktop/Evidencias/Restrio/GF-028b';
await mkdir(out,{recursive:true});
const reports=[];
const yellowBrand = process.env.QA_TEST_YELLOW_BRAND === "1";
const restaurant={name:'Cantina sintética',whatsapp:'',serviceRate:10,plan:'essential',accentColor:yellowBrand ? '#F2C230' : '#23745b',defaultDeliveryFeeCents:300};
const product={id:'11111111-1111-4111-8111-111111111111',name:'Prato sintético',description:'Produto de teste',category:'Pratos',sector:'Cozinha',available:true,featured:false,imageUrl:null,variants:[{id:'22222222-2222-4222-8222-222222222222',name:'Padrão',priceCents:6000,stockAvailable:true}],addons:[]};
const snapshot={restaurant,branding:{logoUrl:null,coverUrl:null},products:[product],tables:[{number:4,label:'Mesa 04',active:true}],orders:[],kitchen:[],inventory:{enabled:false,items:[],movements:[],recipes:[]}};
try {
  for(const width of yellowBrand ? [390] : [390,1280]) {
    const context=await browser.newContext({viewport:{width,height:800},serviceWorkers:'block',reducedMotion:'reduce'});
    const posts=[];let created=0, totalOverride=null, failTransport=false;
    await context.route('**/*',async route=>{
      const request=route.request(), url=new URL(request.url());
      if(url.origin!==base) return route.abort();
      if(url.pathname==='/' || url.searchParams.has('_rsc')) return route.abort();
      if(!url.pathname.startsWith('/api/')) return route.continue();
      let body={},status=200;
      if(url.pathname==='/api/auth/session') body={authenticated:true,username:'Caixa sintético',role:'cashier'};
      else if(url.pathname==='/api/public/menu') body={restaurant,branding:snapshot.branding,products:[product]};
      else if(url.pathname==='/api/operations/state') body=snapshot;
      else if(url.pathname==='/api/operations/orders' && request.method()==='POST') {
        const data=request.postDataJSON();posts.push({data,key:request.headers()['idempotency-key']});
        if(failTransport) {failTransport=false;return route.abort();}
        await new Promise(resolve=>setTimeout(resolve,180));
        const total=totalOverride ?? (data.fulfillment==='delivery'?6300:6000);
        if(data.cashTenderedCents!==undefined && data.cashTenderedCents<total) {status=400;body={error:'O valor para troco precisa ser maior ou igual ao total (R$ 63,00).'};}
        else {created++;body={order:{id:'synthetic-'+created,orderNumber:100+created,totalCents:total,status:'confirmed',revision:1}};}
      } else if(!['GET','HEAD'].includes(request.method())) return route.abort();
      return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    async function addItem() {
      await page.getByRole('button',{name:/Prato sintético.*Produto de teste/}).click();
      await page.getByRole('button',{name:/Adicionar ·/}).click();
      await page.locator('.cart-dock').click();
    }
    async function checkout() {await addItem();await page.getByRole('button',{name:'Continuar pedido',exact:true}).click();await page.getByText('Item adicionado',{exact:true}).waitFor({state:'hidden'});}
    await page.goto(base+'/operacao/garcom?novo=1');
    await page.getByRole('group',{name:'Canal do pedido'}).waitFor();
    if(yellowBrand) await page.evaluate(() => {document.documentElement.style.setProperty('--brand-accent','#F2C230');document.documentElement.style.setProperty('--brand-on-accent','#111111');});
    const selector=await page.getByRole('group',{name:'Canal do pedido'}).evaluate(group=>{
      const selected=group.querySelector('[aria-pressed=true]'),other=group.querySelector('[aria-pressed=false]');
      const subtitle=document.querySelector('.topbar p');
      return {text:getComputedStyle(selected).color,brand:getComputedStyle(document.documentElement).getPropertyValue('--brand-accent').trim(),onBrand:getComputedStyle(document.documentElement).getPropertyValue('--brand-on-accent').trim(),selected:getComputedStyle(selected).backgroundColor,other:getComputedStyle(other).backgroundColor,subtitleWhiteSpace:getComputedStyle(subtitle).whiteSpace,subtitleFits:subtitle.scrollWidth<=subtitle.clientWidth};
    });
    assert.equal(selector.text,'rgb(255, 255, 255)');
    if(yellowBrand) {assert.equal(selector.brand,'#F2C230');assert.equal(selector.onBrand,'#111111');}
    assert.notEqual(selector.selected,selector.other);assert.equal(selector.subtitleWhiteSpace,'normal');assert.ok(selector.subtitleFits);
    await page.screenshot({path:`${out}/seletor-${width}.png`,fullPage:true});
    await page.getByRole('group',{name:'Canal do pedido'}).getByRole('button',{name:/Entrega/}).click();
    await checkout();
    await page.getByLabel('Nome do cliente',{exact:true}).fill('Pessoa sintética');
    await page.getByLabel('Telefone',{exact:true}).fill('31999990000');
    await page.getByLabel('Rua e número',{exact:true}).fill('Rua sintética 123');
    assert.equal(await page.getByLabel('Taxa de entrega (R$)',{exact:true}).inputValue(),'3');
    await page.getByRole('combobox',{name:/Forma prevista/}).selectOption('cash');
    await page.getByLabel('Troco para (R$)',{exact:true}).fill('50');
    await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'O valor para troco precisa ser maior ou igual ao total (R$ 63,00).'}).waitFor();
    assert.equal(created,0);
    assert.equal(await page.getByText('O valor para troco é menor que o total.',{exact:true}).count(),0);
    await page.mouse.move(0,0);
    const actionLayout=await page.getByRole('button',{name:'Enviar pedido',exact:true}).evaluate(button=>{
      const error=document.querySelector('[role=alert]'),rect=button.getBoundingClientRect(),errorRect=error.getBoundingClientRect();
      const probe=document.createElement('span');probe.style.color='var(--core-accent)';document.body.append(probe);const accent=getComputedStyle(probe).color;probe.remove();
      return {text:getComputedStyle(button).color,buttonTop:rect.top,buttonBottom:rect.bottom,errorTop:errorRect.top,errorBottom:errorRect.bottom,height:innerHeight,color:getComputedStyle(button).backgroundColor,accent};
    });
    assert.ok(actionLayout.errorTop>=0 && actionLayout.buttonBottom<=actionLayout.height && actionLayout.buttonTop>=actionLayout.errorBottom,JSON.stringify(actionLayout));
    assert.equal(actionLayout.color,actionLayout.accent);assert.equal(actionLayout.text,'rgb(255, 255, 255)');
    const primary=page.getByRole('button',{name:'Enviar pedido',exact:true});await primary.hover();assert.equal(await primary.evaluate(button=>getComputedStyle(button).color),'rgb(255, 255, 255)');await page.screenshot({path:`${out}/primario-hover-${width}.png`,fullPage:true});await page.mouse.move(0,0);
    assert.equal(await page.getByLabel('Bairro (opcional)',{exact:true}).count(),1);
    assert.equal(await page.getByLabel('Referência (opcional)',{exact:true}).count(),1);
    await page.screenshot({path:`${out}/erro-troco-${width}.png`,fullPage:true});
    await page.getByLabel('Troco para (R$)',{exact:true}).fill('100');
    assert.equal(await page.getByRole('alert').count(),0);
    await page.getByText(/Troco previsto: R\$\s*37,00/).waitFor();
    const fields=await page.locator('[role=dialog] input,[role=dialog] select').evaluateAll(elements=>elements.map(element=>({font:parseFloat(getComputedStyle(element).fontSize),height:element.getBoundingClientRect().height})));
    assert.ok(fields.every(field=>field.font>=16 && field.height>=44),JSON.stringify(fields));
    await page.screenshot({path:`${out}/entrega-troco-${width}.png`,fullPage:true});
    const submit=page.getByRole('button',{name:'Enviar pedido',exact:true});
    await submit.click();
    assert.equal(await page.getByRole('button',{name:'Enviando pedido…',exact:true}).isDisabled(),true);
    await page.getByRole('heading',{name:'E-101',exact:true}).waitFor();
    await page.getByText(/Troco: R\$\s*37,00/).waitFor();
    assert.equal(posts.at(-1).data.deliveryFeeCents,300);assert.equal(posts.at(-1).data.cashTenderedCents,10000);assert.equal(posts.at(-1).data.expectedPaymentMethod,'cash');
    await page.screenshot({path:`${out}/sucesso-entrega-${width}.png`,fullPage:true});
    // New attempt after a lost response keeps the same idempotency key.
    await page.getByRole('button',{name:'Voltar ao salão',exact:true}).click();
    await page.getByRole('button',{name:'Balcão',exact:true}).click();
    await checkout();await page.getByLabel('Nome do cliente',{exact:true}).fill('Balcão sintético');
    assert.equal(await page.getByLabel('Telefone',{exact:true}).count(),0);
    failTransport=true;
    await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Conexão interrompida'}).waitFor();
    const firstKey=posts.at(-1).key;
    await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();
    await page.getByRole('heading',{name:'B-102',exact:true}).waitFor();
    assert.equal(posts.at(-1).key,firstKey);assert.ok(firstKey);
    assert.equal(posts.at(-1).data.fulfillment,'pickup');assert.ok(!('deliveryFeeCents' in posts.at(-1).data));assert.ok(!('tableNumber' in posts.at(-1).data));
    // The receipt uses the total from the server, not only the local preview.
    await page.goto(base+'/operacao/garcom');await page.getByRole('button',{name:'Entrega',exact:true}).waitFor();await page.screenshot({path:`${out}/salao-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Entrega',exact:true}).click();await checkout();
    await page.getByLabel('Nome do cliente',{exact:true}).fill('Outra pessoa sintética');await page.getByLabel('Telefone',{exact:true}).fill('31999990000');await page.getByLabel('Rua e número',{exact:true}).fill('Rua sintética 123');await page.getByRole('combobox',{name:/Forma prevista/}).selectOption('cash');await page.getByLabel('Troco para (R$)',{exact:true}).fill('100');
    totalOverride=6500;await page.getByRole('button',{name:'Enviar pedido',exact:true}).click();await page.getByText(/Troco: R\$\s*35,00/).waitFor();totalOverride=null;
    // Existing table order continues using its original body and action.
    await page.goto(base+'/operacao/garcom/mesa/4');await page.getByRole('button',{name:'Adicionar pedido',exact:true}).click();
    assert.equal(await page.getByRole('group',{name:'Canal do pedido'}).count(),0);
    await addItem();await page.getByRole('button',{name:'Enviar para cozinha',exact:true}).click();
    await page.getByRole('button',{name:'Adicionar pedido',exact:true}).waitFor();
    assert.equal(posts.at(-1).data.tableNumber,4);assert.equal(posts.at(-1).data.sendToKitchen,true);assert.ok(!('fulfillment' in posts.at(-1).data));
    // Public menu never receives the staff channel selector.
    await page.goto(base+'/menu');await page.getByRole('button',{name:/Prato sintético.*Produto de teste/}).waitFor();assert.equal(await page.getByRole('group',{name:'Canal do pedido'}).count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    reports.push({width,brand:yellowBrand?'amarela':'padrao',selector,actionLayout,passed:['selector','delivery-cash-37','server-error-no-success','sending-disabled','pickup-no-fee','idempotency-retry','server-total-authoritative','legacy-table','public-unchanged','fields-16px-44px','selected-color','subtitle-wraps','optional-labels','single-error-next-to-visible-submit','primary-core-accent','white-text-selected-and-primary-hover'],posts:posts.length,fields});
    await context.close();
  }
  await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));
  console.log('PASS UI (APIs simuladas, sem banco): '+JSON.stringify(reports));
} finally {await browser.close();}
