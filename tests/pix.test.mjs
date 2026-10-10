import assert from 'node:assert/strict';
import {crc16,staticPix,normalizePixText} from '../modules/payments/pix.ts';
// Official BCB example, section 2.6.3; CRC must match independently published vector.
const official='00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
assert.equal(crc16(official),'1D3D');
const code=staticPix({key:'123e4567-e12b-12d1-a456-426655440000',name:'João Restaurante',city:'São Gonçalo',amountCents:12345,reference:'QA123'});
let i=0;const fields={};while(i<code.length){const tag=code.slice(i,i+2),n=Number(code.slice(i+2,i+4));fields[tag]=code.slice(i+4,i+4+n);i+=4+n;}
assert.equal(i,code.length);assert.equal(fields['54'],'123.45');assert.equal(fields['59'],'JOAO RESTAURANTE');assert.equal(fields['60'],'SAO GONCALO');assert.equal(fields['62'],'0505QA123');assert.equal(fields['63'],crc16(code.slice(0,-4)));
assert.equal(normalizePixText('é'.repeat(30),25).length,25);
for(const amountCents of [0,-1,1.2,Infinity,2_000_000_001])assert.throws(()=>staticPix({key:'x',name:'QA',city:'QA',amountCents}));
assert.throws(()=>staticPix({key:'x',name:'QA',city:'QA',reference:'unsafe/reference'}));
console.log('PASS: Pix CRC official vector, TLV fields, cents, reference and invalid amounts.');
