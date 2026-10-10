import {randomUUID,scryptSync,randomBytes} from 'node:crypto';
export async function createCoreFixture(db, tag='API') {
  const q={id:randomUUID(),slug:`qa-core-${tag.toLowerCase()}-${randomUUID().slice(0,8)}`,staff:{},products:[],table:randomUUID(),pin:'654321'};
  await db.query('BEGIN');
  try {
    await db.query("INSERT INTO restaurants(id,slug,name,plan,service_rate_basis_points) VALUES($1,$2,$3,'professional',1000)",[q.id,q.slug,`QA Core ${tag}`]);
    await db.query('INSERT INTO restaurant_domains(hostname,restaurant_id) VALUES($1,$2)',[q.slug+'.test',q.id]);
    await db.query('INSERT INTO restaurant_counters(restaurant_id) VALUES($1)',[q.id]);
    await db.query('INSERT INTO inventory_settings(restaurant_id) VALUES($1)',[q.id]);
    const accounts={cash:'cash',bank:'bank',cards:'clearing',receivable:'asset',advances:'liability',sales:'income',payable:'liability',other_receivable:'asset',other_income:'income',operating:'expense',tax:'expense',fees:'expense',stock:'asset',capital:'asset',equity:'equity',service_payable:'liability'};
    for(const [code,kind] of Object.entries(accounts))await db.query('INSERT INTO finance_accounts(restaurant_id,code,name,kind) VALUES($1,$2,$2,$3)',[q.id,code,kind]);
    for(const role of ['manager','waiter','kitchen']){const id=randomUUID(),salt=randomBytes(16).toString('hex'),name=`QA ${tag} ${role}`;q.staff[role]={id,name};await db.query('INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,$4,$5,$6)',[id,q.id,name,role,salt,scryptSync(q.pin,salt,64).toString('hex')]);}
    for(const [name,sector,price] of [['Prato QA','Cozinha',2000],['Pizza QA','Pizzaria',3000]]){const p={id:randomUUID(),variant:randomUUID(),name,sector};q.products.push(p);await db.query('INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,$4,$4)',[p.id,q.id,name,sector]);await db.query("INSERT INTO menu_variants(id,product_id,name,price_cents) VALUES($1,$2,'Individual',$3)",[p.variant,p.id,price]);}
    await db.query("INSERT INTO dining_tables(id,restaurant_id,number,label) VALUES($1,$2,1,'Mesa QA')",[q.table,q.id]);
    await db.query('COMMIT');return q;
  }catch(e){await db.query('ROLLBACK');throw e;}
}
export async function cleanupCoreFixture(db,q){
  if(!q.slug.startsWith('qa-core-'))throw new Error('Refusing cleanup');
  await db.query('BEGIN');
  try{
    await db.query('DELETE FROM finance_settlements WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM finance_documents WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM inventory_movements WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM orders WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM finance_entries WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM cash_shifts WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM finance_commands WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM finance_accounts WHERE restaurant_id=$1',[q.id]);
    await db.query('DELETE FROM restaurants WHERE id=$1 AND slug=$2',[q.id,q.slug]);
    await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}
}
