import QRCode from 'qrcode';

const pngSignature=Uint8Array.of(137,80,78,71,13,10,26,10);
const encoder=new TextEncoder();

function chunk(name,data){
  const type=encoder.encode(name),bytes=new Uint8Array(12+data.length);
  const view=new DataView(bytes.buffer);
  view.setUint32(0,data.length);
  bytes.set(type,4);
  bytes.set(data,8);
  let crc=0xffffffff;
  for(let i=4;i<8+data.length;i++){
    crc^=bytes[i];
    for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  view.setUint32(8+data.length,(crc^0xffffffff)>>>0);
  return bytes;
}

export async function qrPng(link){
  const modules=QRCode.create(link,{errorCorrectionLevel:'M'}).modules;
  const scale=6,quiet=4,size=(modules.size+quiet*2)*scale;
  const pixels=new Uint8Array(size*(size+1));
  for(let y=0;y<size;y++){
    const row=y*(size+1);
    for(let x=0;x<size;x++){
      const col=Math.floor(x/scale)-quiet,line=Math.floor(y/scale)-quiet;
      pixels[row+x+1]=col>=0&&col<modules.size&&line>=0&&line<modules.size&&modules.get(line,col)?0:255;
    }
  }
  const compressed=new Uint8Array(await new Response(new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header=new Uint8Array(13),view=new DataView(header.buffer);
  view.setUint32(0,size);
  view.setUint32(4,size);
  header[8]=8; // 8-bit grayscale, no interlace
  return new Blob([pngSignature,chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}
