// Stored ZIP entries: no dependency, no compression, bounded by export service.
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function zipFiles(files:Array<{name:string;content:Buffer}>){
 const local:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const file of files){
  if(!/^[a-zA-Z0-9_./-]+$/.test(file.name)||file.name.includes('..')||file.name.startsWith('/'))throw new Error('Nome de arquivo inválido.');
  const name=Buffer.from(file.name),crc=crc32(file.content),size=file.content.length;
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(33,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(size,18);h.writeUInt32LE(size,22);h.writeUInt16LE(name.length,26);
  local.push(h,name,file.content);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(size,20);c.writeUInt32LE(size,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+size;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
