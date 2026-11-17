const fs = require('fs');

const pngBuf = fs.readFileSync('client/public/favicon.png');
const base64Data = pngBuf.toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <image href="data:image/png;base64,${base64Data}" width="128" height="128" />
</svg>
`;

fs.writeFileSync('client/public/favicon.svg', svg);
console.log('Successfully written transparent client/public/favicon.svg');
