// test-refresh.js
const NetatmoAuthHelper = require('../src/token/auth-helper');
const helper = new NetatmoAuthHelper();

const tokenData = helper.getTokenData();
if (!tokenData) {
    console.error('Aucun token existant trouvé.');
    process.exit(1);
}

helper.refreshToken(tokenData).then(() => {
    console.log('Test de refresh terminé.');
    process.exit(0);
}).catch(err => {
    console.error('Erreur lors du refresh:', err);
    process.exit(2);
});