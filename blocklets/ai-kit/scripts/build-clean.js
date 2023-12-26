/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */

const rimraf = require('rimraf');

console.log('clean dist folder');
rimraf.sync('dist');
console.log('clean dist folder done!');

console.log('clean api/dist folder');
rimraf.sync('api/dist');
console.log('clean api/dist folder done!');

console.log('clean .blocklet folder');
rimraf.sync('.blocklet');
console.log('clean .blocklet folder done!');
