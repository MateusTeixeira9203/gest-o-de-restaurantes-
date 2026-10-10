import assert from 'node:assert/strict';
import {monthlyDate,installments,convertQuantity} from '../modules/finance/planning.ts';
assert.equal(monthlyDate('2028-01-31',1),'2028-02-29');assert.equal(monthlyDate('2027-01-31',2),'2027-03-31');assert.equal(monthlyDate('2027-12-31',1),'2028-01-31');
assert.deepEqual(installments(10000,3),[3334,3333,3333]);assert.throws(()=>installments(2,3));
assert.equal(convertQuantity(2,'kg','g'),2000);assert.equal(convertQuantity(500,'ml','L'),0.5);assert.equal(convertQuantity(1.5,'L','ml'),1500);assert.throws(()=>convertQuantity(1,'kg','L'));assert.throws(()=>convertQuantity(1,'un','g'));assert.throws(()=>convertQuantity(0,'g','kg'));console.log('PASS: month anchors/leap year, exact cents and dimension-safe unit conversion.');
