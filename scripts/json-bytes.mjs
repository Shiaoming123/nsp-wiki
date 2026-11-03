export function compactJSON(input){
  JSON.parse(input.toString('utf8'));
  const output=Buffer.allocUnsafe(input.length);let length=0,quoted=false,escaped=false;
  for(const byte of input){
    if(quoted){if(escaped)escaped=false;else if(byte===92)escaped=true;else if(byte===34)quoted=false;}
    else if(byte===34)quoted=true;
    else if(byte===32||byte===9||byte===10||byte===13)continue;
    output[length++]=byte;
  }
  return output.subarray(0,length);
}

